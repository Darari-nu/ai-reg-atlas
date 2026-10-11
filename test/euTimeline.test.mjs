import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { OLD_ANNEX1_DATE, OLD_ANNEX3_DATE, resolveTimeline } from '../src/lib/euTimeline.mjs';

const guide = JSON.parse(fs.readFileSync('data/guides/eu-ai-act.json', 'utf8'));
const deadlines = JSON.parse(fs.readFileSync('data/deadlines.json', 'utf8'));

describe('図4 日程の時間軸（src/lib/euTimeline.mjs）', () => {
  const cards = resolveTimeline(guide.milestones, deadlines);

  it('日付順で、同じ日付は1枚にまとまる', () => {
    const dates = cards.map((c) => c.date);
    assert.deepEqual(dates, [...dates].sort());
    assert.equal(new Set(dates).size, dates.length);
  });

  it('2026-07-27（改正規則の発効）は 2026-08-02（一般適用）より前', () => {
    const d = cards.map((c) => c.date);
    assert.ok(d.indexOf('2026-07-27') < d.indexOf('2026-08-02'));
  });

  it('延期の新期限は deadlines.json から読み、旧期限は本体 3 章の対照表と一致する', () => {
    const omnibus = guide.sections.find((s) => s.id === 'omnibus').blocks.find((b) => b.id === 'omnibus-diff');
    const row = (needle) => omnibus.rows.find((r) => r.cells[0].includes(needle)).cells;
    const [, before3, after3] = row('附属書III');
    const [, before1, after1] = row('附属書I の');
    assert.equal(before3, OLD_ANNEX3_DATE);
    assert.equal(before1, OLD_ANNEX1_DATE);
    const items = cards.flatMap((c) => c.items);
    assert.equal(items.find((i) => i.ref.d === 'eu-annex3-highrisk').date, after3);
    assert.equal(items.find((i) => i.ref.d === 'eu-annex1-highrisk').date, after1);
  });

  it('ガイドや deadlines.json から日付が消えたら、黙って進まずに落ちる', () => {
    assert.throws(() => resolveTimeline([], deadlines), /milestones/);
    assert.throws(() => resolveTimeline(guide.milestones, []), /deadlines/);
  });
});
