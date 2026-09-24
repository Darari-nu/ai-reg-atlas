import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deriveTimelineEvents, mergeTimeline, TIMELINE_LEGAL_STAGES } from '../src/lib/derivedTimeline.mjs';

/** 更新レコードの最小形。legal_stage は既定で年表に載る段階（in_force）にしておく */
const rec = (over = {}) => ({
  id: '2026-09-03-jp-001',
  date: '2026-09-03',
  title: 'AI推進法の政令案を公表',
  sources: ['https://example.go.jp/a'],
  effective_date: null,
  deadline_date: null,
  legal_stage: 'in_force',
  ...over,
});

describe('deriveTimelineEvents', () => {
  it('公表イベントを作る', () => {
    const [e, ...rest] = deriveTimelineEvents([rec()], []);
    assert.equal(rest.length, 0);
    assert.deepEqual(e, {
      date: '2026-09-03',
      event: 'AI推進法の政令案を公表',
      source: 'https://example.go.jp/a',
      kind: 'derived',
      scheduled: false,
      updateId: '2026-09-03-jp-001',
    });
  });

  it('同じ日付の種データがあれば公表イベントは出さない', () => {
    const seed = [{ date: '2026-09-03', event: '政令案', source: 'https://other.example/x' }];
    assert.deepEqual(deriveTimelineEvents([rec()], seed), []);
  });

  it('同じ source URL の種データがあれば公表イベントは出さない', () => {
    const seed = [{ date: '2020-01-01', event: '政令案', source: 'https://example.go.jp/a' }];
    assert.deepEqual(deriveTimelineEvents([rec()], seed), []);
  });

  it('種データが空なら重複判定で消えない', () => {
    assert.equal(deriveTimelineEvents([rec()], []).length, 1);
    assert.equal(deriveTimelineEvents([rec()]).length, 1);
  });

  it('effective_date が公表日と同じなら派生させない', () => {
    const out = deriveTimelineEvents([rec({ effective_date: '2026-09-03' })], []);
    assert.deepEqual(
      out.map((e) => e.kind),
      ['derived']
    );
  });

  it('effective_date / deadline_date は scheduled:true の派生イベントになる', () => {
    const out = deriveTimelineEvents(
      [rec({ effective_date: '2027-04-01', deadline_date: '2027-01-31' })],
      []
    );
    assert.deepEqual(
      out.map((e) => [e.kind, e.date, e.scheduled]),
      [
        ['derived', '2026-09-03', false],
        ['derived-effective', '2027-04-01', true],
        ['derived-deadline', '2027-01-31', true],
      ]
    );
    assert.ok(out.every((e) => e.updateId === '2026-09-03-jp-001'));
    assert.ok(out.every((e) => e.event === 'AI推進法の政令案を公表'));
  });

  it('過去日の effective_date でも scheduled:true（フィード由来の予定扱い）', () => {
    const out = deriveTimelineEvents([rec({ effective_date: '2020-01-01' })], []);
    const eff = out.find((e) => e.kind === 'derived-effective');
    assert.equal(eff.scheduled, true);
  });

  it("'YYYY-MM-DD' でない effective_date / deadline_date は無視する", () => {
    const out = deriveTimelineEvents(
      [rec({ effective_date: '2027年4月', deadline_date: null })],
      []
    );
    assert.deepEqual(
      out.map((e) => e.kind),
      ['derived']
    );
  });

  it('sources が無くても落ちない（source は空文字）', () => {
    const out = deriveTimelineEvents([rec({ sources: undefined })], []);
    assert.equal(out[0].source, '');
  });

  it('source が空のレコードは、source 一致による重複判定に巻き込まれない', () => {
    const seed = [{ date: '2020-01-01', event: 'x', source: '' }];
    const out = deriveTimelineEvents([rec({ sources: [] })], seed);
    assert.equal(out.length, 1);
  });

  it('更新レコードが空なら何も出ない', () => {
    assert.deepEqual(deriveTimelineEvents([], []), []);
  });
});

describe('deriveTimelineEvents: legal_stage による絞り込み（年表は法令の節目だけ）', () => {
  it('5段階（施行・成立・確定指針・法案・草案/意見募集）は派生イベントになる', () => {
    for (const stage of TIMELINE_LEGAL_STAGES) {
      const out = deriveTimelineEvents([rec({ legal_stage: stage })], []);
      assert.equal(out.length, 1, `legal_stage=${stage} は年表に出るはず`);
    }
  });

  it('announcement・other は年表に出ない', () => {
    assert.deepEqual(deriveTimelineEvents([rec({ legal_stage: 'announcement' })], []), []);
    assert.deepEqual(deriveTimelineEvents([rec({ legal_stage: 'other' })], []), []);
  });

  it('legal_stage が無いレコードは年表に出ない', () => {
    const { legal_stage, ...withoutStage } = rec();
    assert.deepEqual(deriveTimelineEvents([withoutStage], []), []);
  });

  it('除外段階（announcement）は effective_date/deadline_date があっても派生イベントを1つも出さない', () => {
    const out = deriveTimelineEvents(
      [rec({ legal_stage: 'announcement', effective_date: '2027-04-01', deadline_date: '2027-01-31' })],
      []
    );
    assert.deepEqual(out, []);
  });
});

describe('mergeTimeline', () => {
  const seed = [
    { date: '2024-08-01', event: '発効', source: 'https://eur-lex.example/oj' },
    { date: '2026-09-03', event: '種データ側の同日イベント', source: 'https://seed.example/s' },
  ];
  const derived = [
    { date: '2026-09-03', event: '派生', source: 'https://d.example/1', kind: 'derived', scheduled: false, updateId: 'x' },
    { date: '2027-04-01', event: '施行予定', source: 'https://d.example/1', kind: 'derived-effective', scheduled: true, updateId: 'x' },
  ];

  it('種データに kind:seed / scheduled:false を付ける', () => {
    const out = mergeTimeline(seed, []);
    assert.ok(out.every((e) => e.kind === 'seed' && e.scheduled === false));
    assert.equal(out[0].event, '種データ側の同日イベント'); // 降順
  });

  it('日付降順に並び、同じ日なら種データが先', () => {
    const out = mergeTimeline(seed, derived);
    assert.deepEqual(
      out.map((e) => [e.date, e.kind]),
      [
        ['2027-04-01', 'derived-effective'],
        ['2026-09-03', 'seed'],
        ['2026-09-03', 'derived'],
        ['2024-08-01', 'seed'],
      ]
    );
  });

  it('引数が空でも落ちない', () => {
    assert.deepEqual(mergeTimeline([], []), []);
    assert.deepEqual(mergeTimeline(), []);
  });
});
