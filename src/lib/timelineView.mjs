// 年表ページの表示用の純ロジック（ファイル I/O なし。node --test から直接読む）。

/**
 * 「これからの期限」と国＋日付が一致する未来の項目を年表から除く（重複解消）。
 * 過去の項目や、期限と一致しない未来の項目は残す。
 * @template {{cc:string,date:string,future:boolean}} E
 * @param {E[]} events
 * @param {Array<{country:string,date:string}>} deadlines
 * @returns {E[]}
 */
export function excludeDuplicateFutureEvents(events, deadlines) {
  const keys = new Set(deadlines.map((d) => `${d.country}|${d.date}`));
  return events.filter((e) => !(e.future && keys.has(`${e.cc}|${e.date}`)));
}

/**
 * 項目を年ごとにまとめる（年は新しい順。年の中の並びは渡された順のまま）。
 * @template {{date:string}} E
 * @param {E[]} events
 * @returns {Array<{year:string,items:E[]}>}
 */
export function groupByYear(events) {
  const map = new Map();
  for (const e of events) {
    const y = e.date.slice(0, 4);
    if (!map.has(y)) map.set(y, []);
    map.get(y).push(e);
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([year, items]) => ({ year, items }));
}

/** その年を最初から開いておくか（今年と昨年は開く、それより前は閉じる） */
export function isYearOpen(year, today) {
  return Number(year) >= Number(today.slice(0, 4)) - 1;
}
