// 日次パイプライン: collect が /tmp/pipeline_notifications.json に積んだ「止まった/復旧した」を Discord に送る。
// DISCORD_WEBHOOK_URL（Secrets）が無ければ何もしない。送信に失敗してもパイプラインは落とさない（常に exit 0）。
// webhook URL は秘密なので、ログには一切出さない（エラー文にも含めない）。
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { siteUrl } from './lib/siteUrl.mjs';

export const NOTIFY_FILE = '/tmp/pipeline_notifications.json';
export const MAX_PER_POST = 10; // 1回の POST にまとめる最大件数
export const MAX_CONTENT_CHARS = 2000; // Discord の content 上限
const MAX_REASON_CHARS = 80;

function mmdd(ymd) {
  return typeof ymd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? `${ymd.slice(5, 7)}/${ymd.slice(8, 10)}` : '?';
}

const MAX_LINKS = 5; // explainer のリンク最大件数
const MAX_UPDATE_ITEMS = 8; // updates の行の最大件数

function issuesUrl(env = process.env) {
  const repo = env.GITHUB_REPOSITORY || 'Darari-nu/ai-reg-atlas';
  return `https://github.com/${repo}/issues?q=is%3Aopen+label%3Aneeds-review`;
}

/**
 * 通知1件の文面。1行目は従来どおり、リンクは2行目以降に足す。
 * - explainer: links があれば `  ・<題> <URL>`（最大5件・埋め込みを出すので <> なし）
 * - recovered/down: 情報源の URL（n.key）を <URL>（埋め込みなし）。down は Issue 一覧も
 * - updates: 🆕 新しい更新 N 件 ＋各行（最大8件）
 */
export function formatNotification(n, env = process.env) {
  if (n.type === 'explainer') {
    const head = `📝 ${String(n.label ?? '解説の下書きができました').slice(0, 120)}`; // explain.mjs / digest.mjs が積む
    const links = Array.isArray(n.links) ? n.links.filter((l) => l && l.url) : [];
    if (links.length === 0) return head;
    const lines = links.slice(0, MAX_LINKS).map((l) => `  ・${l.title ? `${String(l.title).slice(0, 80)} ` : ''}${l.url}`);
    if (links.length > MAX_LINKS) lines.push(`  ・ほか ${links.length - MAX_LINKS} 本`);
    return [head, ...lines].join('\n');
  }
  if (n.type === 'updates') {
    const items = Array.isArray(n.items) ? n.items : [];
    const lines = [`🆕 新しい更新 ${items.length} 件`];
    for (const it of items.slice(0, MAX_UPDATE_ITEMS)) {
      lines.push(`  ・${it.flag ? `${it.flag} ` : it.country_ja ? `${it.country_ja} ` : ''}${String(it.title ?? '').slice(0, 80)}${it.url ? ` <${it.url}>` : ''}`);
    }
    if (items.length > MAX_UPDATE_ITEMS) lines.push(`  ・ほか ${items.length - MAX_UPDATE_ITEMS} 件 → <${siteUrl('/updates/', env)}>`);
    return lines.join('\n');
  }
  const flag = n.flag ? `${n.flag} ` : '';
  const keyLine = typeof n.key === 'string' && /^https?:\/\//.test(n.key) ? `\n  <${n.key}>` : '';
  if (n.type === 'recovered') return `🟢 ${flag}${n.label} が復旧しました${keyLine}`;
  const reason = String(n.reason ?? '不明').slice(0, MAX_REASON_CHARS);
  return `🔴 ${flag}${n.label} が${n.days ?? 3}日続けて読み取れません（${mmdd(n.since)}〜・理由: ${reason}）${keyLine}\n  確認待ち一覧 <${issuesUrl(env)}>`;
}

/** 複数件を1つの content にまとめ、2000字に収める */
export function buildContent(items) {
  const text = items.map((n) => formatNotification(n)).join('\n');
  return text.length <= MAX_CONTENT_CHARS ? text : `${text.slice(0, MAX_CONTENT_CHARS - 1)}…`;
}

// 1件だけで2000字を超える文を、行の区切りで切って「…」を付ける（URL の途中では切らない。1行目だけで超えるときだけ字数で切る）
function truncateText(text, max = MAX_CONTENT_CHARS) {
  if (text.length <= max) return text;
  const kept = [];
  let len = 1; // 末尾の「…」
  for (const line of text.split('\n')) {
    const add = line.length + (kept.length ? 1 : 0);
    if (len + add > max) break;
    kept.push(line);
    len += add;
  }
  if (kept.length === 0) return `${text.slice(0, max - 1)}…`;
  return `${kept.join('\n')}…`;
}

/**
 * 通知の区切りで POST を組む。1回につき最大10件かつ2000字。1件の途中では切らない
 * （1件だけで2000字を超えるときだけ、その1件を行の区切りで切る）。戻り値: [{ content, count }]
 */
export function buildPosts(items, env = process.env) {
  const posts = [];
  let cur = [];
  let curLen = 0;
  const flush = () => {
    if (cur.length) posts.push({ content: cur.join('\n'), count: cur.length });
    cur = [];
    curLen = 0;
  };
  for (const n of items) {
    const text = truncateText(formatNotification(n, env));
    const add = text.length + (cur.length ? 1 : 0);
    if (cur.length >= MAX_PER_POST || curLen + add > MAX_CONTENT_CHARS) flush();
    curLen += text.length + (cur.length ? 1 : 0);
    cur.push(text);
  }
  flush();
  return posts;
}

export function chunk(items, size = MAX_PER_POST) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * 送信本体。テストでは fetchImpl / readFile / log を差し替える。
 * 戻り値は終了コード（常に 0）。
 */
export async function run({
  env = process.env,
  fetchImpl = globalThis.fetch,
  readFile = (f) => fs.readFileSync(f, 'utf8'),
  file = NOTIFY_FILE,
  log = console,
} = {}) {
  const webhook = env.DISCORD_WEBHOOK_URL;
  let items = [];
  try {
    const parsed = JSON.parse(readFile(file));
    if (Array.isArray(parsed)) items = parsed;
  } catch {
    // ファイル無し・壊れていれば0件扱い
  }
  if (items.length === 0) {
    log.log('[notify] 通知なし');
    return 0;
  }
  if (!webhook) {
    log.log(`[notify] DISCORD_WEBHOOK_URL 未設定のため送信しない（${items.length}件）`);
    return 0;
  }
  let sent = 0;
  for (const post of buildPosts(items, env)) {
    try {
      const res = await fetchImpl(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // allowed_mentions で @everyone 等の誤爆を防ぐ
        body: JSON.stringify({ content: post.content, allowed_mentions: { parse: [] } }),
      });
      if (!res.ok) {
        log.warn(`[notify] Discord への送信に失敗 HTTP ${res.status}`);
        continue;
      }
      sent += post.count;
    } catch (e) {
      // e.message に URL が入りうるので出さない。名前だけ
      log.warn(`[notify] Discord への送信に失敗 (${e?.name ?? 'Error'})`);
    }
  }
  log.log(`[notify] sent=${sent}/${items.length}`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run().then((code) => process.exit(code));
}
