// 日次パイプライン Step6: JSON Schema検証。失敗なら非0終了（commitさせない §5-2）
import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { isDryRun } from './lib/pipeline.mjs';
import { checkDigestFile } from './lib/digest.mjs';

const ROOT = process.cwd();
const DATA_ROOT = isDryRun() ? '/tmp/dry/data' : path.join(ROOT, 'data');
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const regulationSchema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema/regulation.schema.json'), 'utf8'));
const updateSchema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema/update.schema.json'), 'utf8'));
const explainerSchema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema/explainer.schema.json'), 'utf8'));
const deadlinesSchema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema/deadlines.schema.json'), 'utf8'));
const guideSchema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema/guide.schema.json'), 'utf8'));
const validateRegulation = ajv.compile(regulationSchema);
const validateExplainer = ajv.compile(explainerSchema);
const validateUpdates = ajv.compile(updateSchema);
const validateDeadlines = ajv.compile(deadlinesSchema);
const validateGuide = ajv.compile(guideSchema);

let errors = 0;

// DRY_RUN では書き換えた分だけが /tmp/dry/data に出る。readDataJSON と同じく、
// 無いファイル・ディレクトリはリポジトリの data/ で補う
function resolveData(rel) {
  const dry = path.join(DATA_ROOT, rel);
  return fs.existsSync(dry) ? dry : path.join(ROOT, 'data', rel);
}

function listDataFiles(rel) {
  const names = new Set();
  for (const base of [path.join(ROOT, 'data', rel), path.join(DATA_ROOT, rel)]) {
    if (fs.existsSync(base)) for (const f of fs.readdirSync(base)) names.add(f);
  }
  return [...names].sort();
}

function check(name, ok, validator) {
  if (ok) {
    console.log(`  ok ${name}`);
  } else {
    errors++;
    console.error(`  NG ${name}`);
    for (const e of validator.errors ?? []) console.error(`     ${e.instancePath} ${e.message}`);
  }
}

// regulations + eu_baseline
for (const f of ['eu_baseline.json', ...listDataFiles('regulations').map((f) => `regulations/${f}`)]) {
  const data = JSON.parse(fs.readFileSync(resolveData(f), 'utf8'));
  check(f, validateRegulation(data), validateRegulation);
}

// updates
for (const f of listDataFiles('updates').filter((f) => f.endsWith('.json'))) {
  const data = JSON.parse(fs.readFileSync(resolveData(`updates/${f}`), 'utf8'));
  check(`updates/${f}`, validateUpdates(data), validateUpdates);
}

// explainers（解説記事。無ければ0件）
for (const f of listDataFiles('explainers').filter((f) => f.endsWith('.json'))) {
  const data = JSON.parse(fs.readFileSync(resolveData(`explainers/${f}`), 'utf8'));
  check(`explainers/${f}`, validateExplainer(data), validateExplainer);
}

// deadlines（人が確認した期限一覧）。スキーマに加え、id の重複と国コードの実在を調べる
{
  const data = JSON.parse(fs.readFileSync(resolveData('deadlines.json'), 'utf8'));
  check('deadlines.json', validateDeadlines(data), validateDeadlines);
  const countryCodes = new Set(
    fs.readdirSync(path.join(ROOT, 'data/regulations')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')),
  );
  const extra = [];
  const ids = new Set();
  for (const d of Array.isArray(data) ? data : []) {
    if (ids.has(d.id)) extra.push(`id が重複: ${d.id}`);
    ids.add(d.id);
    if (!countryCodes.has(d.country)) extra.push(`${d.id}: 未知の国コード ${d.country}`);
  }
  check('deadlines.json (id・国コード)', extra.length === 0, { errors: extra.map((message) => ({ instancePath: '', message })) });
}

// guides（一次資料で裏を取った解説ページ。無ければ0件）。スキーマに加え、
// 出典が公式ドメイン（EUR-Lex・欧州委員会）だけか、章 id の重複、表の列数と行のセル数の一致、親ガイドの実在を調べる
const GUIDE_SOURCE_HOSTS = new Set(['eur-lex.europa.eu', 'digital-strategy.ec.europa.eu', 'ec.europa.eu', 'ai-act-service-desk.ec.europa.eu']);
for (const f of listDataFiles('guides').filter((f) => f.endsWith('.json'))) {
  const data = JSON.parse(fs.readFileSync(resolveData(`guides/${f}`), 'utf8'));
  check(`guides/${f}`, validateGuide(data), validateGuide);
  const extra = [];
  const urls = [];
  const collect = (arr) => { if (Array.isArray(arr)) urls.push(...arr); };
  for (const s of data.summary ?? []) collect(s.sources);
  for (const m of data.milestones ?? []) collect(m.sources);
  for (const r of data.references ?? []) urls.push(r.url);
  if (data.parent && !listDataFiles('guides').includes(`${data.parent}.json`)) extra.push(`親ガイドが無い: ${data.parent}`);
  const sectionIds = new Set();
  for (const sec of data.sections ?? []) {
    if (sectionIds.has(sec.id)) extra.push(`章 id が重複: ${sec.id}`);
    sectionIds.add(sec.id);
    for (const b of sec.blocks ?? []) {
      collect(b.sources);
      for (const t of b.tiers ?? []) collect(t.sources);
      for (const st of b.steps ?? []) collect(st.sources);
      if (b.type === 'checklist' || b.type === 'faq') for (const it of b.items ?? []) collect(it.sources);
      if (b.type === 'table') {
        for (const [i, row] of (b.rows ?? []).entries()) {
          collect(row.sources);
          if (row.cells.length !== b.columns.length) extra.push(`${sec.id}: 表の${i + 1}行目のセル数 ${row.cells.length} が列数 ${b.columns.length} と違う`);
        }
      }
    }
  }
  for (const u of urls) {
    let host = '';
    try { host = new URL(u).hostname; } catch { /* 下で NG */ }
    if (!GUIDE_SOURCE_HOSTS.has(host)) extra.push(`公式ドメイン以外の出典: ${u}`);
  }
  check(`guides/${f} (出典ドメイン・章id・表)`, extra.length === 0, { errors: extra.map((message) => ({ instancePath: '', message })) });
}

// digests（週1ダイジェスト原稿。kiji-intake の形か。無ければ0件）
for (const f of listDataFiles('digests').filter((f) => f.endsWith('.md'))) {
  const r = checkDigestFile(fs.readFileSync(resolveData(`digests/${f}`), 'utf8'));
  check(`digests/${f}`, r.ok, { errors: r.reasons.map((message) => ({ instancePath: '', message })) });
}

// meta
const meta = JSON.parse(fs.readFileSync(resolveData('meta.json'), 'utf8'));
const metaOk = typeof meta.last_sweep === 'string' && ['ok', 'partial', 'failed'].includes(meta.status);
check('data/meta.json', metaOk, { errors: [] });

// 状態ファイル（data/state/）。無ければスキップ（初回や DRY_RUN で未作成のことがある）
const isYmd = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function checkState(name, validator) {
  const file = path.join(DATA_ROOT, 'state', name);
  if (!fs.existsSync(file)) return;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    check(`state/${name}`, false, { errors: [{ instancePath: '', message: `JSONとして読めない: ${e.message}` }] });
    return;
  }
  const bad = validator(data);
  check(`state/${name}`, bad.length === 0, { errors: bad.map((message) => ({ instancePath: '', message })) });
}

checkState('last_seen.json', (data) => {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return ['オブジェクトではない'];
  return Object.entries(data)
    .filter(([, v]) => typeof v !== 'string' || Number.isNaN(Date.parse(v)))
    .map(([k]) => `${k}: ISO日時文字列ではない`);
});

checkState('queue.json', (data) => {
  if (!Array.isArray(data)) return ['配列ではない'];
  const bad = data.length > 50 ? [`件数が上限50を超えている (${data.length})`] : [];
  data.forEach((e, i) => {
    if (!e || typeof e.url !== 'string' || !isYmd(e.queued_at)) bad.push(`[${i}]: url/queued_at が不正`);
  });
  return bad;
});

checkState('seen_urls.json', (data) => {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return ['オブジェクトではない'];
  return Object.entries(data)
    .filter(([, v]) => !v || typeof v.verdict !== 'string' || !isYmd(v.date))
    .map(([k]) => `${k}: verdict(string)/date(YYYY-MM-DD)が不正`);
});

if (errors > 0) {
  console.error(`[validate] ${errors} file(s) failed`);
  process.exit(1);
}
console.log('[validate] all data valid');
