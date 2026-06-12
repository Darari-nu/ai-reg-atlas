// 日次パイプライン Step2: 選別。新着全件を1プロンプトに束ねて Flash-Lite へ（§5-2, §14-4）
import fs from 'node:fs';
import path from 'node:path';
import { geminiJSONWithRetry, hasApiKey, MODEL_TRIAGE } from './lib/gemini.mjs';

const ROOT = process.cwd();
const IN_FILE = '/tmp/candidates.json';
const OUT_FILE = '/tmp/triaged.json';
const TARGET_COUNTRIES = ['eu', 'jp', 'us', 'uk', 'cn', 'kr'];

function loadCandidates() {
  try {
    return JSON.parse(fs.readFileSync(IN_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function existingFeedList() {
  const dir = path.join(ROOT, 'data/updates');
  const cutoff = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
  const list = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    for (const u of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) {
      if (u.date >= cutoff) list.push({ id: u.id, title: u.title });
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
    },
    required: ['index', 'relevant', 'country', 'duplicate', 'priority'],
  },
};

async function main() {
  const candidates = loadCandidates();
  if (candidates.length === 0) {
    fs.writeFileSync(OUT_FILE, '[]');
    console.log('[triage] no candidates, skip');
    return;
  }
  if (!hasApiKey()) {
    fs.writeFileSync(OUT_FILE, '[]');
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

候補: ${JSON.stringify(candidates.map((c, i) => ({ index: i, title: c.title, snippet: c.snippet, country_hint: c.country_hint })))}`;

  let verdicts;
  try {
    verdicts = await geminiJSONWithRetry({ model: MODEL_TRIAGE, prompt, schema: RESPONSE_SCHEMA });
  } catch (e) {
    console.error(`[triage] gemini failed after retry: ${e.message}`);
    fs.writeFileSync(OUT_FILE, '[]');
    fs.writeFileSync('/tmp/pipeline_issues.json', JSON.stringify([
      { title: 'triage失敗（GeminiのJSONが2回連続で不正）', body: `候補${candidates.length}件の選別をスキップした。Actionsログを確認。`, labels: ['needs-review'] },
    ]));
    return; // 個別失敗はパイプラインを止めない
  }

  const triaged = [];
  for (const v of verdicts ?? []) {
    if (!v.relevant || v.duplicate) continue;
    const cand = candidates[v.index];
    if (!cand) continue;
    const ccs = (v.country ?? []).filter((c) => TARGET_COUNTRIES.includes(c));
    if (ccs.length === 0) continue;
    triaged.push({ ...cand, countries: ccs, priority: v.priority });
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(triaged, null, 2));
  console.log(`[triage] in=${candidates.length} relevant=${triaged.length}`);
}

main().catch((e) => {
  console.error(`[triage] fatal: ${e.message}`);
  process.exit(1);
});
