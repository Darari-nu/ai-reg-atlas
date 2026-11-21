// 自サイト（Cloudflare Pages の darari-nu.com/atlas）の URL を組む純関数。astro.config.mjs と同じ既定値。
// Discord 通知のリンクに使う。env は呼ぶたびに読む（テストで差し替えられる）。
export function siteBase(env = process.env) {
  const site = (env.ASTRO_SITE || 'https://darari-nu.com').replace(/\/+$/, '');
  const base = (env.ASTRO_BASE || '/atlas').replace(/\/+$/, '');
  return `${site}${base.startsWith('/') || base === '' ? base : `/${base}`}`;
}

/** 既定の SITE_URL（読み込み時点の env）。 */
export const SITE_URL = siteBase();

/** path は '/explain/x/' のように先頭 / つき（無くても補う）。 */
export function siteUrl(path = '/', env = process.env) {
  const p = String(path);
  return `${siteBase(env)}${p.startsWith('/') ? p : `/${p}`}`;
}
