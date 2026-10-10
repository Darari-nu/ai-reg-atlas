import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { buildUpcomingDeadlines, daysUntil, todayJst } from '../src/lib/upcomingDeadlines.mjs';

const TODAY = '2026-10-10';

const cur = (over = {}) => ({
  id: 'eu-x',
  country: 'eu',
  date: '2027-12-02',
  kind: 'obligation_applies',
  title: 't',
  what_to_do: ['a', 'b'],
  applies_to: 'x',
  sources: ['https://example.eu/a'],
  verified: '2026-10-10',
  ...over,
});

const upd = (over = {}) => ({
  id: '2026-10-01-kr-002',
  country: 'kr',
  title: '意見募集',
  sources: ['https://example.kr/a'],
  effective_date: null,
  deadline_date: null,
  legal_stage: 'draft_or_consultation',
  change_type: 'other',
  summary: { what: 'w', who: 'x', when_impact: '2026-10-11まで意見募集' },
  ...over,
});

const build = (curated, updates = [], extra = {}) =>
  buildUpcomingDeadlines({ curated, updates, today: TODAY, ...extra });

describe('daysUntil', () => {
  it('日数を数える', () => {
    assert.equal(daysUntil('2026-10-11', TODAY), 1);
    assert.equal(daysUntil('2027-10-10', TODAY), 365);
    assert.equal(daysUntil('2026-10-10', TODAY), 0);
  });
});

describe('todayJst', () => {
  it('UTC の夕方は JST では翌日になる', () => {
    assert.equal(todayJst(new Date('2026-10-10T15:30:00Z')), '2026-10-11');
    assert.equal(todayJst(new Date('2026-10-10T14:59:00Z')), '2026-10-10');
  });
});

describe('buildUpcomingDeadlines', () => {
  it('過去の期限は出ない。当日は残り（daysLeft 0）', () => {
    const r = build([cur({ id: 'a', date: '2026-10-09' }), cur({ id: 'b', date: '2026-10-10' }), cur({ id: 'c', date: '2026-10-11' })], [
      upd({ id: 'u1', deadline_date: '2026-09-01' }),
      upd({ id: 'u2', country: 'jp', effective_date: '2026-10-10' }),
    ]);
    assert.deepEqual(r.map((d) => d.id), ['b', 'auto-u2-effective_date', 'c']);
    assert.equal(r[0].daysLeft, 0);
  });

  it('日付順に並び、daysLeft が付く', () => {
    const r = build(
      [cur({ id: 'late', date: '2028-08-02' }), cur({ id: 'early', date: '2026-12-02' })],
      [upd({ id: 'u', deadline_date: '2026-11-13' })],
    );
    assert.deepEqual(r.map((d) => d.date), ['2026-11-13', '2026-12-02', '2028-08-02']);
    assert.equal(r[0].daysLeft, 34);
    assert.equal(r[1].daysLeft, 53);
  });

  it('同じ日付では curated が先', () => {
    const r = build([cur({ id: 'c', country: 'eu', date: '2026-12-02' })], [upd({ id: 'u', country: 'us', deadline_date: '2026-12-02' })]);
    assert.deepEqual(r.map((d) => d.source), ['curated', 'auto']);
  });

  it('同じ国・同じ日付なら出典URLが違っても curated を残して auto を捨てる', () => {
    const r = build(
      [cur({ id: 'c', country: 'eu', date: '2026-12-02', sources: ['https://example.eu/a'] })],
      [upd({ id: 'u', country: 'eu', deadline_date: '2026-12-02', sources: ['https://example.eu/other'] })],
    );
    assert.equal(r.length, 1);
    assert.equal(r[0].source, 'curated');
  });

  it('日付か国が違えば重複とみなさない', () => {
    const r = build(
      [cur({ id: 'c', country: 'eu', date: '2026-12-02' })],
      [
        upd({ id: 'u1', country: 'eu', deadline_date: '2026-12-03' }),
        upd({ id: 'u2', country: 'us', deadline_date: '2026-12-02' }),
      ],
    );
    assert.equal(r.length, 3);
  });

  it('auto は意見募集・案の段階のレコードだけ拾う', () => {
    const r = build(
      [],
      [
        upd({ id: 'ok1', deadline_date: '2026-11-01', legal_stage: 'draft_or_consultation', change_type: 'other' }),
        upd({ id: 'ok2', deadline_date: '2026-11-02', legal_stage: 'announcement', change_type: 'guideline_draft' }),
        upd({ id: 'ng1', deadline_date: '2026-11-03', legal_stage: 'in_force', change_type: 'other' }),
        upd({ id: 'ng2', deadline_date: '2026-11-04', legal_stage: 'bill', change_type: 'new_regulation' }),
      ],
    );
    assert.deepEqual(r.map((d) => d.updateId), ['ok1', 'ok2']);
  });

  it('auto の deadline_date は意見募集の締切、effective_date は施行。when_impact・更新id・解説の有無を持つ', () => {
    const r = build(
      [],
      [upd({ id: 'u', effective_date: '2027-01-01', deadline_date: '2026-11-01' })],
      { explainerIds: new Set(['u']) },
    );
    assert.deepEqual(r.map((d) => d.kind), ['consultation_deadline', 'in_force']);
    assert.ok(r.every((d) => d.source === 'auto' && d.updateId === 'u' && d.hasExplainer === true));
    assert.equal(r[0].whenImpact, '2026-10-11まで意見募集');
    assert.equal(r[0].what_to_do, undefined);
  });

  it('同じ更新で施行日と期限が同じ日付なら1件にまとめる', () => {
    const r = build([], [upd({ id: 'u', effective_date: '2027-01-01', deadline_date: '2027-01-01' })]);
    assert.equal(r.length, 1);
  });

  it('日付が null の更新は拾わない', () => {
    assert.deepEqual(build([], [upd()]), []);
  });
});

describe('data/deadlines.json', () => {
  const list = JSON.parse(fs.readFileSync(new URL('../data/deadlines.json', import.meta.url), 'utf8'));
  it('id が重複しない', () => {
    assert.equal(new Set(list.map((d) => d.id)).size, list.length);
  });
  it('どの項目にも出典URLがある', () => {
    assert.ok(list.every((d) => d.sources.length >= 1 && d.sources.every((s) => s.startsWith('https://'))));
  });
});
