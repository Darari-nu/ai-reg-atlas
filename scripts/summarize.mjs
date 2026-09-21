// 日次パイプライン Step3-5,8: 確証→要約→data反映→Issue起票（§5-2, §14-4）
// 新着ゼロ・キー未設定でも meta.json は必ず更新する（60日無活動停止の防止 §15-3）
import fs from 'node:fs';
import path from 'node:path';
import { FALLBACK_SUMMARIZE, geminiJSONWithRetry, geminiStats, hasApiKey, isGeminiStop, MODEL_SUMMARIZE } from './lib/gemini.mjs';
import {
  JINA_READER_PREFIX,
  RECENCY_DAYS,
  appendDrop,
  buildUpdateRecord,
  dedupeByEvent,
  ensureJapaneseTitle,
  existingEventKeys,
  isGoogleNewsUrl,
  loadJSON,
  mechanicalGate,
  publicationDateGate,
  pushIssue,
  readDataJSON,
  readerBody,
  writeDataJSON,
} from './lib/pipeline.mjs';
import {
  dequeueItems,
  enqueue,
  markSeen,
  mergeByUrl,
  pruneSeenUrls,
  readState,
  sortForSummarize,
  toQueueItem,
  writeState,
} from './lib/state.mjs';

const ROOT = process.cwd();
const IN_FILE = '/tmp/triaged.json';
const SEEN_URLS_NAME = 'seen_urls.json';
const QUEUE_NAME = 'queue.json';
// 機械ゲート落ちのうち記憶する理由（blocked-or-js-only-page は一時的なので SKIP_VERDICTS には入れない）
const GATE_SEEN_REASONS = ['body-too-short', 'no-ai-reg-keyword', 'blocked-or-js-only-page'];
const MAX_PER_RUN = Number(process.env.SUMMARIZE_MAX_PER_RUN || 8); // バッチ原則・無料枠保護（§5-3）
const TIMEOUT_MS = 15_000;
const JINA_TIMEOUT_MS = 30_000; // 中継は本体取得＋変換で遅い
const USER_AGENT = 'AIRegAtlasBot/1.0 (+https://darari-nu.com/atlas/about/)';
const STATUS_ORDER = ['proposed', 'draft', 'consultation', 'enacted', 'in_force'];

const today = process.env.SWEEP_DATE || new Date().toISOString().slice(0, 10);
const nowIso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

function writeMeta(status) {
  writeDataJSON(['meta.json'], { last_sweep: nowIso, status });
}

async function fetchText(url, timeoutMs = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

// 直接取れないときだけ r.jina.ai 経由で読む（cac.gov.cn 等は Actions ランナーの IP を弾く。collect の scrape_hash と同じ対策）
async function fetchArticleText(url) {
  try {
    const html = await fetchText(url);
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 20_000);
  } catch (directErr) {
    try {
      const text = readerBody(await fetchText(JINA_READER_PREFIX + url, JINA_TIMEOUT_MS))
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // 画像リンクは本文ではないので落とす
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 20_000);
      console.warn(`[summarize] fetched via jina proxy (direct: ${directErr.message}): ${url}`);
      return text;
    } catch {
      throw directErr; // 直接fetchのエラーの方が原因診断に有用
    }
  }
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    axis: {
      type: 'STRING',
      enum: ['risk_classification', 'prohibited_uses', 'gpai_obligations', 'transparency', 'penalties', 'enforcement_body', 'timeline', 'general'],
    },
    change_type: {
      type: 'STRING',
      enum: ['new_regulation', 'status_change', 'guideline_draft', 'deadline_change', 'diff_change', 'other'],
    },
    title: { type: 'STRING', description: '日本語の見出し（40文字前後）。原文が英語でも必ず日本語にする' },
    summary: {
      type: 'OBJECT',
      properties: {
        what: { type: 'STRING' },
        who: { type: 'STRING' },
        when_impact: { type: 'STRING' },
      },
      required: ['what', 'who', 'when_impact'],
    },
    detail: { type: 'STRING' },
    so_what: { type: 'STRING' },
    diff_changed: { type: 'BOOLEAN' },
    diff_note: { type: 'STRING' },
    usable: { type: 'BOOLEAN' },
    publication_date: { type: 'STRING', nullable: true },
    effective_date: { type: 'STRING', nullable: true },
    deadline_date: { type: 'STRING', nullable: true },
    regulation_patch: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        status: { type: 'STRING', enum: ['proposed', 'draft', 'consultation', 'enacted', 'in_force'] },
        timeline_add: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              date: { type: 'STRING' },
              event: { type: 'STRING' },
              source: { type: 'STRING' },
            },
            required: ['date', 'event', 'source'],
          },
        },
      },
    },
  },
  required: ['axis', 'change_type', 'title', 'summary', 'so_what', 'diff_changed', 'usable', 'publication_date', 'effective_date', 'deadline_date'],
};

// 先頭から limit 件ぶん通るまで fetch する。fetch すらしていない残りは untouched（attempts を増やさず繰り越す）
async function prepareItems(ordered, seenUrls, limit) {
  const gated = [];
  const retry = []; // fetch失敗（一時的なので attempts+1 で繰り越す）
  let cursor = 0;
  for (; cursor < ordered.length && gated.length < limit; cursor++) {
    const item = ordered[cursor];
    try {
      new URL(item.url);
    } catch {
      appendDrop({ ...item, reason: 'invalid-url' });
      continue;
    }
    let articleText = '';
    try {
      articleText = await fetchArticleText(item.url);
    } catch (e) {
      appendDrop({ ...item, reason: `fetch-failed:${e.message}` });
      retry.push(item);
      continue;
    }
    const gate = mechanicalGate(item, articleText);
    if (!gate.ok) {
      appendDrop({ ...item, reason: gate.reason });
      if (GATE_SEEN_REASONS.includes(gate.reason)) markSeen(seenUrls, item.url, gate.reason, today); // ゲート落ちは queue に入れない
      continue;
    }
    gated.push({ ...item, articleText });
  }
  return {
    gated: dedupeByEvent(gated, existingEventKeys({ days: RECENCY_DAYS })),
    retry,
    untouched: ordered.slice(cursor),
  };
}

async function main() {
  const triaged = loadJSON(IN_FILE, []);
  // 前日までのあふれ（TTL7日・attempts<3）と今日の triaged を混ぜる。URL重複は今日の情報を優先
  const carried = dequeueItems(readState(QUEUE_NAME, []), today);
  const merged = mergeByUrl(carried, triaged);
  if (merged.length === 0 || !hasApiKey()) {
    // 生き残りが1件も無いなら、期限切れ・打ち切り済みのエントリだけ残っている状態なので掃除する
    if (merged.length === 0) writeState(QUEUE_NAME, carried);
    writeMeta('ok');
    console.log(`[summarize] nothing to do (items=${merged.length}, key=${hasApiKey()}), meta updated`);
    return;
  }

  const euBaseline = readDataJSON(['eu_baseline.json'], {});
  const seenUrls = readState(SEEN_URLS_NAME, {});
  // 並び: high→low、同順位は古い繰り越しから（＝今日の high は昨日の low より先）
  const ordered = sortForSummarize(merged, today);
  const { gated: items, retry, untouched } = await prepareItems(ordered, seenUrls, MAX_PER_RUN);
  const carryOver = [
    ...untouched.map((i) => toQueueItem(i, { today })), // fetch していないので attempts は増やさない
    ...retry.map((i) => toQueueItem(i, { today, bumpAttempts: true })),
  ];

  let okCount = 0;
  let failCount = 0;

  for (const [idx, item] of items.entries()) {
    const cc = item.countries[0];
    try {
      if (isGoogleNewsUrl(item.url)) {
        appendDrop({ ...item, reason: 'google-news-source' });
        continue;
      }
      const articleText = item.articleText; // 確証: 実URLfetch済み本文（§5-2 Step3）
      const current = readDataJSON(['regulations', `${cc}.json`], {});

      const prompt = `あなたはAI法規制の専門アナリストです。以下の一次ソース本文から、更新レコードを生成してください。事実のみを書き、推測には「〜の見込み」と明記。

制約:
- usable=false は、本文がAI規制の新着更新として使えない場合、または出典本文から日付・事象を確認できない場合
- publication_date は公表日・発表日。YYYY-MM-DDで本文から抽出し、不明なら null
- effective_date は施行日、deadline_date は期限日。本文に無ければ null
- title は**必ず日本語**の見出し（40文字前後）。一次ソースが英語でも翻訳する。「主体、何をした」の形（例: 「欧州データ保護会議（EDPB）、GDPR制裁金の算定ガイドラインを採択」）。機関名は日本語の通称に略称を括弧で添える
- summary.what / who / when_impact は各60文字以内・体言止め可
- so_what は企業のAIガバナンス担当者向けの実務インパクト1文
- EU AI Act基準（添付のeu_baseline.json）と比較し、diff_vs_euへの影響を stricter/looser/absent/unique の観点で判定。影響なしなら diff_changed=false
- 出典は与えられたURLのみ。本文にない情報を書かない
- regulation_patch は status変更 または timeline追加が確実な場合のみ。なければ null

eu_baseline: ${JSON.stringify(euBaseline.axes)}
対象国の現行データ: ${JSON.stringify({ status: current.status, approach: current.approach, regulation_name: current.regulation_name })}
記事URL: ${item.url}
一次ソース本文: ${articleText}`;

      const rec = await geminiJSONWithRetry({ model: MODEL_SUMMARIZE, prompt, schema: RESPONSE_SCHEMA, fallbackModels: FALLBACK_SUMMARIZE });
      // 見出しが日本語でなければ summary.what に差し替える（2026-09-21 に英語の見出しがサイトに出た）
      const jaTitle = ensureJapaneseTitle(rec.title, rec.summary?.what);
      if (jaTitle.replaced) console.warn(`[summarize] title was not Japanese, replaced with summary.what: ${item.url}`);
      rec.title = jaTitle.title;
      if (rec.usable === false) {
        appendDrop({ ...item, country: cc, reason: 'gemini-unusable' });
        markSeen(seenUrls, item.url, 'gemini-unusable', today);
        continue;
      }
      const pubGate = publicationDateGate(rec.publication_date, today);
      if (!pubGate.ok) {
        appendDrop({ ...item, country: cc, reason: pubGate.reason });
        markSeen(seenUrls, item.url, pubGate.reason, today); // stale / missing-publication-date
        continue;
      }

      // 反映: updates/{YYYY-MM}.json へ追記
      const month = rec.publication_date.slice(0, 7);
      const updates = readDataJSON(['updates', `${month}.json`], []);
      const record = buildUpdateRecord({ updates, country: cc, item, rec, discoveredAt: today }); // sourcesはcollectがfetchしたURLのみ
      updates.push(record);
      writeDataJSON(['updates', `${month}.json`], updates);

      // regulation_patch: 矛盾チェック付き適用（§5-4）
      let changed = false;
      if (rec.regulation_patch) {
        const p = rec.regulation_patch;
        if (p.status && p.status !== current.status) {
          if (STATUS_ORDER.indexOf(p.status) < STATUS_ORDER.indexOf(current.status)) {
            pushIssue({
              title: `needs-review: ${cc} のstatus後退提案（${current.status}→${p.status}）`,
              body: `自動上書きせず保留。出典: ${item.url}`,
              labels: ['needs-review'],
            });
          } else {
            current.status = p.status;
            changed = true;
          }
        }
        for (const t of p.timeline_add ?? []) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(t.date) && !current.axes.timeline.some((x) => x.date === t.date && x.event === t.event)) {
            current.axes.timeline.push({ date: t.date, event: t.event, source: item.url });
            changed = true;
          }
        }
      }
      current.last_checked = nowIso;
      if (changed) current.last_changed = nowIso;
      writeDataJSON(['regulations', `${cc}.json`], current);

      if (rec.diff_changed) {
        pushIssue({
          title: `diff-change: ${cc} ${record.title}`,
          body: `${rec.diff_note ?? ''}\n\n出典: ${item.url}\nフィードID: ${record.id}`,
          labels: ['diff-change'],
        });
      }
      okCount++;
      console.log(`[summarize] ok ${record.id} (${item.url})`);
    } catch (e) {
      if (isGeminiStop(e)) {
        // 待ち予算切れ・全モデル枯渇: 残りは呼んでも無駄。件別Issueを積まず1件にまとめて打ち切る
        const rest = items.slice(idx);
        for (const r of rest) appendDrop({ ...r, country: r.countries[0], reason: 'gemini-unavailable' });
        carryOver.push(...rest.map((r) => toQueueItem(r, { today, bumpAttempts: true }))); // 翌日に回す
        failCount += rest.length;
        console.warn(`[summarize] stop: ${e.message} (remaining ${rest.length} items dropped as gemini-unavailable)`);
        pushIssue({
          title: `needs-review: Gemini利用不可で要約を打ち切り（${rest.length}件）`,
          body: `理由: ${e.message}\n\n未処理URL:\n${rest.map((r) => `- ${r.url}`).join('\n')}`,
          labels: ['needs-review'],
        });
        break;
      }
      failCount++;
      console.warn(`[summarize] skip ${item.url} (${e.message})`);
      pushIssue({
        title: `needs-review: 要約スキップ（${cc}）`,
        body: `URL: ${item.url}\n理由: ${e.message}`,
        labels: ['needs-review'],
      });
    }
  }

  // 巡回していない国も last_checked を更新
  for (const f of fs.readdirSync(path.join(ROOT, 'data/regulations'))) {
    const reg = readDataJSON(['regulations', f], {});
    if (reg.last_checked < nowIso) {
      reg.last_checked = nowIso;
      writeDataJSON(['regulations', f], reg);
    }
  }

  writeState(SEEN_URLS_NAME, pruneSeenUrls(seenUrls, today));
  const { queue: nextQueue, dropped: queueDropped } = enqueue(carryOver, today);
  writeState(QUEUE_NAME, nextQueue);
  console.log(`[summarize] queue in=${carried.length} out=${nextQueue.length}${queueDropped ? ` over_limit_dropped=${queueDropped}` : ''}`);

  writeMeta(failCount > 0 && okCount === 0 ? 'partial' : 'ok');
  // drop理由の内訳をログに出す（observability。/tmp/dropped.json は collect/triage/summarize 全段の累積）
  try {
    const drops = JSON.parse(fs.readFileSync('/tmp/dropped.json', 'utf8'));
    const hist = {};
    for (const d of drops) hist[d.reason] = (hist[d.reason] || 0) + 1;
    console.log(`[summarize] drops total=${drops.length} by_reason=${JSON.stringify(hist)}`);
    for (const d of drops.slice(0, 12)) console.log(`[summarize]   drop ${d.reason} | ${(d.url || '').slice(0, 80)}`);
  } catch {
    console.log('[summarize] no drop log');
  }
  console.log(`[summarize] gemini ${JSON.stringify(geminiStats())}`);
  console.log(`[summarize] done ok=${okCount} failed=${failCount}`);
}

main().catch((e) => {
  console.error(`[summarize] fatal: ${e.message}`);
  writeMeta('failed'); // 全体失敗もmetaに刻んで鮮度表示で伝える（§5-2）
  process.exit(1);
});
