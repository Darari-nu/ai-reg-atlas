import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { buildUpcomingDeadlines, daysUntil } from '../src/lib/upcomingDeadlines.mjs';

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

describe('buildUpcomingDeadlines', () => {
  it('過去の期限と今日の期限は出ない', () => {
    const r = build([cur({ id: 'a', date: '2026-10-09' }), cur({ id: 'b', date: '2026-10-10' }), cur({ id: 'c', date: '2026-10-11' })], [
      upd({ id: 'u1', deadline_date: '2026-09-01' }),
      upd({ id: 'u2', effective_date: '2026-10-10' }),
    ]);
    assert.deepEqual(r.map((d) => d.id), ['c']);
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

  it('同じ国・日付・出典URLなら curated を残して auto を捨てる', () => {
    const r = build(
      [cur({ id: 'c', country: 'eu', date: '2026-12-02', sources: ['https://example.eu/a', 'https://example.eu/b'] })],
      [upd({ id: 'u', country: 'eu', effective_date: '2026-12-02', sources: ['https://example.eu/b'] })],
    );
    assert.equal(r.length, 1);
    assert.equal(r[0].source, 'curated');
  });

  it('日付・国・出典のどれかが違えば重複とみなさない', () => {
    const base = { id: 'c', country: 'eu', date: '2026-12-02', sources: ['https://example.eu/b'] };
    const r = build(
      [cur(base)],
      [
        upd({ id: 'u1', country: 'eu', effective_date: '2026-12-03', sources: ['https://example.eu/b'] }),
        upd({ id: 'u2', country: 'us', effective_date: '2026-12-02', sources: ['https://example.eu/b'] }),
        upd({ id: 'u3', country: 'eu', effective_date: '2026-12-02', sources: ['https://example.eu/other'] }),
      ],
    );
    assert.equal(r.length, 4);
  });

  it('auto は effective_date と deadline_date の両方を拾い、元の更新 id と解説の有無を持つ', () => {
    const r = build(
      [],
      [upd({ id: 'u', effective_date: '2027-01-01', deadline_date: '2026-11-01' })],
      { explainerIds: new Set(['u']) },
    );
    assert.equal(r.length, 2);
    assert.deepEqual(r.map((d) => d.kind), ['other', 'in_force']);
    assert.ok(r.every((d) => d.source === 'auto' && d.updateId === 'u' && d.hasExplainer === true));
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
