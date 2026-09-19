import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ageTier,
  countWithin,
  daysAgo,
  discoveryDate,
  fmtDaysAgo,
  globeMarkers,
  latestDateByCountry,
  sortByDiscovery,
} from '../src/lib/freshness.mjs';

/** 更新レコードの最小形 */
const u = (id, country, date, discovered_at) =>
  discovered_at === undefined ? { id, country, date } : { id, country, date, discovered_at };

describe('discoveryDate / sortByDiscovery', () => {
  it('discovered_at が無いレコードは公表日で代用する', () => {
    assert.equal(discoveryDate(u('a', 'jp', '2026-09-01')), '2026-09-01');
    assert.equal(discoveryDate(u('a', 'jp', '2026-09-01', '2026-09-10')), '2026-09-10');
  });

  it('発見日降順に並べる（discovered_at 無しは date で比較される）', () => {
    const list = [
      u('a', 'jp', '2026-09-01', '2026-09-02'),
      u('b', 'jp', '2026-09-05'), // 発見日=2026-09-05
      u('c', 'jp', '2026-08-01', '2026-09-09'),
    ];
    assert.deepEqual(
      sortByDiscovery(list).map((x) => x.id),
      ['c', 'b', 'a']
    );
  });

  it('同じ発見日なら公表日降順 → id降順で決まる', () => {
    const list = [
      u('001', 'jp', '2026-09-01', '2026-09-10'),
      u('003', 'jp', '2026-09-03', '2026-09-10'),
      u('002', 'jp', '2026-09-03', '2026-09-10'),
    ];
    assert.deepEqual(
      sortByDiscovery(list).map((x) => x.id),
      ['003', '002', '001']
    );
  });

  it('元の配列を変えない（新しい配列を返す）', () => {
    const list = [u('a', 'jp', '2026-09-01'), u('b', 'jp', '2026-09-05')];
    const before = list.map((x) => x.id);
    const sorted = sortByDiscovery(list);
    assert.notEqual(sorted, list);
    assert.deepEqual(
      list.map((x) => x.id),
      before
    );
  });

  it('空配列でも落ちない', () => {
    assert.deepEqual(sortByDiscovery([]), []);
  });
});

describe('latestDateByCountry', () => {
  it('国ごとの最大の発見日を返す', () => {
    const list = [
      u('a', 'jp', '2026-09-01', '2026-09-02'),
      u('b', 'jp', '2026-08-20', '2026-09-11'),
      u('c', 'us', '2026-09-30'), // discovered_at 無し
      u('d', 'us', '2026-09-10', '2026-09-12'),
    ];
    assert.deepEqual(latestDateByCountry(list), { jp: '2026-09-11', us: '2026-09-30' });
  });

  it('レコードが無い国はキーごと存在しない', () => {
    assert.deepEqual(latestDateByCountry([]), {});
  });
});

describe('daysAgo / fmtDaysAgo', () => {
  it('同じ日は0', () => {
    assert.equal(daysAgo('2026-09-19', '2026-09-19'), 0);
  });

  it('未来日（負）は0に丸める', () => {
    assert.equal(daysAgo('2026-10-01', '2026-09-19'), 0);
  });

  it('月跨ぎを正しく数える', () => {
    assert.equal(daysAgo('2026-08-31', '2026-09-01'), 1);
    assert.equal(daysAgo('2026-08-19', '2026-09-19'), 31);
  });

  it('年跨ぎ・うるう年も正しい', () => {
    assert.equal(daysAgo('2025-12-31', '2026-01-01'), 1);
    assert.equal(daysAgo('2024-02-28', '2024-03-01'), 2); // 2024はうるう年
  });

  it('夏時間の切替を跨いでもズレない（UTC演算）', () => {
    // 米国の夏時間終了（2026-11-01）を跨ぐ区間
    assert.equal(daysAgo('2026-10-31', '2026-11-02'), 2);
    // 欧州の夏時間開始（2026-03-29）を跨ぐ区間
    assert.equal(daysAgo('2026-03-28', '2026-03-30'), 2);
  });

  it('表示文字列', () => {
    assert.equal(fmtDaysAgo(0), '今日');
    assert.equal(fmtDaysAgo(1), '昨日');
    assert.equal(fmtDaysAgo(2), '2日前');
    assert.equal(fmtDaysAgo(30), '30日前');
  });
});

describe('countWithin', () => {
  const today = '2026-09-19';
  const list = [
    u('a', 'jp', '2026-09-19'), // 0日前
    u('b', 'jp', '2026-09-13'), // 6日前
    u('c', 'jp', '2026-09-12'), // ちょうど7日前 → 含まない
    u('d', 'jp', '2026-01-01', '2026-09-18'), // 発見日で1日前
  ];

  it('直近7日はちょうど7日前を含まない', () => {
    assert.equal(countWithin(list, today, 7), 3);
  });

  it('日数を広げれば増える', () => {
    assert.equal(countWithin(list, today, 8), 4);
  });

  it('days=0 なら常に0件', () => {
    assert.equal(countWithin(list, today, 0), 0);
  });
});

describe('ageTier', () => {
  it('段階を返す', () => {
    assert.equal(ageTier(null), 'none');
    assert.equal(ageTier(0), 'week');
    assert.equal(ageTier(7), 'week');
    assert.equal(ageTier(8), 'month');
    assert.equal(ageTier(30), 'month');
    assert.equal(ageTier(31), 'old');
  });
});

describe('globeMarkers', () => {
  const countries = [
    { code: 'eu', name_ja: 'EU', flag: '🇪🇺', lat: 50.85, lng: 4.35 },
    {
      code: 'us',
      name_ja: '米国',
      flag: '🇺🇸',
      lat: 38.9,
      lng: -77.04,
      subregions: [
        { code: 'us-ca', name_ja: 'カリフォルニア州', lat: 38.58, lng: -121.49 },
        { code: 'us-co', name_ja: 'コロラド州', lat: 39.74, lng: -104.99 },
      ],
    },
    { code: 'jp', name_ja: '日本', flag: '🇯🇵', lat: 36.2, lng: 138.25 },
  ];
  const latest = { eu: '2026-09-12', us: '2026-09-18' }; // jp は更新レコード無し
  const markers = globeMarkers(countries, latest, '2026-09-19');

  it('国 → その国の小地域 の順に並ぶ（DOM順＝Tab順）', () => {
    assert.deepEqual(
      markers.map((m) => m.code),
      ['eu', 'us', 'us-ca', 'us-co', 'jp']
    );
    assert.deepEqual(
      markers.map((m) => m.kind),
      ['country', 'country', 'subregion', 'subregion', 'country']
    );
  });

  it('国マーカーは自国ページへのパスと鮮度を持つ', () => {
    const eu = markers[0];
    assert.equal(eu.path, '/country/eu/');
    assert.equal(eu.ageDays, 7);
    assert.equal(markers[1].ageDays, 1);
  });

  it('更新レコードが無い国の鮮度は null', () => {
    assert.equal(markers[4].ageDays, null);
  });

  it('小地域は親ページの #subregions を指し、鮮度は持たない', () => {
    const ca = markers[2];
    assert.equal(ca.path, '/country/us/#subregions');
    assert.equal(ca.ageDays, null);
    assert.equal(ca.flag, '🇺🇸'); // 親の国旗を流用
    assert.equal(ca.name_ja, 'カリフォルニア州');
    assert.equal(ca.lat, 38.58);
    assert.equal(ca.lng, -121.49);
  });

  it('subregions が無くても落ちない', () => {
    assert.equal(globeMarkers([{ code: 'jp', name_ja: '日本', flag: '🇯🇵', lat: 36.2, lng: 138.25 }], {}, '2026-09-19').length, 1);
  });
});
