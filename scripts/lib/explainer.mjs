// 解説記事（Claude API）の純関数群: スキーマ・プロンプト・出力検査・対象選定・エラー分類・Markdown 化。
// API 呼び出し（generateExplainer）は client を引数で受け取る（テストではモックに差し替える）。
// Gemini 側（gemini.mjs・triage・summarize）には依存しない。
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

export const DEFAULT_MODEL = 'claude-sonnet-5-5'; // 日付接尾辞は付けない。EXPLAINER_MODEL で差し替え可
// Sonnet 5.5 は thinking が既定ONで、max_tokens は思考＋本文の合算。4000 だと思考で食い切って本文が空になりうるので 16000
export const MAX_TOKENS = 16000;
export const EFFORT = 'medium';

// 費用の概算用（Sonnet 5.5: $2 / $10 per MTok。キャッシュ読みは入力の 0.1 倍、書き込みは 1.25 倍）。
// EXPLAINER_MODEL を差し替えたときも同じ単価で概算する（ログに「Sonnet 5.5 単価換算」と明記）
export const PRICE_PER_MTOK = { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 };

// 写し防止: 空白除去後の文字列で、出典本文とこの長さ以上連続して一致する部分があれば不合格（報道由来のみ）
// 日本語（非ASCII）を含む窓は 40 字、英数字だけの窓は 60 字（固有名詞・定型句の羅列での誤検知を避ける）
export const COPY_THRESHOLD = 40;
export const COPY_THRESHOLD_ASCII = 60;

// 失敗の再挑戦: 検査落ち・refusal・max_tokens・parse-failed がこの回数に達したレコードは対象外にする（費用の垂れ流し防止）
export const ATTEMPTS_MAX_TRIES = 2;
export const ATTEMPTS_TTL_DAYS = 7;

// 長さの上下限（文字数）
export const LIMITS = {
  headline: [1, 40],
  lead: [20, 300],
  fact: [1, 200],
  factsCount: [1, 8],
  who_is_affected: [1, 400],
  japan_impact: [1, 600],
  next_steps: [1, 400],
  unknown: [1, 200],
  unknownsCount: [0, 8],
  glossaryCount: [0, 5],
  glossaryTerm: [1, 40],
  glossaryExplanation: [1, 150],
};

/* ---------- スキーマ（Claude の構造化出力。長さ制限は checkExplainer 側で機械検査する） ---------- */

export const ExplainerSchema = z.object({
  headline: z.string(),
  lead: z.string(),
  facts: z.array(z.object({ text: z.string(), source_url: z.string() })),
  who_is_affected: z.string(),
  japan_impact: z.string(),
  next_steps: z.string(),
  unknowns: z.array(z.string()),
  glossary: z.array(z.object({ term: z.string(), explanation: z.string() })),
});

/* ---------- プロンプト ---------- */

// 固定文。日付・件数などの可変値を入れない（プレフィックスキャッシュを効かせるため）
export const SYSTEM_PROMPT = `あなたは、世界のAI規制を日本の企業の担当者向けに解説する編集者です。与えられた「更新レコード」と「出典ページの本文」だけを材料に、読んだ人が内容を理解して次の行動を考えられる解説記事を、指定のJSON構造で書いてください。

## 絶対に守ること
- 出典本文とレコードに書かれていないことを、事実として書かない。あなたの一般知識で補足した内容は facts に入れない。
- 資料から分からないこと（対象範囲の細部、罰則の有無、施行日が未定、など）は unknowns に列挙する。推測で埋めない。
- 事実（資料に書いてあること）と解釈（あなたの読み）を混ぜない。facts には事実だけ、who_is_affected / japan_impact / next_steps には解釈を書く。
- 出典本文が報道記事のときは、本文の言い回しを写さない。事実を自分の言葉で言い直し、同じ文を連続して書き写さない。
- 日本語で書く。専門用語・略称は初出で説明する（glossary に入れてもよい）。

## 各項目の書き方
- headline: 日本語の見出し。35字前後、40字を超えない。「主体、何をした」の形。
- lead: 何が起きたかを2〜3文で。300字以内。
- facts: 資料に書いてあることだけを1項目1文で、3〜6項目。何が決まった、誰が、いつから、誰にどんな義務、を優先する。各項目に source_url を付ける。source_url は、ユーザーメッセージの「出典URL」に列挙されたURLのうち、その事実の根拠になったものを一字一句そのまま使う。
- who_is_affected: 誰に効くか。どんな会社・サービスが対象になりうるか（解釈。断定を避け、「〜の可能性がある」など根拠に応じた強さで書く）。
- japan_impact: 日本の会社にとって何が変わりうるか、何を確認・準備すべきか（解釈）。日本から海外に提供するサービス、海外拠点、取引先を考える。
- next_steps: 今後の予定。資料に書いてある予定は事実として書き、そうでない見通しは「推測」と明記する。予定が資料に無ければ、その旨を書く。
- unknowns: 資料からは分からないこと。0〜6項目。
- glossary: 読者に説明が要る用語だけ。最大5件。term と explanation（1〜2文）。

## 文体
- 「です・ます」調。誇張しない。煽らない。法的助言ではなく、情報整理であることを忘れない。
- 数字・日付・固有名詞は資料のとおりに書く。`;

export function buildUserMessage(record, sourceText) {
  const meta = {
    id: record.id,
    country: record.country,
    publication_date: record.publication_date ?? record.date,
    legal_stage: record.legal_stage ?? null,
    source_kind: record.source_kind ?? null,
    title: record.title,
    summary: record.summary,
    detail: record.detail ?? null,
    so_what: record.so_what,
    effective_date: record.effective_date ?? null,
    deadline_date: record.deadline_date ?? null,
  };
  return [
    '## 更新レコード',
    JSON.stringify(meta, null, 2),
    '',
    '## 出典URL（facts の source_url はこの中から選ぶ）',
    ...record.sources.map((s) => `- ${s}`),
    '',
    '## 出典ページの本文',
    sourceText,
  ].join('\n');
}

/* ---------- 出力の検査 ---------- */

function norm(s) {
  return String(s ?? '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

const isAscii = (t) => /^[\x00-\x7f]*$/.test(t);

/** 出典本文の窓の集合（正規化後）。jp: 非ASCIIを含む40字窓、ascii: 英数字だけの60字窓 */
export function shingleSet(text) {
  const t = norm(text);
  const jp = new Set();
  const ascii = new Set();
  for (let i = 0; i + COPY_THRESHOLD <= t.length; i++) {
    const w = t.slice(i, i + COPY_THRESHOLD);
    if (!isAscii(w)) jp.add(w);
  }
  for (let i = 0; i + COPY_THRESHOLD_ASCII <= t.length; i++) {
    const w = t.slice(i, i + COPY_THRESHOLD_ASCII);
    if (isAscii(w)) ascii.add(w);
  }
  return { jp, ascii };
}

/** field が出典本文と連続一致するか（空白除去・小文字化後。日本語を含む窓は40字、英数字だけは60字） */
export function hasLongCopy(fieldText, shingles) {
  const t = norm(fieldText);
  for (let i = 0; i + COPY_THRESHOLD <= t.length; i++) {
    const w = t.slice(i, i + COPY_THRESHOLD);
    if (!isAscii(w) && shingles.jp.has(w)) return true;
  }
  for (let i = 0; i + COPY_THRESHOLD_ASCII <= t.length; i++) {
    const w = t.slice(i, i + COPY_THRESHOLD_ASCII);
    if (isAscii(w) && shingles.ascii.has(w)) return true;
  }
  return false;
}

function inRange(s, [min, max]) {
  const len = [...String(s ?? '')].length;
  return len >= min && len <= max;
}

/**
 * 検査。{ ok, reasons[] } を返す。落ちたら保存しない。
 * 写し防止は official 以外（media・不明）に適用する。公式資料は事実の言い回しが一致しても許す。
 */
export function checkExplainer(out, record, sourceText) {
  const reasons = [];
  if (!out || typeof out !== 'object') return { ok: false, reasons: ['no-output'] };

  if (!inRange(out.headline, LIMITS.headline)) reasons.push(`headline-length(${[...String(out.headline ?? '')].length})`);
  if (!inRange(out.lead, LIMITS.lead)) reasons.push(`lead-length(${[...String(out.lead ?? '')].length})`);
  for (const k of ['who_is_affected', 'japan_impact', 'next_steps']) {
    if (!inRange(out[k], LIMITS[k])) reasons.push(`${k}-length(${[...String(out[k] ?? '')].length})`);
  }

  const facts = Array.isArray(out.facts) ? out.facts : [];
  if (facts.length < LIMITS.factsCount[0] || facts.length > LIMITS.factsCount[1]) reasons.push(`facts-count(${facts.length})`);
  const allowed = new Set(record.sources ?? []);
  facts.forEach((f, i) => {
    if (!inRange(f?.text, LIMITS.fact)) reasons.push(`fact[${i}]-length`);
    if (!allowed.has(f?.source_url)) reasons.push(`fact[${i}]-source-not-in-record`);
  });

  const unknowns = Array.isArray(out.unknowns) ? out.unknowns : [];
  if (unknowns.length > LIMITS.unknownsCount[1]) reasons.push(`unknowns-count(${unknowns.length})`);
  unknowns.forEach((u, i) => {
    if (!inRange(u, LIMITS.unknown)) reasons.push(`unknown[${i}]-length`);
  });

  const glossary = Array.isArray(out.glossary) ? out.glossary : [];
  if (glossary.length > LIMITS.glossaryCount[1]) reasons.push(`glossary-count(${glossary.length})`);
  glossary.forEach((g, i) => {
    if (!inRange(g?.term, LIMITS.glossaryTerm) || !inRange(g?.explanation, LIMITS.glossaryExplanation)) reasons.push(`glossary[${i}]-length`);
  });

  if (record.source_kind !== 'official' && sourceText) {
    const shingles = shingleSet(sourceText);
    const fields = [
      ['headline', out.headline],
      ['lead', out.lead],
      ...facts.map((f, i) => [`fact[${i}]`, f?.text]),
      ['who_is_affected', out.who_is_affected],
      ['japan_impact', out.japan_impact],
      ['next_steps', out.next_steps],
      ...unknowns.map((u, i) => [`unknown[${i}]`, u]),
      ...glossary.map((g, i) => [`glossary[${i}]`, g?.explanation]),
    ];
    for (const [name, text] of fields) {
      if (hasLongCopy(text, shingles)) reasons.push(`copied-from-source(${name})`);
    }
  }

  return { ok: reasons.length === 0, reasons };
}

/* ---------- 対象選定 ---------- */

function ymdToDay(ymd) {
  return Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000);
}

/** 解説の対象: 直近 days 日（発見日、無ければ公表日）で、まだ解説が無いレコード。新しい順に max 件まで */
export function selectTargets(records, { existingIds = new Set(), attempts = {}, today, days = 7, max = Infinity } = {}) {
  const todayDay = ymdToDay(today);
  const keyOf = (r) => r.discovered_at ?? r.date;
  return records
    .filter((r) => r && r.id && Array.isArray(r.sources) && r.sources.length > 0)
    .filter((r) => !existingIds.has(r.id))
    .filter((r) => (attempts[r.id]?.tries ?? 0) < ATTEMPTS_MAX_TRIES)
    .filter((r) => {
      const d = todayDay - ymdToDay(keyOf(r));
      return Number.isFinite(d) && d >= 0 && d <= days;
    })
    .sort((a, b) => (keyOf(a) === keyOf(b) ? (a.id < b.id ? 1 : -1) : keyOf(a) < keyOf(b) ? 1 : -1))
    .slice(0, max);
}

/* ---------- 失敗の記録（data/state/explainer_attempts.json: { id: { tries, last, reasons } }） ---------- */

export function recordAttempt(map, id, reason, today) {
  const prev = map[id] ?? { tries: 0, last: today, reasons: [] };
  return { ...map, [id]: { tries: prev.tries + 1, last: today, reasons: [...prev.reasons, reason].slice(-5) } };
}

/** 最後の失敗から ttlDays 日を過ぎたエントリを捨てる */
export function pruneAttempts(map, today, ttlDays = ATTEMPTS_TTL_DAYS) {
  const out = {};
  for (const [id, e] of Object.entries(map ?? {})) {
    const age = ymdToDay(today) - ymdToDay(e?.last);
    if (Number.isFinite(age) && age <= ttlDays) out[id] = e;
  }
  return out;
}

/* ---------- エラー分類・費用 ---------- */

/** 'abort'（その回は打ち切り）| 'skip'（その記事だけスキップ） */
export function classifyApiError(err) {
  const status = err?.status;
  // 400/404 は設定ミス（モデルID・パラメータ）なので毎日叩き続けない
  if (status === 400 || status === 401 || status === 402 || status === 403 || status === 404) return 'abort';
  return 'skip'; // 429 / 529 / 5xx（SDK の既定リトライ後）、通信エラーなど
}

export function addUsage(total, usage) {
  return {
    input: total.input + (usage?.input_tokens ?? 0),
    output: total.output + (usage?.output_tokens ?? 0),
    cacheRead: total.cacheRead + (usage?.cache_read_input_tokens ?? 0),
    cacheWrite: total.cacheWrite + (usage?.cache_creation_input_tokens ?? 0),
  };
}

export function estimateCostUsd(u) {
  const p = PRICE_PER_MTOK;
  return (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + u.cacheWrite * p.cacheWrite) / 1_000_000;
}

/* ---------- API 呼び出し ---------- */

/**
 * 1件ぶんの解説を生成する。client は Anthropic SDK のクライアント（テストではモック）。
 * 戻り値: { status: 'ok', explainer, usage } | { status: 'skip'|'abort', reason, usage?, countable? }
 * countable=true は再挑戦回数（explainer_attempts）に数える失敗（refusal / max_tokens / parse-failed）
 * 拒否時の server-side fallback は使わない: 拒否は「その記事は解説しない」でよく、
 * fallback 先がより高価なモデルになるのを避ける。
 */
export async function generateExplainer({ client, model = DEFAULT_MODEL, record, sourceText }) {
  const format = zodOutputFormat(ExplainerSchema);
  let msg;
  try {
    // temperature 等のサンプリング指定・thinking 指定・assistant prefill は Sonnet 5.5 で 400 になるので付けない
    msg = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: buildUserMessage(record, sourceText) }],
      output_config: { effort: EFFORT, format },
    });
  } catch (err) {
    const status = err?.status ?? null;
    return { status: classifyApiError(err), reason: `api-error(${status ?? err?.name ?? 'Error'}): ${String(err?.message ?? '').slice(0, 160)}` };
  }
  const usage = msg.usage ?? null; // どの経路でも usage を返して費用集計に入れる
  if (msg.stop_reason === 'refusal') return { status: 'skip', reason: 'refusal', usage, countable: true };
  if (msg.stop_reason === 'max_tokens') return { status: 'skip', reason: 'max_tokens', usage, countable: true };
  const text = (msg.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    return { status: 'ok', explainer: format.parse(text), usage };
  } catch (e) {
    return { status: 'skip', reason: 'parse-failed', usage, countable: true, detail: String(e?.message ?? '').slice(0, 160) };
  }
}

/* ---------- 保存形・Markdown ---------- */

export function buildStored({ record, out, model, status, now }) {
  return {
    id: record.id,
    status,
    model,
    created_at: now,
    record_id: record.id,
    source_kind: record.source_kind ?? 'official',
    ...(status === 'published' ? { published_at: now } : {}),
    headline: out.headline,
    lead: out.lead,
    facts: out.facts.map((f) => ({ text: f.text, source_url: f.source_url })),
    who_is_affected: out.who_is_affected,
    japan_impact: out.japan_impact,
    next_steps: out.next_steps,
    unknowns: out.unknowns,
    glossary: out.glossary.map((g) => ({ term: g.term, explanation: g.explanation })),
  };
}

/** needs-review Issue の本文（darari が全文を読んで OK を出せるように） */
export function explainerToMarkdown(ex, record) {
  const lines = [
    `# ${ex.headline}`,
    '',
    `対象レコード: ${record.id}（${record.country} / ${record.source_kind === 'media' ? '報道ベース' : '公式資料'}）`,
    `モデル: ${ex.model} / 状態: ${ex.status}`,
    '',
    ex.lead,
    '',
    '## 資料に書いてあること',
    ...ex.facts.map((f) => `- ${f.text}（${f.source_url}）`),
    '',
    '## 解釈（AIによる解説）',
    '',
    '### 誰に効くか',
    ex.who_is_affected,
    '',
    '### 日本の会社にとって',
    ex.japan_impact,
    '',
    '### 今後の予定',
    ex.next_steps,
    '',
    '## 資料からは分からないこと',
    ...(ex.unknowns.length ? ex.unknowns.map((u) => `- ${u}`) : ['- （なし）']),
  ];
  if (ex.glossary.length) {
    lines.push('', '## 用語', ...ex.glossary.map((g) => `- ${g.term}: ${g.explanation}`));
  }
  lines.push('', '---', `公開するには: \`node scripts/explainer-publish.mjs ${ex.id}\` を実行してコミット。`, `元資料: ${record.sources.join(' / ')}`);
  return lines.join('\n');
}
