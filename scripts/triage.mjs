// 日次パイプライン Step2: 選別。新着を TRIAGE_BATCH_SIZE 件ずつ束ねて Flash-Lite へ（§5-2, §14-4）
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { FALLBACK_TRIAGE, geminiJSONWithRetry, geminiStats, hasApiKey, isGeminiStop, MODEL_TRIAGE } from './lib/gemini.mjs';
import {
  applyTriageVerdicts,
  chunk,
  dedupeByEvent,
  existingEventKeys,
  loadJSON,
  normalizeEventLabel,
  pushIssue,
  sortForTriage,
  writeJSON,
} from './lib/pipeline.mjs';

const ROOT = process.cwd();
const IN_FILE = '/tmp/candidates.json';
const OUT_FILE = '/tmp/triaged.json';
// 1回の出力が maxOutputTokens(8192) で切れないよう分割する（1件≒60〜80トークン）
const BATCH_SIZE = Number(process.env.TRIAGE_BATCH_SIZE || 40);
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

function buildPrompt(batch, feedList) {
  return `あなたはAI法規制の専門アナリストです。以下の記事候補リストを評価してください。
対象国コード: ${TARGET_COUNTRIES.join(', ')}
既存の更新フィード（直近60日のid/title一覧）: ${feedList}

各候補について判定:
- index: 候補リストの index の値をそのまま返す（番号を振り直さない）
- relevant: AI法規制・ガイドライン・施行令・公的ガイダンスに関するか（ニュース解説のみ・製品発表・株価は false）
- country: 対象国コード（複数可・対象外なら除外）
- duplicate: 既存フィードと同一事象か
- priority: high（法令・公式文書の発行/変更） / low（動向解説）
- canonical_event: 同一事象を短く正規化したラベル（例: "EU AI Act GPAI guidelines published"）。媒体名やURLは含めない

候補: ${JSON.stringify(batch.map((c, i) => ({ index: i, title: c.title, snippet: c.snippet, country_hint: c.country_hint })))}`;
}

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

  const feedList = JSON.stringify(existingFeedList()); // 全バッチに同梱（各バッチが独立に重複判定できるように）
  const batches = chunk(sortForTriage(candidates), BATCH_SIZE);
  const triaged = [];
  let failed = 0;
  let stopped = false;

  // 一部バッチが失敗しても成功分で続行する（1日分が全滅しないように）
  for (const [bi, batch] of batches.entries()) {
    if (stopped) {
      failed++;
      continue;
    }
    try {
      const verdicts = await geminiJSONWithRetry({
        model: MODEL_TRIAGE,
        prompt: buildPrompt(batch, feedList),
        schema: RESPONSE_SCHEMA,
        fallbackModels: FALLBACK_TRIAGE,
      });
      const { picked, bad, answered } = applyTriageVerdicts(batch, verdicts, TARGET_COUNTRIES);
      triaged.push(...picked);
      console.log(`[triage] batch ${bi + 1}/${batches.length} in=${batch.length} answered=${answered} picked=${picked.length}${bad ? ` bad_index=${bad}` : ''}`);
    } catch (e) {
      failed++;
      console.error(`[triage] batch ${bi + 1}/${batches.length} failed: ${e.message}`);
      if (isGeminiStop(e)) stopped = true; // 待ち予算切れ・全モデル枯渇なら残りは呼ばない
    }
  }

  if (failed > 0) {
    pushIssue({
      title: `triage一部失敗（${failed}/${batches.length}バッチ）`,
      body: `候補${candidates.length}件のうち最大${Math.min(failed * BATCH_SIZE, candidates.length)}件を選別できなかった。Actionsログの [gemini] 行を確認。`,
      labels: ['needs-review'],
    });
  }

  const deduped = dedupeByEvent(triaged, existingEventKeys({ days: 90 }));
  writeJSON(OUT_FILE, deduped);
  console.log(
    `[triage] in=${candidates.length} batches=${batches.length} failed=${failed} relevant=${triaged.length} deduped=${deduped.length} gemini=${JSON.stringify(geminiStats())}`,
  );
}

main().catch((e) => {
  console.error(`[triage] fatal: ${e.message}`);
  process.exit(1);
});
