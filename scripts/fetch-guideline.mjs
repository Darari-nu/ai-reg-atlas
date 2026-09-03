// AI事業者ガイドライン（総務省・経済産業省）を取り込む。
//
// 法令（fetch-fulltext.mjs）と分けている理由:
//   1. 法令ではないのでe-Gov APIにない。PDFしか無い（pdftotextが要る＝CIでは動かさない）
//   2. **新しい版は新しいURLで出る**（20260331_1.pdf のように日付入り）。
//      固定URLを毎日叩く自動化にすると、新版が出ても古い版を取り続けたまま気づけない。
//      自動化してよいのは「新版が出たかの見張り」だけ。取り込み本体は人が動かす。
//
// 使い方:
//   node scripts/fetch-guideline.mjs --pdf-dir=<PDFを置いた場所>   （要 pdftotext / poppler）
//
// **自動化しない。** meti.go.jp は自動アクセスを絞っており、繰り返し叩くと 202 と空の本文を返す。
// 毎日叩きにいく見張りは、壊れるうえに相手にも迷惑。新版の検知は日次パイプラインの
// ニュース収集（collect/triage）に任せ、出たと分かったら人がPDFを落としてここに通す。
//
// 出典表示（政府標準利用規約に基づく二次利用。出典明示が条件）:
//   総務省・経済産業省「AI事業者ガイドライン（第1.2版）」
// 収録するのは本文テキストのみ。PDF内の図表は第三者権利が混じりうるので取り込まない。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'data', 'fulltext', 'jp', 'ai_jigyousha_guideline');
const MANIFEST_FILE = path.join(ROOT, 'data', 'fulltext', 'MANIFEST.json');
const INDEX_URL = 'https://www.meti.go.jp/shingikai/mono_info_service/ai_shakai_jisso/index.html';
const PDF_BASE = 'https://www.meti.go.jp/shingikai/mono_info_service/ai_shakai_jisso/pdf';
// meti.go.jp はボット然としたUAに 202 + 本文ゼロ を返す。ブラウザのUAで取る
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const PDF_DIR = (process.argv.find((a) => a.startsWith('--pdf-dir=')) || '').split('=')[1] || null;

// 取り込む版。新版に上げるときはここと PARTS の日付だけ差し替える
const VERSION = '第1.2版';
const PUBLISHED = '2026-03-31';
const REPORT_URL = 'https://www.meti.go.jp/shingikai/mono_info_service/ai_shakai_jisso/20260331_report.html';
const LICENSE = '政府標準利用規約に基づく二次利用（出典明示が条件）。出典: 総務省・経済産業省「AI事業者ガイドライン（第1.2版）」';

const PARTS = [
  { file: '20260331_1.pdf', key: 'honpen',    label: '本編',                 split: null },
  { file: '20260331_3.pdf', key: 'besshi',    label: '別添（溶け込み版）',   split: /^別添\s*[0-9０-９]+\s*[.．]/ },
  { file: '20260331_5.pdf', key: 'checklist', label: 'チェックリスト（別添7）', split: null },
];

// meti.go.jp のWAFは node の fetch に 202 + 待機ページ を返す（UAを変えても抜けない）。
// curl だと素直に 200 を返すので、ここだけ curl に任せる。CIのubuntuにも入っている。
// 202やリダイレクトでも res.ok は true になる仕様に足をすくわれないよう、
// 200かつ中身があることまで確かめる（空のまま進むと「新版なし」と嘘の結論が出る）。
async function get(url, asBuffer = false) {
  const tmp = path.join(ROOT, `.tmp_get_${crypto.randomBytes(4).toString('hex')}`);
  try {
    const code = execFileSync('curl', [
      '-sS', '-L', '--max-time', '120',
      '-A', UA,
      '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      '-H', 'Accept-Language: ja,en;q=0.9',
      '-o', tmp, '-w', '%{http_code}', url,
    ], { encoding: 'utf8' }).trim();
    if (code !== '200') throw new Error(`HTTP ${code} ${url}`);
    const buf = fs.readFileSync(tmp);
    if (!buf.length) throw new Error(`空のレスポンス ${url}`);
    return asBuffer ? buf : buf.toString('utf8');
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

function pdfToText(buf, tmp) {
  fs.writeFileSync(tmp, buf);
  try {
    execFileSync('pdftotext', ['-enc', 'UTF-8', tmp, `${tmp}.txt`], { stdio: 'pipe' });
  } catch (e) {
    throw new Error('pdftotext が見つからないか失敗しました（brew install poppler）');
  }
  const t = fs.readFileSync(`${tmp}.txt`, 'utf8');
  fs.rmSync(tmp, { force: true });
  fs.rmSync(`${tmp}.txt`, { force: true });
  return t;
}

// 目次行（……で埋まっている行）とページ番号だけの行を落とす
function clean(text) {
  return text
    .split('\n')
    .filter((l) => !/[.．]{6,}/.test(l))
    .filter((l) => !/^\s*\d{1,3}\s*$/.test(l))
    .join('\n')
    .replace(/\f/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function slug(heading, i) {
  const n = (heading.match(/[0-9０-９]+/) || ['x'])[0].replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  return String(n).padStart(2, '0') || String(i).padStart(2, '0');
}

function frontmatter(obj, body) {
  const esc = (v) => (typeof v === 'string' && /[:#"'\n]/.test(v) ? JSON.stringify(v) : v);
  return `---\n${Object.entries(obj).filter(([, v]) => v).map(([k, v]) => `${k}: ${esc(v)}`).join('\n')}\n---\n\n${body.trim()}\n`;
}

async function ingest() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const common = {
    source: '経済産業省・総務省 AI事業者ガイドライン検討会',
    document: 'AI事業者ガイドライン',
    version: VERSION,
    published: PUBLISHED,
    reference_url: REPORT_URL,
    license: LICENSE,
    note: '本文テキストのみ。PDF内の図表は取り込んでいない',
  };
  let written = 0;
  const hashes = {};

  for (const part of PARTS) {
    const url = `${PDF_BASE}/${part.file}`;
    process.stdout.write(`  ${part.label} ... `);
    const local = PDF_DIR ? path.join(PDF_DIR, part.file) : null;
    if (!local || !fs.existsSync(local)) {
      throw new Error(`PDFが見当たらない: ${local || '(--pdf-dir未指定)'}\n`
        + `    ${REPORT_URL} をブラウザで開いて ${part.file} を手で保存し、--pdf-dir で場所を渡すこと`);
    }
    const buf = fs.readFileSync(local);
    hashes[part.key] = crypto.createHash('sha256').update(buf).digest('hex');
    const text = clean(pdfToText(buf, path.join(ROOT, `.tmp_${part.key}.pdf`)));

    const write = (name, heading, body) => {
      const f = path.join(OUT_DIR, name);
      const out = frontmatter({ ...common, part: part.label, section: heading, source_pdf: url }, `# ${heading}\n\n${body}`);
      if (!fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== out) { fs.writeFileSync(f, out); written++; }
    };

    if (!part.split) {
      write(`${part.key}.md`, `${common.document}（${VERSION}） ${part.label}`, text);
      console.log(`1ファイル / ${text.length}字`);
      continue;
    }

    // 見出し行で切る。目次はcleanで落ちているので、残っているのは本文中の見出しだけ
    const lines = text.split('\n');
    const marks = [];
    // 見出しは短い。本文中の「別添 1 にて本ガイドラインで前提としている…」のような
    // 文まで拾うと粉々になる（実際に189個に割れた）。長さで足切りする
    // 「別添 3.」のような番号は表のセルや相互参照にも何度も出る。
    // 同じ番号は最初の1回だけを見出しとして採る（これで6〜9本に落ち着く）
    const seenNum = new Set();
    lines.forEach((l, i) => {
      const t = l.trim();
      if (!part.split.test(t) || [...t].length > 40) return;
      const n = (t.match(/[0-9０-９]+/) || [''])[0];
      if (seenNum.has(n)) return;
      seenNum.add(n);
      marks.push({ i, h: t });
    });
    // 割れすぎ・割れなさすぎは分割の失敗とみなして1本にする
    if (!marks.length || marks.length > 15) {
      write(`${part.key}.md`, `${common.document}（${VERSION}） ${part.label}`, text);
      console.log(`1ファイル / ${text.length}字（見出し${marks.length}個。分割せず）`);
      continue;
    }

    const head = lines.slice(0, marks[0].i).join('\n').trim();
    if (head) write(`${part.key}_00_前文.md`, `${part.label} 前文`, head);
    marks.forEach((m, k) => {
      const body = lines.slice(m.i + 1, k + 1 < marks.length ? marks[k + 1].i : lines.length).join('\n').trim();
      write(`${part.key}_${slug(m.h, k + 1)}.md`, m.h, body);
    });
    console.log(`${marks.length + (head ? 1 : 0)}ファイル / ${text.length}字`);
  }

  const manifest = fs.existsSync(MANIFEST_FILE) ? JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')) : { sources: {} };
  manifest.sources.ai_jigyousha_guideline = {
    title: `AI事業者ガイドライン（${VERSION}）`,
    region: 'jp',
    kind: 'guideline',
    version: VERSION,
    published: PUBLISHED,
    reference_url: REPORT_URL,
    license: LICENSE,
    source_sha256: hashes,
    fetched_at: new Date().toISOString(),
    ingest: '手動（PDF。新版は新URLで出るため自動取得しない）。見張りは --check',
  };
  fs.writeFileSync(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\n  ${written}ファイル書き込み / MANIFEST更新`);
  return 0;
}

ingest().then((c) => process.exit(c || 0)).catch((e) => {
  console.error(`  NG ${e.message}`);
  process.exit(1);
});
