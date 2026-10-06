// 日次パイプライン Step1: ソース巡回 → 新着候補リスト生成（§5-2, §14-3）
// 生HTML・記事本文は保存しない。ログにはタイトル・URL・件数のみ（§8-2）。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import yaml from 'js-yaml';
import Parser from 'rss-parser';
import {
  JINA_READER_PREFIX,
  classifySourceKind,
  dataPath,
  isGoogleNewsUrl,
  isStaleListing,
  isTrustedMediaUrl,
  listingDate,
  loadJSON,
  loadSourceDomains,
  readerBody,
  resolveFeedLink,
  unwrapBingNewsUrl,
  writeJSON,
} from './lib/pipeline.mjs';
import { DEFAULT_CONTEXT_WINDOW, extractDatedLinks, extractDatedLinksMarkdown, isEmptyBody, normalizeUrl, stripHtml } from './lib/scrape.mjs';
import { LAST_SEEN_MAX_LOOKBACK_DAYS, clampLookback, readState, writeState } from './lib/state.mjs';
import { SOURCE_DOWN_DAYS, pruneHealth, recordOutcome } from './lib/sourceHealth.mjs';

const ROOT = process.cwd();
// last_seen は data/state/（data/.cache/ は .gitignore 済みでCIでは毎回空になるため持ち越せない）
const LAST_SEEN_NAME = 'last_seen.json';
const HASHES_FILE = dataPath('hashes.json');
const OUT_FILE = '/tmp/candidates.json';
const ISSUES_FILE = '/tmp/pipeline_issues.json';
const NOTIFY_FILE = '/tmp/pipeline_notifications.json'; // notify-discord.mjs が読む
const HEALTH_NAME = 'source_health.json';
const TIMEOUT_MS = 15_000;
const USER_AGENT = 'AIRegAtlasBot/1.0 (+https://darari-nu.com/atlas/about/)';
const FIRST_RUN_WINDOW_DAYS = Number(process.env.FIRST_RUN_WINDOW_DAYS || 3); // 既定3日。バックフィル時は環境変数で拡大
// scrape_hash は一覧ページの変化で全リンクを拾うため、数年前の記事まで候補になる。日付の分かる古いリンクはここで落とす
const SCRAPE_HASH_MAX_AGE_DAYS = Number(process.env.SCRAPE_HASH_MAX_AGE_DAYS || 30);
const MAX_LINKS_PER_PAGE = 20;
const TODAY = process.env.SWEEP_DATE || new Date().toISOString().slice(0, 10); // SWEEP_DATE は検証用（triage/summarize と同じ）

const parser = new Parser({ timeout: TIMEOUT_MS, headers: { 'User-Agent': USER_AGENT } });

async function fetchWithTimeout(url, extraHeaders = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': USER_AGENT, ...extraHeaders } });
  } finally {
    clearTimeout(t);
  }
}

// 日本の官公庁サイトはShift_JIS配信が残っているため、HTTPヘッダ→<meta charset>の順で検出しデコードする（§8-2: 生HTMLは保存せず即テキスト化）
function detectCharset(contentTypeHeader, headBytes) {
  const headerMatch = /charset=([\w-]+)/i.exec(contentTypeHeader || '');
  if (headerMatch) return headerMatch[1].toLowerCase();
  const headSample = Buffer.from(headBytes).toString('latin1');
  const metaMatch = /<meta[^>]+charset=["']?([\w-]+)/i.exec(headSample);
  if (metaMatch) return metaMatch[1].toLowerCase();
  return 'utf-8';
}

async function decodeHtmlResponse(res) {
  const buf = Buffer.from(await res.arrayBuffer());
  const charset = detectCharset(res.headers.get('content-type'), buf.subarray(0, 2000));
  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf); // 未知のcharset値はUTF-8にフォールバック
  }
}

// Google ニュースは実URLが取れず全件捨てていた。Bing ニュース検索RSSは url パラメータに元記事URLがある
function newsRssUrl(query) {
  const q = encodeURIComponent(query);
  return `https://www.bing.com/news/search?q=${q}&format=rss`;
}

function pushIssue(issue) {
  const issues = loadJSON(ISSUES_FILE, []);
  issues.push(issue);
  writeJSON(ISSUES_FILE, issues);
}

function pushNotification(n) {
  const list = loadJSON(NOTIFY_FILE, []);
  list.push(n);
  writeJSON(NOTIFY_FILE, list);
}

// ログ・通知用の短い表記（host+path を40字まで）
function shortUrl(u) {
  try {
    const url = new URL(u);
    const s = `${url.hostname.replace(/^www\./, '')}${url.pathname === '/' ? '' : url.pathname}`;
    return s.length > 40 ? `${s.slice(0, 40)}…` : s;
  } catch {
    return String(u).slice(0, 40);
  }
}

// 直接fetchが失敗した場合、または成功しても本文が空（JS描画のみ・script だけ等）の場合に r.jina.ai Reader 経由で再試行する（GitHub Actionsランナー特有のIPブロック対策）
// 戻り値の format: 'html'（HTML形式。extractDatedLinks で抽出）/ 'markdown'（jinaの既定形式。extractDatedLinksMarkdown で抽出）
async function fetchScrapeHashContent(url) {
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await decodeHtmlResponse(res);
    if (!isEmptyBody(text)) return { text, viaProxy: false, format: 'html' };
    // 取得は成功したが本文が空 → 中継を HTML 形式で取り直す（markdown 形式は空アンカー［aria-labelだけのカード］が落ちる）
    try {
      const proxied = await fetchWithTimeout(JINA_READER_PREFIX + url, { 'X-Return-Format': 'html' });
      if (!proxied.ok) throw new Error(`HTTP ${proxied.status}`);
      const body = readerBody(await decodeHtmlResponse(proxied));
      if (isEmptyBody(body)) throw new Error('empty body via proxy');
      return { text: body, viaProxy: true, format: 'html', reason: 'empty body, html' };
    } catch {
      return { text, viaProxy: false, format: 'html' }; // 中継も駄目なら従来どおり空本文のまま（稼働監視が no-dated-links で拾う）
    }
  } catch (directErr) {
    try {
      const proxied = await fetchWithTimeout(JINA_READER_PREFIX + url);
      if (!proxied.ok) throw new Error(`HTTP ${proxied.status}`);
      // jinaの前置きヘッダ(Title:/URL Source:/直後のページ取得日時)を除去。取得日時が全リンクの文脈窓に誤って入り込むのを防ぐ
      return { text: readerBody(await decodeHtmlResponse(proxied)), viaProxy: true, format: 'markdown', reason: 'direct fetch failed' };
    } catch {
      throw directErr; // 直接fetchのエラーの方が原因診断に有用なのでそちらを報告
    }
  }
}

async function collectRss(url, countryHint, lastSeen, sourceType, sourceGroup) {
  const feed = await parser.parseURL(url);
  const now = new Date();
  // 遡り上限つき: 状態が古くても now − LAST_SEEN_MAX_LOOKBACK_DAYS 日より前は再収集しない
  const prev = clampLookback(lastSeen[url], now);
  const windowStart = new Date(now.getTime() - FIRST_RUN_WINDOW_DAYS * 86_400_000);
  const threshold = prev ?? windowStart; // 未見フィードは初回窓
  const items = [];
  let newest = prev;

  for (const item of feed.items ?? []) {
    const pub = item.isoDate ? new Date(item.isoDate) : null;
    if (pub && (!newest || pub > newest)) newest = pub;
    if (!pub || pub <= threshold) continue;
    // 相対リンク（priv.gc.ca 等）はフィードURLを基準に絶対化。channel の link は http のことがあるので使わない
    const link = resolveFeedLink(item.link, url);
    if (!link) {
      console.warn(`[collect] skip item with unresolvable link: ${(item.title ?? '').slice(0, 60)}`);
      continue;
    }
    // Bing ニュースの転送URL（bing.com/news/apiclick.aspx?...&url=<元記事>）を元記事URLに展開する。Bing以外は素通り
    const unwrapped = unwrapBingNewsUrl(link);
    items.push({
      title: item.title ?? '',
      url: normalizeUrl(unwrapped),
      snippet: (item.contentSnippet ?? '').slice(0, 300),
      country_hint: countryHint,
      source_type: sourceType,
      source_group: sourceGroup,
    });
  }
  if (newest) lastSeen[url] = newest.toISOString();
  return items;
}

async function collectScrapeHash(url, countryHint, hashes, opts = {}) {
  const contextWindow = opts.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
  const { text: html, viaProxy, format, reason } = await fetchScrapeHashContent(url);
  if (viaProxy) console.warn(`[collect] scrape_hash via jina proxy (${reason}): ${url}`);
  // 正規化: script/style除去 → タグ除去 → 空白圧縮（生HTMLは保存しない §4-1）
  const text = stripHtml(html);
  const hash = crypto.createHash('sha256').update(text).digest('hex');
  const changed = hashes[url] !== undefined && hashes[url] !== hash;
  const isFirst = hashes[url] === undefined;
  hashes[url] = hash;
  // 稼働監視のため、ハッシュの変化に関係なく毎回抽出して件数を数える（候補にするのは変化した時だけ）
  const extracted = format === 'markdown'
    ? extractDatedLinksMarkdown(html, url, countryHint, contextWindow)
    : extractDatedLinks(html, url, countryHint, contextWindow);
  const extractedCount = extracted.length;
  if (!changed || isFirst) return { items: [], extractedCount };
  const fresh = extracted.filter((c) => !isStaleListing(c.listing_date, TODAY, SCRAPE_HASH_MAX_AGE_DAYS));
  if (fresh.length < extracted.length) {
    console.log(`[collect] scrape_hash ${url}: dropped ${extracted.length - fresh.length}/${extracted.length} links older than ${SCRAPE_HASH_MAX_AGE_DAYS}d`);
  }
  return { items: fresh.slice(0, MAX_LINKS_PER_PAGE), extractedCount }; // 古いリンクを落としてから上限をかける（古いものに枠を取られないように）
}

async function main() {
  const config = yaml.load(fs.readFileSync(path.join(ROOT, 'config/countries.yaml'), 'utf8'));
  const lastSeen = readState(LAST_SEEN_NAME, {});
  const hashes = loadJSON(HASHES_FILE, {});
  const sourceDomains = loadSourceDomains(ROOT);

  const candidates = [];
  let okCount = 0;
  let failCount = 0;

  // 情報源ごとの稼働監視。失敗が SOURCE_DOWN_DAYS 日続いたら down、復旧したら recovered のイベントが出る
  let health = readState(HEALTH_NAME, {});
  const activeKeys = new Set();
  const healthEvents = [];
  const track = (country, key, label, { ok, reason }) => {
    activeKeys.add(key);
    const r = recordOutcome(health, key, { ok, reason, label, country: country.code, date: TODAY });
    health = r.health;
    if (r.event) healthEvents.push({ ...r.event, flag: country.flag ?? '' });
  };

  for (const country of config.countries) {
    for (const src of country.official_sources ?? []) {
      const label = `${country.name_ja} ${src.type} ${shortUrl(src.url)}`;
      try {
        let outcome = { ok: true };
        if (src.type === 'rss') {
          candidates.push(...(await collectRss(src.url, country.code, lastSeen, 'rss', 'official_sources')));
        } else if (src.type === 'scrape_hash') {
          const { items, extractedCount } = await collectScrapeHash(src.url, country.code, hashes, { contextWindow: src.context_window });
          candidates.push(...items);
          // ページは取れたのに日付付きリンクが1件も取れない＝構造が変わった（または空ページ）
          if (extractedCount === 0) outcome = { ok: false, reason: 'no-dated-links' };
        }
        if (outcome.ok) okCount++;
        else {
          failCount++;
          console.warn(`[collect] scrape_hash ${src.url}: 日付付きリンクの抽出が0件`);
        }
        track(country, src.url, label, outcome);
      } catch (e) {
        failCount++;
        console.warn(`[collect] skip ${src.type} ${src.url} (${e.message})`); // 継続（§5-2）
        track(country, src.url, label, { ok: false, reason: e.message });
      }
    }
    for (const src of country.watch_feeds ?? []) {
      const label = `${country.name_ja} watch_feed ${shortUrl(src.url)}`;
      try {
        if (src.type === 'rss') {
          candidates.push(...(await collectRss(src.url, country.code, lastSeen, 'rss', 'watch_feeds')));
        }
        okCount++;
        track(country, src.url, label, { ok: true });
      } catch (e) {
        failCount++;
        console.warn(`[collect] skip watch_feed ${src.url} (${e.message})`);
        track(country, src.url, label, { ok: false, reason: e.message });
      }
    }
    for (const q of country.news_queries ?? []) {
      const url = newsRssUrl(q);
      const label = `${country.name_ja} ニュース検索「${q}」`;
      try {
        candidates.push(...(await collectRss(url, country.code, lastSeen, 'rss', 'news_queries')));
        okCount++;
        track(country, url, label, { ok: true });
      } catch (e) {
        failCount++;
        console.warn(`[collect] skip news "${q}" (${e.message})`);
        track(country, url, label, { ok: false, reason: e.message });
      }
    }
  }

  // 稼働監視の結果を保存し、イベントを通知ファイル（と down は needs-review Issue）に出す
  health = pruneHealth(health, activeKeys);
  writeState(HEALTH_NAME, health);
  let downCount = 0;
  let recoveredCount = 0;
  for (const ev of healthEvents) {
    pushNotification(ev);
    if (ev.type === 'down') {
      downCount++;
      pushIssue({
        title: `needs-review: 情報源が${SOURCE_DOWN_DAYS}日続けて読み取れない（${ev.label}）`,
        body: `情報源: ${ev.label}\nURL: ${ev.key}\n理由: ${ev.reason ?? '不明'}\n失敗の開始: ${ev.since}（${ev.days}日連続）`,
        labels: ['needs-review'],
      });
    } else {
      recoveredCount++;
    }
  }
  const failingCount = Object.values(health).filter((h) => h.fail_days > 0).length;
  console.log(`[collect] health down=${downCount} recovered=${recoveredCount} failing=${failingCount}`);

  // URL正規化済みの重複排除＋Google News除外（出典になれないので早期に落としtriage/Gemini枠を本物に回す）
  const seen = new Set();
  let googleDropped = 0;
  const deduped = candidates.filter((c) => {
    if (!c.url || seen.has(c.url)) return false;
    seen.add(c.url);
    if (isGoogleNewsUrl(c.url)) { googleDropped++; return false; }
    return true;
  });

  // news_queries の候補だけ、許可リスト（trusted_media）か公式ドメインのものだけ残す（それ以外は報道でも公式でもなく出典に使えない）
  let newsKept = 0;
  const droppedHostCounts = new Map();
  const final = deduped.filter((c) => {
    if (c.source_group !== 'news_queries') return true;
    const trusted = isTrustedMediaUrl(c.url, sourceDomains.trustedMedia) || classifySourceKind(c.url, sourceDomains) === 'official';
    if (trusted) {
      newsKept++;
      return true;
    }
    let host = c.url;
    try {
      host = new URL(c.url).hostname.toLowerCase();
    } catch {
      // hostが取れない壊れたURLはそのままログに出す
    }
    droppedHostCounts.set(host, (droppedHostCounts.get(host) ?? 0) + 1);
    return false;
  });
  const newsDropped = [...droppedHostCounts.values()].reduce((a, b) => a + b, 0);

  writeState(LAST_SEEN_NAME, lastSeen);
  writeJSON(HASHES_FILE, hashes);
  writeJSON(OUT_FILE, final);

  console.log(`[collect] sources ok=${okCount} failed=${failCount} candidates=${final.length} google_dropped=${googleDropped}`);
  console.log(`[collect] last_seen feeds=${Object.keys(lastSeen).length} max_lookback=${LAST_SEEN_MAX_LOOKBACK_DAYS}d`);
  console.log(`[collect] news kept=${newsKept} dropped_untrusted=${newsDropped}`);
  if (droppedHostCounts.size > 0) {
    const topHosts = [...droppedHostCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([host, count]) => `${host}(${count})`)
      .join(', ');
    console.log(`[collect] dropped_untrusted top hosts: ${topHosts}`);
  }
  if (failCount > 0 && okCount === 0) process.exitCode = 1; // 全滅のみ失敗扱い
}

main().catch((e) => {
  console.error(`[collect] fatal: ${e.message}`);
  process.exit(1);
});
