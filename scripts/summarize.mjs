// 日次パイプライン Step3-5,8: 確証→要約→data反映→Issue起票（§5-2, §14-4）
// 新着ゼロ・キー未設定でも meta.json は必ず更新する（60日無活動停止の防止 §15-3）
import fs from 'node:fs';
import path from 'node:path';
import { geminiJSONWithRetry, hasApiKey, MODEL_SUMMARIZE } from './lib/gemini.mjs';

const ROOT = process.cwd();
const IN_FILE = '/tmp/triaged.json';
const ISSUES_FILE = '/tmp/pipeline_issues.json';
const MAX_PER_RUN = 8; // バッチ原則・無料枠保護（§5-3）
const TIMEOUT_MS = 15_000;
const USER_AGENT = 'AIRegAtlasBot/1.0 (+https://darari-nu.github.io/ai-reg-atlas/about/)';
const STATUS_ORDER = ['proposed', 'draft', 'consultation', 'enacted', 'in_force'];

const today = new Date().toISOString().slice(0, 10);
const nowIso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

function loadJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function pushIssue(issue) {
  const issues = loadJSON(ISSUES_FILE, []);
  issues.push(issue);
  fs.writeFileSync(ISSUES_FILE, JSON.stringify(issues, null, 2));
}

function writeMeta(status) {
  fs.writeFileSync(
    path.join(ROOT, 'data/meta.json'),
    JSON.stringify({ last_sweep: nowIso, status }, null, 2) + '\n'
  );
}

async function fetchArticleText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 20_000);
  } finally {
    clearTimeout(t);
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
    title: { type: 'STRING' },
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
  required: ['axis', 'change_type', 'title', 'summary', 'so_what', 'diff_changed'],
};

function nextId(updates, cc) {
  const prefix = `${today}-${cc}-`;
  const nums = updates.filter((u) => u.id.startsWith(prefix)).map((u) => Number(u.id.slice(-3)));
  return `${prefix}${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;
}

async function main() {
  const triaged = loadJSON(IN_FILE, []);
  if (triaged.length === 0 || !hasApiKey()) {
    writeMeta('ok');
    console.log(`[summarize] nothing to do (items=${triaged.length}, key=${hasApiKey()}), meta updated`);
    return;
  }

  const euBaseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/eu_baseline.json'), 'utf8'));
  const items = triaged.sort((a, b) => (a.priority === b.priority ? 0 : a.priority === 'high' ? -1 : 1)).slice(0, MAX_PER_RUN);

  let okCount = 0;
  let failCount = 0;

  for (const item of items) {
    const cc = item.countries[0];
    try {
      const articleText = await fetchArticleText(item.url); // 確証: 一次ソースfetch（§5-2 Step3）
      const regFile = path.join(ROOT, `data/regulations/${cc}.json`);
      const current = JSON.parse(fs.readFileSync(regFile, 'utf8'));

      const prompt = `あなたはAI法規制の専門アナリストです。以下の一次ソース本文から、更新レコードを生成してください。事実のみを書き、推測には「〜の見込み」と明記。

制約:
- summary.what / who / when_impact は各60文字以内・体言止め可
- so_what は企業のAIガバナンス担当者向けの実務インパクト1文
- EU AI Act基準（添付のeu_baseline.json）と比較し、diff_vs_euへの影響を stricter/looser/absent/unique の観点で判定。影響なしなら diff_changed=false
- 出典は与えられたURLのみ。本文にない情報を書かない
- regulation_patch は status変更 または timeline追加が確実な場合のみ。なければ null

eu_baseline: ${JSON.stringify(euBaseline.axes)}
対象国の現行データ: ${JSON.stringify({ status: current.status, approach: current.approach, regulation_name: current.regulation_name })}
記事URL: ${item.url}
一次ソース本文: ${articleText}`;

      const rec = await geminiJSONWithRetry({ model: MODEL_SUMMARIZE, prompt, schema: RESPONSE_SCHEMA });

      // 反映: updates/{YYYY-MM}.json へ追記
      const monthFile = path.join(ROOT, `data/updates/${today.slice(0, 7)}.json`);
      const updates = loadJSON(monthFile, []);
      const record = {
        id: nextId(updates, cc),
        date: today,
        country: cc,
        axis: rec.axis,
        change_type: rec.change_type,
        title: rec.title.slice(0, 120),
        summary: {
          what: rec.summary.what.slice(0, 120),
          who: rec.summary.who.slice(0, 120),
          when_impact: rec.summary.when_impact.slice(0, 120),
        },
        ...(rec.detail ? { detail: rec.detail } : {}),
        so_what: rec.so_what,
        impact: { diff_changed: rec.diff_changed, diff_note: rec.diff_note ?? '' },
        sources: [item.url], // collectが実際にfetchしたURLのみ（インジェクション対策 §8-3）
        country_anchor: `/country/${cc}/#axis-${rec.axis === 'timeline' || rec.axis === 'general' ? 'risk_classification' : rec.axis}`,
      };
      updates.push(record);
      fs.writeFileSync(monthFile, JSON.stringify(updates, null, 2) + '\n');

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
      fs.writeFileSync(regFile, JSON.stringify(current, null, 2) + '\n');

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
    const file = path.join(ROOT, 'data/regulations', f);
    const reg = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (reg.last_checked < nowIso) {
      reg.last_checked = nowIso;
      fs.writeFileSync(file, JSON.stringify(reg, null, 2) + '\n');
    }
  }

  writeMeta(failCount > 0 && okCount === 0 ? 'partial' : 'ok');
  console.log(`[summarize] done ok=${okCount} failed=${failCount}`);
}

main().catch((e) => {
  console.error(`[summarize] fatal: ${e.message}`);
  writeMeta('failed'); // 全体失敗もmetaに刻んで鮮度表示で伝える（§5-2）
  process.exit(1);
});
