// 日次パイプライン: collect が /tmp/pipeline_notifications.json に積んだ「止まった/復旧した」を Discord に送る。
// DISCORD_WEBHOOK_URL（Secrets）が無ければ何もしない。送信に失敗してもパイプラインは落とさない（常に exit 0）。
// webhook URL は秘密なので、ログには一切出さない（エラー文にも含めない）。
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const NOTIFY_FILE = '/tmp/pipeline_notifications.json';
export const MAX_PER_POST = 10; // 1回の POST にまとめる最大件数
export const MAX_CONTENT_CHARS = 2000; // Discord の content 上限
const MAX_REASON_CHARS = 80;

function mmdd(ymd) {
  return typeof ymd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? `${ymd.slice(5, 7)}/${ymd.slice(8, 10)}` : '?';
}

/** 通知1件を1行の文面にする */
export function formatNotification(n) {
  if (n.type === 'explainer') return `📝 ${String(n.label ?? '解説の下書きができました').slice(0, 120)}`; // explain.mjs が積む
  const flag = n.flag ? `${n.flag} ` : '';
  if (n.type === 'recovered') return `🟢 ${flag}${n.label} が復旧しました`;
  const reason = String(n.reason ?? '不明').slice(0, MAX_REASON_CHARS);
  return `🔴 ${flag}${n.label} が${n.days ?? 3}日続けて読み取れません（${mmdd(n.since)}〜・理由: ${reason}）`;
}

/** 複数件を1つの content にまとめ、2000字に収める */
export function buildContent(items) {
  const text = items.map(formatNotification).join('\n');
  return text.length <= MAX_CONTENT_CHARS ? text : `${text.slice(0, MAX_CONTENT_CHARS - 1)}…`;
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
  for (const group of chunk(items)) {
    try {
      const res = await fetchImpl(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // allowed_mentions で @everyone 等の誤爆を防ぐ
        body: JSON.stringify({ content: buildContent(group), allowed_mentions: { parse: [] } }),
      });
      if (!res.ok) {
        log.warn(`[notify] Discord への送信に失敗 HTTP ${res.status}`);
        continue;
      }
      sent += group.length;
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
