// scrape_hash の一覧ページからの日付付きリンク抽出（collect.mjs から分離。単体テストのため）
import { hasLooseDate, listingDate } from './pipeline.mjs';

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

// 文字も aria-label も title も無い空アンカー（EDPB 型: <h3>見出し</h3> <time>日付</time> <a href=...></a>）用に、
// アンカー直前(contextWindow 字以内)の最後の見出しを題名にする。見出しとアンカーの間に別の <a があれば隣のカードなので使わない
function precedingHeadingText(html, anchorIndex, contextWindow) {
  return precedingHeading(html, anchorIndex, contextWindow).text;
}

// 見出しの文字と、html 内での見出し開始位置（カードの先頭）を返す
function precedingHeading(html, anchorIndex, contextWindow) {
  const offset = Math.max(0, anchorIndex - contextWindow);
  const before = html.slice(offset, anchorIndex);
  let last = null;
  for (const m of before.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi)) last = m;
  if (!last) return { text: '', start: -1 };
  const between = before.slice(last.index + last[0].length);
  if (/<a\b/i.test(between)) return { text: '', start: -1 };
  // 見出しの入っているコンテナを出てしまっていたら（閉じタグが開きタグより多い）別カードの見出しなので使わない
  let depth = 0;
  for (const t of between.matchAll(/<(\/?)(div|li|article|section|ul|ol|td|tr|p)\b[^>]*?(\/?)>/gi)) {
    if (t[3]) continue; // 自己閉じ
    depth += t[1] ? -1 : 1;
    if (depth < 0) return { text: '', start: -1 };
  }
  return { text: textFromHtmlFragment(last[2]), start: offset + last.index };
}

// SNS・共有サービスのホスト（記事ではなく共有ボタンのリンク）。サブドメイン（www. 等）も含めて除外
export const SHARE_HOSTS = ['x.com', 'twitter.com', 'facebook.com', 'linkedin.com', 'instagram.com', 't.me', 'wa.me', 'api.whatsapp.com', 'line.me'];
const SHARE_PATH_RE = /\/intent\/(?:tweet|post)|sharer(?:\.php)?(?:[/?#]|$)|\/shareArticle|[?&]share=/i;

/** 共有・SNS・mailto/tel リンクか（abs は絶対URL。href は元の文字列） */
export function isShareLink(href, abs) {
  if (/^(?:mailto:|tel:)/i.test(href.trim())) return true;
  let u;
  try {
    u = new URL(abs);
  } catch {
    return false;
  }
  if (u.protocol === 'mailto:' || u.protocol === 'tel:') return true;
  const host = u.hostname.toLowerCase();
  if (SHARE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return true;
  return SHARE_PATH_RE.test(u.pathname + u.search);
}

// 情報源ごとの link_include（正規表現文字列）。不正なら無視して1回だけ警告
const warnedBadLinkInclude = new Set();
function compileLinkInclude(opts) {
  const src = opts?.linkInclude;
  if (!src) return null;
  try {
    return new RegExp(src);
  } catch {
    if (!warnedBadLinkInclude.has(src)) {
      warnedBadLinkInclude.add(src);
      console.warn(`[scrape] link_include が不正な正規表現のため無視します: ${src}`);
    }
    return null;
  }
}

export function extractDatedLinks(html, baseUrl, countryHint, contextWindow = DEFAULT_CONTEXT_WINDOW, opts = {}) {
  const items = [];
  const seen = new Map(); // url -> items の添字
  const include = compileLinkInclude(opts);
  // 米国式(Jul 22, 2026)、日→月式(22 July 2026、豪州・シンガポール等)、dd/mm/yyyy式(ブラジル・欧州圏)を許容
  const datePattern = /(?:20\d{2}[-/.年]\s?\d{1,2}[-/.月]\s?\d{1,2}日?|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+20\d{2}(?!\d)|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*,?\s+20\d{2}(?!\d)|\d{1,2}\/\d{1,2}\/20\d{2}(?!\d))/i;
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
    if (!title) {
      const titleAttr = attrs.match(/\btitle=["']([^"']+)["']/i);
      if (titleAttr) title = textFromHtmlFragment(titleAttr[1]);
    }
    // 見出しから題名を借りたアンカーは、日付も自分のカード（見出しの先頭〜アンカーの末尾）の中からだけ探す
    let cardStart = -1;
    if (!title) {
      const h = precedingHeading(html, match.index, CONTEXT_WINDOW);
      title = h.text;
      cardStart = h.start;
    }
    if (!title) continue;
    const anchorEnd = match.index + match[0].length;
    const cardMode = cardStart >= 0;
    const start = cardMode ? cardStart : Math.max(0, match.index - CONTEXT_WINDOW);
    const end = cardMode ? anchorEnd : Math.min(html.length, anchorEnd + CONTEXT_WINDOW);
    const context = `${title} ${href} ${html.slice(start, end)}`;
    if (!datePattern.test(context) && !hasLooseDate(context)) continue;
    let absolute;
    try {
      absolute = normalizeUrl(new URL(href, baseUrl).toString());
    } catch {
      continue;
    }
    if (isShareLink(href, absolute)) continue;
    if (include && !include.test(absolute)) continue;
    const dup = seen.get(absolute);
    // 同じ URL のアンカーが複数あるとき（画像の空リンク＋見出しリンク等）は、日付が取れたほうを残す
    const entry = {
      title,
      url: absolute,
      snippet: title,
      country_hint: countryHint,
      source_type: 'scrape_hash',
      source_group: 'official_sources',
      listing_date: cardMode
        ? listingDate({ href: absolute, title, text: html.slice(cardStart, anchorEnd), start: match.index - cardStart, end: anchorEnd - cardStart, window: CONTEXT_WINDOW })
        : listingDate({ href: absolute, title, text: html, start: match.index, end: anchorEnd, window: CONTEXT_WINDOW }),
    };
    if (dup === undefined) {
      seen.set(absolute, items.length);
      items.push(entry);
    } else if (!items[dup].listing_date && entry.listing_date) {
      items[dup] = entry;
    }
  }
  return items;
}

// r.jina.ai Reader経由のフォールバック時はMarkdown（[text](url)形式）で返るため、HTML用extractDatedLinksとは別にリンク抽出する
export function extractDatedLinksMarkdown(text, baseUrl, countryHint, contextWindow = DEFAULT_CONTEXT_WINDOW, opts = {}) {
  const items = [];
  const seen = new Map(); // url -> items の添字
  const include = compileLinkInclude(opts);
  const datePattern = /(?:20\d{2}[-/.年]\s?\d{1,2}[-/.月]\s?\d{1,2}日?|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+20\d{2}(?!\d)|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*,?\s+20\d{2}(?!\d)|\d{1,2}\/\d{1,2}\/20\d{2}(?!\d))/i;
  // リンク文字に画像 ![alt](src) が1段入れ子になっていても外側のリンクを取る（HCDN 型）
  // URL 内の括弧は1段だけ許す（例: a_(1).jpg）
  // 画像の alt は200字・URL は500字まで（閉じていない ![ が大量にあっても二乗にならないよう上限を付ける）
  const IMG = String.raw`!\[[^\]]{0,200}\]\((?:[^()]|\([^()]{0,100}\)){0,500}\)`;
  const linkRe = new RegExp(String.raw`\[((?:${IMG}|[^\[\]]){1,2000})\]\(((?:[^()\s]|\([^()\s]{0,200}\)){1,1000})(?:\s+"[^"]{0,300}")?\)`, 'g');
  const imgRe = new RegExp(IMG, 'g');
  const CONTEXT_WINDOW = contextWindow;
  for (const match of text.matchAll(linkRe)) {
    if (match.index > 0 && text[match.index - 1] === '!') continue; // ![alt](img) は画像でありリンクではない
    // 画像部分と見出し記号（###）を除いた文字を題名にする。画像だけのリンクは題名が空になって落ちる
    const title = textFromHtmlFragment(match[1].replace(imgRe, ' ').replace(/(?:^|\s)#{1,6}(?=\s)/g, ' '));
    const href = match[2];
    if (!title || !href) continue;
    if (/^(?:javascript:|#)/i.test(href) || /\.(?:png|jpe?g|gif|svg|webp|ico)(?:[?#]|$)/i.test(href)) continue; // 疑似リンク・画像は除外
    const start = Math.max(0, match.index - CONTEXT_WINDOW);
    const end = Math.min(text.length, match.index + match[0].length + CONTEXT_WINDOW);
    const context = `${title} ${href} ${text.slice(start, end)}`;
    if (!datePattern.test(context) && !hasLooseDate(context)) continue;
    let absolute;
    try {
      absolute = normalizeUrl(new URL(href, baseUrl).toString());
    } catch {
      continue;
    }
    if (isShareLink(href, absolute)) continue;
    if (include && !include.test(absolute)) continue;
    const dup = seen.get(absolute);
    // 同じ URL のアンカーが複数あるとき（画像の空リンク＋見出しリンク等）は、日付が取れたほうを残す
    const entry = {
      title,
      url: absolute,
      snippet: title,
      country_hint: countryHint,
      source_type: 'scrape_hash',
      source_group: 'official_sources',
      listing_date: listingDate({ href: absolute, title, text, start: match.index, end: match.index + match[0].length, window: CONTEXT_WINDOW }),
    };
    if (dup === undefined) {
      seen.set(absolute, items.length);
      items.push(entry);
    } else if (!items[dup].listing_date && entry.listing_date) {
      items[dup] = entry;
    }
  }
  return items;
}

