// 日次パイプライン Step2: 選別。新着全件を1プロンプトに束ねて Flash-Lite へ（§5-2, §14-4）
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { geminiJSONWithRetry, hasApiKey, MODEL_TRIAGE } from './lib/gemini.mjs';
import { dedupeByEvent, existingEventKeys, loadJSON, normalizeEventLabel, writeJSON } from './lib/pipeline.mjs';

const ROOT = process.cwd();
const IN_FILE = '/tmp/candidates.json';
const OUT_FILE = '/tmp/triaged.json';
// 対象国はcountries.yamlが単一の正（国追加でここを触らない）
const TARGET_COUNTRIES = yaml
  .load(fs.readFileSync(path.join(ROOT, 'config/countries.yaml'), 'utf8'))
  .countries.map((c) => c.code);

function loadCandidates() {
  return loadJSON(IN_FILE, []);
}

function existingFeedList() {
  const dir = path.join(ROOT, 'data/updates');
  const cutoff = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
  const list = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    for (const u of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) {
      if (u.date >= cutoff) list.push({ id: u.id, title: u.title, canonical_event: u.canonical_event || normalizeEventLabel(u.title) });
    }
  }
  return list;
}

const RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      index: { type: 'INTEGER' },
      relevant: { type: 'BOOLEAN' },
      country: { type: 'ARRAY', items: { type: 'STRING' } },
      duplicate: { type: 'BOOLEAN' },
      priority: { type: 'STRING', enum: ['high', 'low'] },
      canonical_event: { type: 'STRING' },
    },
    required: ['index', 'relevant', 'country', 'duplicate', 'priority', 'canonical_event'],
  },
};

async function main() {
  const candidates = loadCandidates();
  if (candidates.length === 0) {
    writeJSON(OUT_FILE, []);
    console.log('[triage] no candidates, skip');
    return;
  }
  if (!hasApiKey()) {
    writeJSON(OUT_FILE, []);
    console.log('[triage] GEMINI_API_KEY not set, skip (safe no-op)');
    return;
  }

  const prompt = `あなたはAI法規制の専門アナリストです。以下の記事候補リストを評価してください。
対象国コード: ${TARGET_COUNTRIES.join(', ')}
既存の更新フィード（直近60日のid/title一覧）: ${JSON.stringify(existingFeedList())}

各候補について判定:
- relevant: AI法規制・ガイドライン・施行令・公的ガイダンスに関するか（ニュース解説のみ・製品発表・株価は false）
- country: 対象国コード（複数可・対象外なら除外）
- duplicate: 既存フィードと同一事象か
- priority: high（法令・公式文書の発行/変更） / low（動向解説）
- canonical_event: 同一事象を短く正規化したラベル（例: "EU AI Act GPAI guidelines published"）。媒体名やURLは含めない

候補: ${JSON.stringify(candidates.map((c, i) => ({ index: i, title: c.title, snippet: c.snippet, country_hint: c.country_hint })))}`;

  let verdicts;
  try {
    verdicts = await geminiJSONWithRetry({ model: MODEL_TRIAGE, prompt, schema: RESPONSE_SCHEMA });
  } catch (e) {
    console.error(`[triage] gemini failed after retry: ${e.message}`);
    writeJSON(OUT_FILE, []);
    writeJSON('/tmp/pipeline_issues.json', [
      { title: 'triage失敗（GeminiのJSONが2回連続で不正）', body: `候補${candidates.length}件の選別をスキップした。Actionsログを確認。`, labels: ['needs-review'] },
    ]);
    return; // 個別失敗はパイプラインを止めない
  }

  const triaged = [];
  for (const v of verdicts ?? []) {
    if (!v.relevant || v.duplicate) continue;
    const cand = candidates[v.index];
    if (!cand) continue;
    const ccs = (v.country ?? []).filter((c) => TARGET_COUNTRIES.includes(c));
    if (ccs.length === 0) continue;
    triaged.push({ ...cand, countries: ccs, priority: v.priority, canonical_event: v.canonical_event });
  }

  const deduped = dedupeByEvent(triaged, existingEventKeys({ days: 90 }));
  writeJSON(OUT_FILE, deduped);
  console.log(`[triage] in=${candidates.length} relevant=${triaged.length} deduped=${deduped.length}`);
}

main().catch((e) => {
  console.error(`[triage] fatal: ${e.message}`);
  process.exit(1);
});
