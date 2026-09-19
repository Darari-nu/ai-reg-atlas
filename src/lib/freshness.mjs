// 鮮度（更新レコードの発見日まわり）の純ロジック。
// node --test から直接読めるよう .mjs に置き、fs も import.meta も使わない。
// 日付は全て 'YYYY-MM-DD' 文字列。大小比較は文字列比較で足りる。

/**
 * @typedef {Object} UpdateLike
 * @property {string} id
 * @property {string} date               公表日
 * @property {string} [discovered_at]    発見日（古いレコードには無い）
 * @property {string} country
 */

/**
 * @typedef {Object} CountryLike
 * @property {string} code
 * @property {string} name_ja
 * @property {string} flag
 * @property {number} lat
 * @property {number} lng
 * @property {SubregionLike[]} [subregions]
 */

/**
 * @typedef {Object} SubregionLike
 * @property {string} code
 * @property {string} name_ja
 * @property {number} lat
 * @property {number} lng
 */

/**
 * @typedef {Object} Marker
 * @property {string} code
 * @property {'country'|'subregion'} kind
 * @property {string} name_ja
 * @property {string} flag
 * @property {number} lat
 * @property {number} lng
 * @property {string} path
 * @property {number|null} ageDays
 */

/**
 * 発見日。無いレコードは公表日で代用する。
 * @param {UpdateLike} u
 * @returns {string}
 */
export function discoveryDate(u) {
  return u.discovered_at ?? u.date;
}

/**
 * 発見日順（新しい順）に並べた新しい配列を返す。元配列は変えない。
 * 同じ発見日なら公表日降順 → id降順で決着させる（並びを安定させるため）。
 * @param {UpdateLike[]} updates
 * @returns {UpdateLike[]}
 */
export function sortByDiscovery(updates) {
  const cmp = (a, b) => (a < b ? 1 : a > b ? -1 : 0); // 降順
  return [...updates].sort(
    (a, b) =>
      cmp(discoveryDate(a), discoveryDate(b)) || cmp(a.date, b.date) || cmp(a.id, b.id)
  );
}

/**
 * 国ごとの最新の発見日。
 * @param {UpdateLike[]} updates
 * @returns {Record<string, string>}
 */
export function latestDateByCountry(updates) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const u of updates) {
    const d = discoveryDate(u);
    if (!d) continue;
    if (!out[u.country] || d > out[u.country]) out[u.country] = d;
  }
  return out;
}

/**
 * today − ymd を日数で返す。負なら 0。
 * UTC の日付演算なので夏時間の影響を受けない（pipeline.mjs の daysBetween と同じ方式）。
 * @param {string} ymd
 * @param {string} today
 * @returns {number}
 */
export function daysAgo(ymd, today) {
  const at = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  const n = Math.floor((at(today) - at(ymd)) / 86_400_000);
  return n > 0 ? n : 0;
}

/**
 * 日数の表示文字列。
 * @param {number} n
 * @returns {string}
 */
export function fmtDaysAgo(n) {
  if (n === 0) return '今日';
  if (n === 1) return '昨日';
  return `${n}日前`;
}

/**
 * 直近 days 日以内に発見した更新レコードの件数（ちょうど days 日前は含まない）。
 * @param {UpdateLike[]} updates
 * @param {string} today
 * @param {number} days
 * @returns {number}
 */
export function countWithin(updates, today, days) {
  return updates.filter((u) => daysAgo(discoveryDate(u), today) < days).length;
}

/**
 * 鮮度の段階。表示側の色分け用。
 * @param {number|null} ageDays
 * @returns {'none'|'week'|'month'|'old'}
 */
export function ageTier(ageDays) {
  if (ageDays === null || ageDays === undefined) return 'none';
  if (ageDays <= 7) return 'week';
  if (ageDays <= 30) return 'month';
  return 'old';
}

/**
 * 地球儀のマーカー一覧。国 → その国の subregions の順（DOM順＝Tab順）。
 * @param {CountryLike[]} countries
 * @param {Record<string, string>} latestByCc 国ごとの最新発見日
 * @param {string} today
 * @returns {Marker[]}
 */
export function globeMarkers(countries, latestByCc, today) {
  /** @type {Marker[]} */
  const out = [];
  for (const c of countries) {
    const latest = latestByCc[c.code];
    out.push({
      code: c.code,
      kind: 'country',
      name_ja: c.name_ja,
      flag: c.flag,
      lat: c.lat,
      lng: c.lng,
      path: `/country/${c.code}/`,
      ageDays: latest ? daysAgo(latest, today) : null,
    });
    for (const s of c.subregions ?? []) {
      out.push({
        code: s.code,
        kind: 'subregion',
        name_ja: s.name_ja,
        flag: c.flag, // 親の国旗を流用
        lat: s.lat,
        lng: s.lng,
        path: `/country/${c.code}/#subregions`,
        ageDays: null, // 小地域ごとの更新レコードは無いので鮮度は付けない
      });
    }
  }
  return out;
}
