import fs from 'node:fs';
import path from 'node:path';

export const ROOT = process.cwd();
export const DRY_ROOT = '/tmp/dry';
export const DROPPED_FILE = '/tmp/dropped.json';
// GitHub Actionsのhashfiles()はGITHUB_WORKSPACE配下しか解決できず、/tmp配下だと常に空文字列を返し
// needs-review Issue起票ステップが永久にスキップされる(2ヶ月間無検知だった実障害)。ワークスペース内に置く。
export const ISSUES_FILE = path.join(ROOT, '.pipeline-cache', 'pipeline_issues.json');

export const MIN_BODY_CHARS = Number(process.env.MIN_BODY_CHARS || 600);
export const RECENCY_DAYS = Number(process.env.RECENCY_DAYS || 90);

export const AI_REG_KEYWORDS = (
  process.env.AI_REG_KEYWORDS ||
  'AI,人工知能,artificial intelligence,regulation,regulatory,規制,法,法律,act,guideline,guidance,ガイドライン,policy,政策,compliance,施行,罰則,透明性,リスク'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Content-Typeヘッダにcharsetが無いShift_JIS等の官公庁サイト向け。res.text()のUTF-8決め打ちで文字化けし、
// 日付正規表現が一致しなくなる(§日本総務省で実際に発生・2ヶ月間無検知だった)ため、charsetを検出して明示デコードする
export function detectCharset(contentType, bytes) {
  const headerMatch = /charset=["']?([a-z0-9_-]+)/i.exec(contentType || '');
  if (headerMatch) return headerMatch[1].toLowerCase();
  const sniff = Buffer.from(bytes.slice(0, 2048)).toString('latin1');
  const metaMatch = /<meta[^>]+charset=["']?\s*([a-z0-9_-]+)/i.exec(sniff);
  if (metaMatch) return metaMatch[1].toLowerCase();
  const xmlMatch = /<\?xml[^>]+encoding=["']([a-z0-9_-]+)["']/i.exec(sniff);
  if (xmlMatch) return xmlMatch[1].toLowerCase();
  return 'utf-8';
}

export async function decodeResponseText(res) {
  const buf = new Uint8Array(await res.arrayBuffer());
  const charset = detectCharset(res.headers.get('content-type'), buf);
  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf);
  }
}

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

export function hasAiRegKeyword(text, keywords = AI_REG_KEYWORDS) {
  const lower = String(text || '').toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

export function looksLikeBlockedPage(text) {
  const body = String(text || '');
  const lower = body.toLowerCase();
  if (lower.includes('enable javascript') || lower.includes('please enable javascript')) return true;
  if (lower.includes('cookie consent') || lower.includes('accept all cookies')) return true;
  // アンチスクレイピング壁がHTTP 200のまま返す案内文(federalregister.gov等で実際に発生)。
  // 本文長・キーワードは通過するため、これが無いとGeminiに空の本文が渡り静かにdropされる
  if (lower.includes('request access') && lower.includes('automated')) return true;
  if (lower.includes('complete the captcha') || lower.includes('verify you are a human')) return true;
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
      if (!prev || (priorityRank[expanded.priority] || 0) > (priorityRank[prev.priority] || 0)) {
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

export function buildUpdateRecord({ updates = [], country, item, rec }) {
  const pubDate = rec.publication_date;
  return {
    id: nextIdForDate(updates, country, pubDate),
    date: pubDate,
    country,
    axis: rec.axis,
    change_type: rec.change_type,
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
    effective_date: rec.effective_date ?? null,
    deadline_date: rec.deadline_date ?? null,
    sources: [item.url],
    country_anchor: `/country/${country}/#axis-${rec.axis === 'timeline' || rec.axis === 'general' ? 'risk_classification' : rec.axis}`,
  };
}
