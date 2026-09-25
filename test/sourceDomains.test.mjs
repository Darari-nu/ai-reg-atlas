// config/source_domains.yaml の形式検査。ネットワークは使わない。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import yaml from 'js-yaml';
import { OFFICIAL_TLD_RE } from '../scripts/lib/pipeline.mjs';

const doc = yaml.load(fs.readFileSync(path.join(process.cwd(), 'config/source_domains.yaml'), 'utf8'));

describe('source_domains.yaml', () => {
  it('official と trusted_media が読める・空でない', () => {
    assert.ok(Array.isArray(doc.official) && doc.official.length > 0);
    assert.ok(Array.isArray(doc.trusted_media) && doc.trusted_media.length > 0);
  });

  it('official・trusted_media は小文字・スキーム無し・重複無し', () => {
    for (const list of [doc.official, doc.trusted_media]) {
      const seen = new Set();
      for (const d of list) {
        assert.equal(typeof d, 'string');
        assert.ok(d.length > 0);
        assert.equal(d, d.toLowerCase(), `${d} は小文字であるべき`);
        assert.ok(!/^https?:\/\//.test(d), `${d} にスキームを含めない`);
        assert.ok(!/\//.test(d), `${d} にパスを含めない`);
        assert.ok(!seen.has(d), `${d} が重複している`);
        seen.add(d);
      }
    }
  });

  it('trusted_media に政府系TLDのドメインが混ざっていない', () => {
    for (const d of doc.trusted_media) {
      assert.equal(OFFICIAL_TLD_RE.test(d), false, `${d} は政府系TLDなので trusted_media ではなく official 側`);
    }
  });
});
