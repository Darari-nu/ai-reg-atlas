// config/countries.yaml の形式検査。ネットワークは使わない（URLの死活確認は手作業の運用側）。
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const doc = yaml.load(
  fs.readFileSync(path.join(process.cwd(), 'config/countries.yaml'), 'utf8')
);
const countries = doc.countries;

const STATUSES = ['proposed', 'draft', 'consultation', 'enacted', 'in_force'];
const COUNTRY_CODE = /^[a-z]{2}$/;
const SUBREGION_CODE = /^[a-z]{2}-[a-z0-9]{2,6}$/;

/** 全 subregion を [親の国, 小地域] の組で列挙する */
const allSubregions = () =>
  countries.flatMap((c) => (c.subregions ?? []).map((s) => [c, s]));

describe('countries.yaml: 国', () => {
  it('1件以上ある', () => {
    assert.ok(Array.isArray(countries) && countries.length > 0);
  });

  it('code は2字の小文字で一意', () => {
    const seen = new Set();
    for (const c of countries) {
      assert.match(c.code, COUNTRY_CODE, `国コード: ${c.code}`);
      assert.ok(!seen.has(c.code), `国コードが重複: ${c.code}`);
      seen.add(c.code);
    }
  });

  it('緯度経度が地球上にある', () => {
    for (const c of countries) {
      assert.ok(c.lat >= -90 && c.lat <= 90, `${c.code} lat=${c.lat}`);
      assert.ok(c.lng >= -180 && c.lng <= 180, `${c.code} lng=${c.lng}`);
    }
  });
});

describe('countries.yaml: subregions', () => {
  it('初期データが入っている', () => {
    assert.ok(allSubregions().length >= 10, `件数: ${allSubregions().length}`);
  });

  it('code は 親コード-英数 の形で、全体で一意', () => {
    const seen = new Set();
    for (const [c, s] of allSubregions()) {
      assert.match(s.code, SUBREGION_CODE, `小地域コード: ${s.code}`);
      assert.ok(
        s.code.startsWith(`${c.code}-`),
        `${s.code} は親 ${c.code} を接頭辞に持つこと`
      );
      assert.ok(!seen.has(s.code), `小地域コードが重複: ${s.code}`);
      seen.add(s.code);
    }
  });

  it('国コードとぶつからない', () => {
    const cc = new Set(countries.map((c) => c.code));
    for (const [, s] of allSubregions()) assert.ok(!cc.has(s.code), s.code);
  });

  it('name_ja と緯度経度がある', () => {
    for (const [, s] of allSubregions()) {
      assert.ok(typeof s.name_ja === 'string' && s.name_ja.length > 0, `${s.code} name_ja`);
      assert.equal(typeof s.lat, 'number', `${s.code} lat`);
      assert.equal(typeof s.lng, 'number', `${s.code} lng`);
      assert.ok(s.lat >= -90 && s.lat <= 90, `${s.code} lat=${s.lat}`);
      assert.ok(s.lng >= -180 && s.lng <= 180, `${s.code} lng=${s.lng}`);
    }
  });

  it('note が非空', () => {
    for (const [, s] of allSubregions()) {
      assert.ok(typeof s.note === 'string' && s.note.trim().length > 0, `${s.code} note`);
    }
  });

  it('sources が1件以上で、全て http(s) の絶対URL', () => {
    for (const [, s] of allSubregions()) {
      assert.ok(Array.isArray(s.sources) && s.sources.length > 0, `${s.code} sources`);
      for (const u of s.sources) {
        assert.match(u, /^https?:\/\/\S+$/, `${s.code} の出典: ${u}`);
      }
    }
  });

  it('status があれば規定の値', () => {
    for (const [, s] of allSubregions()) {
      if (s.status === undefined) continue;
      assert.ok(STATUSES.includes(s.status), `${s.code} status=${s.status}`);
    }
  });

  it('自動監視の設定は国ブロックだけが持つ（小地域は収集対象外）', () => {
    for (const [, s] of allSubregions()) {
      assert.equal(s.official_sources, undefined, `${s.code}`);
      assert.equal(s.watch_feeds, undefined, `${s.code}`);
    }
  });
});
