// 日次パイプライン Step6: JSON Schema検証。失敗なら非0終了（commitさせない §5-2）
import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { isDryRun } from './lib/pipeline.mjs';

const ROOT = process.cwd();
const DATA_ROOT = isDryRun() ? '/tmp/dry/data' : path.join(ROOT, 'data');
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const regulationSchema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema/regulation.schema.json'), 'utf8'));
const updateSchema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema/update.schema.json'), 'utf8'));
const validateRegulation = ajv.compile(regulationSchema);
const validateUpdates = ajv.compile(updateSchema);

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
