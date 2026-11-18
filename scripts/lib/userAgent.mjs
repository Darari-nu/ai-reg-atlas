// 取得先ごとの User-Agent の選び方（純関数。fs なし）
export const BOT_USER_AGENT = 'AIRegAtlasBot/1.0 (+https://darari-nu.com/atlas/about/)';
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// 2026-11-18: mptc.gov.kh は 2026-11-16 からボット名の UA に「Request Rejected」（HTTP 200）を返す。
// 指定したホストだけブラウザの UA で取りに行く（ほかの情報源は今まで通りボット UA）。
export const BROWSER_UA_HOSTS = ['mptc.gov.kh'];

export function userAgentFor(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return BOT_USER_AGENT;
  }
  const hit = BROWSER_UA_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  return hit ? BROWSER_USER_AGENT : BOT_USER_AGENT;
}

// fetch の代わりに使う。ブラウザ UA の対象ホストは、リダイレクト先にブラウザ UA を持ち出さないよう
// 手動で 1 ホップずつ追い、ホップごとに userAgentFor(そのURL) を付け直す。
// ボット UA のホストは今まで通り自動リダイレクト（ボット UA が漏れても害はない）。
export async function fetchWithUa(url, init = {}, fetchImpl = fetch, maxRedirects = 5) {
  const withUa = (u, extra) => ({ ...extra, headers: { ...extra.headers, 'User-Agent': userAgentFor(u) } });
  if (userAgentFor(url) === BOT_USER_AGENT) {
    return fetchImpl(url, { ...init, headers: { 'User-Agent': BOT_USER_AGENT, ...init.headers } });
  }
  let current = String(url);
  let opts = { ...init, redirect: 'manual' };
  for (let hop = 0; ; hop++) {
    const res = await fetchImpl(current, withUa(current, opts));
    const loc = res.headers?.get?.('location');
    if (res.status < 300 || res.status >= 400 || !loc) return res;
    // 転送応答の本文は使わないので閉じてから次へ（接続を残さない）
    try { await res.body?.cancel?.(); } catch { /* 閉じられなくても続行 */ }
    if (hop >= maxRedirects) throw new Error('too many redirects');
    const method = (opts.method || 'GET').toUpperCase();
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && method !== 'GET' && method !== 'HEAD')) {
      const { body: _b, ...rest } = opts;
      opts = { ...rest, method: 'GET' };
    }
    current = new URL(loc, current).href;
  }
}
