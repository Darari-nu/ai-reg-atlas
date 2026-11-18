import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_CONTEXT_WINDOW,
  extractDatedLinks,
  extractDatedLinksMarkdown,
  SHARE_HOSTS,
  isEmptyBody,
  isShareLink,
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

describe('extractDatedLinks: 見出しだけが題名の空アンカー（EDPB 型）', () => {
  const EB = 'https://www.edpb.europa.eu/news/news_en';
  const edpb = (h, d, slug) =>
    `<div class="card"><h3 class="card__title">${h}</h3> <time datetime="x">${d}</time> <a class="card__link" href="/news/news/${slug}_en"></a></div>`;

  it('h3 → time → 空 a で見出しと日付が取れる', () => {
    const items = extractDatedLinks(edpb('Guidelines on X', '17 November 2026', 'a') + edpb('Opinion Y', '12 November 2026', 'b'), EB, 'eu');
    assert.equal(items.length, 2);
    assert.equal(items[0].title, 'Guidelines on X');
    assert.equal(items[0].url, 'https://www.edpb.europa.eu/news/news/a_en');
    assert.equal(items[0].listing_date, '2026-11-17');
    assert.equal(items[1].title, 'Opinion Y');
    assert.equal(items[1].listing_date, '2026-11-12');
  });

  it('見出しとアンカーの間に別の <a があれば隣のカードの見出しは取らない', () => {
    const html = '<h3>Other card</h3> <a href="/other">more</a> <time>17 November 2026</time> <a href="/news/x_en"></a>';
    const items = extractDatedLinks(html, EB, 'eu');
    assert.ok(!items.some((i) => i.url.endsWith('/news/x_en')));
  });

  it('title 属性があればそれを題名にする', () => {
    const items = extractDatedLinks('<time>17 November 2026</time><a href="/n/y" title="From attr"></a>', EB, 'eu');
    assert.equal(items[0].title, 'From attr');
  });

  it('文字のあるアンカーは従来どおり', () => {
    const items = extractDatedLinks('<h3>Heading</h3><a href="/n/z">Link text</a> 17 November 2026', EB, 'eu');
    assert.equal(items[0].title, 'Link text');
  });
});

describe('extractDatedLinksMarkdown: 画像入りリンク（HCDN 型）と欧州語の日付', () => {
  const HB = 'https://www.hcdn.gob.ar/prensa/';
  const md =
    '[![Image 1: x](https://www.hcdn.gob.ar/img/a.jpeg) 03 de noviembre de 2026 ### Sesión especial en Diputados Texto de la nota. Ver más](https://www.hcdn.gob.ar/prensa/noticia/X/)\n' +
    '[![Image 2: solo imagen](https://www.hcdn.gob.ar/img/b.jpeg)](https://www.hcdn.gob.ar/prensa/noticia/Y/)\n';

  it('外側のリンクの URL・見出し（画像と ### を除く）・日付が取れる', () => {
    const items = extractDatedLinksMarkdown(md, HB, 'ar');
    assert.equal(items.length, 1);
    assert.equal(items[0].url, 'https://www.hcdn.gob.ar/prensa/noticia/X/');
    assert.ok(items[0].title.includes('Sesión especial en Diputados'));
    assert.ok(!items[0].title.includes('###'));
    assert.ok(!items[0].title.includes('Image 1'));
    assert.equal(items[0].listing_date, '2026-11-03');
  });

  it('画像だけのリンクは拾わない', () => {
    const items = extractDatedLinksMarkdown(md, HB, 'ar');
    assert.ok(!items.some((i) => i.url.includes('/noticia/Y/')));
  });

  it('従来の [text](url) と日付は変わらない', () => {
    const items = extractDatedLinksMarkdown('[Press release](https://e.com/p/1) Jul 22, 2026', 'https://e.com/', 'xx');
    assert.equal(items.length, 1);
    assert.equal(items[0].listing_date, '2026-07-22');
  });
});

describe('見出しのカード境界（空アンカー）', () => {
  const EB = 'https://www.edpb.europa.eu/news/news_en';
  it('見出しの入ったコンテナを出たあとのアンカーは前のカードの見出しを使わない', () => {
    const html = '<div><h3>Previous</h3><time>17 November 2026</time></div><div><a href="/next"></a></div>';
    assert.equal(extractDatedLinks(html, EB, 'eu').length, 0);
  });
  it('EDPB の実構造（見出し → 日付 div → 空アンカー）は取れる', () => {
    const html = '<article><h3 class="t">Real title</h3> <div class="node-article-card__date"><time datetime="2026-11-17T00:00:00Z">17 November 2026</time></div> <a class="node-article-card__link" href="/news/news/real_en" rel="bookmark"></a></article>';
    const items = extractDatedLinks(html, EB, 'eu');
    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'Real title');
    assert.equal(items[0].listing_date, '2026-11-17');
  });
});

describe('共有・SNS リンクの除外と link_include', () => {
  const B = 'https://e.gov/news/';
  it('isShareLink: SNS ホスト・共有 URL・mailto・tel', () => {
    for (const h of SHARE_HOSTS) assert.equal(isShareLink(`https://${h}/x`, `https://${h}/x`), true, h);
    assert.equal(isShareLink('https://www.facebook.com/sharer/sharer.php?u=1', 'https://www.facebook.com/sharer/sharer.php?u=1'), true);
    assert.equal(isShareLink('https://twitter.com/intent/tweet?url=1', 'https://twitter.com/intent/tweet?url=1'), true);
    assert.equal(isShareLink('mailto:a@b.c', 'mailto:a@b.c'), true);
    assert.equal(isShareLink('tel:+8100', 'tel:+8100'), true);
    assert.equal(isShareLink('/news/a', 'https://e.gov/news/a'), false);
  });
  const html =
    '<a href="https://x.com/share?u=1">Share on X 17 November 2026</a>' +
    '<a href="mailto:a@b.c">Mail 17 November 2026</a>' +
    '<a href="/prensa/noticia/1/">Real 17 November 2026</a>' +
    '<a href="/prensa/otra/2/">Other 17 November 2026</a>';
  it('HTML: 共有リンクは落ちる', () => {
    const urls = extractDatedLinks(html, B, 'xx').map((i) => i.url);
    assert.deepEqual(urls, ['https://e.gov/prensa/noticia/1/', 'https://e.gov/prensa/otra/2/']);
  });
  it('HTML: link_include で絞る', () => {
    const urls = extractDatedLinks(html, B, 'xx', 400, { linkInclude: '/prensa/noticia/' }).map((i) => i.url);
    assert.deepEqual(urls, ['https://e.gov/prensa/noticia/1/']);
  });
  const md =
    '[Share 17 November 2026](https://www.linkedin.com/shareArticle?u=1)\n[Real 17 November 2026](https://e.gov/prensa/noticia/1/)\n[Other 17 November 2026](https://e.gov/prensa/otra/2/)\n';
  it('Markdown: 共有リンクは落ち、link_include で絞れる', () => {
    assert.equal(extractDatedLinksMarkdown(md, B, 'xx').length, 2);
    const urls = extractDatedLinksMarkdown(md, B, 'xx', 400, { linkInclude: '/prensa/noticia/' }).map((i) => i.url);
    assert.deepEqual(urls, ['https://e.gov/prensa/noticia/1/']);
  });
  it('不正な link_include は無視して1回だけ警告', () => {
    const orig = console.warn;
    let n = 0;
    console.warn = () => n++;
    try {
      assert.equal(extractDatedLinks(html, B, 'xx', 400, { linkInclude: '(' }).length, 2);
      assert.equal(extractDatedLinks(html, B, 'xx', 400, { linkInclude: '(' }).length, 2);
    } finally {
      console.warn = orig;
    }
    assert.equal(n, 1);
  });
});

describe('同じ URL の重複アンカー', () => {
  it('title 属性だけの空アンカーが先でも、日付の取れた見出しリンクを残す', () => {
    const pad = ' '.repeat(600);
    const html = `<a href="/n/a" title="Title A"></a>${pad}<h2><a href="/n/a">Title A</a></h2> <time>12 November 2026</time>`;
    const items = extractDatedLinks(html, 'https://e.gov/', 'xx');
    assert.equal(items.length, 1);
    assert.equal(items[0].listing_date, '2026-11-12');
  });
});

describe('Markdown 画像リンクの括弧', () => {
  it('画像 URL に括弧があっても画像部分が題名に残らない', () => {
    const md = '[![alt](https://e.com/a_(1).jpg) Headline text 17 November 2026](https://e.com/article)';
    const items = extractDatedLinksMarkdown(md, 'https://e.com/', 'xx');
    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'Headline text 17 November 2026');
    assert.equal(items[0].url, 'https://e.com/article');
  });
  it('画像だけ（括弧入り URL）のリンクは拾わない', () => {
    const md = '[![alt](https://e.com/a_(1).jpg)](https://e.com/article) 17 November 2026';
    assert.equal(extractDatedLinksMarkdown(md, 'https://e.com/', 'xx').length, 0);
  });
  it('リンク URL の括弧1段も取れる', () => {
    const items = extractDatedLinksMarkdown('[Doc 17 November 2026](https://e.com/wiki/A_(b))', 'https://e.com/', 'xx');
    assert.equal(items[0].url, 'https://e.com/wiki/A_(b)');
  });
  it('性能: 閉じない [ ![ ( の 200KB が 500ms 未満', () => {
    for (const unit of ['[', '![', '(', '[![a](', '[a(', '![a](b(', '[![']) {
      const big = unit.repeat(Math.ceil(200000 / unit.length)).slice(0, 200000);
      const t0 = performance.now();
      extractDatedLinksMarkdown(big, 'https://e.com/', 'xx');
      const ms = performance.now() - t0;
      assert.ok(ms < 500, `${JSON.stringify(unit)} took ${ms}ms`);
    }
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

describe('監査追加: カード境界・画像リンク', () => {
  it('見出し借りのアンカーは前のカードの日付を借りない', () => {
    const html = '<article><h3>Old</h3><time>17 November 2026</time></article><article><h3>Undated</h3><a href="/new"></a></article>';
    assert.equal(extractDatedLinks(html, 'https://e.gov/', 'EU').length, 0);
  });
  it('EDPB 型は自分のカードの日付を取る', () => {
    const html = '<h3>T</h3><div class="node-article-card__date"><time datetime="2026-11-17">17 November 2026</time></div><a class="node-article-card__link" href="/news/x_en"></a>';
    const r = extractDatedLinks(html, 'https://e.gov/', 'EU');
    assert.equal(r.length, 1);
    assert.equal(r[0].listing_date, '2026-11-17');
  });
  it('Markdown: 長い alt の画像は内側リンクとして拾わない', () => {
    const md = `[![${'a'.repeat(201)}](https://e.gov/img) Head 17 November 2026](https://e.gov/article)`;
    const r = extractDatedLinksMarkdown(md, 'https://e.gov/', 'EU');
    assert.ok(!r.some((x) => x.url === 'https://e.gov/img'));
  });
});
