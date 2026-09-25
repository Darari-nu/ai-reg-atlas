import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

export const ROOT = process.cwd();
export const DRY_ROOT = '/tmp/dry';
export const DROPPED_FILE = '/tmp/dropped.json';

export const MIN_BODY_CHARS = Number(process.env.MIN_BODY_CHARS || 600);
export const RECENCY_DAYS = Number(process.env.RECENCY_DAYS || 90);

export const AI_REG_KEYWORDS = (
  process.env.AI_REG_KEYWORDS ||
  'AI,人工知能,artificial intelligence,regulation,regulatory,規制,法,法律,act,guideline,guidance,ガイドライン,policy,政策,compliance,施行,罰則,透明性,リスク'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export function isDryRun() {
  return /^(1|true|yes)$/i.test(process.env.DRY_RUN || '');
}

export function dataPath(...parts) {
  return path.join(isDryRun() ? DRY_ROOT : ROOT, 'data', ...parts);
}

export function rootPath(...parts) {
  return path.join(ROOT, ...parts);
}

export function loadJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function readDataJSON(relParts, fallback) {
  const target = dataPath(...relParts);
  if (fs.existsSync(target)) return loadJSON(target, fallback);
  return loadJSON(rootPath('data', ...relParts), fallback);
}

export function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

export function writeDataJSON(relParts, data) {
  writeJSON(dataPath(...relParts), data);
}

export function appendDrop(entry) {
  const drops = loadJSON(DROPPED_FILE, []);
  drops.push({
    url: entry.url || '',
    reason: entry.reason,
    country: entry.country || entry.country_hint || null,
  });
  writeJSON(DROPPED_FILE, drops);
}

export function isGoogleNewsUrl(raw) {
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return host === 'news.google.com' || host.endsWith('.news.google.com') || host === 'news.url.google.com';
  } catch {
    return false;
  }
}

/**
 * Bing ニュースの転送URL（bing.com/news/apiclick.aspx?...&url=<元記事>）から元記事のURLを取り出す。
 * Bing 以外・url パラメータ無し・http(s) 以外のときはそのまま返す（§計画 実装指示2）。
 */
export function unwrapBingNewsUrl(link) {
  try {
    const url = new URL(link);
    const host = url.hostname.toLowerCase();
    const isBing = host === 'bing.com' || host.endsWith('.bing.com');
    if (isBing && url.pathname.includes('/news/apiclick.aspx')) {
      const target = url.searchParams.get('url');
      if (target && /^https?:\/\//i.test(target)) return target;
    }
    return link;
  } catch {
    return link;
  }
}

/** host が domain 自身か、そのサブドメインか（先頭の www. は無視。部分文字列一致はしない） */
export function hostMatches(host, domain) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '');
  const d = String(domain || '').toLowerCase().replace(/^www\./, '');
  if (!h || !d) return false;
  return h === d || h.endsWith(`.${d}`);
}

// 政府系TLD（末尾一致）。.gov / .gov.(uk|in|br|au|sg|cn|tw|kh|hk|nz|ie)（任意の2文字ccTLDではなく列挙に限定。
// gov.ai・x.gov.io のような非政府ドメインが誤って official にならないように） / .go.kr / .go.jp / .gc.ca /
// .gob.xx / .gouv.fr / europa.eu / nic.in / leg.br / parliament.uk
export const OFFICIAL_TLD_RE =
  /(?:^|\.)(?:gov(?:\.(?:uk|in|br|au|sg|cn|tw|kh|hk|nz|ie))?|go\.kr|go\.jp|gc\.ca|gob\.[a-z]{2}|gouv\.fr|europa\.eu|nic\.in|leg\.br|parliament\.uk)$/i;

/**
 * 出典URLのホストから official/media を機械的に決める。壊れたURLは media。
 * official: 政府系TLD（OFFICIAL_TLD_RE） or officialDomains（source_domains.yaml の official） or officialHosts（countries.yaml の official_sources のホスト）
 */
export function classifySourceKind(url, { officialDomains = [], officialHosts = [] } = {}) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'media';
  }
  if (OFFICIAL_TLD_RE.test(host)) return 'official';
  if (officialDomains.some((d) => hostMatches(host, d))) return 'official';
  if (officialHosts.some((h) => hostMatches(host, h))) return 'official';
  return 'media';
}

/**
 * regulation_patch（status前進・timeline_add）を自動適用してよいか。
 * 報道由来（sourceKind === 'media'）のときは自動適用せず、needs-review Issue に回す（§追加指示 必須1）。
 * official・未設定（undefined）は従来どおり自動適用してよい。
 */
export function shouldAutoApplyPatch(sourceKind) {
  return sourceKind !== 'media';
}

/** ホストが trustedMedia（source_domains.yaml の trusted_media）のどれかに一致するか */
export function isTrustedMediaUrl(url, trustedMedia = []) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return trustedMedia.some((d) => hostMatches(host, d));
}

/**
 * config/source_domains.yaml と config/countries.yaml を読み、
 * { officialDomains, officialHosts, trustedMedia } を返す（I/Oを伴うのでこれだけ純関数でない）。
 */
export function loadSourceDomains(root) {
  const sourceDomains = yaml.load(fs.readFileSync(path.join(root, 'config/source_domains.yaml'), 'utf8')) || {};
  const officialDomains = (sourceDomains.official ?? []).map((d) => String(d).toLowerCase());
  const trustedMedia = (sourceDomains.trusted_media ?? []).map((d) => String(d).toLowerCase());

  const countriesCfg = yaml.load(fs.readFileSync(path.join(root, 'config/countries.yaml'), 'utf8')) || {};
  const officialHosts = [];
  for (const country of countriesCfg.countries ?? []) {
    for (const src of country.official_sources ?? []) {
      try {
        officialHosts.push(new URL(src.url).hostname.toLowerCase().replace(/^www\./, ''));
      } catch {
        // 壊れたURLは無視
      }
    }
  }
  return { officialDomains, officialHosts, trustedMedia };
}

export function hasAiRegKeyword(text, keywords = AI_REG_KEYWORDS) {
  const lower = String(text || '').toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

export function looksLikeBlockedPage(text) {
  const body = String(text || '');
  const lower = body.toLowerCase();
  if (lower.includes('enable javascript') || lower.includes('please enable javascript')) return true;
  if (lower.includes('cookie consent') || lower.includes('accept all cookies')) return true;
  const functionCount = (body.match(/function\s*\(\)\s*\{/g) || []).length;
  return functionCount >= 20;
}

export function mechanicalGate(item, articleText, options = {}) {
  if (isGoogleNewsUrl(item.url)) return { ok: false, reason: 'google-news-source' };
  if (String(articleText || '').trim().length < (options.minBodyChars ?? MIN_BODY_CHARS)) {
    return { ok: false, reason: 'body-too-short' };
  }
  if (!hasAiRegKeyword(articleText, options.keywords ?? AI_REG_KEYWORDS)) {
    return { ok: false, reason: 'no-ai-reg-keyword' };
  }
  if (looksLikeBlockedPage(articleText)) return { ok: false, reason: 'blocked-or-js-only-page' };
  return { ok: true };
}

export function normalizeEventLabel(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

export function existingEventKeys({ days = 90 } = {}) {
  const dir = rootPath('data', 'updates');
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const keys = new Set();
  if (!fs.existsSync(dir)) return keys;
  for (const f of fs.readdirSync(dir).filter((name) => name.endsWith('.json'))) {
    for (const u of loadJSON(path.join(dir, f), [])) {
      if (u.date < cutoff) continue;
      const label = normalizeEventLabel(u.canonical_event || u.title);
      if (label) keys.add(`${u.country}:${label}`);
    }
  }
  return keys;
}

/** source_group の優先順位（SOURCE_GROUP_ORDER に無いものは最後） */
function sourceGroupRank(sourceGroup) {
  return SOURCE_GROUP_ORDER[sourceGroup] ?? 9;
}

export function dedupeByEvent(items, existingKeys = new Set()) {
  const byKey = new Map();
  const priorityRank = { high: 2, low: 1 };
  for (const item of items) {
    const countries = item.countries?.length ? item.countries : [item.country_hint].filter(Boolean);
    const label = normalizeEventLabel(item.canonical_event || item.title);
    if (!label) continue;
    for (const cc of countries) {
      const key = `${cc}:${label}`;
      if (existingKeys.has(key)) {
        appendDrop({ ...item, country: cc, reason: 'duplicate-existing-event' });
        continue;
      }
      const expanded = { ...item, countries: [cc], canonical_event: item.canonical_event || item.title };
      const prev = byKey.get(key);
      let expandedWins;
      if (!prev) {
        expandedWins = true;
      } else {
        const expandedRank = priorityRank[expanded.priority] || 0;
        const prevRank = priorityRank[prev.priority] || 0;
        // priorityが同じなら source_group の順（official_sources > watch_feeds > news_queries）で優先する
        expandedWins = expandedRank !== prevRank ? expandedRank > prevRank : sourceGroupRank(expanded.source_group) < sourceGroupRank(prev.source_group);
      }
      if (expandedWins) {
        if (prev) appendDrop({ ...prev, country: cc, reason: 'duplicate-event-lower-priority' });
        byKey.set(key, expanded);
      } else {
        appendDrop({ ...expanded, country: cc, reason: 'duplicate-event-lower-priority' });
      }
    }
  }
  return [...byKey.values()];
}

export function isYmd(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function daysBetween(a, b) {
  const start = Date.UTC(Number(a.slice(0, 4)), Number(a.slice(5, 7)) - 1, Number(a.slice(8, 10)));
  const end = Date.UTC(Number(b.slice(0, 4)), Number(b.slice(5, 7)) - 1, Number(b.slice(8, 10)));
  return Math.floor((end - start) / 86_400_000);
}

export function publicationDateGate(publicationDate, sweepDate, recencyDays = RECENCY_DAYS) {
  if (!isYmd(publicationDate)) return { ok: false, reason: 'missing-publication-date' };
  if (daysBetween(publicationDate, sweepDate) >= recencyDays) return { ok: false, reason: 'stale-publication-date' };
  return { ok: true };
}

export function nextIdForDate(updates, cc, pubDate) {
  const prefix = `${pubDate}-${cc}-`;
  const nums = updates.filter((u) => u.id.startsWith(prefix)).map((u) => Number(u.id.slice(-3)));
  return `${prefix}${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;
}

/**
 * 同じ出典URLかつ同じ公表日のレコードが既にあるか（重複登録の機械チェック）。
 * 同じ出典URLでも公表日が違えば別の出来事（EUの政策ハブページのように1つのURLから複数の出来事が出る）
 * ので、URLと日付の両方で判定する。
 */
export function isDuplicateRecord(updates, url, date) {
  return (updates ?? []).some((u) => u.sources?.[0] === url && u.date === date);
}

/**
 * normalizeEventLabel した文字列どうしの文字2-gram集合のJaccard係数（0〜1）。
 * どちらかが正規化後に空（2-gramが取れない）なら0。報道の同一事象の重複登録対策（§追加指示 必須3b）
 */
export function titleBigramSimilarity(a, b) {
  const bigrams = (value) => {
    const norm = normalizeEventLabel(value);
    const set = new Set();
    for (let i = 0; i < norm.length - 1; i++) set.add(norm.slice(i, i + 2));
    return set;
  };
  const setA = bigrams(a);
  const setB = bigrams(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const gram of setA) if (setB.has(gram)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * 同じ country で、date の差が days 日以内、タイトルの類似度（titleBigramSimilarity）が threshold 以上の
 * 既存レコードがあれば返す（無ければ null）。報道由来レコードの二重登録対策（§追加指示 必須3b）
 * 2026-09-26 実測: 重複3組 0.24〜0.27、別の出来事14組 最大0.18。差が小さいので、報道のみに適用し、
 * 落としたものは similar ログで確認する。
 */
export function findSimilarRecord(updates, { country, date, title }, { days = 3, threshold = 0.2 } = {}) {
  for (const u of updates ?? []) {
    if (u.country !== country) continue;
    if (!isYmd(u.date) || !isYmd(date)) continue;
    if (Math.abs(daysBetween(date, u.date)) > days) continue;
    if (titleBigramSimilarity(title, u.title) >= threshold) return u;
  }
  return null;
}

// legal_stage（法的段階）の全値。年表に載せる5段階＋載せない2段階（announcement/other）
export const LEGAL_STAGES = ['in_force', 'enacted', 'final_guidance', 'bill', 'draft_or_consultation', 'announcement', 'other'];

// 「差分変化（diff_changed）」を true にしてよい法的段階（施行・成立・確定した公式指針のみ）
export const DIFF_BINDING_STAGES = ['in_force', 'enacted', 'final_guidance'];

/**
 * diff_changed=true にしてよいのは、次の両方を満たすときだけ:
 * 1. legal_stage が「施行（in_force）」「成立（enacted）」「確定した公式指針（final_guidance）」のいずれか
 * 2. diff_items（EUとの差分一覧 diff_vs_eu の追加・更新・削除）が1件以上ある
 * どちらか欠けていれば、モデルの diff_changed=true 判定でも false に落とす（機械ゲート）。
 * country==='eu' は常に false（EU自身はEU AI Act基準そのものなので「EUとの差分」という概念が存在しない）。
 */
export function decideDiffChanged(rec, country) {
  if (country === 'eu') return false;
  return (
    rec.diff_changed === true &&
    DIFF_BINDING_STAGES.includes(rec.legal_stage) &&
    Array.isArray(rec.diff_items) &&
    rec.diff_items.length > 0
  );
}

/** axis が timeline/general のときは国別ページに対応する軸見出しが無いので、更新一覧へ飛ばす */
export function countryAnchor(country, axis) {
  if (axis === 'timeline' || axis === 'general') return `/country/${country}/#updates`;
  return `/country/${country}/#axis-${axis}`;
}

/**
 * discoveredAt を渡すと discovered_at を含める（省略時はキー自体を出さない＝既存レコードと同じ形）。
 * sourceKind が 'official'|'media' のときだけ source_kind を legal_stage の直後に含める（無ければキー自体を出さない）。
 */
export function buildUpdateRecord({ updates = [], country, item, rec, discoveredAt, sourceKind }) {
  const pubDate = rec.publication_date;
  return {
    id: nextIdForDate(updates, country, pubDate),
    date: pubDate,
    country,
    axis: rec.axis,
    change_type: rec.change_type,
    ...(LEGAL_STAGES.includes(rec.legal_stage) ? { legal_stage: rec.legal_stage } : {}),
    ...(sourceKind === 'official' || sourceKind === 'media' ? { source_kind: sourceKind } : {}),
    title: rec.title.slice(0, 120),
    summary: {
      what: rec.summary.what.slice(0, 120),
      who: rec.summary.who.slice(0, 120),
      when_impact: rec.summary.when_impact.slice(0, 120),
    },
    ...(rec.detail ? { detail: rec.detail } : {}),
    so_what: rec.so_what,
    impact: { diff_changed: rec.diff_changed, diff_note: rec.diff_note ?? '' },
    canonical_event: item.canonical_event || rec.title,
    publication_date: pubDate,
    ...(discoveredAt ? { discovered_at: discoveredAt } : {}), // サイトが見つけた日（トップのNEW欄の並び替え用）
    effective_date: rec.effective_date ?? null,
    deadline_date: rec.deadline_date ?? null,
    sources: [item.url],
    country_anchor: countryAnchor(country, rec.axis),
  };
}

export const ISSUES_FILE = '/tmp/pipeline_issues.json';

/** 起票予定Issueを追記する（上書きしない。collect/triage/summarize で共有） */
export function pushIssue(issue) {
  const issues = loadJSON(ISSUES_FILE, []);
  issues.push(issue);
  writeJSON(ISSUES_FILE, issues);
}

/** RSSの<link>が相対パスのとき、取得に使ったフィードURLを基準に絶対化する。http(s)にならなければ '' */
export function resolveFeedLink(link, feedUrl) {
  if (!link) return '';
  try {
    const url = new URL(link, feedUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

// triage のバッチ分割（出力が maxOutputTokens で切れて全滅するのを防ぐ）
export const SOURCE_GROUP_ORDER = { official_sources: 0, watch_feeds: 1, news_queries: 2 };

export function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** 公式ソースを先に処理する（後半バッチが失敗しても一次情報は拾えているように）。安定ソート */
export function sortForTriage(candidates) {
  return [...candidates].sort((a, b) => (SOURCE_GROUP_ORDER[a.source_group] ?? 9) - (SOURCE_GROUP_ORDER[b.source_group] ?? 9));
}

/** バッチ内ローカルindexでverdictを候補に結び付ける。不正・重複indexは捨てて件数を返す */
export function applyTriageVerdicts(batch, verdicts, targetCountries) {
  const picked = [];
  const seen = new Set();
  let bad = 0;
  for (const v of verdicts ?? []) {
    if (!Number.isInteger(v?.index) || v.index < 0 || v.index >= batch.length || seen.has(v.index)) {
      bad++;
      continue;
    }
    seen.add(v.index);
    if (!v.relevant || v.duplicate) continue;
    const ccs = (v.country ?? []).filter((c) => targetCountries.includes(c));
    if (ccs.length === 0) continue;
    picked.push({ ...batch[v.index], countries: ccs, priority: v.priority, canonical_event: v.canonical_event });
  }
  return { picked, bad, answered: seen.size };
}

/** relevant=false と判定された候補オブジェクト（不正・重複indexは無視）。セカンドルックの対象選別に使う */
export function irrelevantItems(batch, verdicts) {
  const items = [];
  const seen = new Set();
  for (const v of verdicts ?? []) {
    if (!Number.isInteger(v?.index) || v.index < 0 || v.index >= batch.length || seen.has(v.index)) continue;
    seen.add(v.index);
    if (v.relevant === false && batch[v.index]) items.push(batch[v.index]);
  }
  return items;
}

/** relevant=false と判定された候補のURL（seen_urls に記憶して翌日の再判定を止めるため）。不正indexは無視 */
export function irrelevantUrls(batch, verdicts) {
  return irrelevantItems(batch, verdicts)
    .filter((c) => c.url)
    .map((c) => c.url);
}

// セカンドルックの対象にする source_group。RSS（watch_feeds/news_queries）は last_seen の仕組みで
// pub <= last_seen の記事を二度と候補に出さないため、1回の判定で relevant=false になると再挑戦の機会が
// 来ない。一次情報（official_sources）だけは temperature 既定(1.0)の1回の揺れで取りこぼさないよう、
// 同じ実行内でもう一度判定する。
export const SECOND_LOOK_GROUPS = ['official_sources'];

/** セカンドルック（再判定）の対象か */
export function needsSecondLook(item) {
  return SECOND_LOOK_GROUPS.includes(item?.source_group);
}

// GitHub Actionsランナーの IP を弾くサイト（cac.gov.cn 等）向けの中継。collect と summarize で共有
export const JINA_READER_PREFIX = 'https://r.jina.ai/';

/** r.jina.ai の応答から前置き(Title:/URL Source:)と、本文先頭のページ取得日時の行を除く */
export function readerBody(raw) {
  const body = String(raw).split(/\nMarkdown Content:\n/)[1] ?? String(raw);
  // 取得日時（例: 2026年09月13日 星期日）が全リンクの文脈窓や本文日付に紛れ込むのを防ぐ
  return body.replace(/^\s*(?:20\d{2}[-/.年]\s?\d{1,2}[-/.月]\s?\d{1,2}日?)[^\n]*\n/, '');
}

// 一覧ページのリンクの日付（scrape_hash の古い記事を collect 段で落とすため）
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const DATE_RE = new RegExp(
  [
    '(20\\d{2})[-/.年]\\s?(\\d{1,2})[-/.月]\\s?(\\d{1,2})', // 2026-08-20 / 2026-08/20（URL）/ 2026年8月20日
    '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?\\s+(\\d{1,2}),?\\s+(20\\d{2})', // Jul 22, 2026
    '(\\d{1,2})\\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?,?\\s+(20\\d{2})', // 22 July 2026
    '(\\d{1,2})/(\\d{1,2})/(20\\d{2})', // 22/07/2026（dd/mm。13以上なら入れ替え）
  ].join('|'),
  'gi',
);

function toYmd(y, m, d) {
  if (m > 12 && d <= 12) [m, d] = [d, m];
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function matchToYmd(g) {
  if (g[1]) return toYmd(+g[1], +g[2], +g[3]);
  if (g[4]) return toYmd(+g[6], MONTHS[g[4].slice(0, 3).toLowerCase()], +g[5]);
  if (g[7]) return toYmd(+g[9], MONTHS[g[8].slice(0, 3).toLowerCase()], +g[7]);
  if (g[10]) return toYmd(+g[12], +g[11], +g[10]);
  return null;
}

/** 文字列中の最初の日付を YYYY-MM-DD で返す。無ければ null */
export function parseLooseDate(text) {
  for (const g of String(text ?? '').matchAll(DATE_RE)) {
    const ymd = matchToYmd(g);
    if (ymd) return ymd;
  }
  return null;
}

/** text[start,end) のアンカーに最も近い日付（前後 window 文字以内）。隣のリンクの日付を拾いにくくする */
export function nearestDate(text, start, end, window = 400) {
  const from = Math.max(0, start - window);
  const slice = String(text).slice(from, Math.min(text.length, end + window));
  let best = null;
  let bestDist = Infinity;
  for (const g of slice.matchAll(DATE_RE)) {
    const ymd = matchToYmd(g);
    if (!ymd) continue;
    const pos = from + g.index;
    const dist = pos < start ? start - (pos + g[0].length) : Math.max(0, pos - end);
    if (dist < bestDist) [best, bestDist] = [ymd, dist];
  }
  return best;
}

/** 一覧リンクの日付: URL → タイトル → アンカー周辺の順で探す */
export function listingDate({ href, title, text, start, end }) {
  return parseLooseDate(href) ?? parseLooseDate(title) ?? (text != null ? nearestDate(text, start, end) : null);
}

/** 日付が分かり、かつ maxAgeDays より古ければ true（日付不明・未来日付は落とさない） */
export function isStaleListing(listing_date, today, maxAgeDays) {
  return isYmd(listing_date) && daysBetween(listing_date, today) > maxAgeDays;
}

/** 日本語（ひらがな・カタカナ・漢字）を1文字でも含むか。サイトに出す見出しの言語チェック用 */
export function hasJapanese(text) {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(String(text ?? ''));
}

/**
 * サイトに出す見出しを日本語に揃える。モデルが原文（英語等）のまま title を返したときは、
 * 日本語で書かれている summary.what を見出しに使う（追加のAPI呼び出しをしない）。
 * @returns {{ title: string, replaced: boolean }}
 */
export function ensureJapaneseTitle(title, summaryWhat) {
  if (hasJapanese(title)) return { title, replaced: false };
  if (hasJapanese(summaryWhat)) return { title: summaryWhat, replaced: true };
  return { title, replaced: false }; // どちらも日本語でなければ手を付けない（落とすよりはまし。ログで拾う）
}
