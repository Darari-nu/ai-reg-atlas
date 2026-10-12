// 週1ダイジェスト原稿: 先週（月〜日・JST）の更新・解説・これからの期限から、「今週のAI規制の変化3つ」の原稿を Claude で作り、
// data/digests/YYYY-Www.md に保存する（kiji-intake の原稿の形）。公開はしない（darari の GO・検品・承認の3段を通る）。
// ANTHROPIC_API_KEY が無い・クレジット切れ・API 障害・先週の更新が0件・原稿が既にある、のときは何もせず続行する（いかなる場合も exit 0）。
// 送るのは公開データ（更新レコードの要約と公開済み解説の lead/facts）だけ。キーは SDK が環境変数から読む。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import yaml from 'js-yaml';
import { addUsage, estimateCostUsd } from './lib/explainer.mjs';
import {
  ATLAS_URL_DEFAULT,
  DEFAULT_MODEL,
  buildDigestInput,
  checkDigest,
  checkDigestFile,
  deadlineLines,
  digestToMarkdown,
  generateDigest,
  selectWeekRecords,
  targetWeek,
} from './lib/digest.mjs';
import { todayJst } from '../src/lib/upcomingDeadlines.mjs';
import { DRY_ROOT, dataPath, isDryRun, loadJSON, rootPath, writeJSON } from './lib/pipeline.mjs';

export const NOTIFY_FILE = '/tmp/pipeline_notifications.json'; // notify-discord.mjs が読む

function listJson(rel) {
  const out = [];
  for (const base of [rootPath('data', rel), path.join(DRY_ROOT, 'data', rel)]) {
    if (fs.existsSync(base)) for (const f of fs.readdirSync(base)) if (f.endsWith('.json')) out.push(path.join(base, f));
  }
  return [...new Set(out)].sort();
}

const defaultLoadRecords = () => listJson('updates').flatMap((f) => loadJSON(f, []));
const defaultLoadExplainers = () => listJson('explainers').map((f) => loadJSON(f, null)).filter((e) => e && e.status === 'published');
const defaultLoadCurated = () => loadJSON(rootPath('data', 'deadlines.json'), []);
function defaultLoadCountries() {
  const y = yaml.load(fs.readFileSync(rootPath('config', 'countries.yaml'), 'utf8'));
  return Object.fromEntries((y?.countries ?? []).map((c) => [c.code, { name_ja: c.name_ja, flag: c.flag }]));
}
const defaultExists = (file) => fs.existsSync(rootPath('data', 'digests', file)) || fs.existsSync(dataPath('digests', file));
function defaultWrite(file, text) {
  const target = dataPath('digests', file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text, { flag: 'wx' }); // 既存は上書きしない（あれば例外）
}
function defaultPushNotification(n) {
  const list = loadJSON(NOTIFY_FILE, []);
  list.push(n);
  writeJSON(NOTIFY_FILE, list);
}

/**
 * 本体。依存はすべて差し替え可能（テスト用）。戻り値は終了コード（常に 0）。
 */
export async function run({
  env = process.env,
  createClient = () => new Anthropic(), // キーは SDK が ANTHROPIC_API_KEY から読む
  loadRecords = defaultLoadRecords,
  loadExplainers = defaultLoadExplainers,
  loadCurated = defaultLoadCurated,
  loadCountries = defaultLoadCountries,
  fileExists = defaultExists,
  writeDigest = defaultWrite,
  pushNotification = defaultPushNotification,
  log = console,
  today = env.DIGEST_DATE || todayJst(), // 検証用に DIGEST_DATE=YYYY-MM-DD で「今日」を差し替えられる
} = {}) {
  try {
    if (!env.ANTHROPIC_API_KEY) {
      log.log('[digest] no key, skip');
      return 0;
    }
    const model = env.DIGEST_MODEL || DEFAULT_MODEL;
    const base = (env.DIGEST_ATLAS_URL || ATLAS_URL_DEFAULT).replace(/\/+$/, '');
    const week = targetWeek(today);
    const file = `${week.label}.md`;

    if (fileExists(file)) {
      log.log(`[digest] ${file} already exists, skip (never overwrite)`);
      return 0;
    }
    const allRecords = loadRecords();
    const records = selectWeekRecords(allRecords, week);
    if (records.length === 0) {
      log.log(`[digest] no updates in ${week.from}..${week.to}, skip (no API call)`);
      return 0;
    }

    const countries = loadCountries();
    const explainers = loadExplainers();
    const input = buildDigestInput({ records, explainers, countries, week });
    const client = createClient();
    let res = await generateDigest({ client, model, input });
    let usage = addUsage({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, res.usage ?? {});
    const logUsage = () => log.log(`[digest] model=${model} usage=${JSON.stringify(usage)} cost~$${estimateCostUsd(usage).toFixed(3)} (Sonnet 5.5 単価換算)`);
    logUsage();
    if (res.status !== 'ok') {
      log.warn(`[digest] ${res.status}: ${res.reason}`);
      return 0;
    }
    let check = checkDigest(res.digest, input);
    if (!check.ok) {
      // 検査不合格のときに限り、理由を伝えて1回だけ書き直させる（最大2回。ループにしない）
      log.warn(`[digest] rejected (try 1): ${check.reasons.join(', ')}`);
      res = await generateDigest({ client, model, input, retryReasons: check.reasons });
      usage = addUsage(usage, res.usage ?? {});
      logUsage();
      if (res.status !== 'ok') {
        log.warn(`[digest] ${res.status}: ${res.reason}`);
        return 0;
      }
      check = checkDigest(res.digest, input);
      if (!check.ok) {
        log.warn(`[digest] rejected: ${check.reasons.join(', ')}`);
        return 0;
      }
    }
    const { markdown, title } = digestToMarkdown({
      digest: res.digest,
      input,
      records,
      publishedIds: new Set(explainers.map((e) => e.id)),
      countries,
      deadlines: deadlineLines({ curated: loadCurated(), updates: allRecords, today, countries, base }),
      base,
    });
    const fcheck = checkDigestFile(markdown);
    if (!fcheck.ok) {
      log.warn(`[digest] rejected (file check): ${fcheck.reasons.join(', ')}`);
      return 0;
    }
    writeDigest(file, markdown);
    log.log(`[digest] ok ${file} "${title}"`);
    if (!isDryRun()) pushNotification({ type: 'explainer', label: '今週のダイジェスト原稿ができました', count: 1 });
  } catch (e) {
    // どんな例外でもパイプラインは落とさない
    log.warn(`[digest] error: ${e?.name ?? 'Error'}: ${String(e?.message ?? '').slice(0, 200)}`);
  }
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run().then((code) => process.exit(code));
}
