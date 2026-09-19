// 更新レコードから年表の「派生イベント」を作る純ロジック。API もファイル I/O も使わない。
// 種データ（data/regulations/*.json の axes.timeline）＋ 更新フィード由来の派生イベント、の二層構成。

/**
 * @typedef {Object} SeedItem
 * @property {string} date
 * @property {string} event
 * @property {string} source
 */

/**
 * @typedef {Object} UpdateLike
 * @property {string} id
 * @property {string} date
 * @property {string} title
 * @property {string[]} [sources]
 * @property {string|null} [effective_date]
 * @property {string|null} [deadline_date]
 */

/**
 * @typedef {Object} DerivedEvent
 * @property {string} date
 * @property {string} event
 * @property {string} source
 * @property {'seed'|'derived'|'derived-effective'|'derived-deadline'} kind
 * @property {boolean} scheduled
 * @property {string} [updateId]
 */

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** @param {unknown} v @returns {v is string} */
function isYmd(v) {
  return typeof v === 'string' && YMD.test(v);
}

/**
 * 1国分の更新レコードから派生イベントを作る（国での絞り込みは呼び出し側の責任）。
 * @param {UpdateLike[]} updates
 * @param {SeedItem[]} [seedTimeline]
 * @returns {DerivedEvent[]}
 */
export function deriveTimelineEvents(updates, seedTimeline = []) {
  const seeds = seedTimeline ?? [];
  const seedDates = new Set(seeds.map((t) => t.date));
  const seedSources = new Set(seeds.map((t) => t.source).filter(Boolean));

  /** @type {DerivedEvent[]} */
  const out = [];
  for (const u of updates ?? []) {
    const source = u.sources?.[0] ?? '';

    // 1) 公表イベント。既に種データ化されている（summarize の timeline_add 経由）なら二重表示しない
    const dup = seedDates.has(u.date) || (source !== '' && seedSources.has(source));
    if (!dup && isYmd(u.date)) {
      out.push({
        date: u.date,
        event: u.title,
        source,
        kind: 'derived',
        scheduled: false,
        updateId: u.id,
      });
    }

    // 2) 施行予定日。フィード由来の「予定」なので過去日でも scheduled:true（確定情報ではない）
    if (isYmd(u.effective_date) && u.effective_date !== u.date) {
      out.push({
        date: u.effective_date,
        event: u.title,
        source,
        kind: 'derived-effective',
        scheduled: true,
        updateId: u.id,
      });
    }

    // 3) 期限日。扱いは施行予定日と同じ
    if (isYmd(u.deadline_date) && u.deadline_date !== u.date) {
      out.push({
        date: u.deadline_date,
        event: u.title,
        source,
        kind: 'derived-deadline',
        scheduled: true,
        updateId: u.id,
      });
    }
  }
  return out;
}

/**
 * 種データと派生イベントを結合し、日付降順で返す（同じ日なら種データが先）。
 * @param {SeedItem[]} [seedTimeline]
 * @param {DerivedEvent[]} [derived]
 * @returns {DerivedEvent[]}
 */
export function mergeTimeline(seedTimeline = [], derived = []) {
  /** @type {DerivedEvent[]} */
  const seeds = (seedTimeline ?? []).map((t) => ({
    ...t,
    kind: /** @type {'seed'} */ ('seed'),
    scheduled: false,
  }));
  const all = [...seeds, ...(derived ?? [])];
  const rank = (e) => (e.kind === 'seed' ? 0 : 1);
  return all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : rank(a) - rank(b)));
}
