// パイプラインが日をまたいで持ち越す状態（data/state/*.json）の読み書き。
// data/.cache/ は .gitignore 済みで CI では毎回空になるため、持ち越したい状態はこちらに置く。
// 保存するのは URL・タイトル・抜粋と判定結果だけ。記事本文（生データ）は保存しない（§4-1）。
import fs from 'node:fs';
import { dataPath, daysBetween, isYmd, rootPath, writeJSON } from './pipeline.mjs';

// 既知URLの記憶（seen_urls）の有効期限。切れたら忘れてもう一度拾い直す
export const SEEN_URL_TTL_DAYS = Number(process.env.SEEN_URL_TTL_DAYS || 30);
// last_seen がどれだけ古くても、これより前までは遡らない（状態が古いときの大量再収集を防ぐ）
export const LAST_SEEN_MAX_LOOKBACK_DAYS = Number(process.env.LAST_SEEN_MAX_LOOKBACK_DAYS || 14);

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
