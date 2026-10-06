// scrape_hash の一覧ページからの日付付きリンク抽出（collect.mjs から分離。単体テストのため）
import { listingDate } from './pipeline.mjs';

// アンカー自身に日付が無くても周辺の兄弟要素(日付div等)を見る幅（文字数）。情報源ごとに context_window で上書きできる
export const DEFAULT_CONTEXT_WINDOW = 400;

export function normalizeUrl(u) {
  try {
    const url = new URL(u);
    url.hash = '';
    url.searchParams.delete('utm_source');
    url.searchParams.delete('utm_medium');
    url.searchParams.delete('utm_campaign');
    return url.toString();
  } catch {
    return u;
  }
}

export function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 直接取得は成功したが、script/style を除くと本文が何も残らない（JS描画のみ等）か
export function isEmptyBody(html) {
  return stripHtml(html) === '';
}

function textFromHtmlFragment(fragment) {
  return stripHtml(fragment).slice(0, 300);
}

export function extractDatedLinks(html, baseUrl, countryHint, contextWindow = DEFAULT_CONTEXT_WINDOW) {
  const items = [];
  const seen = new Set();
  // 米国式(Jul 22, 2026)、日→月式(22 July 2026、豪州・シンガポール等)、dd/mm/yyyy式(ブラジル・欧州圏)を許容
  const datePattern = /(?:20\d{2}[-/.年]\s?\d{1,2}[-/.月]\s?\d{1,2}日?|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+20\d{2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*,?\s+20\d{2}|\d{1,2}\/\d{1,2}\/20\d{2})/i;
  // href前後の属性も個別に捕捉: タイトルが空のアンカー(aria-labelのみ)や、日付が兄弟要素にあるカード型レイアウトに対応するため
  const anchorRe = /<a\b([^>]*)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  const CONTEXT_WINDOW = contextWindow;
  for (const match of html.matchAll(anchorRe)) {
    const attrs = `${match[1]} ${match[3]}`;
    const href = match[2];
    let title = textFromHtmlFragment(match[4]);
    if (!title) {
      const ariaMatch = attrs.match(/aria-label=["']([^"']+)["']/i);
      if (ariaMatch) title = textFromHtmlFragment(ariaMatch[1]);
    }
    if (!title) continue;
    const start = Math.max(0, match.index - CONTEXT_WINDOW);
    const end = Math.min(html.length, match.index + match[0].length + CONTEXT_WINDOW);
    const context = `${title} ${href} ${html.slice(start, end)}`;
    if (!datePattern.test(context)) continue;
    let absolute;
    try {
      absolute = normalizeUrl(new URL(href, baseUrl).toString());
    } catch {
      continue;
    }
    if (seen.has(absolute)) continue;
    seen.add(absolute);
    items.push({
      title,
      url: absolute,
      snippet: title,
      country_hint: countryHint,
      source_type: 'scrape_hash',
      source_group: 'official_sources',
      listing_date: listingDate({ href: absolute, title, text: html, start: match.index, end: match.index + match[0].length, window: CONTEXT_WINDOW }),
    });
  }
  return items;
}

// r.jina.ai Reader経由のフォールバック時はMarkdown（[text](url)形式）で返るため、HTML用extractDatedLinksとは別にリンク抽出する
export function extractDatedLinksMarkdown(text, baseUrl, countryHint, contextWindow = DEFAULT_CONTEXT_WINDOW) {
  const items = [];
  const seen = new Set();
  const datePattern = /(?:20\d{2}[-/.年]\s?\d{1,2}[-/.月]\s?\d{1,2}日?|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+20\d{2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*,?\s+20\d{2}|\d{1,2}\/\d{1,2}\/20\d{2})/i;
  const linkRe = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const CONTEXT_WINDOW = contextWindow;
  for (const match of text.matchAll(linkRe)) {
    const title = textFromHtmlFragment(match[1]);
    const href = match[2];
    if (!title || !href) continue;
    if (/^(?:javascript:|#)/i.test(href) || /\.(?:png|jpe?g|gif|svg|webp|ico)(?:[?#]|$)/i.test(href)) continue; // 疑似リンク・画像は除外
    const start = Math.max(0, match.index - CONTEXT_WINDOW);
    const end = Math.min(text.length, match.index + match[0].length + CONTEXT_WINDOW);
    const context = `${title} ${href} ${text.slice(start, end)}`;
    if (!datePattern.test(context)) continue;
    let absolute;
    try {
      absolute = normalizeUrl(new URL(href, baseUrl).toString());
    } catch {
      continue;
    }
    if (seen.has(absolute)) continue;
    seen.add(absolute);
    items.push({
      title,
      url: absolute,
      snippet: title,
      country_hint: countryHint,
      source_type: 'scrape_hash',
      source_group: 'official_sources',
      listing_date: listingDate({ href: absolute, title, text, start: match.index, end: match.index + match[0].length, window: CONTEXT_WINDOW }),
    });
  }
  return items;
}

