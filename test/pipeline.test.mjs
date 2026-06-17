import assert from 'node:assert/strict';
import fs from 'node:fs';
import { beforeEach, describe, it } from 'node:test';
import {
  buildUpdateRecord,
  dedupeByEvent,
  mechanicalGate,
  publicationDateGate,
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
