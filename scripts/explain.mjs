// 日次パイプライン: summarize の後。直近7日の更新レコードのうち解説が無いものを、Claude で解説記事（下書き）にする。
// ANTHROPIC_API_KEY が無い・クレジット切れ・API 障害のときは何もせず続行する（いかなる場合も exit 0。パイプラインを落とさない）。
// 送るのは公開データ（出典ページ本文とレコード）だけ。キーは SDK が環境変数から読む（コードでは値を扱わない）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import {
  DEFAULT_MODEL,
  addUsage,
  buildStored,
  checkExplainer,
  estimateCostUsd,
  explainerToMarkdown,
  generateExplainer,
  pruneAttempts,
  recordAttempt,
  selectTargets,
} from './lib/explainer.mjs';
import { fetchArticleText } from './lib/fetchArticle.mjs';
import { readState, writeState } from './lib/state.mjs';
import { DRY_ROOT, loadJSON, pushIssue, readDataJSON, rootPath, writeDataJSON, writeJSON } from './lib/pipeline.mjs';

export const NOTIFY_FILE = '/tmp/pipeline_notifications.json'; // notify-discord.mjs が読む
const MIN_SOURCE_CHARS = 300; // これより短い本文は解説の材料にならない（取得失敗扱いでスキップ）

function listJsonNames(rel) {
  const names = new Set();
  for (const base of [rootPath('data', rel), path.join(DRY_ROOT, 'data', rel)]) {
    if (fs.existsSync(base)) for (const f of fs.readdirSync(base)) if (f.endsWith('.json')) names.add(f);
  }
  return [...names].sort();
}

function defaultLoadRecords() {
  return listJsonNames('updates').flatMap((f) => readDataJSON(['updates', f], []));
}

function defaultExistingIds() {
  return new Set(listJsonNames('explainers').map((f) => f.replace(/\.json$/, '')));
}

function defaultPushNotification(n) {
  const list = loadJSON(NOTIFY_FILE, []);
  list.push(n);
  writeJSON(NOTIFY_FILE, list);
}

// 出典ページの本文。取れなければ null（その回はスキップして翌日再挑戦）。maxInput を超えたら切る
async function fetchSources(record, { fetchArticle, maxInput, log }) {
  const parts = [];
  for (const url of record.sources) {
    try {
      // 切り詰めの検知のため 1 字多く取る
      const text = await fetchArticle(url, { maxChars: maxInput + 1, logPrefix: 'explain' });
      if (text) parts.push({ url, text });
    } catch (e) {
      log.warn(`[explain] fetch failed ${url} (${e.message})`);
    }
  }
  const total = parts.reduce((n, p) => n + p.text.length, 0);
  if (parts.length === 0 || total < MIN_SOURCE_CHARS) return null;
  let joined = parts.map((p) => (parts.length > 1 ? `### ${p.url}\n${p.text}` : p.text)).join('\n\n');
  if (joined.length > maxInput) {
    log.warn(`[explain] source text truncated ${joined.length} -> ${maxInput} chars: ${record.id}`);
    joined = joined.slice(0, maxInput);
  }
  return joined;
}

/**
 * 本体。依存はすべて差し替え可能（テスト用）。戻り値は終了コード（常に 0）。
 */
export async function run({
  env = process.env,
  createClient = () => new Anthropic(), // キーは SDK が ANTHROPIC_API_KEY から読む
  loadRecords = defaultLoadRecords,
  existingIds = defaultExistingIds,
  fetchArticle = fetchArticleText,
  writeExplainer = (id, data) => writeDataJSON(['explainers', `${id}.json`], data),
  readAttempts = () => readState('explainer_attempts.json', {}),
  writeAttempts = (m) => writeState('explainer_attempts.json', m),
  pushIssueFn = pushIssue,
  pushNotification = defaultPushNotification,
  log = console,
  today = env.SWEEP_DATE || new Date().toISOString().slice(0, 10),
  now = new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
} = {}) {
  try {
    if (!env.ANTHROPIC_API_KEY) {
      log.log('[explain] no key, skip');
      return 0;
    }
    const model = env.EXPLAINER_MODEL || DEFAULT_MODEL;
    // 不正値（NaN・0以下）だと上限が効かなくなるので既定3に戻す
    const maxRaw = Number(env.EXPLAINER_MAX_PER_RUN);
    const max = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : 3;
    const maxInput = Number(env.EXPLAINER_MAX_INPUT_CHARS || 40_000);
    // 遡る日数（既定7）。過去分の一括解説（explain-backfill.yml）のときだけ大きくする。不正値は既定に戻す
    const lookback = Number(env.EXPLAINER_LOOKBACK_DAYS);
    const days = Number.isFinite(lookback) && lookback > 0 ? lookback : 7;
    const autoPublish = env.EXPLAINER_AUTO_PUBLISH === '1';
    const status = autoPublish ? 'published' : 'draft';

    let attempts = pruneAttempts(readAttempts(), today);
    const targets = selectTargets(loadRecords(), { existingIds: existingIds(), attempts, today, days });
    if (targets.length === 0) {
      log.log('[explain] nothing to do');
      return 0;
    }

    const client = createClient();
    let usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    let attempted = 0;
    const made = [];
    let aborted = null;

    for (const record of targets) {
      if (attempted >= max) break;
      const sourceText = await fetchSources(record, { fetchArticle, maxInput, log });
      if (!sourceText) {
        log.warn(`[explain] skip ${record.id}: source text unavailable (retry tomorrow)`);
        continue;
      }
      attempted++;
      const res = await generateExplainer({ client, model, record, sourceText });
      if (res.usage) usage = addUsage(usage, res.usage);
      if (res.status === 'abort') {
        aborted = res.reason;
        log.warn(`[explain] abort: ${res.reason} (remaining records wait until tomorrow)`);
        break;
      }
      if (res.status === 'skip') {
        log.warn(`[explain] skip ${record.id}: ${res.reason}`);
        if (res.countable) attempts = recordAttempt(attempts, record.id, res.reason, today);
        continue;
      }
      const check = checkExplainer(res.explainer, record, sourceText);
      if (!check.ok) {
        log.warn(`[explain] rejected ${record.id}: ${check.reasons.join(', ')}`);
        attempts = recordAttempt(attempts, record.id, `rejected: ${check.reasons.join(',')}`.slice(0, 200), today);
        continue;
      }
      const stored = buildStored({ record, out: res.explainer, model, status, now });
      writeExplainer(record.id, stored);
      made.push({ stored, record });
      log.log(`[explain] ok ${record.id} (${status})`);
    }

    writeAttempts(attempts);
    log.log(
      `[explain] done made=${made.length} attempted=${attempted} model=${model} usage=${JSON.stringify(usage)} cost~$${estimateCostUsd(usage).toFixed(3)} (Sonnet 5.5 単価換算)${aborted ? ` aborted=${aborted}` : ''}`
    );

    if (made.length > 0) {
      if (!autoPublish) {
        for (const { stored, record } of made) {
          pushIssueFn({
            title: `needs-review: 解説の下書き ${record.id}`,
            body: explainerToMarkdown(stored, record),
            labels: ['needs-review'],
          });
        }
      }
      pushNotification({
        type: 'explainer',
        label: autoPublish ? `解説を公開しました ${made.length} 本` : `解説の下書きが ${made.length} 本できました（確認待ち）`,
        count: made.length,
      });
    }
  } catch (e) {
    // どんな例外でもパイプラインは落とさない
    log.warn(`[explain] error: ${e?.name ?? 'Error'}: ${String(e?.message ?? '').slice(0, 200)}`);
  }
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run().then((code) => process.exit(code));
}
