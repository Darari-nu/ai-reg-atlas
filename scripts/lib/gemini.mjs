// Gemini APIクライアント共通部（バックオフ・responseSchema強制 §5-3）
// キーは環境変数のみ。コード・ログに値を出さない。
import 'dotenv/config';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// 空文字（Actions の未設定 Variables）も既定値に落とす
function envList(name, fallback) {
  const raw = process.env[name];
  return (raw && raw.trim() ? raw : fallback).split(',').map((s) => s.trim()).filter(Boolean);
}

// 既定は固定名。エイリアス(-latest)は指す先が予告なく変わり（2026-09時点で gemini-flash-latest = 3.8-flash）、
// 最新世代は混雑で503が続きやすいので使わない。2.5系は新規キーでは404（提供終了）。2026-09-13 に疎通確認済み
export const MODEL_TRIAGE = process.env.GEMINI_MODEL_TRIAGE || 'gemini-3.5-flash-lite';
export const MODEL_SUMMARIZE = process.env.GEMINI_MODEL_SUMMARIZE || 'gemini-3.6-flash';
// どのモデルが空いているかは時間帯で入れ替わる（2026-09-19 実測: 3.5-flash が 0/4、3.8-flash が 2/4、3.6-flash が 3/4）。
// 1つに賭けず列を長く持ち、待つ前に全部を1周する（下の geminiJSON を参照）
export const FALLBACK_TRIAGE = envList('GEMINI_FALLBACK_TRIAGE', 'gemini-3.1-flash-lite,gemini-3.8-flash,gemini-3.5-flash');
export const FALLBACK_SUMMARIZE = envList('GEMINI_FALLBACK_SUMMARIZE', 'gemini-3.8-flash,gemini-3.5-flash,gemini-3.5-flash-lite');

const BACKOFF_BASE_MS = Number(process.env.GEMINI_BACKOFF_BASE_MS || 20_000);
const MAX_ATTEMPTS = Number(process.env.GEMINI_MAX_ATTEMPTS || 3);
const RETRY_DELAY_CAP_MS = 120_000;
// 1プロセス（=1ステップ）で待つ時間の累計上限。超えたら打ち切る
const WAIT_BUDGET_MS = Number(process.env.GEMINI_WAIT_BUDGET_SEC || 600) * 1000;

let waitedMs = 0; // プロセス累計の待ち時間
const exhausted = new Set(); // 日次枠切れ/404 で以後使わないモデル
const usage = { calls: 0, prompt: 0, output: 0, thoughts: 0 }; // 無料枠の消費を見積もるため

export function hasApiKey() {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** kind: quota-daily | http-retryable | http-fatal | not-found | parse | truncated | budget | quota-all */
export class GeminiError extends Error {
  constructor(message, meta = {}) {
    super(message);
    Object.assign(this, meta);
  }
}

/** これ以上Geminiを呼んでも無駄な失敗（待ち予算切れ・全モデル枯渇）。呼び出し側はループを打ち切る */
export const isGeminiStop = (e) => e instanceof GeminiError && (e.kind === 'budget' || e.kind === 'quota-all');
export const geminiStats = () => ({ waitedSec: Math.round(waitedMs / 1000), exhausted: [...exhausted], usage: { ...usage } });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sleepWithBudget(ms, model) {
  if (waitedMs + ms > WAIT_BUDGET_MS) {
    throw new GeminiError(
      `[gemini] wait budget exhausted (${Math.round(waitedMs / 1000)}s + ${Math.round(ms / 1000)}s > ${WAIT_BUDGET_MS / 1000}s)`,
      { kind: 'budget', model },
    );
  }
  waitedMs += ms;
  await sleep(ms);
}

function redact(text, key) {
  return key ? String(text).split(key).join('***') : String(text);
}

// 429/5xx の本文から quota 情報を抜く。想定構造: error.details[] に
//  { "@type": ".../google.rpc.QuotaFailure", violations: [{ quotaMetric, quotaId }] } と
//  { "@type": ".../google.rpc.RetryInfo", retryDelay: "34s" }
function parseErrorBody(raw) {
  const out = { status: '', message: '', quotaIds: [], retryDelayMs: null };
  try {
    const err = JSON.parse(raw)?.error ?? {};
    out.status = err.status ?? '';
    out.message = err.message ?? '';
    for (const d of err.details ?? []) {
      for (const v of d.violations ?? []) if (v.quotaId) out.quotaIds.push(v.quotaId);
      if (typeof d.retryDelay === 'string') out.retryDelayMs = Math.round(parseFloat(d.retryDelay) * 1000);
    }
  } catch {
    /* JSONでない本文はそのまま */
  }
  return out;
}

function classify(status, info) {
  if (status === 429 && info.quotaIds.some((q) => /perday|daily/i.test(q))) return 'quota-daily';
  if (status === 429 || status === 408 || status >= 500) return 'http-retryable';
  if (status === 404) return 'not-found';
  return 'http-fatal';
}

function backoffMs(attempt, hintMs) {
  const base = hintMs ? Math.min(hintMs, RETRY_DELAY_CAP_MS) : BACKOFF_BASE_MS * 2 ** attempt;
  return Math.round(base * (1 + Math.random() * 0.2)); // ジッタ 0〜20%
}

// 1モデルに1回だけ投げる。待たない・再試行しない（再試行の制御は geminiJSON 側）。失敗は GeminiError で投げる
async function callModelOnce(model, body, key) {
  const res = await fetch(`${API_BASE}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const raw = redact(await res.text().catch(() => ''), key);
      const info = parseErrorBody(raw);
      const kind = classify(res.status, info);
      console.warn(
        `[gemini] HTTP ${res.status} model=${model} kind=${kind} status=${info.status || '-'} quota=${info.quotaIds.join('|') || '-'} retryDelay=${info.retryDelayMs ?? '-'}ms msg=${JSON.stringify(redact(info.message, key).slice(0, 300))}`,
      );
      if (!info.status) console.warn(`[gemini] body: ${raw.slice(0, 600)}`);
      throw new GeminiError(`[gemini] HTTP ${res.status} from ${model} (${kind}${info.quotaIds[0] ? `: ${info.quotaIds[0]}` : ''})`, {
        kind,
        status: res.status,
        model,
        quotaId: info.quotaIds[0],
        retryDelayMs: info.retryDelayMs,
      });
    }

  const data = await res.json();
  usage.calls += 1;
  usage.prompt += data?.usageMetadata?.promptTokenCount ?? 0;
  usage.output += data?.usageMetadata?.candidatesTokenCount ?? 0;
  usage.thoughts += data?.usageMetadata?.thoughtsTokenCount ?? 0;
  const cand = data?.candidates?.[0];
  // 出力上限で切れたものは同じ入力を再送しても無意味（入力側を小さくして防ぐ）
  if (cand?.finishReason === 'MAX_TOKENS') {
    throw new GeminiError(`[gemini] output truncated (MAX_TOKENS) from ${model}`, { kind: 'truncated', model });
  }
  const text = cand?.content?.parts?.[0]?.text;
  if (!text) throw new GeminiError(`[gemini] empty response from ${model} (finishReason=${cand?.finishReason ?? '-'})`, { kind: 'parse', model });
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new GeminiError(`[gemini] invalid JSON from ${model}: ${e.message}`, { kind: 'parse', model });
  }
}

/**
 * 構造化出力でGeminiを呼ぶ。model → fallbackModels の順に **待たずに1周** し、
 * 全部が混雑(429/408/5xx)だったときだけバックオフして次の周回に入る（最大 GEMINI_MAX_ATTEMPTS 周）。
 * 混んでいるモデルは1分待っても混んでいる一方、空いている別モデルは即答するため（2026-09-19 実測）。
 * 日次枠切れ(quota-daily)/404 のモデルは以後このプロセスではスキップ。
 * parse / truncated / http-fatal / budget は周回せずそのまま投げる。
 * @returns {Promise<any>} パース済みJSON
 */
export async function geminiJSON({ model, prompt, schema, maxOutputTokens = 8192, fallbackModels = [] }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      response_mime_type: 'application/json',
      response_schema: schema,
      maxOutputTokens,
      // temperature は既定(1.0)のまま。Gemini 3 系は 1.0 未満でループや性能低下が起きうると公式ガイドが強く推奨している
      // （出力のぶれは構造化出力・enum・機械ゲートで受け止める）
    },
  };

  const chain = [model, ...fallbackModels].filter((m, i, a) => m && a.indexOf(m) === i);
  let last = null;
  for (let pass = 0; pass < MAX_ATTEMPTS; pass++) {
    let busy = 0; // この周回で混雑により落ちたモデル数
    for (const m of chain) {
      if (exhausted.has(m)) {
        if (pass === 0) console.warn(`[gemini] skip ${m} (exhausted earlier in this run)`);
        continue;
      }
      try {
        const out = await callModelOnce(m, body, key);
        if (m !== model || pass > 0) console.warn(`[gemini] served by model=${m} (pass ${pass + 1}/${MAX_ATTEMPTS})`);
        return out;
      } catch (e) {
        if (!(e instanceof GeminiError)) throw e; // ネットワーク例外など
        last = e;
        if (e.kind === 'quota-daily' || e.kind === 'not-found') {
          exhausted.add(m);
          console.warn(`[gemini] ${m} failed (${e.kind}), trying next model`);
          continue;
        }
        if (e.kind === 'http-retryable') {
          busy++;
          continue; // 待たずに次のモデルへ
        }
        throw e; // parse / truncated / http-fatal / budget
      }
    }
    if (busy === 0) break; // 混雑以外の理由で全滅（全モデル枯渇）。待っても回復しない
    if (pass < MAX_ATTEMPTS - 1) {
      const ms = backoffMs(pass, last?.retryDelayMs);
      console.warn(`[gemini] all ${busy} model(s) busy, backoff ${Math.round(ms / 1000)}s (pass ${pass + 1}/${MAX_ATTEMPTS}, waited total ${Math.round(waitedMs / 1000)}s)`);
      await sleepWithBudget(ms, model);
    }
  }
  throw new GeminiError(`[gemini] all models failed: ${chain.join(',')} (last: ${last?.message ?? 'none'})`, { kind: 'quota-all', model });
}

/** JSONパース失敗(kind=parse)のときだけ1回リトライ（§5-2）。HTTP系はgeminiJSON内で処理済みなので再試行しない */
export async function geminiJSONWithRetry(args) {
  try {
    return await geminiJSON(args);
  } catch (e) {
    if (!(e instanceof GeminiError) || e.kind !== 'parse') throw e;
    console.warn(`[gemini] parse failed (${e.message}), retrying once`);
    return await geminiJSON(args);
  }
}
