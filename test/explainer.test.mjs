import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  COPY_THRESHOLD,
  DEFAULT_MODEL,
  SYSTEM_PROMPT,
  buildStored,
  buildUserMessage,
  checkExplainer,
  classifyApiError,
  estimateCostUsd,
  explainerToMarkdown,
  generateExplainer,
  selectTargets,
} from '../scripts/lib/explainer.mjs';
import { run } from '../scripts/explain.mjs';
import { publishExplainers } from '../scripts/explainer-publish.mjs';
import { formatNotification } from '../scripts/notify-discord.mjs';

const SRC = 'https://example.gov/news/1';
const record = (over = {}) => ({
  id: '2026-10-08-kr-001',
  date: '2026-10-08',
  discovered_at: '2026-10-08',
  country: 'kr',
  source_kind: 'official',
  title: '韓国、AI基本法の施行令案を公表',
  summary: { what: 'w', who: 'x', when_impact: 'y' },
  so_what: 's',
  sources: [SRC],
  ...over,
});
const article = (over = {}) => ({
  headline: '韓国、AI基本法の施行令案を公表',
  lead: '韓国政府がAI基本法の施行令案を公表しました。事業者の義務の詳細が示されています。意見募集も行われます。',
  facts: [{ text: '施行令案が公表された。', source_url: SRC }],
  who_is_affected: '韓国で AI サービスを提供する事業者に関係する可能性があります。',
  japan_impact: '韓国向けにサービスを出している日本企業は、対象かどうかを確認する必要があります。',
  next_steps: '資料に今後の日程は書かれていません。',
  unknowns: ['罰則の詳細は資料から分からない。'],
  glossary: [{ term: '施行令', explanation: '法律を実施するための細則。' }],
  ...over,
});
const longText = (seed) => Array.from({ length: 200 }, (_, i) => `${seed}${i}`).join(' ');
const usage = { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const okMsg = (out = article()) => ({ stop_reason: 'end_turn', parsed_output: out, usage });
const apiErr = (status) => Object.assign(new Error(`status ${status}`), { status });

describe('checkExplainer', () => {
  it('正常な記事は通る', () => {
    assert.deepEqual(checkExplainer(article(), record(), 'x'.repeat(500)), { ok: true, reasons: [] });
  });
  it('facts が空なら不合格', () => {
    const r = checkExplainer(article({ facts: [] }), record(), '');
    assert.equal(r.ok, false);
    assert.ok(r.reasons.some((x) => x.startsWith('facts-count')));
  });
  it('source_url がレコードの sources に無ければ不合格', () => {
    const r = checkExplainer(article({ facts: [{ text: 'a', source_url: 'https://evil.example/x' }] }), record(), '');
    assert.ok(r.reasons.includes('fact[0]-source-not-in-record'));
  });
  it('長さの上限（headline 40・lead 300）を超えたら不合格', () => {
    const r = checkExplainer(article({ headline: 'あ'.repeat(41), lead: 'い'.repeat(301) }), record(), '');
    assert.ok(r.reasons.some((x) => x.startsWith('headline-length')));
    assert.ok(r.reasons.some((x) => x.startsWith('lead-length')));
  });
  const copied = 'The Ministry announced that providers of high impact AI systems must conduct risk assessments before deployment.';
  it('報道由来で出典と40字以上一致すれば不合格（空白・大文字小文字を無視）', () => {
    const src = `intro ${copied} outro`;
    const out = article({ facts: [{ text: copied.toUpperCase().replace(/ /g, '  '), source_url: SRC }] });
    const r = checkExplainer(out, record({ source_kind: 'media' }), src);
    assert.ok(r.reasons.some((x) => x.startsWith('copied-from-source(fact[0])')));
  });
  it('公式資料なら一致を許す', () => {
    const out = article({ facts: [{ text: copied, source_url: SRC }] });
    assert.equal(checkExplainer(out, record({ source_kind: 'official' }), copied).ok, true);
  });
  it('報道由来でも、閾値未満の一致や翻訳は通る', () => {
    const short = copied.slice(0, COPY_THRESHOLD - 1);
    const out = article({ facts: [{ text: short, source_url: SRC }] });
    assert.equal(checkExplainer(out, record({ source_kind: 'media' }), copied).ok, true);
  });
  it('日本語の報道本文の写しも検出する', () => {
    const jp = '政府は高影響AIを提供する事業者に対し、導入前のリスク評価の実施を義務付ける方針を明らかにした。';
    const out = article({ lead: `${jp}以上です。` });
    const r = checkExplainer(out, record({ source_kind: 'media' }), `前置き。${jp}後書き。`);
    assert.ok(r.reasons.some((x) => x.startsWith('copied-from-source(lead)')));
  });
});

describe('selectTargets', () => {
  const recs = [
    record({ id: '2026-10-08-kr-001', discovered_at: '2026-10-08' }),
    record({ id: '2026-10-07-jp-001', discovered_at: '2026-10-07', date: '2026-10-07' }),
    record({ id: '2026-09-20-us-001', discovered_at: '2026-09-20', date: '2026-09-20' }),
    record({ id: '2026-10-01-tw-001', discovered_at: '2026-10-01', date: '2026-10-01' }),
  ];
  it('7日より古いものと解説済みは対象外、新しい順', () => {
    const t = selectTargets(recs, { existingIds: new Set(['2026-10-07-jp-001']), today: '2026-10-09' });
    assert.deepEqual(t.map((r) => r.id), ['2026-10-08-kr-001']);
  });
  it('ちょうど7日前は含み、8日前は含まない', () => {
    const t = selectTargets(recs, { today: '2026-10-08' });
    assert.ok(t.some((r) => r.id === '2026-10-01-tw-001'));
    const t2 = selectTargets(recs, { today: '2026-10-09' });
    assert.ok(!t2.some((r) => r.id === '2026-10-01-tw-001'));
  });
  it('max で件数を絞る', () => {
    assert.equal(selectTargets(recs, { today: '2026-10-09', max: 1 }).length, 1);
  });
});

describe('generateExplainer', () => {
  it('API 引数: モデル・max_tokens・effort・format・system の cache_control。サンプリング/thinking/prefill は付けない', async () => {
    let args;
    const client = { messages: { parse: async (a) => ((args = a), okMsg()) } };
    const r = await generateExplainer({ client, record: record(), sourceText: 'body' });
    assert.equal(r.status, 'ok');
    assert.equal(args.model, 'claude-sonnet-5-5');
    assert.equal(DEFAULT_MODEL, 'claude-sonnet-5-5');
    assert.equal(args.max_tokens, 4000);
    assert.equal(args.output_config.effort, 'medium');
    assert.ok(args.output_config.format);
    assert.equal(args.system[0].cache_control.type, 'ephemeral');
    assert.equal(args.system[0].text, SYSTEM_PROMPT);
    for (const k of ['temperature', 'top_p', 'top_k', 'thinking']) assert.ok(!(k in args), k);
    assert.deepEqual(args.messages.map((m) => m.role), ['user']);
  });
  it('システムプロンプトに日付など可変値を含めない', () => {
    assert.ok(!/\d{4}-\d{2}-\d{2}/.test(SYSTEM_PROMPT));
  });
  it('ユーザーメッセージに出典URLと本文が入る', () => {
    const m = buildUserMessage(record(), 'BODY-TEXT');
    assert.ok(m.includes(SRC) && m.includes('BODY-TEXT') && m.includes('source_kind'));
  });
  it('refusal / max_tokens / パース失敗は skip（保存対象にしない）', async () => {
    for (const [stop_reason, parsed_output, reason] of [
      ['refusal', null, 'refusal'],
      ['max_tokens', null, 'max_tokens'],
      ['end_turn', null, 'parse-failed'],
    ]) {
      const client = { messages: { parse: async () => ({ stop_reason, parsed_output, usage }) } };
      const r = await generateExplainer({ client, record: record(), sourceText: 'b' });
      assert.equal(r.status, 'skip');
      assert.equal(r.reason, reason);
    }
  });
  it('401/402/403 は abort、429/529/500 は skip', async () => {
    for (const [status, want] of [[401, 'abort'], [402, 'abort'], [403, 'abort'], [429, 'skip'], [529, 'skip'], [500, 'skip']]) {
      assert.equal(classifyApiError(apiErr(status)), want);
      const client = { messages: { parse: async () => { throw apiErr(status); } } };
      assert.equal((await generateExplainer({ client, record: record(), sourceText: 'b' })).status, want);
    }
  });
});

function harness({ records, existing = new Set(), env = {}, parse, fetchArticle } = {}) {
  const saved = {};
  const issues = [];
  const notes = [];
  const logs = [];
  let calls = 0;
  let clientCreated = 0;
  const log = { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')) };
  const deps = {
    env: { ANTHROPIC_API_KEY: 'test-key-not-real', ...env },
    createClient: () => {
      clientCreated++;
      return { messages: { parse: async (a) => ((calls++), parse(a, calls)) } };
    },
    loadRecords: () => records,
    existingIds: () => existing,
    fetchArticle: fetchArticle ?? (async () => longText('本文')),
    writeExplainer: (id, d) => { saved[id] = d; },
    pushIssueFn: (i) => issues.push(i),
    pushNotification: (n) => notes.push(n),
    log,
    today: '2026-10-09',
    now: '2026-10-09T00:00:00Z',
  };
  return { deps, saved, issues, notes, logs, calls: () => calls, clientCreated: () => clientCreated };
}
const recs = (n) => Array.from({ length: n }, (_, i) => record({ id: `2026-10-08-kr-00${i + 1}`, sources: [`https://example.gov/${i}`] }));
const artFor = (r) => article({ facts: [{ text: '事実。', source_url: r.sources[0] }] });

describe('explain run', () => {
  it('キー無しなら API を呼ばず（クライアントも作らず）exit 0', async () => {
    const h = harness({ records: recs(2), env: { ANTHROPIC_API_KEY: '' }, parse: async () => okMsg() });
    assert.equal(await run(h.deps), 0);
    assert.equal(h.clientCreated(), 0);
    assert.ok(h.logs.some((l) => l.includes('[explain] no key, skip')));
  });
  it('下書きとして保存し、Issue と通知を積む', async () => {
    const rs = recs(1);
    const h = harness({ records: rs, parse: async () => okMsg(artFor(rs[0])) });
    assert.equal(await run(h.deps), 0);
    const s = h.saved[rs[0].id];
    assert.equal(s.status, 'draft');
    assert.equal(s.model, 'claude-sonnet-5-5');
    assert.equal(s.record_id, rs[0].id);
    assert.equal(h.issues.length, 1);
    assert.equal(h.issues[0].title, `needs-review: 解説の下書き ${rs[0].id}`);
    assert.ok(h.issues[0].body.includes('資料に書いてあること'));
    assert.equal(h.notes[0].count, 1);
    assert.ok(h.logs.some((l) => l.includes('usage=') && l.includes('cost~$')));
  });
  it('EXPLAINER_AUTO_PUBLISH=1 のときだけ published（Issue は積まない）', async () => {
    const rs = recs(1);
    const h = harness({ records: rs, env: { EXPLAINER_AUTO_PUBLISH: '1' }, parse: async () => okMsg(artFor(rs[0])) });
    await run(h.deps);
    assert.equal(h.saved[rs[0].id].status, 'published');
    assert.equal(h.issues.length, 0);
  });
  it('上限本数（EXPLAINER_MAX_PER_RUN、既定3）で止まる', async () => {
    // 全件で同じ source_url を許すため sources を共通にする
    const shared = recs(5).map((r) => ({ ...r, sources: [SRC] }));
    const h2 = harness({ records: shared, parse: async () => okMsg(article()) });
    await run(h2.deps);
    assert.equal(h2.calls(), 3);
    const h3 = harness({ records: shared, env: { EXPLAINER_MAX_PER_RUN: '1' }, parse: async () => okMsg(article()) });
    await run(h3.deps);
    assert.equal(h3.calls(), 1);
  });
  it('解説済みのレコードは対象外', async () => {
    const rs = recs(2).map((r) => ({ ...r, sources: [SRC] }));
    const h = harness({ records: rs, existing: new Set([rs[0].id]), parse: async () => okMsg(article()) });
    await run(h.deps);
    assert.deepEqual(Object.keys(h.saved), [rs[1].id]);
  });
  it('402 でその回は打ち切り（残りは呼ばない）', async () => {
    const rs = recs(3).map((r) => ({ ...r, sources: [SRC] }));
    const h = harness({ records: rs, parse: async () => { throw apiErr(402); } });
    assert.equal(await run(h.deps), 0);
    assert.equal(h.calls(), 1);
    assert.deepEqual(h.saved, {});
    assert.ok(h.logs.some((l) => l.includes('abort')));
  });
  it('429 はその記事だけスキップして次へ進む', async () => {
    const rs = recs(3).map((r) => ({ ...r, sources: [SRC] }));
    const h = harness({
      records: rs,
      parse: async (_a, n) => {
        if (n === 1) throw apiErr(429);
        return okMsg(article());
      },
    });
    await run(h.deps);
    assert.equal(h.calls(), 3);
    assert.equal(Object.keys(h.saved).length, 2);
  });
  it('refusal / max_tokens は保存しない', async () => {
    const rs = recs(2).map((r) => ({ ...r, sources: [SRC] }));
    const h = harness({
      records: rs,
      parse: async (_a, n) => ({ stop_reason: n === 1 ? 'refusal' : 'max_tokens', parsed_output: null, usage }),
    });
    await run(h.deps);
    assert.deepEqual(h.saved, {});
    assert.equal(h.notes.length, 0);
  });
  it('検査に落ちた記事は保存しない', async () => {
    const rs = recs(1);
    const h = harness({ records: rs, parse: async () => okMsg(article({ facts: [{ text: 'a', source_url: 'https://other.example/' }] })) });
    await run(h.deps);
    assert.deepEqual(h.saved, {});
    assert.ok(h.logs.some((l) => l.includes('rejected')));
  });
  it('出典本文が取れなければ API を呼ばずスキップ', async () => {
    const rs = recs(2);
    const h = harness({ records: rs, parse: async () => okMsg(), fetchArticle: async () => { throw new Error('HTTP 403'); } });
    await run(h.deps);
    assert.equal(h.calls(), 0);
  });
  it('入力が上限を超えたら切ってログに残す', async () => {
    const rs = recs(1);
    let sent = '';
    const h = harness({
      records: rs,
      env: { EXPLAINER_MAX_INPUT_CHARS: '500' },
      fetchArticle: async () => 'あ'.repeat(501),
      parse: async (a) => ((sent = a.messages[0].content), okMsg(artFor(rs[0]))),
    });
    await run(h.deps);
    assert.ok(h.logs.some((l) => l.includes('truncated')));
    assert.ok(!sent.includes('あ'.repeat(501)));
    assert.ok(sent.includes('あ'.repeat(500)));
  });
  it('想定外の例外でも exit 0', async () => {
    const rs = recs(1);
    const h = harness({ records: rs, parse: async () => okMsg() });
    h.deps.loadRecords = () => { throw new Error('boom'); };
    assert.equal(await run(h.deps), 0);
  });
});

describe('explainer-publish', () => {
  it('draft を published にし、無い id は missing に入れる', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'expl-'));
    const r = record();
    const ex = buildStored({ record: r, out: article(), model: DEFAULT_MODEL, status: 'draft', now: '2026-10-09T00:00:00Z' });
    fs.writeFileSync(path.join(dir, `${r.id}.json`), JSON.stringify(ex));
    const res = publishExplainers([r.id, '2026-10-01-xx-999'], { dir, now: '2026-10-10T00:00:00Z' });
    assert.deepEqual(res.published, [r.id]);
    assert.deepEqual(res.missing, ['2026-10-01-xx-999']);
    const after = JSON.parse(fs.readFileSync(path.join(dir, `${r.id}.json`), 'utf8'));
    assert.equal(after.status, 'published');
    assert.equal(after.published_at, '2026-10-10T00:00:00Z');
    assert.deepEqual(publishExplainers([r.id], { dir }).already, [r.id]);
  });
});

describe('補助', () => {
  it('費用の概算（Sonnet 5.5 単価）', () => {
    assert.equal(estimateCostUsd({ input: 1_000_000, output: 1_000_000, cacheRead: 0, cacheWrite: 0 }), 12);
  });
  it('Markdown に事実と解釈の見出しが入る', () => {
    const ex = buildStored({ record: record(), out: article(), model: 'm', status: 'draft', now: 'n' });
    const md = explainerToMarkdown(ex, record());
    assert.ok(md.includes('## 資料に書いてあること') && md.includes('## 解釈（AIによる解説）') && md.includes('資料からは分からないこと'));
  });
  it('Discord 通知の文面（explainer 種別）', () => {
    assert.ok(formatNotification({ type: 'explainer', label: '解説の下書きが 2 本できました（確認待ち）' }).includes('解説の下書き'));
  });
});
