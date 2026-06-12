// 日次パイプライン Step1: ソース巡回 → 新着候補リスト生成（§5-2, §14-3）
// 生HTML・記事本文は保存しない。ログにはタイトル・URL・件数のみ（§8-2）。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import yaml from 'js-yaml';
import Parser from 'rss-parser';

const ROOT = process.cwd();
const CACHE_DIR = path.join(ROOT, 'data/.cache');
const LAST_SEEN_FILE = path.join(CACHE_DIR, 'last_seen.json');
const HASHES_FILE = path.join(ROOT, 'data/hashes.json');
const OUT_FILE = '/tmp/candidates.json';
const TIMEOUT_MS = 15_000;
const USER_AGENT = 'AIRegAtlasBot/1.0 (+https://darari-nu.github.io/ai-reg-atlas/about/)';
const FIRST_RUN_WINDOW_DAYS = 3; // キャッシュなし初回はフィード全件でなく直近3日のみ

const parser = new Parser({ timeout: TIMEOUT_MS, headers: { 'User-Agent': USER_AGENT } });

function loadJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

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

async function collectRss(url, countryHint, lastSeen, sourceType) {
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
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const hash = crypto.createHash('sha256').update(text).digest('hex');
  const changed = hashes[url] !== undefined && hashes[url] !== hash;
  const isFirst = hashes[url] === undefined;
  hashes[url] = hash;
  if (!changed) return [];
  // 変化検知時: ページ自体を候補化（新着リンク抽出はtriage側のGemini判断に委ねる）
  if (isFirst) return [];
  return [
    {
      title: `ページ更新検知: ${url}`,
      url: normalizeUrl(url),
      snippet: text.slice(0, 300),
      country_hint: countryHint,
      source_type: 'scrape_hash',
    },
  ];
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
          candidates.push(...(await collectRss(src.url, country.code, lastSeen, 'rss')));
        } else if (src.type === 'scrape_hash') {
          candidates.push(...(await collectScrapeHash(src.url, country.code, hashes)));
        }
        okCount++;
      } catch (e) {
        failCount++;
        console.warn(`[collect] skip ${src.type} ${src.url} (${e.message})`); // 継続（§5-2）
      }
    }
    for (const q of country.news_queries ?? []) {
      const url = newsRssUrl(q);
      try {
        candidates.push(...(await collectRss(url, country.code, lastSeen, 'news')));
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

  fs.writeFileSync(LAST_SEEN_FILE, JSON.stringify(lastSeen, null, 2));
  fs.writeFileSync(HASHES_FILE, JSON.stringify(hashes, null, 2) + '\n');
  fs.writeFileSync(OUT_FILE, JSON.stringify(deduped, null, 2));

  console.log(`[collect] sources ok=${okCount} failed=${failCount} candidates=${deduped.length}`);
  if (failCount > 0 && okCount === 0) process.exitCode = 1; // 全滅のみ失敗扱い
}

main().catch((e) => {
  console.error(`[collect] fatal: ${e.message}`);
  process.exit(1);
});
