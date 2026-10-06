import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_CONTEXT_WINDOW,
  extractDatedLinks,
  extractDatedLinksMarkdown,
  isEmptyBody,
} from '../scripts/lib/scrape.mjs';

const BASE = 'https://www.imda.gov.sg/resources/press-releases-factsheets-and-speeches';
const CL = 'TeaserCard-module-scss-module__Pcfx9q__';

// IMDA 一覧のカード（実物と同じ構造・クラス名の長さ）。アンカーは本文が空で aria-label に題名があり、
// 日付 div はアンカー末尾から約470字後ろにある（題名が vh span と見出しで繰り返されるため）
function card(slug, title, date, desc) {
  return (
    `<div class="${CL}teaser-card teaser-card ${CL}teaser-card--newsroom">` +
    `<a href="/resources/press-releases-factsheets-and-speeches/${slug}" class="${CL}teaser-card__anchor-link" aria-label="${title}"></a>` +
    `<div class="${CL}teaser-card__link"><span class="vh">${title}</span>` +
    `<div class="${CL}teaser-card__header teaser-card__header"><div><span class="${CL}category">Factsheet</span></div>` +
    `<div class="${CL}date date">${date}</div></div>` +
    `<div class="${CL}teaser-card__content teaser-card__content"><div class="${CL}teaser-card__title teaser-card__title">${title}</div>` +
    `<p class="undefined">${desc}</p><span class="icon icon-chevron-right" aria-hidden="true"></span></div></div></div>`
  );
}

const DESC = 'Read the latest highlights and insights from the past year for enterprises and citizens across Singapore.';
const HTML =
  '<html><head><script>var x = 1;</script></head><body><main>' +
  card('card-a', 'Singapore Digital Economy Report and Annual Report 2026 for IMDA stakeholders', '05 Oct 2026', DESC) +
  card('card-b', 'Singapore launches liquid cooling standard for data centres in tropical climates', '27 Aug 2026', DESC) +
  card('card-c', 'IMDA and the IAPP strengthen partnership to expand AI governance professional training', '22 Jul 2026', DESC) +
  '</main></body></html>';

describe('extractDatedLinks の文脈幅', () => {
  it('フィクスチャは日付がアンカー末尾から400字より後ろにある（再現条件）', () => {
    const m = HTML.match(/<a [^>]*card-a[^>]*><\/a>/);
    const anchorEnd = m.index + m[0].length;
    const dateAt = HTML.indexOf('05 Oct 2026');
    assert.ok(dateAt - anchorEnd > DEFAULT_CONTEXT_WINDOW, `distance=${dateAt - anchorEnd}`);
    assert.ok(dateAt - anchorEnd < 800);
  });

  it('既定(400)では記事が取れない', () => {
    assert.equal(extractDatedLinks(HTML, BASE, 'sg').length, 0);
  });

  it('800 では記事が取れ、listing_date がカード自身の日付になる', () => {
    const items = extractDatedLinks(HTML, BASE, 'sg', 800);
    assert.equal(items.length, 3);
    const byUrl = Object.fromEntries(items.map((i) => [i.url.split('/').pop(), i]));
    assert.equal(byUrl['card-a'].listing_date, '2026-10-05');
    assert.equal(byUrl['card-b'].listing_date, '2026-08-27');
    assert.equal(byUrl['card-c'].listing_date, '2026-07-22');
    assert.match(byUrl['card-a'].title, /^Singapore Digital Economy Report/);
  });

  it('既定値は引数省略時と 400 指定で同じ結果（他の情報源の挙動不変）', () => {
    assert.deepEqual(extractDatedLinks(HTML, BASE, 'sg'), extractDatedLinks(HTML, BASE, 'sg', 400));
    const md = '[Policy paper](https://example.gov/a)\n\n12 Sep 2026\n';
    assert.deepEqual(extractDatedLinksMarkdown(md, 'https://example.gov/', 'xx'), extractDatedLinksMarkdown(md, 'https://example.gov/', 'xx', 400));
    assert.equal(extractDatedLinksMarkdown(md, 'https://example.gov/', 'xx')[0].listing_date, '2026-09-12');
  });

  it('markdown 抽出も文脈幅を受け取る', () => {
    const md = `[Policy paper](https://example.gov/a)\n\n${'x'.repeat(500)}\n\n12 Sep 2026\n`;
    assert.equal(extractDatedLinksMarkdown(md, 'https://example.gov/', 'xx').length, 0);
    const items = extractDatedLinksMarkdown(md, 'https://example.gov/', 'xx', 800);
    assert.equal(items.length, 1);
    assert.equal(items[0].listing_date, '2026-09-12');
  });
});

describe('isEmptyBody（直接取得の本文が空か）', () => {
  it('script/style だけなら空', () => {
    assert.equal(isEmptyBody('<html><head><script>var a=1;</script><style>a{}</style></head><body><script>x()</script></body></html>'), true);
    assert.equal(isEmptyBody(''), true);
    assert.equal(isEmptyBody('  \n '), true);
  });
  it('本文テキストがあれば空でない', () => {
    assert.equal(isEmptyBody('<html><body><p>Press releases</p></body></html>'), false);
    assert.equal(isEmptyBody(HTML), false); // カードの本文テキストがある
  });
});
