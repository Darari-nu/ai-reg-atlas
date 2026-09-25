// パイプラインが日をまたいで持ち越す状態（data/state/*.json）の読み書き。
// data/.cache/ は .gitignore 済みで CI では毎回空になるため、持ち越したい状態はこちらに置く。
// 保存するのは URL・タイトル・抜粋と判定結果だけ。記事本文（生データ）は保存しない（§4-1）。
import fs from 'node:fs';
import { dataPath, daysBetween, isYmd, rootPath, SOURCE_GROUP_ORDER, writeJSON } from './pipeline.mjs';

// 既知URLの記憶（seen_urls）の有効期限。切れたら忘れてもう一度拾い直す
export const SEEN_URL_TTL_DAYS = Number(process.env.SEEN_URL_TTL_DAYS || 30);
// last_seen がどれだけ古くても、これより前までは遡らない（状態が古いときの大量再収集を防ぐ）
export const LAST_SEEN_MAX_LOOKBACK_DAYS = Number(process.env.LAST_SEEN_MAX_LOOKBACK_DAYS || 14);

// あふれ分の繰り越し（queue）の上限・有効期限・再挑戦回数
export const QUEUE_MAX = 50;
export const QUEUE_TTL_DAYS = 7;
export const QUEUE_MAX_ATTEMPTS = 3;
// queue に入れる項目（記事本文は入れない。URL・タイトル・抜粋と選別結果だけ）
export const QUEUE_FIELDS = [
  'url',
  'title',
  'snippet',
  'country_hint',
  'source_type',
  'source_group',
  'countries',
  'priority',
  'canonical_event',
];

// この verdict が付いたURLは再 triage・再要約しない。
// blocked-or-js-only-page と fetch 失敗は一時的な失敗なので含めない（翌日また試す）
export const SKIP_VERDICTS = [
  'gemini-unusable',
  'no-ai-reg-keyword',
  'body-too-short',
  'stale-publication-date',
  'triage-irrelevant',
];

/** 壊れたJSONは fallback を返して warn する（状態ファイルの破損でパイプラインを止めない） */
export function readStateFile(file, fallback) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return fallback; // 未作成は正常
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`[state] 壊れた状態ファイルを無視して初期値で続行: ${file} (${e.message})`);
    return fallback;
  }
}

/** 読み込み規則は readDataJSON と同じ: DRY_RUN なら /tmp/dry を先に見て、無ければリポジトリの data/state */
export function readState(name, fallback) {
  const target = dataPath('state', name);
  if (fs.existsSync(target)) return readStateFile(target, fallback);
  return readStateFile(rootPath('data', 'state', name), fallback);
}

export function writeState(name, data) {
  writeJSON(dataPath('state', name), data);
}

/** last_seen の遡り上限: threshold = max(prev, now − maxDays日)。prev が無ければ null（呼び出し側が初回窓を使う） */
export function clampLookback(prev, now, maxDays = LAST_SEEN_MAX_LOOKBACK_DAYS) {
  const prevDate = prev instanceof Date ? prev : prev ? new Date(prev) : null;
  if (!prevDate || Number.isNaN(prevDate.getTime())) return null;
  const limit = new Date(now.getTime() - maxDays * 86_400_000);
  return prevDate > limit ? prevDate : limit;
}

/** seen_urls に1件記録する（本文は入れない） */
export function markSeen(map, url, verdict, date) {
  if (!url || !verdict) return map;
  map[url] = { verdict, date };
  return map;
}

/** 再 triage・再要約しない verdict か */
export function isSkippable(entry) {
  return Boolean(entry) && SKIP_VERDICTS.includes(entry.verdict);
}

/** TTL切れ・日付不正のエントリを落とす（ファイルが無限に育たないように毎回かける） */
export function pruneSeenUrls(map, today, ttlDays = SEEN_URL_TTL_DAYS) {
  const out = {};
  for (const [url, entry] of Object.entries(map ?? {})) {
    if (!entry || typeof entry.verdict !== 'string' || !isYmd(entry.date)) continue;
    if (daysBetween(entry.date, today) > ttlDays) continue;
    out[url] = { verdict: entry.verdict, date: entry.date };
  }
  return out;
}

// ---- queue（要約のあふれの繰り越し）--------------------------------------

/** 繰り越し用の形に落とす。本文（articleText）など余計なキーは捨てる */
export function toQueueItem(item, { today, bumpAttempts = false } = {}) {
  const out = {};
  for (const key of QUEUE_FIELDS) if (item[key] !== undefined) out[key] = item[key];
  out.queued_at = isYmd(item.queued_at) ? item.queued_at : today;
  out.attempts = (Number.isInteger(item.attempts) ? item.attempts : 0) + (bumpAttempts ? 1 : 0);
  return out;
}

/** まだ使える繰り越しか（TTL内・再挑戦回数の上限未満） */
export function isQueueItemLive(entry, today, ttlDays = QUEUE_TTL_DAYS, maxAttempts = QUEUE_MAX_ATTEMPTS) {
  if (!entry?.url) return false;
  if ((Number.isInteger(entry.attempts) ? entry.attempts : 0) >= maxAttempts) return false;
  const queuedAt = isYmd(entry.queued_at) ? entry.queued_at : today;
  return daysBetween(queuedAt, today) <= ttlDays;
}

/** queue から今日処理できるものを取り出す（TTL切れ・打ち切り済みはここで消える） */
export function dequeueItems(queue, today, ttlDays = QUEUE_TTL_DAYS, maxAttempts = QUEUE_MAX_ATTEMPTS) {
  return (Array.isArray(queue) ? queue : []).filter((e) => isQueueItemLive(e, today, ttlDays, maxAttempts));
}

/** 繰り越し分と今日の triaged を URL で重複排除する。内容は今日を優先し、queued_at/attempts は繰り越し分を引き継ぐ */
export function mergeByUrl(queued, todays) {
  const byUrl = new Map();
  for (const item of queued ?? []) if (item?.url) byUrl.set(item.url, item);
  for (const item of todays ?? []) {
    if (!item?.url) continue;
    const prev = byUrl.get(item.url);
    byUrl.set(item.url, prev ? { ...item, queued_at: prev.queued_at, attempts: prev.attempts } : item);
  }
  return [...byUrl.values()];
}

/**
 * priority high → low、同順位は source_group の順（official_sources > watch_feeds > news_queries、
 * それ以外は最後）、さらに同順位は queued_at（無ければ today）が古い順＝翌日優先。
 * 報道が増えた日に公式が queue に押し出されないよう、第2キーに source_group を入れている（§追加指示 必須3c）
 */
export function sortForSummarize(items, today) {
  const rank = (p) => (p === 'high' ? 0 : 1);
  const groupRank = (g) => SOURCE_GROUP_ORDER[g] ?? 9;
  return [...items].sort((a, b) => {
    const byPriority = rank(a.priority) - rank(b.priority);
    if (byPriority !== 0) return byPriority;
    const byGroup = groupRank(a.source_group) - groupRank(b.source_group);
    if (byGroup !== 0) return byGroup;
    const qa = isYmd(a.queued_at) ? a.queued_at : today;
    const qb = isYmd(b.queued_at) ? b.queued_at : today;
    return qa < qb ? -1 : qa > qb ? 1 : 0;
  });
}

/** 次回へ繰り越す queue を組む。URLで重複排除し、上限超過分は priority低・古い順に捨てる */
export function enqueue(items, today, max = QUEUE_MAX) {
  const byUrl = new Map();
  for (const item of items ?? []) {
    if (!item?.url) continue;
    const prev = byUrl.get(item.url);
    // 同一URLが複数経路で来たら attempts の多い方（より多く失敗した記録）を残す
    if (!prev || (item.attempts ?? 0) > (prev.attempts ?? 0)) byUrl.set(item.url, item);
  }
  const all = [...byUrl.values()];
  const rank = (p) => (p === 'high' ? 0 : 1);
  const keepOrder = [...all].sort((a, b) => {
    const byPriority = rank(a.priority) - rank(b.priority);
    if (byPriority !== 0) return byPriority; // high を残す
    const qa = isYmd(a.queued_at) ? a.queued_at : today;
    const qb = isYmd(b.queued_at) ? b.queued_at : today;
    return qa < qb ? 1 : qa > qb ? -1 : 0; // 同順位なら古いものから捨てる＝新しいものを残す
  });
  return { queue: keepOrder.slice(0, max), dropped: Math.max(0, keepOrder.length - max) };
}
