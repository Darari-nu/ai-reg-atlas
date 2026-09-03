// 日次パイプライン Step1: ソース巡回 → 新着候補リスト生成（§5-2, §14-3）
// 生HTML・記事本文は保存しない。ログにはタイトル・URL・件数のみ（§8-2）。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import yaml from 'js-yaml';
import Parser from 'rss-parser';
import { dataPath, loadJSON, writeJSON, isGoogleNewsUrl, decodeResponseText, ISSUES_FILE } from './lib/pipeline.mjs';

const ROOT = process.cwd();
const CACHE_DIR = dataPath('.cache');
const LAST_SEEN_FILE = path.join(CACHE_DIR, 'last_seen.json');
const HASHES_FILE = dataPath('hashes.json');
const OUT_FILE = '/tmp/candidates.json';
const TIMEOUT_MS = 15_000;
const USER_AGENT = 'AIRegAtlasBot/1.0 (+https://darari-nu.github.io/ai-reg-atlas/about/)';
const FIRST_RUN_WINDOW_DAYS = Number(process.env.FIRST_RUN_WINDOW_DAYS || 3); // 既定3日。バックフィル時は環境変数で拡大

const parser = new Parser({ timeout: TIMEOUT_MS, headers: { 'User-Agent': USER_AGENT } });

function normalizeUrl(u) {
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

async function fetchWithTimeout(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': USER_AGENT } });
  } finally {
    clearTimeout(t);
  }
}

function newsRssUrl(query) {
  const q = encodeURIComponent(query);
  return `https://news.google.com/rss/search?q=${q}&hl=ja&gl=JP&ceid=JP:ja`;
}

function pushIssue(issue) {
  const issues = loadJSON(ISSUES_FILE, []);
  issues.push(issue);
  writeJSON(ISSUES_FILE, issues);
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textFromHtmlFragment(fragment) {
  return stripHtml(fragment).slice(0, 300);
}

function extractDatedLinks(html, baseUrl, countryHint) {
  const items = [];
  const seen = new Set();
  // 米国式(Jul 22, 2026)、日→月式(22 July 2026、豪州・シンガポール等)、dd/mm/yyyy式(ブラジル・欧州圏)を許容
  const datePattern = /(?:20\d{2}[-/.年]\s?\d{1,2}[-/.月]\s?\d{1,2}日?|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+20\d{2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*,?\s+20\d{2}|\d{1,2}\/\d{1,2}\/20\d{2})/i;
  // href前後の属性も個別に捕捉: タイトルが空のアンカー(aria-labelのみ)や、日付が兄弟要素にあるカード型レイアウトに対応するため
  const anchorRe = /<a\b([^>]*)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  const CONTEXT_WINDOW = 400; // アンカー自身に日付が無くても周辺の兄弟要素(日付div等)を見る
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
    });
  }
  return items.slice(0, 20);
}

async function collectRss(url, countryHint, lastSeen, sourceType, sourceGroup) {
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await decodeResponseText(res); // parseURL任せだとcharset未指定XML(Shift_JIS等)が文字化けするため自前デコード
  const feed = await parser.parseString(xml);
  const prev = lastSeen[url] ? new Date(lastSeen[url]) : null;
  const windowStart = new Date(Date.now() - FIRST_RUN_WINDOW_DAYS * 86_400_000);
  const threshold = prev ?? windowStart;
  const items = [];
  let newest = prev;

  for (const item of feed.items ?? []) {
    const pub = item.isoDate ? new Date(item.isoDate) : null;
    if (pub && (!newest || pub > newest)) newest = pub;
    if (!pub || pub <= threshold) continue;
    items.push({
      title: item.title ?? '',
      url: normalizeUrl(item.link ?? ''),
      snippet: (item.contentSnippet ?? '').slice(0, 300),
      country_hint: countryHint,
      source_type: sourceType,
      source_group: sourceGroup,
    });
  }
  if (newest) lastSeen[url] = newest.toISOString();
  return items;
}

async function collectScrapeHash(url, countryHint, hashes) {
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await decodeResponseText(res); // charset未指定のShift_JIS等を文字化けさせない
  // 正規化: script/style除去 → タグ除去 → 空白圧縮（生HTMLは保存しない §4-1）
  const text = stripHtml(html);
  const hash = crypto.createHash('sha256').update(text).digest('hex');
  const changed = hashes[url] !== undefined && hashes[url] !== hash;
  const isFirst = hashes[url] === undefined;
  hashes[url] = hash;
  if (!changed) return [];
  if (isFirst) return [];
  const extracted = extractDatedLinks(html, url, countryHint);
  if (extracted.length === 0) {
    pushIssue({
      title: `needs-review: scrape_hash構造抽出不可（${countryHint}）`,
      body: `全文を候補化せず保留。URL: ${url}`,
      labels: ['needs-review'],
    });
  }
  return extracted;
}

async function main() {
  const config = yaml.load(fs.readFileSync(path.join(ROOT, 'config/countries.yaml'), 'utf8'));
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const lastSeen = loadJSON(LAST_SEEN_FILE, {});
  const hashes = loadJSON(HASHES_FILE, {});

  const candidates = [];
  let okCount = 0;
  let failCount = 0;

  for (const country of config.countries) {
    for (const src of country.official_sources ?? []) {
      try {
        if (src.type === 'rss') {
          candidates.push(...(await collectRss(src.url, country.code, lastSeen, 'rss', 'official_sources')));
        } else if (src.type === 'scrape_hash') {
          candidates.push(...(await collectScrapeHash(src.url, country.code, hashes)));
        }
        okCount++;
      } catch (e) {
        failCount++;
        console.warn(`[collect] skip ${src.type} ${src.url} (${e.message})`); // 継続（§5-2）
      }
    }
    for (const src of country.watch_feeds ?? []) {
      try {
        if (src.type === 'rss') {
          candidates.push(...(await collectRss(src.url, country.code, lastSeen, 'rss', 'watch_feeds')));
        }
        okCount++;
      } catch (e) {
        failCount++;
        console.warn(`[collect] skip watch_feed ${src.url} (${e.message})`);
      }
    }
    for (const q of country.news_queries ?? []) {
      const url = newsRssUrl(q);
      try {
        candidates.push(...(await collectRss(url, country.code, lastSeen, 'rss', 'news_queries')));
        okCount++;
      } catch (e) {
        failCount++;
        console.warn(`[collect] skip news "${q}" (${e.message})`);
      }
    }
  }

  // URL正規化済みの重複排除＋Google News除外（出典になれないので早期に落としtriage/Gemini枠を本物に回す）
  const seen = new Set();
  let googleDropped = 0;
  const deduped = candidates.filter((c) => {
    if (!c.url || seen.has(c.url)) return false;
    seen.add(c.url);
    if (isGoogleNewsUrl(c.url)) { googleDropped++; return false; }
    return true;
  });

  writeJSON(LAST_SEEN_FILE, lastSeen);
  writeJSON(HASHES_FILE, hashes);
  writeJSON(OUT_FILE, deduped);

  console.log(`[collect] sources ok=${okCount} failed=${failCount} candidates=${deduped.length} google_dropped=${googleDropped}`);
  if (failCount > 0 && okCount === 0) process.exitCode = 1; // 全滅のみ失敗扱い
}

main().catch((e) => {
  console.error(`[collect] fatal: ${e.message}`);
  process.exit(1);
});
