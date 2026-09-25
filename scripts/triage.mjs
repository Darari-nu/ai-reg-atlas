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
  irrelevantItems,
  loadJSON,
  needsSecondLook,
  normalizeEventLabel,
  pushIssue,
  sortForTriage,
  writeJSON,
} from './lib/pipeline.mjs';
import { isSkippable, markSeen, pruneSeenUrls, readState, writeState } from './lib/state.mjs';

const ROOT = process.cwd();
const IN_FILE = '/tmp/candidates.json';
const OUT_FILE = '/tmp/triaged.json';
const SEEN_URLS_NAME = 'seen_urls.json';
const TODAY = process.env.SWEEP_DATE || new Date().toISOString().slice(0, 10);
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
- relevant: AI（人工知能）を対象とする法規制・ガイドライン・施行令・公的ガイダンス、またはAIの開発・利用に具体的に触れる規制当局の決定・執行か。AIに触れない一般の個人情報保護・通信・放送・生命科学・サイバー規制は false（AI固有の規定を含む場合だけ true）。ディープフェイク・AI生成物・自動化された意思決定に関する規定は、刑法・選挙法・消費者法などの中にあっても AI固有の規定として true。ニュース解説のみ・製品発表・株価も false
- country: 対象国コード（複数可・対象外なら除外）
- duplicate: 既存フィードと同一事象か
- priority: high（法令・公式文書の発行/変更） / low（動向解説）
- canonical_event: 同一事象を短く正規化したラベル（例: "EU AI Act GPAI guidelines published"）。媒体名やURLは含めない

候補: ${JSON.stringify(batch.map((c, i) => ({ index: i, title: c.title, snippet: c.snippet, country_hint: c.country_hint })))}`;
}

function callTriage(batch, feedList) {
  return geminiJSONWithRetry({
    model: MODEL_TRIAGE,
    prompt: buildPrompt(batch, feedList),
    schema: RESPONSE_SCHEMA,
    fallbackModels: FALLBACK_TRIAGE,
  });
}

// セカンドルック: 1回目で relevant=false だった公式ソースの候補を、同じ実行の中でもう一度判定する
// （needsSecondLook 対象のみ。RSSは last_seen の仕組みで一度しか候補に出ないため対象外）。
// 1回目の成功後に呼ぶので、ここでの例外は「triage一部失敗」に数えない（1回目は成功している）。
async function runSecondLook(secondLook, feedList, seenUrls) {
  const rescued = [];
  const stillIrrelevant = [];
  const batches = chunk(secondLook, BATCH_SIZE);
  for (const [bi, batch] of batches.entries()) {
    try {
      const verdicts = await callTriage(batch, feedList);
      const { picked } = applyTriageVerdicts(batch, verdicts, TARGET_COUNTRIES);
      rescued.push(...picked);
      for (const item of irrelevantItems(batch, verdicts)) {
        markSeen(seenUrls, item.url, 'triage-irrelevant', TODAY);
        stillIrrelevant.push(item);
      }
    } catch (e) {
      console.error(`[triage] second_look batch ${bi + 1}/${batches.length} failed: ${e.message}`);
      if (isGeminiStop(e)) break; // 待ち予算切れ・全モデル枯渇なら残りのセカンドルックは打ち切る
    }
  }
  console.log(`[triage] second_look in=${secondLook.length} rescued=${rescued.length}`);
  for (const item of rescued.slice(0, 10)) console.log(`[triage] second_look rescued: ${String(item.title || '').slice(0, 70)}`);
  for (const item of stillIrrelevant.slice(0, 10)) console.log(`[triage] second_look still irrelevant: ${String(item.title || '').slice(0, 70)}`);
  return rescued;
}

async function main() {
  const all = loadCandidates();
  // 既知URL（前回までに「関係なし」等と判定済み）はバッチに入れない＝Gemini枠を浪費しない
  const seenUrls = readState(SEEN_URLS_NAME, {});
  const candidates = all.filter((c) => !isSkippable(seenUrls[c.url]));
  console.log(`[triage] skipped_seen=${all.length - candidates.length}`);

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
  const secondLook = []; // 公式ソースで relevant=false だったもの（まだ markSeen しない。全バッチ後にもう一度判定）
  let failed = 0;
  let stopped = false;

  // 一部バッチが失敗しても成功分で続行する（1日分が全滅しないように）
  for (const [bi, batch] of batches.entries()) {
    if (stopped) {
      failed++;
      continue;
    }
    try {
      const verdicts = await callTriage(batch, feedList);
      const { picked, bad, answered } = applyTriageVerdicts(batch, verdicts, TARGET_COUNTRIES);
      // relevant=false は翌日以降も同じ判定になるので記憶しておく（duplicate は状況で変わるので記憶しない）。
      // ただし公式ソース（needsSecondLook）はまだ記憶せず、セカンドルックに回す
      for (const item of irrelevantItems(batch, verdicts)) {
        if (needsSecondLook(item)) secondLook.push(item);
        else markSeen(seenUrls, item.url, 'triage-irrelevant', TODAY);
      }
      triaged.push(...picked);
      console.log(`[triage] batch ${bi + 1}/${batches.length} in=${batch.length} answered=${answered} picked=${picked.length}${bad ? ` bad_index=${bad}` : ''}`);
    } catch (e) {
      failed++;
      console.error(`[triage] batch ${bi + 1}/${batches.length} failed: ${e.message}`);
      if (isGeminiStop(e)) stopped = true; // 待ち予算切れ・全モデル枯渇なら残りは呼ばない
    }
  }

  // セカンドルック: 温度1.0の1回の揺れで一次情報を取りこぼさないよう、公式ソースの relevant=false だけもう一度判定する
  if (secondLook.length > 0 && !stopped) {
    triaged.push(...(await runSecondLook(secondLook, feedList, seenUrls)));
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
  writeState(SEEN_URLS_NAME, pruneSeenUrls(seenUrls, TODAY));
  console.log(
    `[triage] in=${candidates.length} batches=${batches.length} failed=${failed} relevant=${triaged.length} deduped=${deduped.length} gemini=${JSON.stringify(geminiStats())}`,
  );
}

main().catch((e) => {
  console.error(`[triage] fatal: ${e.message}`);
  process.exit(1);
});
