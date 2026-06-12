// 日次パイプライン Step6: JSON Schema検証。失敗なら非0終了（commitさせない §5-2）
import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ROOT = process.cwd();
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const regulationSchema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema/regulation.schema.json'), 'utf8'));
const updateSchema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema/update.schema.json'), 'utf8'));
const validateRegulation = ajv.compile(regulationSchema);
const validateUpdates = ajv.compile(updateSchema);

let errors = 0;

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
for (const f of ['data/eu_baseline.json', ...fs.readdirSync(path.join(ROOT, 'data/regulations')).map((f) => `data/regulations/${f}`)]) {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  check(f, validateRegulation(data), validateRegulation);
}

// updates
for (const f of fs.readdirSync(path.join(ROOT, 'data/updates')).filter((f) => f.endsWith('.json'))) {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, `data/updates/${f}`), 'utf8'));
  check(`data/updates/${f}`, validateUpdates(data), validateUpdates);
}

// meta
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/meta.json'), 'utf8'));
const metaOk = typeof meta.last_sweep === 'string' && ['ok', 'partial', 'failed'].includes(meta.status);
check('data/meta.json', metaOk, { errors: [] });

if (errors > 0) {
  console.error(`[validate] ${errors} file(s) failed`);
  process.exit(1);
}
console.log('[validate] all data valid');
