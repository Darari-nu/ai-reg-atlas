// 出典ページの本文取得（summarize と explain で共有）。挙動は summarize.mjs に置いていた頃から変えていない
import { JINA_READER_PREFIX, readerBody } from './pipeline.mjs';

const TIMEOUT_MS = 15_000;
const JINA_TIMEOUT_MS = 30_000; // 中継は本体取得＋変換で遅い
const USER_AGENT = 'AIRegAtlasBot/1.0 (+https://darari-nu.com/atlas/about/)';
export const DEFAULT_MAX_CHARS = 20_000;

export async function fetchText(url, timeoutMs = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

// 直接取れないときだけ r.jina.ai 経由で読む（cac.gov.cn 等は Actions ランナーの IP を弾く。collect の scrape_hash と同じ対策）
// maxChars: 返す本文の上限（既定は summarize と同じ 20,000 字）。logPrefix: ログの接頭辞
export async function fetchArticleText(url, { maxChars = DEFAULT_MAX_CHARS, logPrefix = 'summarize' } = {}) {
  try {
    const html = await fetchText(url);
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxChars);
  } catch (directErr) {
    try {
      const text = readerBody(await fetchText(JINA_READER_PREFIX + url, JINA_TIMEOUT_MS))
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // 画像リンクは本文ではないので落とす
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxChars);
      console.warn(`[${logPrefix}] fetched via jina proxy (direct: ${directErr.message}): ${url}`);
      return text;
    } catch {
      throw directErr; // 直接fetchのエラーの方が原因診断に有用
    }
  }
}
