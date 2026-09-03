// L2コーパス: 条文全文を一次ソースから機械取得し、条ごと1ファイルのMarkdownに割る。
// L1（data/regulations/*.json）が「差分サマリー」なのに対し、こちらは「原文」。
// サイトにはビルドしない。BOT・執筆の引き当て用データとして持つだけ。
//
// 使い方:
//   npm run fulltext              変更があったものだけ書き直す
//   npm run fulltext -- --force   ハッシュが同じでも全部書き直す
//   npm run fulltext -- --only=eu_ai_act   1ソースだけ
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import yaml from 'js-yaml';

const ROOT = process.cwd();
const OUT_ROOT = path.join(ROOT, 'data', 'fulltext');
const MANIFEST_FILE = path.join(OUT_ROOT, 'MANIFEST.json');
const CONFIG_FILE = path.join(ROOT, 'config', 'fulltext-sources.yaml');
const TIMEOUT_MS = 60_000;
const USER_AGENT = 'AIRegAtlasBot/1.0 (+https://darari-nu.github.io/ai-reg-atlas/about/)';

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').split('=')[1] || null;

async function fetchWithTimeout(url, headers = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': USER_AGENT, ...headers } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return res;
  } finally {
    clearTimeout(t);
  }
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function writeIfChanged(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === body) return false;
  fs.writeFileSync(file, body);
  return true;
}

function frontmatter(obj, body) {
  const esc = (v) => (typeof v === 'string' && /[:#"'\n]/.test(v) ? JSON.stringify(v) : v);
  const lines = Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${esc(v)}`);
  return `---\n${lines.join('\n')}\n---\n\n${body.trim()}\n`;
}

// ---------- HTML → Markdown（OJの語彙だけ扱う小さい変換器） ----------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(s) {
  return s
    .replace(/&([a-zA-Z]+);/g, (m, name) => ENTITIES[name] ?? m)
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (m, n) => String.fromCodePoint(parseInt(n, 16)));
}

// 開始タグの位置から、対応する閉じタグまでを取り出す（入れ子対応）
function matchElement(html, tag, from) {
  const open = new RegExp(`<${tag}\\b[^>]*>`, 'gi');
  const step = new RegExp(`<(/)?${tag}\\b[^>]*?(/)?>`, 'gi');
  open.lastIndex = from;
  const m = open.exec(html);
  if (!m || m.index !== from) return null;
  if (m[0].endsWith('/>')) return { start: from, end: open.lastIndex, inner: '', attrs: m[0] };
  step.lastIndex = from;
  let depth = 0;
  let hit;
  while ((hit = step.exec(html))) {
    if (hit[2]) continue; // 自己閉じ
    depth += hit[1] ? -1 : 1;
    if (depth === 0) {
      return { start: from, end: step.lastIndex, inner: html.slice(m.index + m[0].length, hit.index), attrs: m[0] };
    }
  }
  return null;
}

function findElementById(html, id) {
  const re = new RegExp(`<div\\b[^>]*\\bid="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'i');
  const m = re.exec(html);
  return m ? matchElement(html, 'div', m.index) : null;
}

function inlineText(html) {
  return decodeEntities(
    html
      .replace(/<span[^>]*class="oj-bold"[^>]*>([\s\S]*?)<\/span>/gi, (m, t) => `**${t.trim()}**`)
      .replace(/<span[^>]*class="oj-italic"[^>]*>([\s\S]*?)<\/span>/gi, (m, t) => `*${t.trim()}*`)
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

// <table> は (a)(b)(c) の箇条書きに使われている。1列目=見出し記号、2列目=本文。
function renderTable(inner, depth) {
  const out = [];
  let i = 0;
  while (i < inner.length) {
    const at = inner.toLowerCase().indexOf('<tr', i);
    if (at < 0) break;
    const row = matchElement(inner, 'tr', at);
    if (!row) break;
    const cells = [];
    let j = 0;
    while (j < row.inner.length) {
      const ct = row.inner.toLowerCase().indexOf('<td', j);
      if (ct < 0) break;
      const cell = matchElement(row.inner, 'td', ct);
      if (!cell) break;
      cells.push(cell.inner);
      j = cell.end;
    }
    if (cells.length >= 2) {
      const marker = inlineText(cells[0]);
      const body = renderBlocks(cells.slice(1).join('\n'), depth + 1).trim();
      const pad = '  '.repeat(depth);
      const [head, ...rest] = body.split('\n');
      out.push(`${pad}- ${marker ? `${marker} ` : ''}${head}`.trimEnd());
      for (const r of rest) out.push(r ? (r.startsWith(' ') ? r : `${pad}  ${r}`) : '');
    } else if (cells.length === 1) {
      out.push(renderBlocks(cells[0], depth).trim());
    }
    i = row.end;
  }
  return out.join('\n');
}

function renderBlocks(html, depth = 0) {
  const out = [];
  let i = 0;
  const lower = html.toLowerCase();
  while (i < html.length) {
    const next = ['<p', '<table', '<div']
      .map((t) => ({ t: t.slice(1), at: lower.indexOf(t, i) }))
      .filter((x) => x.at >= 0)
      .sort((a, b) => a.at - b.at)[0];
    if (!next) break;
    const el = matchElement(html, next.t, next.at);
    if (!el) { i = next.at + 1; continue; }
    if (next.t === 'table') {
      const t = renderTable(el.inner, depth);
      if (t) out.push(t);
    } else if (next.t === 'div') {
      const d = renderBlocks(el.inner, depth);
      if (d.trim()) out.push(d);
    } else {
      const text = inlineText(el.inner);
      if (text) out.push(/class="oj-note"/i.test(el.attrs) ? `> ${text}` : text);
    }
    i = el.end;
  }
  return out.join('\n\n');
}

// ---------- EU ----------

const ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII'];

async function fetchEu(src) {
  const url = `http://publications.europa.eu/resource/celex/${src.celex}`;
  const res = await fetchWithTimeout(url, {
    'Accept-Language': src.language || 'eng',
    Accept: 'application/xhtml+xml',
  });
  const html = await res.text();
  const hash = sha256(html);
  const dir = path.join(OUT_ROOT, src.key);
  const common = {
    source: 'EUR-Lex (Cellar)',
    celex: src.celex,
    language: src.language || 'eng',
    reference_url: src.reference_url,
    license: src.license,
  };

  // 条ごとの所属章を先に引く
  const chapterOf = new Map();
  for (const rn of ROMAN) {
    const cpt = findElementById(html, `cpt_${rn}`);
    if (!cpt) continue;
    const t1 = /class="oj-ti-section-1"[^>]*>([\s\S]*?)<\/p>/i.exec(cpt.inner);
    const t2 = /class="oj-ti-section-2"[^>]*>([\s\S]*?)<\/p>/i.exec(cpt.inner);
    const label = [t1 && inlineText(t1[1]), t2 && inlineText(t2[1]).replace(/\*/g, '')].filter(Boolean).join(' — ');
    for (const [, n] of cpt.inner.matchAll(/id="art_(\d+[a-z]*)"/gi)) chapterOf.set(n, label);
  }

  let written = 0;
  const emit = (file, fm, body) => { if (writeIfChanged(file, frontmatter(fm, body))) written++; };

  // 条
  const articleIds = [...new Set([...html.matchAll(/id="art_(\d+[a-z]*)"/gi)].map((m) => m[1]))];
  for (const n of articleIds) {
    const el = findElementById(html, `art_${n}`);
    if (!el) continue;
    const num = inlineText((/class="oj-ti-art"[^>]*>([\s\S]*?)<\/p>/i.exec(el.inner) || [])[1] || `Article ${n}`);
    const title = inlineText((/class="oj-sti-art"[^>]*>([\s\S]*?)<\/p>/i.exec(el.inner) || [])[1] || '');
    // 見出し2つを本文から外してから描画する
    const body = renderBlocks(
      el.inner
        .replace(/<p[^>]*class="oj-ti-art"[\s\S]*?<\/p>/i, '')
        .replace(/<div[^>]*class="eli-title"[\s\S]*?<\/div>/i, '')
    );
    const pad = /^\d+$/.test(n) ? String(n).padStart(3, '0') : n;
    emit(path.join(dir, `article_${pad}.md`), {
      ...common, kind: 'article', article: num, title, chapter: chapterOf.get(n) || '',
      anchor: `art_${n}`,
    }, `# ${num}${title ? ` — ${title}` : ''}\n\n${body}`);
  }

  // 前文（180本。1本ずつ切らず1ファイルにまとめる。参照は「Recital N」単位で足りる）
  const recitals = [];
  for (let n = 1; n <= 300; n++) {
    const el = findElementById(html, `rct_${n}`);
    if (!el) continue;
    const body = renderBlocks(el.inner).replace(new RegExp(`^-\\s*\\(${n}\\)\\s*`), '');
    recitals.push(`## Recital ${n}\n\n${body}`);
  }
  if (recitals.length) {
    emit(path.join(dir, 'recitals.md'), { ...common, kind: 'recitals', count: recitals.length },
      `# Recitals (${recitals.length})\n\n${recitals.join('\n\n')}`);
  }

  // 附属書
  const annexIds = [...new Set([...html.matchAll(/id="anx_([IVX]+)"/gi)].map((m) => m[1]))];
  for (const rn of annexIds) {
    const el = findElementById(html, `anx_${rn}`);
    if (!el) continue;
    emit(path.join(dir, `annex_${rn}.md`), { ...common, kind: 'annex', annex: rn, anchor: `anx_${rn}` },
      `# ANNEX ${rn}\n\n${renderBlocks(el.inner).replace(new RegExp(`^ANNEX\\s*${rn}\\s*\\n+`), '')}`);
  }

  return { hash, written, counts: { articles: articleIds.length, recitals: recitals.length, annexes: annexIds.length } };
}

// ---------- 日本（e-Gov法令API v2） ----------

function egovText(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(egovText).join('');
  return egovText(node.children);
}

function collect(node, tag, acc = []) {
  if (!node || typeof node !== 'object') return acc;
  if (Array.isArray(node)) { for (const c of node) collect(c, tag, acc); return acc; }
  if (node.tag === tag) acc.push(node);
  collect(node.children, tag, acc);
  return acc;
}

function renderJpArticle(art) {
  const out = [];
  for (const p of collect(art, 'Paragraph')) {
    const num = egovText(collect(p, 'ParagraphNum')[0]).trim();
    for (const s of collect(p, 'ParagraphSentence')) {
      const t = egovText(s).trim();
      if (t) out.push(num ? `${num}　${t}` : t);
    }
    for (const item of collect(p, 'Item')) {
      const it = egovText(collect(item, 'ItemTitle')[0]).trim();
      const ib = collect(item, 'ItemSentence').map(egovText).join('').trim();
      if (ib) out.push(`- ${it ? `${it}　` : ''}${ib}`);
      for (const sub of collect(item, 'Subitem1')) {
        const st = egovText(collect(sub, 'Subitem1Title')[0]).trim();
        const sb = collect(sub, 'Subitem1Sentence').map(egovText).join('').trim();
        if (sb) out.push(`  - ${st ? `${st}　` : ''}${sb}`);
      }
    }
  }
  return out.join('\n\n');
}

async function fetchJp(src) {
  const url = `https://laws.e-gov.go.jp/api/2/law_data/${src.law_id}`;
  const res = await fetchWithTimeout(url, { Accept: 'application/json' });
  const raw = await res.text();
  const hash = sha256(raw);
  const data = JSON.parse(raw);
  const rev = data.revision_info || {};
  const dir = path.join(OUT_ROOT, 'jp', src.key);
  const common = {
    source: 'e-Gov法令検索 法令API v2',
    law_id: src.law_id,
    law_num: (data.law_info || {}).law_num,
    law_title: rev.law_title || src.title,
    law_revision_id: rev.law_revision_id,
    reference_url: src.reference_url,
    license: src.license,
  };

  let written = 0;
  const main = collect(data.law_full_text, 'MainProvision')[0];
  const articles = collect(main, 'Article');
  for (const art of articles) {
    const title = egovText(collect(art, 'ArticleTitle')[0]).trim();
    const caption = egovText(collect(art, 'ArticleCaption')[0]).trim();
    const numAttr = (art.attr || {}).Num || '';
    const pad = /^\d+$/.test(numAttr) ? numAttr.padStart(3, '0') : (numAttr || title).replace(/[^\w]/g, '_');
    const body = renderJpArticle(art);
    if (!body) continue;
    const file = path.join(dir, `article_${pad}.md`);
    if (writeIfChanged(file, frontmatter(
      { ...common, kind: 'article', article: title, caption: caption.replace(/^（|）$/g, ''), article_num: numAttr },
      `# ${title}${caption ? ` ${caption}` : ''}\n\n${body}`
    ))) written++;
  }
  return { hash, written, counts: { articles: articles.length } };
}

// ---------- main ----------

async function main() {
  const cfg = yaml.load(fs.readFileSync(CONFIG_FILE, 'utf8'));
  const manifest = fs.existsSync(MANIFEST_FILE) ? JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')) : { sources: {} };
  const jobs = [
    ...(cfg.eu || []).map((s) => ({ ...s, fetcher: fetchEu, region: 'eu' })),
    ...(cfg.jp || []).map((s) => ({ ...s, fetcher: fetchJp, region: 'jp' })),
  ].filter((s) => !ONLY || s.key === ONLY);

  let failed = 0;
  for (const job of jobs) {
    process.stdout.write(`  ${job.key} ... `);
    try {
      const prev = manifest.sources[job.key];
      const r = await job.fetcher(job);
      const unchanged = prev && prev.source_sha256 === r.hash;
      manifest.sources[job.key] = {
        title: job.title,
        region: job.region,
        reference_url: job.reference_url,
        license: job.license,
        source_sha256: r.hash,
        counts: r.counts,
        fetched_at: new Date().toISOString(),
        ...(unchanged && !FORCE ? { last_changed: prev.last_changed } : { last_changed: new Date().toISOString() }),
      };
      console.log(`${unchanged ? '変更なし' : '更新'} / ${JSON.stringify(r.counts)} / ${r.written}ファイル書き込み`);
    } catch (e) {
      failed++;
      console.log(`NG ${e.message}`);
    }
  }

  manifest.generated_at = new Date().toISOString();
  manifest.note = 'L2条文全文コーパス。サイトにはビルドしない。収録の線引きは config/fulltext-sources.yaml を見ること。';
  fs.mkdirSync(OUT_ROOT, { recursive: true });
  fs.writeFileSync(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\nMANIFEST: ${path.relative(ROOT, MANIFEST_FILE)}`);
  if (failed) process.exit(1);
}

main();
