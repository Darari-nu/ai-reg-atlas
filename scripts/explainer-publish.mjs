// 解説の下書きを公開にする: node scripts/explainer-publish.mjs <id...>
// darari の OK を受けて実行し、data/explainers/ の変更をコミットする（push はしない）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** dir 内の <id>.json を draft → published にする。戻り値: { published: [], missing: [], already: [] } */
export function publishExplainers(ids, { dir = path.join(process.cwd(), 'data', 'explainers'), now = new Date().toISOString().replace(/\.\d+Z$/, 'Z') } = {}) {
  const result = { published: [], missing: [], already: [] };
  for (const id of ids) {
    const file = path.join(dir, `${id}.json`);
    if (!/^[\w-]+$/.test(id) || !fs.existsSync(file)) {
      result.missing.push(id);
      continue;
    }
    const ex = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (ex.status === 'published') {
      result.already.push(id);
      continue;
    }
    ex.status = 'published';
    ex.published_at = now;
    fs.writeFileSync(file, JSON.stringify(ex, null, 2) + '\n');
    result.published.push(id);
  }
  return result;
}

function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error('usage: node scripts/explainer-publish.mjs <id...>');
    process.exit(2);
  }
  const r = publishExplainers(ids);
  if (r.published.length) console.log(`[explainer-publish] published: ${r.published.join(', ')}`);
  if (r.already.length) console.log(`[explainer-publish] already published: ${r.already.join(', ')}`);
  if (r.missing.length) {
    console.error(`[explainer-publish] not found: ${r.missing.join(', ')}`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
