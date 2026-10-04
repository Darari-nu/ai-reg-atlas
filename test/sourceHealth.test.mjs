import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SOURCE_DOWN_DAYS, pruneHealth, recordOutcome } from '../scripts/lib/sourceHealth.mjs';

const K = 'https://example.go.jp/news';
const base = { label: '日本 scrape_hash example.go.jp/news', country: 'jp' };
const fail = (health, date, reason = 'HTTP 404') => recordOutcome(health, K, { ...base, ok: false, reason, date });
const ok = (health, date) => recordOutcome(health, K, { ...base, ok: true, date });

describe('recordOutcome', () => {
  it('既定の閾値は3日', () => {
    assert.equal(SOURCE_DOWN_DAYS, 3);
  });

  it('1〜2日の失敗では発火しない', () => {
    let r = fail({}, '2026-10-01');
    assert.equal(r.event, null);
    assert.equal(r.health[K].fail_days, 1);
    r = fail(r.health, '2026-10-02');
    assert.equal(r.event, null);
    assert.equal(r.health[K].fail_days, 2);
    assert.equal(r.health[K].alerted, false);
  });

  it('3日目に down が1回だけ出て、4日目以降は再発火しない', () => {
    let h = {};
    h = fail(h, '2026-10-01').health;
    h = fail(h, '2026-10-02').health;
    const r3 = fail(h, '2026-10-03');
    assert.equal(r3.event.type, 'down');
    assert.equal(r3.event.key, K);
    assert.equal(r3.event.since, '2026-10-01');
    assert.equal(r3.event.days, 3);
    assert.equal(r3.event.reason, 'HTTP 404');
    assert.equal(r3.health[K].alerted, true);
    const r4 = fail(r3.health, '2026-10-04');
    assert.equal(r4.event, null);
    assert.equal(r4.health[K].fail_days, 4);
    assert.equal(fail(r4.health, '2026-10-05').event, null);
  });

  it('同じ日に2回失敗しても1日扱い', () => {
    let r = fail({}, '2026-10-01');
    r = fail(r.health, '2026-10-01');
    r = fail(r.health, '2026-10-01');
    assert.equal(r.health[K].fail_days, 1);
    assert.equal(r.event, null);
  });

  it('同日に何度失敗しても閾値に早く届かない', () => {
    let h = {};
    for (let i = 0; i < 5; i++) h = fail(h, '2026-10-01').health;
    h = fail(h, '2026-10-02').health;
    assert.equal(h[K].alerted, false);
  });

  it('通知済みの後に成功すると recovered が出てリセットされる', () => {
    let h = {};
    for (const d of ['2026-10-01', '2026-10-02', '2026-10-03']) h = fail(h, d).health;
    const r = ok(h, '2026-10-04');
    assert.equal(r.event.type, 'recovered');
    assert.equal(r.event.since, '2026-10-01');
    assert.equal(r.health[K].fail_days, 0);
    assert.equal(r.health[K].alerted, false);
    assert.equal(r.health[K].first_failed, null);
    assert.equal(r.health[K].last_ok, '2026-10-04');
    // 復旧後にもう一度成功しても出ない
    assert.equal(ok(r.health, '2026-10-05').event, null);
  });

  it('未通知のまま成功したらイベントは無く、カウントだけ戻る', () => {
    let h = fail({}, '2026-10-01').health;
    h = fail(h, '2026-10-02').health;
    const r = ok(h, '2026-10-03');
    assert.equal(r.event, null);
    assert.equal(r.health[K].fail_days, 0);
    // 戻った後は最初から数え直し
    const r2 = fail(r.health, '2026-10-04');
    assert.equal(r2.health[K].fail_days, 1);
    assert.equal(r2.health[K].first_failed, '2026-10-04');
  });

  it('復旧後の再失敗は再び3日で通知される', () => {
    let h = {};
    for (const d of ['2026-10-01', '2026-10-02', '2026-10-03']) h = fail(h, d).health;
    h = ok(h, '2026-10-04').health;
    h = fail(h, '2026-10-05').health;
    h = fail(h, '2026-10-06').health;
    assert.equal(fail(h, '2026-10-07').event.type, 'down');
  });

  it('入力の health を書き換えない', () => {
    const h = {};
    fail(h, '2026-10-01');
    assert.deepEqual(h, {});
  });

  it('閾値は引数で変えられる', () => {
    const r = recordOutcome({}, K, { ...base, ok: false, reason: 'x', date: '2026-10-01' }, 1);
    assert.equal(r.event.type, 'down');
  });
});

describe('pruneHealth', () => {
  it('config から消えた情報源を落とす', () => {
    const h = { a: { fail_days: 1 }, b: { fail_days: 0 } };
    assert.deepEqual(pruneHealth(h, new Set(['b'])), { b: { fail_days: 0 } });
    assert.deepEqual(pruneHealth(h, ['a']), { a: { fail_days: 1 } });
    assert.deepEqual(pruneHealth(undefined, ['a']), {});
  });
});
