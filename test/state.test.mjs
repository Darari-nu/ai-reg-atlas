import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  LAST_SEEN_MAX_LOOKBACK_DAYS,
  SKIP_VERDICTS,
  clampLookback,
  isSkippable,
  markSeen,
  pruneSeenUrls,
  readStateFile,
} from '../scripts/lib/state.mjs';

const tmpDirs = [];

function tmpFile(name, body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-state-'));
  tmpDirs.push(dir);
  const file = path.join(dir, name);
  fs.writeFileSync(file, body);
  return file;
}

afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

describe('state: 状態ファイルの読み込み', () => {
  it('壊れたJSONは fallback を返す（警告のみ・例外にしない）', () => {
    const file = tmpFile('broken.json', '{ "a": ');
    const warnings = [];
    const orig = console.warn;
    console.warn = (m) => warnings.push(m);
    try {
      assert.deepEqual(readStateFile(file, {}), {});
      assert.deepEqual(readStateFile(file, []), []);
    } finally {
      console.warn = orig;
    }
    assert.equal(warnings.length, 2);
    assert.match(warnings[0], /\[state\]/);
  });

  it('正しいJSONはそのまま、未作成は fallback', () => {
    const file = tmpFile('ok.json', '{"https://a":{"verdict":"triage-irrelevant","date":"2026-09-19"}}');
    assert.deepEqual(readStateFile(file, {}), { 'https://a': { verdict: 'triage-irrelevant', date: '2026-09-19' } });
    assert.deepEqual(readStateFile(path.join(path.dirname(file), 'none.json'), { x: 1 }), { x: 1 });
  });
});

describe('state: seen_urls', () => {
  it('pruneSeenUrls は TTL 丁度は残し、超えたら落とす', () => {
    const map = {
      'https://keep': { verdict: 'triage-irrelevant', date: '2026-08-20' }, // 30日ちょうど
      'https://drop': { verdict: 'triage-irrelevant', date: '2026-08-19' }, // 31日
      'https://today': { verdict: 'body-too-short', date: '2026-09-19' },
    };
    const pruned = pruneSeenUrls(map, '2026-09-19', 30);
    assert.deepEqual(Object.keys(pruned).sort(), ['https://keep', 'https://today']);
  });

  it('pruneSeenUrls は形の壊れたエントリを捨て、余計なキーを残さない', () => {
    const pruned = pruneSeenUrls(
      {
        'https://a': { verdict: 'gemini-unusable', date: '2026-09-18', articleText: '本文は保存しない' },
        'https://b': { verdict: 'gemini-unusable' }, // date なし
        'https://c': { date: '2026-09-18' }, // verdict なし
        'https://d': null,
        'https://e': { verdict: 'x', date: '2026/09/18' }, // 日付形式が違う
      },
      '2026-09-19',
      30,
    );
    assert.deepEqual(pruned, { 'https://a': { verdict: 'gemini-unusable', date: '2026-09-18' } });
  });

  it('isSkippable は SKIP_VERDICTS のものだけ true', () => {
    for (const verdict of SKIP_VERDICTS) assert.equal(isSkippable({ verdict }), true, verdict);
    // 一時的な失敗は再挑戦する
    assert.equal(isSkippable({ verdict: 'blocked-or-js-only-page' }), false);
    assert.equal(isSkippable({ verdict: 'missing-publication-date' }), false);
    assert.equal(isSkippable({ verdict: 'fetch-failed:HTTP 503' }), false);
    assert.equal(isSkippable(undefined), false);
    assert.equal(isSkippable(null), false);
  });

  it('markSeen は URL・verdict・日付だけを書く', () => {
    const map = {};
    markSeen(map, 'https://a', 'triage-irrelevant', '2026-09-19');
    markSeen(map, '', 'triage-irrelevant', '2026-09-19'); // URLが無ければ何もしない
    assert.deepEqual(map, { 'https://a': { verdict: 'triage-irrelevant', date: '2026-09-19' } });
  });
});

describe('state: last_seen の遡り上限', () => {
  const now = new Date('2026-09-19T00:00:00Z');
  const days = (n) => new Date(now.getTime() - n * 86_400_000);

  it('古すぎる prev は now − maxDays にクランプする', () => {
    assert.equal(clampLookback(days(40).toISOString(), now, 14).toISOString(), days(14).toISOString());
  });

  it('上限内の prev はそのまま', () => {
    assert.equal(clampLookback(days(3).toISOString(), now, 14).toISOString(), days(3).toISOString());
    assert.equal(clampLookback(days(14).toISOString(), now, 14).toISOString(), days(14).toISOString());
  });

  it('prev が無い・壊れていれば null（呼び出し側が初回窓を使う）', () => {
    assert.equal(clampLookback(undefined, now, 14), null);
    assert.equal(clampLookback(null, now, 14), null);
    assert.equal(clampLookback('not-a-date', now, 14), null);
  });

  it('既定の上限は14日', () => {
    assert.equal(LAST_SEEN_MAX_LOOKBACK_DAYS, 14);
  });
});
