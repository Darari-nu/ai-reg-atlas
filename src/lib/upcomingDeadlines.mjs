// 「これからの期限」の純ロジック。ファイル I/O も import.meta も使わない（node --test から直接読む）。
// 人が確認した期限（data/deadlines.json）と、更新レコードの deadline_date（意見募集の締切）を合わせ、
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
 * @property {string} [whenImpact]      auto のみ（元の更新の summary.when_impact）
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
 * @param {Array<{id:string,country:string,title:string,sources?:string[],legal_stage?:string,change_type?:string,summary?:{when_impact?:string},effective_date?:string|null,deadline_date?:string|null}>} args.updates
 * @param {string} args.today
 * @param {Set<string>} [args.explainerIds]  解説が公開済みの更新レコード id
 * @returns {UpcomingDeadline[]}
 */
/** 意見募集・案の段階の更新か（legal_stage が draft_or_consultation、または change_type が案・意見募集系の guideline_draft） */
export function isConsultationRecord(u) {
  return u.legal_stage === 'draft_or_consultation' || u.change_type === 'guideline_draft';
}

/** 今日の日付（Asia/Tokyo）。サイトの読者は日本にいるので、UTC ではなく JST で数える */
export function todayJst(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function buildUpcomingDeadlines({ curated, updates, today, explainerIds = new Set() }) {
  /** @type {UpcomingDeadline[]} */
  const out = [];

  for (const c of curated) {
    if (c.date < today) continue; // 当日は「今日まで」として残す
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

  // 自動分。意見募集・案の段階のレコードだけを拾う（確定済みの法令の日付は人が確認して curated に入れる）。
  // 同じ国・同じ日付が curated にあれば、出典URLが違っても curated を優先して捨てる
  const curatedKeys = new Set(out.map((c) => `${c.country}|${c.date}`));

  for (const u of updates) {
    if (!isConsultationRecord(u)) continue;
    for (const [field, kind] of [['deadline_date', 'consultation_deadline']]) {
      const date = u[field];
      if (!date || date < today) continue;
      if (curatedKeys.has(`${u.country}|${date}`)) continue;
      out.push({
        id: `auto-${u.id}-${field}`,
        source: 'auto',
        country: u.country,
        date,
        daysLeft: daysUntil(date, today),
        kind,
        title: u.title,
        sources: u.sources ?? [],
        whenImpact: u.summary?.when_impact,
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
