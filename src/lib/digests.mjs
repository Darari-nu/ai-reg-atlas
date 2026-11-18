// 週1ダイジェスト（data/digests/YYYY-Www.md）を Atlas の週報ページ用に読む。loadDigests 以外は純関数。
// 原稿は kiji-intake の形の Markdown（scripts/lib/digest.mjs の digestToMarkdown が書く）。
// 本文をそのまま流さず、節に分解して構造で描く（リンクは Atlas の絶対 URL → base 付きの内部パスに直す）。
// DOM も Astro も import しない。node --test から直接読める。

import fs from 'node:fs';
import path from 'node:path';

const DAY = 86_400_000;
const ymdToMs = (ymd) => Date.parse(`${ymd}T00:00:00Z`);
const msToYmd = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (ymd, n) => msToYmd(ymdToMs(ymd) + n * DAY);

export const WEEK_RE = /^(\d{4})-W(\d{2})$/;

/** ISO 週ラベル 'YYYY-Www'（年またぎは木曜の属する年） */
export function isoWeekLabel(ymd) {
  const ms = ymdToMs(ymd);
  const dow = (new Date(ms).getUTCDay() + 6) % 7; // 月=0
  const thu = ms - dow * DAY + 3 * DAY;
  const year = new Date(thu).getUTCFullYear();
  const week = Math.floor((thu - Date.UTC(year, 0, 1)) / DAY / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** 'YYYY-Www' → その週の月曜〜日曜。形が違えば null */
export function weekRange(label) {
  const m = String(label).match(WEEK_RE);
  if (!m) return null;
  const y = Number(m[1]);
  const w = Number(m[2]);
  const jan4 = Date.UTC(y, 0, 4); // 1月4日は必ず第1週
  const dow = (new Date(jan4).getUTCDay() + 6) % 7;
  const from = msToYmd(jan4 - dow * DAY + (w - 1) * 7 * DAY);
  if (isoWeekLabel(from) !== label) return null; // W53 が無い年など
  return { from, to: addDays(from, 6) };
}

/** frontmatter（1行 key: value の寛容な読み。scripts/lib/digest.mjs と同じ） */
export function parseFrontmatter(raw) {
  const m = String(raw).replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fm: null, body: String(raw).trim() };
  const fm = {};
  for (const line of m[1].split('\n')) {
    const k = line.match(/^([\w-]+):\s*(.*)$/);
    if (k) fm[k[1]] = k[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return { fm, body: m[2].trim() };
}

/** Atlas の絶対 URL（https://darari-nu.com/atlas/...）→ base を除いた内部パス（/explain/.../）。Atlas 以外は null */
export function toInternalPath(url) {
  const m = String(url).match(/^https?:\/\/(?:www\.)?darari-nu\.com\/atlas(\/[^\s]*)$/);
  return m ? m[1] : null;
}

/** URL から更新レコードの id を取り出す（/explain/<id>/ か /country/<cc>/#u-<id>） */
export function recordIdFromUrl(url) {
  const s = String(url);
  const a = s.match(/\/explain\/([0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z-]+-\d{3})\/?/);
  if (a) return a[1];
  const b = s.match(/#u-([0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z-]+-\d{3})$/);
  return b ? b[1] : null;
}

/** '## 見出し' ごとに本文を分ける */
function sections(body) {
  const out = {};
  let cur = null;
  for (const line of body.split('\n')) {
    const h = line.match(/^## (.+)$/);
    if (h) {
      cur = h[1].trim();
      out[cur] = [];
    } else if (cur) out[cur].push(line);
  }
  return out;
}

// 作る側は見出しの末尾に必ず（国旗 国名）を付ける。国旗が無い国（countries.yaml に flag が無い）は（国名）だけ
const FLAG_RE = /（(?:(\p{RI}\p{RI})\s*)?([^）]+)）\s*$/u;

/** 「今週の変化3つ」の1件（### 1. 見出し（🇵🇭 フィリピン） + 箇条書き3行） */
function parseChange(block) {
  const head = block[0].match(/^### (\d+)\.\s*(.+)$/);
  if (!head) return null;
  let title = head[2].trim();
  let flag = '';
  let countryName = '';
  const f = title.match(FLAG_RE);
  if (f) {
    flag = f[1] ?? '';
    countryName = f[2].trim();
    title = title.replace(FLAG_RE, '').trim();
  }
  const field = (label) => {
    const line = block.find((l) => l.startsWith(`- ${label}`));
    return line ? line.replace(/^- [^:：]+[:：]\s*/, '').trim() : '';
  };
  const what = field('何が起きたか');
  const oneLiner = field('社内で聞かれたときの一言');
  const more = block.find((l) => l.startsWith('- 詳しく'));
  let atlasUrl = '';
  let sourceUrl = '';
  if (more) {
    const urls = more.match(/https?:\/\/\S+/g) ?? [];
    atlasUrl = urls.find((u) => toInternalPath(u)) ?? '';
    sourceUrl = urls.find((u) => !toInternalPath(u)) ?? '';
  }
  if (!what || !atlasUrl) return null;
  return {
    n: Number(head[1]),
    title,
    flag,
    countryName,
    what,
    oneLiner,
    recordId: recordIdFromUrl(atlasUrl),
    href: toInternalPath(atlasUrl),
    sourceUrl,
  };
}

/** 「これからの期限」の1行: - 2026-11-27（あと11日）インド：本文 → URL */
function parseDeadline(line) {
  const m = line.match(/^- (\d{4}-\d{2}-\d{2})（[^）]*）([^：]+)：(.+?)\s*→\s*(https?:\/\/\S+)\s*$/);
  if (!m) return null;
  return { date: m[1], country: m[2].trim(), text: m[3].trim(), href: toInternalPath(m[4]) };
}

/** 「今週のその他の動き」の1行: - 本文（🇰🇷 韓国）URL */
function parseOther(line) {
  const m = line.match(/^- (.+)（(?:(\p{RI}\p{RI})\s*)?([^）]+)）\s*(https?:\/\/\S+)\s*$/u);
  if (!m) return null;
  return { text: m[1].trim(), flag: m[2] ?? '', countryName: m[3].trim(), recordId: recordIdFromUrl(m[4]), href: toInternalPath(m[4]) };
}

/**
 * 原稿1本 → 週報ページの中身。週ラベルが変・frontmatter が無い・変化が1件も読めない、なら null（そのページは作らない）。
 */
export function parseDigest(raw, week) {
  const range = weekRange(week);
  if (!range) return null;
  const { fm, body } = parseFrontmatter(raw);
  if (!fm || !fm.title) return null;
  const sec = sections(body);
  const changeLines = sec['今週の変化3つ'] ?? [];
  const blocks = [];
  for (const line of changeLines) {
    if (line.startsWith('### ')) blocks.push([line]);
    else if (blocks.length && line.trim()) blocks[blocks.length - 1].push(line);
  }
  // 一部だけ読めた原稿は、欠けたまま出さずに週ごと外す（読めた件数と書いてある件数が合わなければ null）
  const changes = blocks.map(parseChange);
  if (changes.length === 0 || changes.length > 3 || changes.some((c) => !c)) return null;
  const deadlineKey = Object.keys(sec).find((k) => k.startsWith('これからの期限'));
  // 期限の節は「期限なし」の一文（URL なし）もありうる。URL のある行だけが期限で、それは全部読めること
  const deadlineLines = (deadlineKey ? sec[deadlineKey] : []).filter((l) => l.startsWith('- ') && /→\s*https?:\/\//.test(l));
  const deadlines = deadlineLines.map(parseDeadline);
  const otherLines = (sec['今週のその他の動き'] ?? []).filter((l) => l.startsWith('- '));
  const others = otherLines.map(parseOther);
  if (deadlines.some((x) => !x) || others.some((x) => !x)) return null;
  // 見出しの「今週のAI規制：」は一覧で冗長なので外した短い題も持つ
  const shortTitle = fm.title.replace(/^今週のAI規制[:：]\s*/, '').replace(/（\d{4}\/\d{2}\/\d{2}週）$/, '').trim();
  return { week, ...range, title: fm.title, shortTitle, summary: fm.summary ?? '', changes, deadlines, others };
}

/** data/digests を読む。新しい週が先。読めない原稿は飛ばす */
export function loadDigests(dir = path.join(process.cwd(), 'data/digests')) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    const week = f.replace(/\.md$/, '');
    if (!f.endsWith('.md') || !WEEK_RE.test(week)) continue;
    let d = null;
    try {
      d = parseDigest(fs.readFileSync(path.join(dir, f), 'utf8'), week);
    } catch (e) {
      console.warn(`[digests] ${f} を読めないので週報ページを作らない: ${e?.message ?? e}`);
      continue;
    }
    if (d) out.push(d);
    else console.warn(`[digests] ${f} の形が読めないので週報ページを作らない`);
  }
  return out.sort((a, b) => (a.week < b.week ? 1 : -1));
}

/** 週ごとの更新件数（discovered_at、無ければ date で数える。週報の対象週と同じ数え方）。endWeek を含む直近 n 週・古い順 */
export function weeklyCounts(records, endWeek, n = 8) {
  const end = weekRange(endWeek);
  if (!end) return [];
  const weeks = [];
  for (let i = n - 1; i >= 0; i--) {
    const from = addDays(end.from, -7 * i);
    weeks.push({ week: isoWeekLabel(from), from, to: addDays(from, 6), count: 0 });
  }
  for (const r of records) {
    const d = r.discovered_at ?? r.date;
    const w = weeks.find((x) => d >= x.from && d <= x.to);
    if (w) w.count++;
  }
  return weeks;
}

/** 正距円筒図法で緯度経度 → SVG 座標（width × width/2） */
export function equirect(lat, lng, width) {
  const h = width / 2;
  return { x: ((lng + 180) / 360) * width, y: ((90 - lat) / 180) * h };
}

/**
 * スマホ用の拡大枠。点（緯度経度）を余白 pad 度で囲み、経度の幅は最低 minSpan 度、
 * 縦横比（経度の幅 ÷ 緯度の幅）は ratio。世界の外にはみ出すときは内側へずらす。
 * 戻り値は equirect(width) の座標系での viewBox {x, y, w, h}。
 */
export function focusBox(points, width, { pad = 22, minSpan = 80, ratio = 1.6 } = {}) {
  const H = width / 2;
  if (!points.length) return { x: 0, y: 0, w: width, h: H };
  const lngs = points.map((p) => p.lng);
  const lats = points.map((p) => p.lat);
  const cLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const cLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  let spanLng = Math.max(minSpan, Math.max(...lngs) - Math.min(...lngs) + 2 * pad);
  let spanLat = Math.max(spanLng / ratio, Math.max(...lats) - Math.min(...lats) + 2 * pad);
  spanLng = Math.min(360, Math.max(spanLng, spanLat * ratio));
  spanLat = Math.min(180, spanLng / ratio);
  const fit = (c, span, min, max) => Math.min(max - span, Math.max(min, c - span / 2));
  const lo = fit(cLng, spanLng, -180, 180);
  const bot = fit(cLat, spanLat, -90, 90);
  const a = equirect(bot + spanLat, lo, width);
  const b = equirect(bot, lo + spanLng, width);
  return { x: a.x, y: a.y, w: b.x - a.x, h: Math.min(H, b.y) - a.y };
}
