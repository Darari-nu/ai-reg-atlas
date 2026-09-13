import assert from 'node:assert/strict';
import fs from 'node:fs';
import { beforeEach, describe, it } from 'node:test';
import {
  applyTriageVerdicts,
  buildUpdateRecord,
  chunk,
  dedupeByEvent,
  mechanicalGate,
  publicationDateGate,
  resolveFeedLink,
  sortForTriage,
} from '../scripts/lib/pipeline.mjs';

const longAiRegText = `
  On 2026-06-10 the authority published an artificial intelligence regulation guideline
  for AI system governance, risk classification, transparency, compliance, and legal
  obligations under the new act. This official notice explains regulatory expectations
  for providers and deployers, including documentation, monitoring, accountability,
  implementation timelines, and enforcement coordination.
`.repeat(4);

describe('pipeline quality gates', () => {
  beforeEach(() => {
    try {
      fs.unlinkSync('/tmp/dropped.json');
    } catch {
      // noop
    }
  });

  it('drops google news, empty body, stale publication dates, and no-keyword pages', () => {
    assert.equal(
      mechanicalGate({ url: 'https://news.google.com/rss/articles/example', country_hint: 'us' }, longAiRegText).reason,
      'google-news-source'
    );
    assert.equal(
      mechanicalGate({ url: 'https://example.gov/news' }, 'AI regulation').reason,
      'body-too-short'
    );
    assert.equal(
      mechanicalGate({ url: 'https://example.gov/news' }, 'This page discusses unrelated procurement updates. '.repeat(30)).reason,
      'no-ai-reg-keyword'
    );
    assert.equal(publicationDateGate('2026-01-01', '2026-06-17', 90).reason, 'stale-publication-date');
  });

  it('uses publication_date for update date and id prefix', () => {
    const record = buildUpdateRecord({
      updates: [{ id: '2026-06-10-us-001' }],
      country: 'us',
      item: { url: 'https://example.gov/ai-guideline', canonical_event: 'AI guideline publication' },
      rec: {
        axis: 'transparency',
        change_type: 'guideline_draft',
        title: 'AI transparency guideline published',
        summary: { what: 'AI guideline', who: 'providers', when_impact: 'from publication' },
        so_what: 'Review AI governance controls.',
        diff_changed: false,
        publication_date: '2026-06-10',
        effective_date: null,
        deadline_date: null,
      },
    });

    assert.equal(record.id, '2026-06-10-us-002');
    assert.equal(record.date, '2026-06-10');
    assert.equal(record.publication_date, '2026-06-10');
    assert.equal(record.sources[0], 'https://example.gov/ai-guideline');
  });

  it('dedupes the same canonical event per country and prefers high priority', () => {
    const deduped = dedupeByEvent([
      {
        url: 'https://tracker.example/story',
        title: 'Tracker story',
        countries: ['eu'],
        priority: 'low',
        canonical_event: 'EU AI Act guideline published',
      },
      {
        url: 'https://official.example/guideline',
        title: 'Official publication',
        countries: ['eu'],
        priority: 'high',
        canonical_event: 'EU AI Act guideline published',
      },
      {
        url: 'https://official.example/guideline-us',
        title: 'US publication',
        countries: ['us'],
        priority: 'high',
        canonical_event: 'EU AI Act guideline published',
      },
    ]);

    assert.equal(deduped.length, 2);
    assert.equal(deduped.find((item) => item.countries[0] === 'eu').url, 'https://official.example/guideline');
    assert.equal(deduped.find((item) => item.countries[0] === 'us').url, 'https://official.example/guideline-us');
  });
});

describe('collect: RSSリンクの絶対化', () => {
  const feed = 'https://www.priv.gc.ca/en/rss/news/';
  it('相対パスはフィードURLを基準に解決する', () => {
    assert.equal(resolveFeedLink('/en/opc-news/news-and-announcements/2026/nr-c_260910/', feed), 'https://www.priv.gc.ca/en/opc-news/news-and-announcements/2026/nr-c_260910/');
  });
  it('絶対URLはそのまま', () => {
    assert.equal(resolveFeedLink('https://example.gov/a?b=1', feed), 'https://example.gov/a?b=1');
  });
  it('空・http(s)以外は空文字', () => {
    assert.equal(resolveFeedLink('', feed), '');
    assert.equal(resolveFeedLink(undefined, feed), '');
    assert.equal(resolveFeedLink('javascript:void(0)', feed), '');
    assert.equal(resolveFeedLink('mailto:a@b.c', feed), '');
  });
});

describe('triage: バッチ分割', () => {
  it('chunk は指定件数ずつ切る', () => {
    const arr = Array.from({ length: 150 }, (_, i) => i);
    assert.deepEqual(chunk(arr, 40).map((b) => b.length), [40, 40, 40, 30]);
    assert.deepEqual(chunk([], 40), []);
  });

  it('sortForTriage は公式→watch→newsの順、同順位は元の並びを保つ', () => {
    const c = [
      { id: 1, source_group: 'news_queries' },
      { id: 2, source_group: 'official_sources' },
      { id: 3, source_group: 'watch_feeds' },
      { id: 4, source_group: 'official_sources' },
      { id: 5 },
    ];
    assert.deepEqual(sortForTriage(c).map((x) => x.id), [2, 4, 3, 1, 5]);
    assert.deepEqual(c.map((x) => x.id), [1, 2, 3, 4, 5]); // 元配列は変えない
  });

  it('applyTriageVerdicts はバッチ内indexで結び付け、不正indexを捨てる', () => {
    const batch = [{ url: 'a' }, { url: 'b' }, { url: 'c' }];
    const v = (index, extra = {}) => ({ index, relevant: true, duplicate: false, country: ['jp'], priority: 'high', canonical_event: `e${index}`, ...extra });
    const { picked, bad, answered } = applyTriageVerdicts(
      batch,
      [v(0), v(1, { relevant: false }), v(2, { duplicate: true }), v(3), v(-1), v(1.5), v(0), v(1, { country: ['zz'] })],
      ['jp', 'us'],
    );
    assert.deepEqual(picked.map((p) => p.url), ['a']);
    assert.deepEqual(picked[0].countries, ['jp']);
    assert.equal(picked[0].canonical_event, 'e0');
    assert.equal(bad, 5); // 3, -1, 1.5, 重複0, 重複1
    assert.equal(answered, 3);
  });

  it('対象外の国コードは落とし、対象国が残らなければ除外する', () => {
    const batch = [{ url: 'a' }, { url: 'b' }];
    const base = { relevant: true, duplicate: false, priority: 'low', canonical_event: 'x' };
    const { picked } = applyTriageVerdicts(batch, [{ ...base, index: 0, country: ['zz', 'us'] }, { ...base, index: 1, country: ['zz'] }], ['jp', 'us']);
    assert.deepEqual(picked.map((p) => [p.url, p.countries]), [['a', ['us']]]);
  });

  it('verdicts が null でも落ちない', () => {
    assert.deepEqual(applyTriageVerdicts([{ url: 'a' }], null, ['jp']), { picked: [], bad: 0, answered: 0 });
  });
});
