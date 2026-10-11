import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { excludeDuplicateFutureEvents, groupByYear, isYearOpen } from '../src/lib/timelineView.mjs';

const ev = (cc, date, future) => ({ cc, date, future, event: `${cc}${date}` });

describe('excludeDuplicateFutureEvents', () => {
  it('国＋日付が期限と一致する未来の項目だけ除く', () => {
    const events = [
      ev('eu', '2027-12-02', true), // 期限と一致 → 除く
      ev('eu', '2028-08-02', true), // 一致しない未来 → 残す
      ev('us', '2027-12-02', true), // 国が違う → 残す
      ev('eu', '2025-08-02', false), // 過去 → 残す
    ];
    const r = excludeDuplicateFutureEvents(events, [{ country: 'eu', date: '2027-12-02' }]);
    assert.deepEqual(r.map((e) => e.event), ['eu2028-08-02', 'us2027-12-02', 'eu2025-08-02']);
  });
  it('過去の項目は、期限と国＋日付が同じでも残す', () => {
    const r = excludeDuplicateFutureEvents([ev('eu', '2026-01-01', false)], [{ country: 'eu', date: '2026-01-01' }]);
    assert.equal(r.length, 1);
  });
});

describe('groupByYear / isYearOpen', () => {
  it('年ごとにまとめ、年は新しい順', () => {
    const g = groupByYear([ev('a', '2026-05-01'), ev('a', '2026-01-01'), ev('a', '2024-01-01'), ev('a', '2025-01-01')]);
    assert.deepEqual(g.map((x) => [x.year, x.items.length]), [['2026', 2], ['2025', 1], ['2024', 1]]);
  });
  it('今年と昨年は開き、それより前は閉じる', () => {
    assert.equal(isYearOpen('2026', '2026-10-11'), true);
    assert.equal(isYearOpen('2025', '2026-10-11'), true);
    assert.equal(isYearOpen('2024', '2026-10-11'), false);
  });
});
