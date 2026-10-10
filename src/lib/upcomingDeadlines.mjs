// 「これからの期限」の純ロジック。ファイル I/O も import.meta も使わない（node --test から直接読む）。
// 人が確認した期限（data/deadlines.json）と、更新レコードの effective_date / deadline_date を合わせ、
// 今日より先のものを日付順に返す。日付は全て 'YYYY-MM-DD'。

/**
 * @typedef {Object} CuratedDeadline
 * @property {string} id
 * @property {string} country
 * @property {string} date
 * @property {string} kind
 * @property {string} title
 * @property {string[]} what_to_do
 * @property {string} applies_to
 * @property {string[]} sources
 * @property {string} verified
 */

/**
 * @typedef {Object} UpcomingDeadline
 * @property {string} id
 * @property {'curated'|'auto'} source
 * @property {string} country
 * @property {string} date
 * @property {number} daysLeft
 * @property {string} kind
 * @property {string} title
 * @property {string[]} sources
 * @property {string[]} [what_to_do]    curated のみ
 * @property {string} [applies_to]      curated のみ
 * @property {string} [verified]        curated のみ
 * @property {string} [updateId]        auto のみ（元の更新レコード）
 * @property {boolean} [hasExplainer]   auto のみ
 */

/** 今日から date まで何日か（date が先なら正の整数。UTC 日付どうしの差なので夏時間の影響を受けない） */
export function daysUntil(date, today) {
  const at = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((at(date) - at(today)) / 86_400_000);
}

/**
 * @param {Object} args
 * @param {CuratedDeadline[]} args.curated
 * @param {Array<{id:string,country:string,title:string,sources?:string[],effective_date?:string|null,deadline_date?:string|null}>} args.updates
 * @param {string} args.today
 * @param {Set<string>} [args.explainerIds]  解説が公開済みの更新レコード id
 * @returns {UpcomingDeadline[]}
 */
export function buildUpcomingDeadlines({ curated, updates, today, explainerIds = new Set() }) {
  /** @type {UpcomingDeadline[]} */
  const out = [];

  for (const c of curated) {
    if (!(c.date > today)) continue;
    out.push({
      id: c.id,
      source: 'curated',
      country: c.country,
      date: c.date,
      daysLeft: daysUntil(c.date, today),
      kind: c.kind,
      title: c.title,
      sources: c.sources,
      what_to_do: c.what_to_do,
      applies_to: c.applies_to,
      verified: c.verified,
    });
  }

  // 自動分。同じ国・同じ日付・同じ出典URLが curated にあれば curated を優先して捨てる
  const curatedKeys = new Set();
  for (const c of out) for (const s of c.sources) curatedKeys.add(`${c.country}|${c.date}|${s}`);
  const autoSeen = new Set();

  for (const u of updates) {
    for (const [field, kind] of [['effective_date', 'in_force'], ['deadline_date', 'other']]) {
      const date = u[field];
      if (!date || !(date > today)) continue;
      const sources = u.sources ?? [];
      if (sources.some((s) => curatedKeys.has(`${u.country}|${date}|${s}`))) continue;
      // 同じレコードで施行日と期限が同じ日付のときは1件にまとめる
      const key = `${u.id}|${date}`;
      if (autoSeen.has(key)) continue;
      autoSeen.add(key);
      out.push({
        id: `auto-${u.id}-${field}`,
        source: 'auto',
        country: u.country,
        date,
        daysLeft: daysUntil(date, today),
        kind,
        title: u.title,
        sources,
        updateId: u.id,
        hasExplainer: explainerIds.has(u.id),
      });
    }
  }

  // 日付順。同じ日付なら curated を先に、その中は id 順（並びを毎回同じにする）
  return out.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.source !== b.source) return a.source === 'curated' ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
