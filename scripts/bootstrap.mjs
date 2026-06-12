// 新国シード生成（§9 国の追加手順）: npm run bootstrap -- --country=xx
// Geminiで§4-4スキーマのドラフトを生成 → 人間レビュー後にマージする前提。
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { geminiJSONWithRetry, hasApiKey, MODEL_SUMMARIZE } from './lib/gemini.mjs';

const ROOT = process.cwd();
const cc = (process.argv.find((a) => a.startsWith('--country=')) ?? '').split('=')[1];
if (!cc || !/^[a-z]{2}$/.test(cc)) {
  console.error('usage: npm run bootstrap -- --country=xx');
  process.exit(1);
}

const config = yaml.load(fs.readFileSync(path.join(ROOT, 'config/countries.yaml'), 'utf8'));
const country = config.countries.find((c) => c.code === cc);
if (!country) {
  console.error(`country "${cc}" not found in config/countries.yaml — 先にYAMLへ1ブロック追記すること`);
  process.exit(1);
}

const outFile = path.join(ROOT, `data/regulations/${cc}.json`);
if (fs.existsSync(outFile)) {
  console.error(`${outFile} already exists — 上書きしない（手動で消してから再実行）`);
  process.exit(1);
}

const nowIso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

const emptyAxis = { summary: '', detail: '', sources: [] };
const skeleton = {
  jurisdiction: cc,
  regulation_name: '',
  status: 'proposed',
  approach: 'soft_law',
  axes: {
    risk_classification: emptyAxis,
    prohibited_uses: emptyAxis,
    gpai_obligations: emptyAxis,
    transparency: emptyAxis,
    penalties: emptyAxis,
    enforcement_body: emptyAxis,
    timeline: [],
  },
  diff_vs_eu: { stricter: [], looser: [], absent: [], unique: [] },
  last_checked: nowIso,
  last_changed: nowIso,
};

async function main() {
  if (!hasApiKey()) {
    fs.writeFileSync(outFile, JSON.stringify(skeleton, null, 2) + '\n');
    console.log(`[bootstrap] GEMINI_API_KEY未設定のため空スケルトンを生成: ${outFile}（手動で埋めること）`);
    return;
  }

  const euBaseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/eu_baseline.json'), 'utf8'));
  const prompt = `あなたはAI法規制の専門アナリストです。${country.name_ja}（${country.name_en ?? cc}）のAI規制の現状サマリーを、以下のJSON構造で生成してください。

制約:
- 事実のみ。確信が持てない項目は summary を空文字にする
- sources には公式機関のURLのみを書く（不確かなURLは書かない）
- diff_vs_eu はEU AI Act（添付）との差分を stricter/looser/absent/unique の4分類で
- これは人間レビュー前のドラフトである

eu_baseline: ${JSON.stringify(euBaseline.axes)}`;

  const schema = {
    type: 'OBJECT',
    properties: {
      regulation_name: { type: 'STRING' },
      status: { type: 'STRING', enum: ['proposed', 'draft', 'consultation', 'enacted', 'in_force'] },
      approach: { type: 'STRING', enum: ['risk_based', 'sectoral', 'soft_law'] },
    },
    required: ['regulation_name', 'status', 'approach'],
  };

  const head = await geminiJSONWithRetry({ model: MODEL_SUMMARIZE, prompt, schema });
  const draft = { ...skeleton, ...head };
  fs.writeFileSync(outFile, JSON.stringify(draft, null, 2) + '\n');
  console.log(`[bootstrap] draft generated: ${outFile}`);
  console.log('[bootstrap] ※軸の中身は日次パイプライン or 手動で充填し、人間レビュー後にマージすること');
}

main().catch((e) => {
  console.error(`[bootstrap] fatal: ${e.message}`);
  process.exit(1);
});
