import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, it } from 'node:test';
import {
  applyTriageVerdicts,
  buildUpdateRecord,
  chunk,
  classifySourceKind,
  decideDiffChanged,
  dedupeByEvent,
  ensureJapaneseTitle,
  hasJapanese,
  hostMatches,
  irrelevantItems,
  irrelevantUrls,
  isDuplicateRecord,
  isStaleListing,
  isTrustedMediaUrl,
  LEGAL_STAGES,
  listingDate,
  loadSourceDomains,
  mechanicalGate,
  nearestDate,
  needsSecondLook,
  OFFICIAL_TLD_RE,
  parseLooseDate,
  readerBody,
  publicationDateGate,
  resolveFeedLink,
  sortForTriage,
  unwrapBingNewsUrl,
} from '../scripts/lib/pipeline.mjs';
import { TIMELINE_LEGAL_STAGES } from '../src/lib/derivedTimeline.mjs';

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
    assert.equal('discovered_at' in record, false); // discoveredAt 未指定ならキー自体を出さない
    assert.equal(record.country_anchor, '/country/us/#axis-transparency');
  });

  it('discoveredAt を渡すと discovered_at を含める', () => {
    const record = buildUpdateRecord({
      updates: [],
      country: 'jp',
      item: { url: 'https://example.go.jp/ai' },
      rec: {
        axis: 'penalties',
        change_type: 'other',
        title: 'T',
        summary: { what: 'a', who: 'b', when_impact: 'c' },
        so_what: 'd',
        diff_changed: false,
        publication_date: '2026-09-01',
      },
      discoveredAt: '2026-09-19',
    });
    assert.equal(record.discovered_at, '2026-09-19');
    assert.equal(record.date, '2026-09-01'); // date は公表日のまま
  });

  it('axis が general/timeline のときアンカーは #updates', () => {
    const build = (axis) =>
      buildUpdateRecord({
        updates: [],
        country: 'cn',
        item: { url: 'https://example.cn/ai' },
        rec: {
          axis,
          change_type: 'other',
          title: 'T',
          summary: { what: 'a', who: 'b', when_impact: 'c' },
          so_what: 'd',
          diff_changed: false,
          publication_date: '2026-09-01',
        },
      });
    assert.equal(build('general').country_anchor, '/country/cn/#updates');
    assert.equal(build('timeline').country_anchor, '/country/cn/#updates');
    assert.equal(build('penalties').country_anchor, '/country/cn/#axis-penalties');
  });

  it('legal_stage が有効値なら change_type の直後に含める', () => {
    const record = buildUpdateRecord({
      updates: [],
      country: 'jp',
      item: { url: 'https://example.go.jp/ai' },
      rec: {
        axis: 'timeline',
        change_type: 'status_change',
        title: 'T',
        summary: { what: 'a', who: 'b', when_impact: 'c' },
        so_what: 'd',
        diff_changed: false,
        publication_date: '2026-09-01',
        legal_stage: 'in_force',
      },
    });
    assert.equal(record.legal_stage, 'in_force');
    assert.deepEqual(Object.keys(record).slice(0, 5), ['id', 'date', 'country', 'axis', 'change_type']);
    assert.equal(Object.keys(record)[5], 'legal_stage');
  });

  it('legal_stage が無効値・無しならキー自体を出さない', () => {
    const build = (legal_stage) =>
      buildUpdateRecord({
        updates: [],
        country: 'jp',
        item: { url: 'https://example.go.jp/ai' },
        rec: {
          axis: 'timeline',
          change_type: 'status_change',
          title: 'T',
          summary: { what: 'a', who: 'b', when_impact: 'c' },
          so_what: 'd',
          diff_changed: false,
          publication_date: '2026-09-01',
          ...(legal_stage !== undefined ? { legal_stage } : {}),
        },
      });
    assert.equal('legal_stage' in build(undefined), false);
    assert.equal('legal_stage' in build('IN_FORCE'), false); // enum外（大文字違い）
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

describe('isDuplicateRecord: 同じ出典URLかつ同じ公表日の重複チェック', () => {
  const updates = [{ id: '2026-09-16-kr-001', date: '2026-09-16', sources: ['https://example.kr/a'] }];

  it('同URL・同日 → true', () => {
    assert.equal(isDuplicateRecord(updates, 'https://example.kr/a', '2026-09-16'), true);
  });

  it('同URL・別日 → false（同じURLから複数の出来事が出るページもあるため）', () => {
    assert.equal(isDuplicateRecord(updates, 'https://example.kr/a', '2026-09-19'), false);
  });

  it('別URL・同日 → false', () => {
    assert.equal(isDuplicateRecord(updates, 'https://example.kr/b', '2026-09-16'), false);
  });

  it('空配列 → false', () => {
    assert.equal(isDuplicateRecord([], 'https://example.kr/a', '2026-09-16'), false);
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

  it('irrelevantUrls は relevant=false のURLだけ返す（duplicate は返さない）', () => {
    const batch = [{ url: 'a' }, { url: 'b' }, { url: 'c' }];
    const v = (index, extra = {}) => ({ index, relevant: true, duplicate: false, country: ['jp'], priority: 'low', canonical_event: 'e', ...extra });
    assert.deepEqual(
      irrelevantUrls(batch, [v(0, { relevant: false }), v(1, { duplicate: true }), v(2), v(9, { relevant: false }), v(0, { relevant: false })]),
      ['a'],
    );
    assert.deepEqual(irrelevantUrls(batch, null), []);
  });

  it('irrelevantItems は relevant=false の候補オブジェクトを返す（duplicate・範囲外・重複indexは無視）', () => {
    const batch = [{ url: 'a', title: 'A' }, { url: 'b', title: 'B' }, { url: 'c', title: 'C' }];
    const v = (index, extra = {}) => ({ index, relevant: true, duplicate: false, country: ['jp'], priority: 'low', canonical_event: 'e', ...extra });
    assert.deepEqual(
      irrelevantItems(batch, [v(0, { relevant: false }), v(1, { duplicate: true }), v(2), v(9, { relevant: false }), v(0, { relevant: false })]),
      [batch[0]],
    );
    assert.deepEqual(irrelevantItems(batch, null), []);
  });

  it('needsSecondLook は official_sources だけ true', () => {
    assert.equal(needsSecondLook({ source_group: 'official_sources' }), true);
    assert.equal(needsSecondLook({ source_group: 'watch_feeds' }), false);
    assert.equal(needsSecondLook({ source_group: 'news_queries' }), false);
    assert.equal(needsSecondLook({}), false);
  });
});

describe('collect: 一覧リンクの日付と古いリンクの除外', () => {
  it('parseLooseDate は各形式を YYYY-MM-DD にする', () => {
    assert.equal(parseLooseDate('https://www.cac.gov.cn/2026-08/20/c_1788889498173657.htm'), '2026-08-20');
    assert.equal(parseLooseDate('https://www.federalregister.gov/documents/2026/09/14/2026-18646/x'), '2026-09-14');
    assert.equal(parseLooseDate('2026年8月20日 施行'), '2026-08-20');
    assert.equal(parseLooseDate('Jul 22, 2026'), '2026-07-22');
    assert.equal(parseLooseDate('22 July 2026'), '2026-07-22');
    assert.equal(parseLooseDate('22/07/2026'), '2026-07-22');
    assert.equal(parseLooseDate('c_1788889498173657'), null);
    assert.equal(parseLooseDate(undefined), null);
  });

  it('nearestDate はアンカーに一番近い日付を選ぶ', () => {
    const t = '<li><span>2025-01-01</span> ………………………… </li><li><a href="/x">A</a><span>2026-09-10</span></li>';
    const start = t.indexOf('<a');
    assert.equal(nearestDate(t, start, t.indexOf('</a>') + 4), '2026-09-10');
  });

  it('listingDate は URL → タイトル → 周辺 の順', () => {
    assert.equal(listingDate({ href: 'https://a/2026-08/20/x.htm', title: '2025年1月1日', text: '2024-01-01', start: 0, end: 1 }), '2026-08-20');
    assert.equal(listingDate({ href: 'https://a/x.htm', title: '2025年1月1日 通知', text: '2024-01-01', start: 0, end: 1 }), '2025-01-01');
    assert.equal(listingDate({ href: 'https://a/x.htm', title: '通知' }), null);
  });

  it('isStaleListing は日付が分かり上限より古いときだけ true', () => {
    assert.equal(isStaleListing('2022-12-14', '2026-09-13', 30), true);
    assert.equal(isStaleListing('2026-08-20', '2026-09-13', 30), false);
    assert.equal(isStaleListing(null, '2026-09-13', 30), false);
    assert.equal(isStaleListing('2026-10-01', '2026-09-13', 30), false); // 未来日付は落とさない
  });

  it('readerBody は jina の前置きと取得日時の行を除く', () => {
    const raw = 'Title: t\n\nURL Source: https://x\n\nMarkdown Content:\n2026年09月13日 星期日\n\n# 本文見出し\n本文';
    assert.equal(readerBody(raw), '\n# 本文見出し\n本文');
    assert.equal(readerBody('前置きなし'), '前置きなし');
  });
});

describe('summarize: 見出しを日本語に揃える', () => {
  it('hasJapanese はかな・漢字を検出する', () => {
    assert.equal(hasJapanese('EDPB、ガイドラインを採択'), true);
    assert.equal(hasJapanese('中国CAC'), true);
    assert.equal(hasJapanese('EDPB Adopts Guidelines'), false);
    assert.equal(hasJapanese(''), false);
    assert.equal(hasJapanese(undefined), false);
  });

  it('英語の見出しは summary.what に差し替える', () => {
    const r = ensureJapaneseTitle('EDPB Adopts Guidelines on Administrative Fines', 'EDPBがGDPRの行政制裁金ガイドラインを採択');
    assert.deepEqual(r, { title: 'EDPBがGDPRの行政制裁金ガイドラインを採択', replaced: true });
  });

  it('日本語の見出しはそのまま', () => {
    const r = ensureJapaneseTitle('韓国PIPC、5社に改善勧告', 'x');
    assert.deepEqual(r, { title: '韓国PIPC、5社に改善勧告', replaced: false });
  });

  it('どちらも日本語でなければ元のまま（レコードを落とさない）', () => {
    assert.deepEqual(ensureJapaneseTitle('English title', 'also english'), { title: 'English title', replaced: false });
  });
});

describe('decideDiffChanged: 法的段階＋差分項目の両方が揃ったときだけ true', () => {
  const base = { diff_changed: true, legal_stage: 'in_force', diff_items: [{ bucket: 'stricter', topic: 'x', action: 'add' }] };

  it('施行（in_force）＋項目1件 → true', () => {
    assert.equal(decideDiffChanged(base), true);
  });

  it('成立（enacted）＋項目 → true', () => {
    assert.equal(decideDiffChanged({ ...base, legal_stage: 'enacted' }), true);
  });

  it('確定した公式指針（final_guidance）＋項目 → true', () => {
    assert.equal(decideDiffChanged({ ...base, legal_stage: 'final_guidance' }), true);
  });

  it('法案（bill）＋項目 → false', () => {
    assert.equal(decideDiffChanged({ ...base, legal_stage: 'bill' }), false);
  });

  it('announcement（方針表明・会見・事件の公表） → false', () => {
    assert.equal(decideDiffChanged({ ...base, legal_stage: 'announcement' }), false);
  });

  it('diff_items が0件 → false', () => {
    assert.equal(decideDiffChanged({ ...base, diff_items: [] }), false);
  });

  it('diff_items が無い（undefined） → false', () => {
    const { diff_items, ...rest } = base;
    assert.equal(decideDiffChanged(rest), false);
  });

  it('legal_stage が無い（undefined） → false', () => {
    const { legal_stage, ...rest } = base;
    assert.equal(decideDiffChanged(rest), false);
  });

  it('diff_changed=false ならほかが揃っていても false', () => {
    assert.equal(decideDiffChanged({ ...base, diff_changed: false }), false);
  });

  it('country=eu なら他が全部揃っていても false（EU自身に「EUとの差分」は無い）', () => {
    assert.equal(decideDiffChanged(base, 'eu'), false);
  });

  it('country=jp で揃っていれば true', () => {
    assert.equal(decideDiffChanged(base, 'jp'), true);
  });

  it('legal_stage が enum 外（大文字違い等）なら false', () => {
    assert.equal(decideDiffChanged({ ...base, legal_stage: 'IN_FORCE' }), false);
    assert.equal(decideDiffChanged({ ...base, legal_stage: 'in force' }), false);
  });

  it('diff_items が配列でない（文字列）なら false', () => {
    assert.equal(decideDiffChanged({ ...base, diff_items: 'x' }), false);
  });
});

describe('legal_stage の enum 整合（schema / pipeline / derivedTimeline / summarize プロンプトが食い違わないこと）', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'schema/update.schema.json'), 'utf8'));
  const schemaEnum = schema.items.properties.legal_stage.enum;

  // summarize.mjs は import すると main() が動いてしまうので、ソースを文字列として読み
  // RESPONSE_SCHEMA.legal_stage.enum の配列リテラルだけを正規表現で抜き出す
  const summarizeSrc = fs.readFileSync(path.join(process.cwd(), 'scripts/summarize.mjs'), 'utf8');
  const legalStageBlockMatch = summarizeSrc.match(/legal_stage:\s*{[\s\S]*?enum:\s*\[([^\]]+)\]/);
  assert.ok(legalStageBlockMatch, 'RESPONSE_SCHEMA.legal_stage.enum が summarize.mjs に見つからない');
  const responseSchemaEnum = legalStageBlockMatch[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);

  it('(a) schema/update.schema.json の legal_stage enum は LEGAL_STAGES と同じ7値・同じ順', () => {
    assert.deepEqual(schemaEnum, LEGAL_STAGES);
    assert.equal(LEGAL_STAGES.length, 7);
  });

  it('(b) derivedTimeline の TIMELINE_LEGAL_STAGES は LEGAL_STAGES の部分集合で5値', () => {
    assert.equal(TIMELINE_LEGAL_STAGES.length, 5);
    for (const stage of TIMELINE_LEGAL_STAGES) {
      assert.ok(LEGAL_STAGES.includes(stage), `${stage} は LEGAL_STAGES に含まれるはず`);
    }
    // announcement / other は法令の節目ではないので年表には含まれない
    assert.equal(TIMELINE_LEGAL_STAGES.includes('announcement'), false);
    assert.equal(TIMELINE_LEGAL_STAGES.includes('other'), false);
  });

  it('(c) summarize.mjs の RESPONSE_SCHEMA.legal_stage.enum は LEGAL_STAGES と一致', () => {
    assert.deepEqual(responseSchemaEnum, LEGAL_STAGES);
  });
});

describe('unwrapBingNewsUrl（Bingニュースの転送URLを元記事URLに展開）', () => {
  it('bing.com/news/apiclick.aspx の url パラメータを取り出す', () => {
    const link = 'https://www.bing.com/news/apiclick.aspx?ID=abc&url=https%3A%2F%2Fexample.com%2Farticle';
    assert.equal(unwrapBingNewsUrl(link), 'https://example.com/article');
  });

  it('Bing 以外のURLはそのまま返す', () => {
    assert.equal(unwrapBingNewsUrl('https://example.com/news/apiclick.aspx?url=https://other.com'), 'https://example.com/news/apiclick.aspx?url=https://other.com');
  });

  it('bing.com でも apiclick.aspx 以外・url パラメータ無しはそのまま返す', () => {
    assert.equal(unwrapBingNewsUrl('https://www.bing.com/news/search?q=ai'), 'https://www.bing.com/news/search?q=ai');
    assert.equal(unwrapBingNewsUrl('https://www.bing.com/news/apiclick.aspx?ID=abc'), 'https://www.bing.com/news/apiclick.aspx?ID=abc');
  });

  it('url パラメータが http(s) 以外はそのまま返す', () => {
    const link = 'https://www.bing.com/news/apiclick.aspx?url=javascript%3Aalert(1)';
    assert.equal(unwrapBingNewsUrl(link), link);
  });

  it('壊れたURLはそのまま返す', () => {
    assert.equal(unwrapBingNewsUrl('not a url'), 'not a url');
  });
});

describe('hostMatches（ホストがドメイン自身かサブドメインか）', () => {
  it('完全一致・サブドメインは true', () => {
    assert.equal(hostMatches('reuters.com', 'reuters.com'), true);
    assert.equal(hostMatches('jp.reuters.com', 'reuters.com'), true);
  });

  it('先頭の www. を除いて比較する', () => {
    assert.equal(hostMatches('www.reuters.com', 'reuters.com'), true);
    assert.equal(hostMatches('reuters.com', 'www.reuters.com'), true);
  });

  it('部分文字列一致は false（notreuters.com は reuters.com に一致しない）', () => {
    assert.equal(hostMatches('notreuters.com', 'reuters.com'), false);
    assert.equal(hostMatches('reuters.com.evil.com', 'reuters.com'), false);
  });
});

describe('classifySourceKind（出典ホストの official/media 判定）', () => {
  const domains = loadSourceDomains(path.join(process.cwd()));

  it('政府系TLD（.gov / .go.kr / .go.jp / .gc.ca / europa.eu / leg.br 等）は official', () => {
    assert.equal(classifySourceKind('https://www.nist.gov/news', domains), 'official');
    assert.equal(classifySourceKind('https://www.msit.go.kr/', domains), 'official');
    assert.equal(classifySourceKind('https://www8.cao.go.jp/', domains), 'official');
    assert.equal(classifySourceKind('https://priv.gc.ca/', domains), 'official');
    assert.equal(classifySourceKind('https://digital-strategy.ec.europa.eu/', domains), 'official');
    assert.equal(classifySourceKind('https://www.camara.leg.br/', domains), 'official');
    assert.equal(classifySourceKind('https://www.gov.uk/', domains), 'official');
  });

  it('source_domains.yaml の official（canada.ca）は official', () => {
    assert.equal(classifySourceKind('https://www.canada.ca/en.html', domains), 'official');
  });

  it('countries.yaml の official_sources のホストは official', () => {
    assert.equal(classifySourceKind('https://www.tc260.org.cn/', domains), 'official');
  });

  it('報道・NGOなど許可リスト外の非公式ドメインは media', () => {
    assert.equal(classifySourceKind('https://artificialintelligenceact.eu/feed/', domains), 'media');
    assert.equal(classifySourceKind('https://www.dataprivacybr.org/', domains), 'media');
    assert.equal(classifySourceKind('https://www.reuters.com/technology/', domains), 'media');
  });

  it('壊れたURLは media', () => {
    assert.equal(classifySourceKind('not a url', domains), 'media');
  });
});

describe('OFFICIAL_TLD_RE', () => {
  it('部分一致のなりすましホストにはマッチしない', () => {
    assert.equal(OFFICIAL_TLD_RE.test('evilgov.uk'), false);
    assert.equal(OFFICIAL_TLD_RE.test('notgov.com'), false);
  });
});

describe('isTrustedMediaUrl（許可リストの報道機関か）', () => {
  const domains = loadSourceDomains(path.join(process.cwd()));

  it('許可リストのドメイン・サブドメインは true', () => {
    assert.equal(isTrustedMediaUrl('https://www.reuters.com/technology/', domains.trustedMedia), true);
    assert.equal(isTrustedMediaUrl('https://jp.reuters.com/article', domains.trustedMedia), true);
  });

  it('許可リストに無い媒体は false', () => {
    assert.equal(isTrustedMediaUrl('https://www.dataprivacybr.org/', domains.trustedMedia), false);
  });
});

describe('buildUpdateRecord の source_kind', () => {
  const baseRec = {
    axis: 'timeline',
    change_type: 'status_change',
    title: 'T',
    summary: { what: 'a', who: 'b', when_impact: 'c' },
    so_what: 'd',
    diff_changed: false,
    publication_date: '2026-09-01',
    legal_stage: 'in_force',
  };

  it('official/media を渡すと legal_stage の直後に含める', () => {
    const record = buildUpdateRecord({
      updates: [],
      country: 'jp',
      item: { url: 'https://example.go.jp/ai' },
      rec: baseRec,
      sourceKind: 'media',
    });
    assert.equal(record.source_kind, 'media');
    assert.deepEqual(Object.keys(record).slice(0, 6), ['id', 'date', 'country', 'axis', 'change_type', 'legal_stage']);
    assert.equal(Object.keys(record)[6], 'source_kind');
  });

  it('未指定・不正値ならキー自体を出さない', () => {
    const withoutKind = buildUpdateRecord({
      updates: [],
      country: 'jp',
      item: { url: 'https://example.go.jp/ai' },
      rec: baseRec,
    });
    assert.equal('source_kind' in withoutKind, false);

    const invalidKind = buildUpdateRecord({
      updates: [],
      country: 'jp',
      item: { url: 'https://example.go.jp/ai' },
      rec: baseRec,
      sourceKind: 'unknown',
    });
    assert.equal('source_kind' in invalidKind, false);
  });
});

describe('既存データ（data/updates/*.json）の source_kind', () => {
  const domains = loadSourceDomains(path.join(process.cwd()));
  const dir = path.join(process.cwd(), 'data/updates');
  const records = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));

  it('全件に source_kind があり classifySourceKind(sources[0]) と一致する', () => {
    assert.ok(records.length > 0);
    for (const rec of records) {
      assert.ok(['official', 'media'].includes(rec.source_kind), `${rec.id}: source_kind が無いか不正`);
      assert.equal(rec.source_kind, classifySourceKind(rec.sources[0], domains), `${rec.id}: 判定結果と不一致`);
    }
  });

  it('media は4件（artificialintelligenceact.eu 2件 + dataprivacybr.org 2件）', () => {
    const mediaRecords = records.filter((r) => r.source_kind === 'media');
    assert.equal(mediaRecords.length, 4);
    const hosts = mediaRecords.map((r) => new URL(r.sources[0]).hostname.replace(/^www\./, ''));
    assert.deepEqual(
      hosts.filter((h) => h === 'artificialintelligenceact.eu').length,
      2
    );
    assert.deepEqual(
      hosts.filter((h) => h === 'dataprivacybr.org').length,
      2
    );
  });
});
