// 日次パイプライン Step1: ソース巡回 → 新着候補リスト生成（§5-2, §14-3）
// 生HTML・記事本文は保存しない。ログにはタイトル・URL・件数のみ（§8-2）。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import yaml from 'js-yaml';
import Parser from 'rss-parser';
import { dataPath, loadJSON, writeJSON } from './lib/pipeline.mjs';

const ROOT = process.cwd();
const CACHE_DIR = dataPath('.cache');
const LAST_SEEN_FILE = path.join(CACHE_DIR, 'last_seen.json');
const HASHES_FILE = dataPath('hashes.json');
const OUT_FILE = '/tmp/candidates.json';
const ISSUES_FILE = '/tmp/pipeline_issues.json';
const TIMEOUT_MS = 15_000;
const USER_AGENT = 'AIRegAtlasBot/1.0 (+https://darari-nu.github.io/ai-reg-atlas/about/)';
const FIRST_RUN_WINDOW_DAYS = 3; // キャッシュなし初回はフィード全件でなく直近3日のみ

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
  const datePattern = /(?:20\d{2}[-/.年]\s?\d{1,2}[-/.月]\s?\d{1,2}日?|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+20\d{2})/i;
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorRe)) {
    const href = match[1];
    const title = textFromHtmlFragment(match[2]);
    const context = `${title} ${href}`;
    if (!title || !datePattern.test(context)) continue;
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
  const feed = await parser.parseURL(url);
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
  const html = await res.text();
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

  // URL正規化済みの重複排除
  const seen = new Set();
  const deduped = candidates.filter((c) => {
    if (!c.url || seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });

  writeJSON(LAST_SEEN_FILE, lastSeen);
  writeJSON(HASHES_FILE, hashes);
  writeJSON(OUT_FILE, deduped);

  console.log(`[collect] sources ok=${okCount} failed=${failCount} candidates=${deduped.length}`);
  if (failCount > 0 && okCount === 0) process.exitCode = 1; // 全滅のみ失敗扱い
}

main().catch((e) => {
  console.error(`[collect] fatal: ${e.message}`);
  process.exit(1);
});
