// 週1ダイジェスト原稿の純関数群: 対象週の決定・入力の組み立て・出力の検査・Markdown 化・原稿ファイルの検査。
// API 呼び出し（generateDigest）は client を引数で受け取る（テストではモックに差し替える）。
// Claude 呼び出しの作りは lib/explainer.mjs と同じ（create＋output_config.format＋zodOutputFormat の自前 parse）。
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import {
  DEFAULT_MODEL,
  EFFORT,
  MAX_TOKENS,
  classifyApiError,
  hasLongCopy,
  shingleSet,
} from './explainer.mjs';
import { buildUpcomingDeadlines } from '../../src/lib/upcomingDeadlines.mjs';

export { DEFAULT_MODEL, MAX_TOKENS, EFFORT };
export const ATLAS_URL_DEFAULT = 'https://darari-nu.com/atlas'; // 末尾スラッシュなし。DIGEST_ATLAS_URL で差し替え可

export const MAX_RECORDS = 40; // モデルに渡す先週分レコードの上限（費用の上限）
export const DEADLINE_WINDOW_DAYS = 90;
export const MAX_DEADLINE_LINES = 8;
export const MIN_BODY_CHARS = 200; // kiji-intake の決まり（本文200字以上）

export const LIMITS = {
  title: [1, 30], // 「今週のAI規制：<title>（YYYY/MM/DD週）」の <title> 部分。全体で40字前後になる
  summary: [1, 120],
  picksCount: [1, 3],
  headline: [1, 40],
  what: [1, 300],
  one_liner: [1, 200],
  othersCount: [0, 5],
  line: [1, 100],
};

/* ---------- 日付（JST・ISO週） ---------- */

const DAY = 86_400_000;
const ymdToMs = (ymd) => Date.parse(`${ymd}T00:00:00Z`);
const msToYmd = (ms) => new Date(ms).toISOString().slice(0, 10);

/** 'YYYY-MM-DD' に n 日足す */
export function addDays(ymd, n) {
  return msToYmd(ymdToMs(ymd) + n * DAY);
}

/** ISO 週ラベル 'YYYY-Www'（年またぎは木曜の属する年） */
export function isoWeekLabel(ymd) {
  const ms = ymdToMs(ymd);
  const dow = (new Date(ms).getUTCDay() + 6) % 7; // 月=0
  const thu = ms - dow * DAY + 3 * DAY;
  const year = new Date(thu).getUTCFullYear();
  const week = Math.floor((thu - Date.UTC(year, 0, 1)) / DAY / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * 今日（JST の日付）から見た「先週（月〜日）」。月曜の朝に走らせれば直前の月〜日になる。
 * 何曜日に走らせても、今週の月曜より前の完全な1週間を返す。
 */
export function targetWeek(todayJst) {
  const dow = (new Date(ymdToMs(todayJst)).getUTCDay() + 6) % 7;
  const thisMonday = addDays(todayJst, -dow);
  const from = addDays(thisMonday, -7);
  return { from, to: addDays(from, 6), label: isoWeekLabel(from) };
}

/* ---------- 入力の組み立て ---------- */

const STAGE_PRIORITY = { in_force: 0, enacted: 0, final_guidance: 0, bill: 1, draft_or_consultation: 2, announcement: 3 };
const recKey = (r) => r.discovered_at ?? r.date;

/** 先週分（discovered_at、無ければ date が from〜to）のレコードを、重要そうな順に MAX_RECORDS 件まで */
export function selectWeekRecords(records, { from, to }) {
  return records
    .filter((r) => r && r.id && Array.isArray(r.sources) && r.sources.length > 0)
    .filter((r) => {
      const k = recKey(r);
      return typeof k === 'string' && k >= from && k <= to;
    })
    .sort((a, b) => {
      const pa = (STAGE_PRIORITY[a.legal_stage] ?? 4) * 2 + (a.source_kind === 'official' ? 0 : 1);
      const pb = (STAGE_PRIORITY[b.legal_stage] ?? 4) * 2 + (b.source_kind === 'official' ? 0 : 1);
      if (pa !== pb) return pa - pb;
      return a.id < b.id ? 1 : -1;
    })
    .slice(0, MAX_RECORDS);
}

/** 解説ページ・国別ページ・元資料の URL（コードで組み立てる。モデルには書かせない） */
export function atlasLinks(record, publishedIds, base = ATLAS_URL_DEFAULT) {
  return {
    atlas_url: publishedIds.has(record.id) ? `${base}/explain/${record.id}/` : `${base}/country/${record.country}/#u-${record.id}`,
    source_url: record.sources[0],
  };
}

/** モデルに渡す入力（レコード要約と、あれば公開済みの解説の lead / facts だけ。本文の再取得はしない） */
export function buildDigestInput({ records, explainers = [], countries = {}, week }) {
  const exById = new Map(explainers.map((e) => [e.record_id ?? e.id, e]));
  return {
    week,
    records: records.map((r) => {
      const ex = exById.get(r.id);
      return {
        record_id: r.id,
        country: countries[r.country]?.name_ja ?? r.country,
        legal_stage: r.legal_stage ?? null,
        source_kind: r.source_kind ?? null,
        title: r.title,
        what: r.summary?.what ?? null,
        so_what: r.so_what ?? null,
        effective_date: r.effective_date ?? null,
        deadline_date: r.deadline_date ?? null,
        ...(ex ? { explainer_lead: ex.lead, explainer_facts: ex.facts.map((f) => f.text) } : {}),
      };
    }),
  };
}

/* ---------- スキーマ・プロンプト ---------- */

export const DigestSchema = z.object({
  title: z.string(),
  summary: z.string(),
  picks: z.array(z.object({ record_id: z.string(), headline: z.string(), what: z.string(), one_liner: z.string() })),
  others: z.array(z.object({ record_id: z.string(), line: z.string() })),
});

// 固定文。日付・件数などの可変値を入れない（プレフィックスキャッシュを効かせるため）
export const SYSTEM_PROMPT = `あなたは、世界のAI規制の動きを日本の企業の担当者向けに週1回まとめる編集者です。与えられた「先週の更新レコード」だけを材料に、「今週のAI規制の変化3つ」と「社内で聞かれたときの一言」の原稿を、指定のJSON構造で書いてください。読むのは、社内でAI導入・運用を担当している人（情シス・法務・企画）で、3分で自社に関係しそうな動きを把握し、上司に聞かれたら一言で答えられるようにするのが目的です。

## 絶対に守ること
- 入力のレコードに書かれていないことを、事実として書かない。あなたの一般知識で補足しない。分からないことは書かない。
- 事実（資料に書いてあること）と解釈（あなたの読み）を混ぜない。picks の what は事実だけ、one_liner は解釈だけ。
- URL・リンクは一切書かない（コード側で付ける）。record_id は入力にあるものを一字一句そのまま使う。入力にない record_id を作らない。
- 筆者の個人的な体験・経験談・「私の会社では」のような一次体験は書かない。
- 入力が報道由来（source_kind が media）のときは、言い回しを写さず自分の言葉で言い直す。
- 日本語で、「です・ます」調。誇張しない。煽らない。法的助言ではなく情報整理であることを忘れない。

## 3つの選び方
- 先週のレコードから、重要な順に最大3つ選ぶ（候補が3件未満ならある分だけ。無理に3つにしない）。
- 重要度の目安: 法的な段階が進んでいるもの（成立・施行・確定した指針）を優先する。次に法案・草案・意見募集。出典が公式資料のもの（source_kind が official）を優先する。日本企業（日本から海外へサービスを出す、海外拠点や取引先がある）に関係が大きいものを優先する。
- 同じ出来事のレコードが複数あれば1つにまとめて扱う（record_id は代表の1つ）。

## 各項目の書き方
- title: 今週の一番大きな変化を一言で。25字前後、30字を超えない。「今週のAI規制：」や日付は付けない（コードが付ける）。
- summary: 今週の全体を120字以内で。
- picks[].headline: その変化の見出し。35字前後、40字を超えない。国名は付けない（コードが付ける）。
- picks[].what: 何が起きたか。資料に書いてあることだけを1〜3文、300字以内。
- picks[].one_liner: 「社内で聞かれたときの一言」。上司に聞かれて答える口調の1〜2文、200字以内。うちの会社に関係するか、何を確認すればよいかの解釈。断定を避け、根拠に応じた強さで書く。
- others: 3つに入らなかったその他の動きを最大5件。1件1行（100字以内）。picks と同じ record_id は使わない。無ければ空配列。`;

export function buildUserMessage(input) {
  return [
    `## 対象週: ${input.week.from} 〜 ${input.week.to}（日本時間・月〜日）`,
    '',
    '## 先週の更新レコード（record_id は一字一句このとおりに使う）',
    JSON.stringify(input.records, null, 2),
  ].join('\n');
}

/* ---------- 出力の検査 ---------- */

function inRange(s, [min, max]) {
  const len = [...String(s ?? '')].length;
  return len >= min && len <= max;
}
const hasUrlLike = (s) => /https?:|www\./i.test(String(s ?? ''));
const hasBreaker = (s) => /[\n\r]/.test(String(s ?? '')); // 1行のはずの項目に改行が入ると frontmatter・箇条書きが崩れる

/**
 * 検査。{ ok, reasons[] }。URL はモデルに書かせない（http 等が入ったら不合格）。record_id は入力のものだけ。
 * 報道由来（official 以外）の項目は、入力の文面（要約・解説の事実）との長い連続一致を不合格にする（既存の写し防止を再利用）。
 */
export function checkDigest(out, input) {
  const reasons = [];
  if (!out || typeof out !== 'object') return { ok: false, reasons: ['no-output'] };
  const byId = new Map(input.records.map((r) => [r.record_id, r]));

  if (!inRange(out.title, LIMITS.title)) reasons.push(`title-length(${[...String(out.title ?? '')].length})`);
  if (!inRange(out.summary, LIMITS.summary)) reasons.push(`summary-length(${[...String(out.summary ?? '')].length})`);

  const picks = Array.isArray(out.picks) ? out.picks : [];
  if (picks.length < LIMITS.picksCount[0] || picks.length > LIMITS.picksCount[1]) reasons.push(`picks-count(${picks.length})`);
  const seen = new Set();
  picks.forEach((p, i) => {
    if (!byId.has(p?.record_id)) reasons.push(`pick[${i}]-record-not-in-input`);
    if (seen.has(p?.record_id)) reasons.push(`pick[${i}]-duplicate`);
    seen.add(p?.record_id);
    if (!inRange(p?.headline, LIMITS.headline)) reasons.push(`pick[${i}]-headline-length`);
    if (!inRange(p?.what, LIMITS.what)) reasons.push(`pick[${i}]-what-length`);
    if (!inRange(p?.one_liner, LIMITS.one_liner)) reasons.push(`pick[${i}]-one_liner-length`);
  });

  const others = Array.isArray(out.others) ? out.others : [];
  if (others.length > LIMITS.othersCount[1]) reasons.push(`others-count(${others.length})`);
  others.forEach((o, i) => {
    if (!byId.has(o?.record_id)) reasons.push(`other[${i}]-record-not-in-input`);
    if (seen.has(o?.record_id)) reasons.push(`other[${i}]-duplicate`);
    seen.add(o?.record_id);
    if (!inRange(o?.line, LIMITS.line)) reasons.push(`other[${i}]-line-length`);
  });

  const texts = [
    ['title', out.title],
    ['summary', out.summary],
    ...picks.flatMap((p, i) => [
      [`pick[${i}].headline`, p?.headline],
      [`pick[${i}].what`, p?.what],
      [`pick[${i}].one_liner`, p?.one_liner],
    ]),
    ...others.map((o, i) => [`other[${i}].line`, o?.line]),
  ];
  for (const [name, t] of texts) {
    if (hasUrlLike(t)) reasons.push(`url-in-text(${name})`);
    if (hasBreaker(t)) reasons.push(`newline-in-text(${name})`);
  }

  // 写し防止（報道由来のみ）
  for (const [kind, items] of [['pick', picks], ['other', others]]) {
    items.forEach((it, i) => {
      const rec = byId.get(it?.record_id);
      if (!rec || rec.source_kind === 'official') return;
      const material = [rec.title, rec.what, rec.so_what, rec.explainer_lead, ...(rec.explainer_facts ?? [])].filter(Boolean).join('\n');
      const sh = shingleSet(material);
      const fields = kind === 'pick' ? [it.headline, it.what, it.one_liner] : [it.line];
      if (fields.some((f) => hasLongCopy(f, sh))) reasons.push(`copied-from-source(${kind}[${i}])`);
    });
  }

  return { ok: reasons.length === 0, reasons };
}

/* ---------- API 呼び出し ---------- */

/**
 * 週1本のダイジェストを生成する。client は Anthropic SDK のクライアント（テストではモック）。
 * 戻り値: { status: 'ok', digest, usage } | { status: 'skip'|'abort', reason, usage? }
 */
export async function generateDigest({ client, model = DEFAULT_MODEL, input }) {
  const format = zodOutputFormat(DigestSchema);
  let msg;
  try {
    // temperature 等のサンプリング指定・thinking 指定・assistant prefill は Sonnet 5.5 で 400 になるので付けない
    msg = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: buildUserMessage(input) }],
      output_config: { effort: EFFORT, format },
    });
  } catch (err) {
    const status = err?.status ?? null;
    return { status: classifyApiError(err), reason: `api-error(${status ?? err?.name ?? 'Error'}): ${String(err?.message ?? '').slice(0, 160)}` };
  }
  const usage = msg.usage ?? null;
  if (msg.stop_reason === 'refusal') return { status: 'skip', reason: 'refusal', usage };
  if (msg.stop_reason === 'max_tokens') return { status: 'skip', reason: 'max_tokens', usage };
  const text = (msg.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    return { status: 'ok', digest: format.parse(text), usage };
  } catch (e) {
    return { status: 'skip', reason: 'parse-failed', usage, detail: String(e?.message ?? '').slice(0, 160) };
  }
}

/* ---------- Markdown 化（kiji-intake の原稿の形） ---------- */

// intake の frontmatter は1行 key: value・クォート非対応なので、改行とダブルクォートを落とす
const fm1 = (s) => String(s ?? '').replace(/["\n\r]/g, ' ').replace(/\s+/g, ' ').trim();

const slashDate = (ymd) => ymd.replace(/-/g, '/');

/** これからの期限（90日以内）の行。人が確認した期限も意見募集の締切（自動分）も。URL はコード生成 */
export function deadlineLines({ curated, updates, today, countries = {}, base = ATLAS_URL_DEFAULT }) {
  return buildUpcomingDeadlines({ curated, updates, today })
    .filter((d) => d.daysLeft <= DEADLINE_WINDOW_DAYS)
    .slice(0, MAX_DEADLINE_LINES)
    .map((d) => {
      const left = d.daysLeft === 0 ? '今日まで' : `あと${d.daysLeft}日`;
      const anchor = d.source === 'curated' ? `#dl-${d.id}` : '#deadlines';
      return `- ${d.date}（${left}）${countries[d.country]?.name_ja ?? d.country}：${fm1(d.title)} → ${base}/timeline/${anchor}`;
    });
}

/**
 * 原稿本体を作る。picks は入力の record_id から、国旗・国名・URL をコード側で付ける。
 * 戻り値: { markdown, title }
 */
export function digestToMarkdown({ digest, input, records, publishedIds = new Set(), countries = {}, deadlines = [], base = ATLAS_URL_DEFAULT }) {
  const recById = new Map(records.map((r) => [r.id, r]));
  const place = (id) => {
    const r = recById.get(id);
    const c = countries[r.country] ?? {};
    return { label: `${c.flag ? `${c.flag} ` : ''}${c.name_ja ?? r.country}`, links: atlasLinks(r, publishedIds, base) };
  };
  const title = `今週のAI規制：${fm1(digest.title)}（${slashDate(input.week.from)}週）`;
  const lines = [
    '---',
    `title: ${title}`,
    'source: AI Reg Atlas（Claude Sonnet 5.5 が週次で下書き）',
    'dare: 社内でAI導入・運用を担当している人（情シス・法務・企画）',
    'henka: 今週の各国のAI規制の動きのうち、自社に関係しそうなものを3分で把握し、上司に聞かれたら一言で答えられる',
    'mode: sozai',
    `summary: ${fm1(digest.summary)}`,
    '---',
    '## 今週の変化3つ',
  ];
  digest.picks.forEach((p, i) => {
    const { label, links } = place(p.record_id);
    lines.push(
      `### ${i + 1}. ${fm1(p.headline)}（${label}）`,
      `- 何が起きたか（資料に書いてあること）: ${fm1(p.what)}`,
      `- 社内で聞かれたときの一言（解釈）: ${fm1(p.one_liner)}`,
      `- 詳しく: ${links.atlas_url} ／ 元資料: ${links.source_url}`,
      '',
    );
  });
  lines.push('## これからの期限（90日以内）');
  lines.push(...(deadlines.length ? deadlines : ['- 90日以内に、人が確認した期限・意見募集の締切はいまのところありません。']));
  if (digest.others.length) {
    lines.push('', '## 今週のその他の動き');
    for (const o of digest.others) {
      const { label, links } = place(o.record_id);
      lines.push(`- ${fm1(o.line)}（${label}）${links.atlas_url}`);
    }
  }
  lines.push('', '---', `出典と詳しい解説は AI Reg Atlas（${base}/）。法的助言ではありません。`, '');
  return { markdown: lines.join('\n'), title };
}

/* ---------- 原稿ファイルの検査（validate.mjs・テスト用） ---------- */

/** dispatch の intake.mjs と同じ寛容な frontmatter 読み（1行 key: value） */
export function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fm: null, body: raw.trim() };
  const fm = {};
  for (const line of m[1].split('\n')) {
    const k = line.match(/^([\w-]+):\s*(.*)$/);
    if (k) fm[k[1]] = k[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return { fm, body: m[2].trim() };
}

/** kiji-intake の形か。{ ok, reasons[] }。必須: title・source・summary・mode(sozai|asis)、本文200字以上、鍵らしき文字列なし */
export function checkDigestFile(raw) {
  const reasons = [];
  const { fm, body } = parseFrontmatter(raw);
  if (!fm) return { ok: false, reasons: ['no-frontmatter'] };
  for (const k of ['title', 'source', 'summary', 'mode']) if (!fm[k]) reasons.push(`missing-${k}`);
  if (fm.mode && !['sozai', 'asis'].includes(fm.mode)) reasons.push('bad-mode');
  if (fm.summary && [...fm.summary].length > 120) reasons.push('summary-too-long');
  const n = [...body].length;
  if (n < MIN_BODY_CHARS) reasons.push(`body-too-short(${n})`);
  if (/(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY)/.test(raw)) reasons.push('secret-like-string');
  return { ok: reasons.length === 0, reasons };
}
