// 週報ページ（/digest/）用の読み取り（src/lib/digests.mjs）と地図（src/lib/worldLand.mjs）の検査。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  equirect,
  focusBox,
  isoWeekLabel,
  loadDigests,
  parseDigest,
  recordIdFromUrl,
  toInternalPath,
  weekRange,
  weeklyCounts,
} from '../src/lib/digests.mjs';
import { landPath, unwrapRing } from '../src/lib/worldLand.mjs';
import { digestToMarkdown, isoWeekLabel as genWeekLabel } from '../scripts/lib/digest.mjs';

const base = 'https://darari-nu.com/atlas';
const allRecords = fs
  .readdirSync('data/updates')
  .filter((f) => f.endsWith('.json'))
  .flatMap((f) => JSON.parse(fs.readFileSync(path.join('data/updates', f), 'utf8')));
const ids = new Set(allRecords.map((r) => r.id));

describe('週ラベルと期間', () => {
  it('週ラベル → 月曜〜日曜', () => {
    assert.deepEqual(weekRange('2026-W46'), { from: '2026-11-09', to: '2026-11-15' });
    assert.deepEqual(weekRange('2026-W53'), { from: '2026-12-28', to: '2027-01-03' });
    assert.deepEqual(weekRange('2027-W01'), { from: '2027-01-04', to: '2027-01-10' });
  });
  it('形が違う・存在しない週は null', () => {
    assert.equal(weekRange('2026-46'), null);
    assert.equal(weekRange('2027-W53'), null); // 2027年は52週まで
  });
  it('週ラベルの数え方は原稿を作る側（scripts/lib/digest.mjs）と同じ', () => {
    for (const d of ['2026-01-01', '2026-10-05', '2026-12-31', '2027-01-03', '2027-01-04']) assert.equal(isoWeekLabel(d), genWeekLabel(d));
  });
});

describe('URL の扱い', () => {
  it('Atlas の絶対 URL だけを内部パスにする', () => {
    assert.equal(toInternalPath(`${base}/explain/2026-11-09-ph-001/`), '/explain/2026-11-09-ph-001/');
    assert.equal(toInternalPath(`${base}/timeline/#deadlines`), '/timeline/#deadlines');
    assert.equal(toInternalPath('https://www.philstar.com/x'), null);
    assert.equal(toInternalPath('https://evil.example/atlas/explain/x/'), null);
  });
  it('解説ページ・国別ページのどちらからも record_id が取れる', () => {
    assert.equal(recordIdFromUrl(`${base}/explain/2026-11-09-ph-001/`), '2026-11-09-ph-001');
    assert.equal(recordIdFromUrl(`${base}/country/kr/#u-2026-11-09-kr-001`), '2026-11-09-kr-001');
    assert.equal(recordIdFromUrl(`${base}/timeline/#deadlines`), null);
  });
});

describe('実際の原稿（data/digests）', () => {
  const digests = loadDigests();
  const files = fs.readdirSync('data/digests').filter((f) => /^\d{4}-W\d{2}\.md$/.test(f));
  it('全部の原稿がページになる（読めずに落ちる週が無い）', () => {
    assert.equal(digests.length, files.length);
    assert.ok(digests.length >= 1);
  });
  it('新しい週が先', () => {
    const weeks = digests.map((d) => d.week);
    assert.deepEqual(weeks, [...weeks].sort().reverse());
  });
  it('変化は1〜3件、どれも更新レコードに実在し、リンクは内部パス', () => {
    for (const d of digests) {
      assert.ok(d.changes.length >= 1 && d.changes.length <= 3, d.week);
      for (const c of d.changes) {
        assert.ok(ids.has(c.recordId), `${d.week} ${c.recordId}`);
        assert.match(c.href, /^\/(explain|country)\//);
        assert.ok(c.flag && c.countryName && c.what && c.oneLiner, `${d.week} #${c.n}`);
        assert.ok(!c.sourceUrl || /^https?:\/\//.test(c.sourceUrl));
      }
      for (const o of d.others) assert.ok(ids.has(o.recordId), `${d.week} other ${o.recordId}`);
      for (const x of d.deadlines) assert.match(x.href ?? '', /^\/timeline\//);
      assert.ok(d.title && d.summary && d.shortTitle && !d.shortTitle.startsWith('今週のAI規制'));
    }
  });
});

describe('原稿の形の約束（作る側の digestToMarkdown の出力をそのまま読める）', () => {
  const rec = (over = {}) => ({
    id: '2026-10-06-kr-001',
    date: '2026-10-06',
    discovered_at: '2026-10-06',
    country: 'kr',
    source_kind: 'official',
    legal_stage: 'in_force',
    title: 't',
    summary: { what: 'w', who: 'x', when_impact: 'y' },
    so_what: 's',
    sources: ['https://example.gov/news/1'],
    ...over,
  });
  const countries = { kr: { name_ja: '韓国', flag: '🇰🇷' }, eu: { name_ja: 'EU', flag: '🇪🇺' } };
  const { markdown } = digestToMarkdown({
    digest: {
      title: '韓国でAI基本法の施行令が公表',
      summary: '韓国で施行令が公表されました。',
      picks: [
        { record_id: '2026-10-06-kr-001', headline: '韓国がAI基本法の施行令を公表', what: '施行令が公表されました。', one_liner: '確認するのがよさそうです。' },
        { record_id: '2026-10-07-eu-001', headline: 'EUの指針', what: '指針が出ました。', one_liner: '様子見でよさそうです。' },
      ],
      others: [],
    },
    input: { week: { from: '2026-10-05', to: '2026-10-11', label: '2026-W41' } },
    records: [rec(), rec({ id: '2026-10-07-eu-001', country: 'eu', sources: ['https://eu.example/p'] })],
    publishedIds: new Set(['2026-10-06-kr-001']),
    countries,
    deadlines: ['- 2026-11-01（あと20日）EU：テスト → https://darari-nu.com/atlas/timeline/#dl-x'],
    base,
  });
  const d = parseDigest(markdown, '2026-W41');
  it('変化・国旗・リンク（解説あり＝explain、なし＝国別ページ）を取り出せる', () => {
    assert.equal(d.changes.length, 2);
    assert.deepEqual(
      d.changes.map((c) => [c.flag, c.countryName, c.recordId, c.href]),
      [
        ['🇰🇷', '韓国', '2026-10-06-kr-001', '/explain/2026-10-06-kr-001/'],
        ['🇪🇺', 'EU', '2026-10-07-eu-001', '/country/eu/#u-2026-10-07-eu-001'],
      ],
    );
    assert.equal(d.changes[1].sourceUrl, 'https://eu.example/p');
    assert.deepEqual(d.deadlines, [{ date: '2026-11-01', country: 'EU', text: 'テスト', href: '/timeline/#dl-x' }]);
    assert.equal(d.shortTitle, '韓国でAI基本法の施行令が公表');
  });
});

describe('壊れた原稿はページにしない（ビルドを落とさない）', () => {
  it('frontmatter が無い・変化の節が無い・週ラベルが変なら null', () => {
    assert.equal(parseDigest('本文だけ', '2026-W41'), null);
    assert.equal(parseDigest('---\ntitle: x\n---\n## これからの期限（90日以内）\n- なし', '2026-W41'), null);
    assert.equal(parseDigest('---\ntitle: x\n---\n## 今週の変化3つ\n### 1. a（🇰🇷 韓国）\n- 何が起きたか: b\n- 詳しく: https://darari-nu.com/atlas/explain/2026-10-06-kr-001/', 'W41'), null);
  });
  it('置き場に壊れた原稿・別名のファイルがあっても、それだけ飛ばす', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'digests-'));
    fs.writeFileSync(path.join(dir, '2026-W41.md'), '壊れている');
    fs.writeFileSync(path.join(dir, 'memo.md'), '---\ntitle: x\n---');
    fs.copyFileSync('data/digests/2026-W46.md', path.join(dir, '2026-W46.md'));
    assert.deepEqual(loadDigests(dir).map((d) => d.week), ['2026-W46']);
    assert.deepEqual(loadDigests(path.join(dir, 'none')), []);
  });
});

describe('一部だけ読める原稿・形の揺れ（監査の指摘）', () => {
  const real = fs.readFileSync('data/digests/2026-W46.md', 'utf8');
  it('変化の2件目が壊れていたら、1件だけのページにせず週ごと外す', () => {
    const broken = real.replace(/### 2\. /, '### 二. ');
    assert.ok(parseDigest(real, '2026-W46'));
    assert.equal(parseDigest(broken, '2026-W46'), null);
    const noLink = real.replace(/(### 3\.[\s\S]*?)- 詳しく: \S+/, '$1- 詳しく: なし');
    assert.equal(parseDigest(noLink, '2026-W46'), null);
  });
  it('期限・その他の行が1本でも読めなければ週ごと外す', () => {
    assert.equal(parseDigest(real.replace('→ https://darari-nu.com/atlas/timeline/#deadlines', '→ https://darari-nu.com/atlas/timeline/#deadlines 余計'), '2026-W46'), null);
    assert.equal(parseDigest(real.replace(/（🇲🇾 マレーシア）https:\S+/, '（🇲🇾 マレーシア）'), '2026-W46'), null);
  });
  it('期限が無い週の一文（URL なし）は失敗扱いにしない', () => {
    const none = real.replace(/## これからの期限（90日以内）\n[\s\S]*?\n\n/, '## これからの期限（90日以内）\n- 90日以内に、人が確認した期限・意見募集の締切はいまのところありません。\n\n');
    const d = parseDigest(none, '2026-W46');
    assert.ok(d);
    assert.deepEqual(d.deadlines, []);
  });
  it('改行が CRLF でも読める', () => {
    assert.equal(parseDigest(real.replace(/\n/g, '\r\n'), '2026-W46')?.changes.length, 3);
  });
  it('国旗の無い国（（国名）だけ）でも読める', () => {
    const d = parseDigest(real.replace('（🇦🇺 豪州）', '（豪州）').replace('（🇧🇷 ブラジル）', '（ブラジル）'), '2026-W46');
    assert.equal(d.changes[1].countryName, '豪州');
    assert.equal(d.changes[1].flag, '');
    assert.equal(d.changes[1].title, 'フロンティアAI企業に安全措置を義務づける方針');
    assert.ok(d.others.some((o) => o.countryName === 'ブラジル' && o.flag === ''));
  });
});

describe('週ごとの件数', () => {
  it('拾った日（discovered_at、無ければ date）で、指定週を含む直近 n 週を古い順に数える', () => {
    const recs = [
      { date: '2026-11-01', discovered_at: '2026-11-10' }, // 拾った日で W46
      { date: '2026-11-15' }, // W46 の日曜
      { date: '2026-11-16' }, // W47（範囲外）
      { date: '2026-11-02' }, // W45
    ];
    const w = weeklyCounts(recs, '2026-W46', 3);
    assert.deepEqual(w.map((x) => [x.week, x.count]), [['2026-W44', 0], ['2026-W45', 1], ['2026-W46', 2]]);
  });
});

describe('地図', () => {
  it('正距円筒の座標', () => {
    assert.deepEqual(equirect(0, 0, 720), { x: 360, y: 180 });
    assert.deepEqual(equirect(90, -180, 720), { x: 0, y: 0 });
  });
  it('スマホの拡大枠は点を全部含み、世界の外にはみ出さない', () => {
    const cases = [
      [{ lat: 37.5, lng: 127 }, { lat: 14.6, lng: 121 }, { lat: -35.3, lng: 149.1 }],
      [{ lat: 38.9, lng: -77 }, { lat: 28.6, lng: 77.2 }, { lat: 39.9, lng: 116.4 }],
      [{ lat: 64, lng: 179 }],
      [{ lat: -60, lng: -179 }, { lat: 70, lng: 178 }],
    ];
    for (const pts of cases) {
      const b = focusBox(pts, 720);
      assert.ok(b.x >= -1e-9 && b.y >= -1e-9 && b.x + b.w <= 720 + 1e-9 && b.y + b.h <= 360 + 1e-9, JSON.stringify(b));
      for (const p of pts) {
        const { x, y } = equirect(p.lat, p.lng, 720);
        assert.ok(x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h, JSON.stringify({ p, b }));
      }
    }
    assert.deepEqual(focusBox([], 720), { x: 0, y: 0, w: 720, h: 360 });
  });
  it('日付変更線をまたぐリングは経度をつないで閉じる（途中で切らない）', () => {
    const fiji = [[179, -16], [-179.5, -16.5], [-179.8, -17], [179.2, -17.2], [179, -16]];
    const u = unwrapRing(fiji);
    for (let i = 1; i < u.length; i++) assert.ok(Math.abs(u[i][0] - u[i - 1][0]) <= 180);
    assert.deepEqual(u[0], [179, -16]);
    assert.equal(u[1][0], 180.5);
  });
  it('極を一周するリングは極まで下ろして閉じる', () => {
    const ring = [[-180, -70], [-90, -72], [0, -70], [90, -71], [180, -70]].map(([a, b]) => [a, b]);
    const u = unwrapRing([...ring.slice(0, 4), [179.9, -70], [-179.9, -70.1]]);
    assert.deepEqual(u.slice(-2).map((p) => p[1]), [-90, -90]);
  });
  it('陸地のパスが作れる（各リングは閉じていて、M の数とZ の数が同じ）', () => {
    const d = landPath(720);
    assert.ok(d.length > 10000 && d.startsWith('M'));
    assert.equal((d.match(/M/g) ?? []).length, (d.match(/Z/g) ?? []).length);
    // はみ出した写しは枠の外に出るが、1つの写しの中で 180 度ぶん以上の飛びは無い（＝地図を横切る直線が無い）
    for (const sub of d.split('Z').filter(Boolean)) {
      const pts = [...sub.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
      for (let i = 1; i < pts.length; i++) {
        const onPole = pts[i][1] === pts[i - 1][1] && (pts[i][1] === 0 || pts[i][1] === 360); // 極の線に沿って閉じる辺（画面外）は例外
        assert.ok(onPole || Math.abs(pts[i][0] - pts[i - 1][0]) < 360, sub.slice(0, 40));
      }
    }
  });
});
