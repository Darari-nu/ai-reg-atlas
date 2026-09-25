import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

// import 前に設定する（モジュール読み込み時に定数化されるため）。dotenv は既存の値を上書きしない
process.env.GEMINI_API_KEY = 'test-key-XYZ';
process.env.GEMINI_BACKOFF_BASE_MS = '1';
process.env.GEMINI_WAIT_BUDGET_SEC = '1';
process.env.GEMINI_MAX_ATTEMPTS = '3';
const { geminiJSON, geminiJSONWithRetry, GeminiError, isGeminiStop, geminiStats } = await import('../scripts/lib/gemini.mjs');

const mkRes = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
const okBody = (text, finishReason = 'STOP') => ({ candidates: [{ finishReason, content: { parts: [{ text }] } }] });
const quotaBody = (quotaId, retryDelay = '0.001s', message = 'quota exceeded') => ({
  error: {
    code: 429,
    status: 'RESOURCE_EXHAUSTED',
    message,
    details: [
      { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId }] },
      { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay },
    ],
  },
});
const overloaded = { error: { code: 503, status: 'UNAVAILABLE', message: 'The model is overloaded.' } };

const realFetch = globalThis.fetch;
const realWarn = console.warn;
let calls;
let warnings;

// responder(model, n) → Response。n は そのモデルへの何回目の呼び出しか(0始まり)
function stubFetch(responder) {
  const perModel = {};
  globalThis.fetch = async (url) => {
    const model = String(url).match(/models\/([^:]+):/)[1];
    calls.push(model);
    const n = (perModel[model] = (perModel[model] ?? -1) + 1);
    return responder(model, n);
  };
}

const args = (model, fallbackModels = []) => ({ model, prompt: 'p', schema: { type: 'OBJECT' }, fallbackModels });
const count = (m) => calls.filter((c) => c === m).length;

describe('gemini client', () => {
  beforeEach(() => {
    calls = [];
    warnings = [];
    console.warn = (...a) => warnings.push(a.join(' '));
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    console.warn = realWarn;
  });

  it('503なら待たずに次のモデルへ回す（同一モデルで粘らない）', async () => {
    stubFetch((m) => (m === 'p503' ? mkRes(503, overloaded) : mkRes(200, okBody('{"ok":true}'))));
    const t0 = Date.now();
    const out = await geminiJSON(args('p503', ['f503']));
    assert.deepEqual(out, { ok: true });
    assert.deepEqual(calls, ['p503', 'f503']); // 1周目で決着
    assert.ok(Date.now() - t0 < 500); // バックオフを挟まない
  });

  it('全モデルが混雑したときだけ待って次の周回に入る', async () => {
    // 1周目は全滅、2周目に2番目のモデルが復活する
    stubFetch((m, n) => (m === 'f2nd' && n >= 1 ? mkRes(200, okBody('{"ok":true}')) : mkRes(503, overloaded)));
    const out = await geminiJSON(args('p2nd', ['f2nd']));
    assert.deepEqual(out, { ok: true });
    assert.deepEqual(calls, ['p2nd', 'f2nd', 'p2nd', 'f2nd']);
    assert.ok(warnings.some((w) => w.includes('all 2 model(s) busy, backoff')));
    assert.ok(warnings.some((w) => w.includes('served by model=f2nd (pass 2/3)')));
  });

  it('日次枠切れ(429 PerDay)は即フォールバックし、以後そのモデルを呼ばない', async () => {
    stubFetch((m) => (m === 'pday' ? mkRes(429, quotaBody('GenerateRequestsPerDayPerProjectPerModel-FreeTier')) : mkRes(200, okBody('{"ok":1}'))));
    // 2回呼んでも pday は1回しか叩かれない（exhausted 記録）
    await geminiJSON(args('pday', ['fday']));
    await geminiJSON(args('pday', ['fday']));
    assert.equal(count('pday'), 1);
    assert.equal(count('fday'), 2);
    assert.ok(warnings.some((w) => w.includes('kind=quota-daily') && w.includes('GenerateRequestsPerDay')));
  });

  it('400は即throwしフォールバックしない', async () => {
    stubFetch(() => mkRes(400, { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'bad schema' } }));
    await assert.rejects(geminiJSON(args('p400', ['f400'])), (e) => e instanceof GeminiError && e.kind === 'http-fatal');
    assert.deepEqual(calls, ['p400']);
  });

  it('MAX_TOKENSで切れた出力は truncated として再試行しない', async () => {
    stubFetch(() => mkRes(200, okBody('[{"index":0,', 'MAX_TOKENS')));
    await assert.rejects(geminiJSONWithRetry(args('ptrunc', ['ftrunc'])), (e) => e.kind === 'truncated');
    assert.deepEqual(calls, ['ptrunc']);
  });

  it('壊れたJSONのときだけ geminiJSONWithRetry が1回やり直す', async () => {
    stubFetch((_m, n) => mkRes(200, okBody(n === 0 ? '{"ok":' : '{"ok":true}')));
    assert.deepEqual(await geminiJSONWithRetry(args('pparse')), { ok: true });
    assert.equal(count('pparse'), 2);
  });

  it('HTTPエラーでは geminiJSONWithRetry が2周しない', async () => {
    stubFetch(() => mkRes(503, overloaded));
    await assert.rejects(geminiJSONWithRetry(args('pall', ['fall'])), (e) => e.kind === 'quota-all' && isGeminiStop(e));
    assert.deepEqual(calls, ['pall', 'fall', 'pall', 'fall', 'pall', 'fall']); // 2モデル×3周。JSONリトライで2周目に入らない
  });

  it('待ち予算を超えるバックオフは待たずに budget で打ち切る', async () => {
    stubFetch(() => mkRes(429, quotaBody('GenerateRequestsPerMinutePerProjectPerModel-FreeTier', '30s')));
    const t0 = Date.now();
    await assert.rejects(geminiJSON(args('pbudget', ['fbudget'])), (e) => e.kind === 'budget' && isGeminiStop(e));
    assert.ok(Date.now() - t0 < 1000);
    assert.deepEqual(calls, ['pbudget', 'fbudget']); // 1周してから待とうとして予算切れ
  });

  it('エラー本文にAPIキーが含まれていてもログには出さない', async () => {
    stubFetch(() => mkRes(400, { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'API key test-key-XYZ is invalid' } }));
    await assert.rejects(geminiJSON(args('pkey')));
    assert.ok(warnings.length > 0);
    assert.ok(warnings.every((w) => !w.includes('test-key-XYZ')));
  });

  it('JSONでないエラー本文も伏せ字にして出す', async () => {
    stubFetch(() => mkRes(502, '<html>bad gateway test-key-XYZ</html>'));
    await assert.rejects(geminiJSON(args('phtml')));
    assert.ok(warnings.some((w) => w.includes('body: <html>bad gateway ***')));
    assert.ok(warnings.every((w) => !w.includes('test-key-XYZ')));
  });

  it('usageMetadataをgeminiStats().usageに積算する（HTTPエラーは数えない）', async () => {
    const before = geminiStats().usage;
    const usageBody = (usageMetadata) => ({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":true}' }] } }],
      usageMetadata,
    });
    // perr は毎回503（数えない）、pusage1/pusage2 は成功（数える）
    stubFetch((m) => (m === 'perr' ? mkRes(503, overloaded) : mkRes(200, usageBody({ promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 2 }))));
    await geminiJSON(args('perr', ['pusage1']));
    await geminiJSON(args('pusage2'));
    const after = geminiStats().usage;
    assert.equal(after.calls - before.calls, 2);
    assert.equal(after.prompt - before.prompt, 20);
    assert.equal(after.output - before.output, 10);
    assert.equal(after.thoughts - before.thoughts, 4);
  });
});
