import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  LAST_SEEN_MAX_LOOKBACK_DAYS,
  QUEUE_MAX,
  SKIP_VERDICTS,
  clampLookback,
  dequeueItems,
  enqueue,
  isSkippable,
  markSeen,
  mergeByUrl,
  pruneSeenUrls,
  readStateFile,
  sortForSummarize,
  toQueueItem,
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

describe('state: queue（要約のあふれの繰り越し）', () => {
  const TODAY = '2026-09-19';
  const item = (url, extra = {}) => ({ url, title: `t-${url}`, snippet: 's', countries: ['jp'], priority: 'low', ...extra });

  it('toQueueItem は本文などを捨て、queued_at/attempts を付ける', () => {
    const q = toQueueItem({ ...item('https://a'), articleText: '本文は保存しない', junk: 1 }, { today: TODAY });
    assert.deepEqual(Object.keys(q).sort(), ['attempts', 'countries', 'priority', 'queued_at', 'snippet', 'title', 'url']);
    assert.equal(q.queued_at, TODAY);
    assert.equal(q.attempts, 0);
    // 既に繰り越し済みのものは queued_at を引き継ぎ、bumpAttempts で回数だけ増える
    const again = toQueueItem({ ...q, queued_at: '2026-09-17', attempts: 1 }, { today: TODAY, bumpAttempts: true });
    assert.equal(again.queued_at, '2026-09-17');
    assert.equal(again.attempts, 2);
  });

  it('dequeueItems は TTL7日ちょうどを残し、8日目と attempts>=3 を落とす', () => {
    const queue = [
      { ...item('https://keep'), queued_at: '2026-09-12', attempts: 0 }, // 7日
      { ...item('https://expired'), queued_at: '2026-09-11', attempts: 0 }, // 8日
      { ...item('https://tried'), queued_at: TODAY, attempts: 3 },
      { ...item('https://tried2'), queued_at: TODAY, attempts: 2 },
      { queued_at: TODAY }, // url なし
    ];
    assert.deepEqual(dequeueItems(queue, TODAY).map((e) => e.url), ['https://keep', 'https://tried2']);
    assert.deepEqual(dequeueItems(null, TODAY), []);
  });

  it('mergeByUrl は今日の情報を優先し、queued_at/attempts は繰り越しを引き継ぐ', () => {
    const merged = mergeByUrl(
      [{ ...item('https://a'), priority: 'low', queued_at: '2026-09-17', attempts: 1 }],
      [{ ...item('https://a'), priority: 'high' }, item('https://b')],
    );
    assert.equal(merged.length, 2);
    const a = merged.find((m) => m.url === 'https://a');
    assert.equal(a.priority, 'high'); // 今日の判定が勝つ
    assert.equal(a.queued_at, '2026-09-17'); // 繰り越しの古さは保つ（翌日優先のため）
    assert.equal(a.attempts, 1);
  });

  it('sortForSummarize は high→low、同順位は古い繰り越しが先', () => {
    const items = [
      { ...item('today-low'), priority: 'low' },
      { ...item('old-low'), priority: 'low', queued_at: '2026-09-15' },
      { ...item('today-high'), priority: 'high' },
      { ...item('old-high'), priority: 'high', queued_at: '2026-09-15' },
    ];
    assert.deepEqual(sortForSummarize(items, TODAY).map((i) => i.url), ['old-high', 'today-high', 'old-low', 'today-low']);
  });

  it('sortForSummarize は同じ priority なら source_group の順（official_sources > watch_feeds > news_queries）が先', () => {
    const items = [
      { ...item('news'), priority: 'high', source_group: 'news_queries' },
      { ...item('official'), priority: 'high', source_group: 'official_sources' },
      { ...item('watch'), priority: 'high', source_group: 'watch_feeds' },
    ];
    assert.deepEqual(sortForSummarize(items, TODAY).map((i) => i.url), ['official', 'watch', 'news']);
  });

  it('sortForSummarize は priority が第1キー: priority high の報道は priority low の公式より先', () => {
    const items = [
      { ...item('low-official'), priority: 'low', source_group: 'official_sources' },
      { ...item('high-news'), priority: 'high', source_group: 'news_queries' },
    ];
    assert.deepEqual(sortForSummarize(items, TODAY).map((i) => i.url), ['high-news', 'low-official']);
  });

  it('enqueue は URL で重複排除する（より多く失敗した記録を残す）', () => {
    const { queue } = enqueue(
      [
        { ...item('https://a'), queued_at: TODAY, attempts: 0 },
        { ...item('https://a'), queued_at: TODAY, attempts: 1 },
        { ...item('https://b'), queued_at: TODAY, attempts: 0 },
        { queued_at: TODAY }, // url なしは捨てる
      ],
      TODAY,
    );
    assert.deepEqual(queue.map((e) => [e.url, e.attempts]).sort(), [['https://a', 1], ['https://b', 0]]);
  });

  it('enqueue は上限50を超えたら priority低・古い順に捨てる', () => {
    const many = [
      ...Array.from({ length: 30 }, (_, i) => ({ ...item(`https://high-${i}`), priority: 'high', queued_at: TODAY, attempts: 0 })),
      ...Array.from({ length: 25 }, (_, i) => ({ ...item(`https://low-new-${i}`), priority: 'low', queued_at: TODAY, attempts: 0 })),
      ...Array.from({ length: 10 }, (_, i) => ({ ...item(`https://low-old-${i}`), priority: 'low', queued_at: '2026-09-15', attempts: 0 })),
    ];
    const { queue, dropped } = enqueue(many, TODAY);
    assert.equal(queue.length, QUEUE_MAX);
    assert.equal(dropped, 15);
    assert.equal(queue.filter((e) => e.priority === 'high').length, 30); // high は全部残る
    assert.equal(queue.filter((e) => e.url.startsWith('https://low-old')).length, 0); // 古い low から捨てる
    assert.equal(queue.filter((e) => e.url.startsWith('https://low-new')).length, 20);
  });
});
