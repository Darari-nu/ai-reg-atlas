// 図4（EU AI法の日程の時間軸）の中身。日付は data/guides/eu-ai-act.json の milestones と
// data/deadlines.json から読む（ここには日付を直書きしない）。例外は「改正前の旧期限」2つだけで、
// 本体 3 章の対照表（omnibus-diff）に載っている日付。test/euTimeline.test.mjs が一致を検査する。
// 純ロジック。ファイル I/O をしない（node --test から直接読む）。

// 改正前の高リスク期限（本体 3 章の対照表の「改正前」列）
export const OLD_ANNEX3_DATE = '2026-08-02';
export const OLD_ANNEX1_DATE = '2027-08-02';

// ref: { m: ガイドの milestone の日付 } または { d: deadlines.json の id }
export const TIMELINE_ITEMS = [
  { ref: { m: '2024-08-01' }, text: 'AI法 発効' },
  { ref: { m: '2025-02-02' }, text: '禁止・AIリテラシー 適用開始' },
  { ref: { m: '2025-08-02' }, text: '汎用AI・罰則等 適用開始', sub: '汎用AIモデル提供者への罰金（第101条）は2026-08-02から' },
  { ref: { m: '2026-07-27' }, text: '改正規則 発効', kind: 'unique', chip: '改正' },
  {
    ref: { m: '2026-08-02' },
    text: '一般適用開始',
    sub: '第50条の透明性義務などが適用される日。全条文が始まる日ではありません',
    oldChip: `改正前: 附属書III系の高リスク義務はこの日の予定でした（${OLD_ANNEX3_DATE}）`,
  },
  { ref: { d: 'eu-new-prohibitions' }, text: '追加された禁止の適用開始', kind: 'stricter', chip: '追加禁止' },
  {
    ref: { d: 'eu-art50-2-transition-end' },
    text: '既存の生成AI: 第50条2項への対応期限',
    sub: '2026-08-02より前に市場に出した生成AIの提供者が対象',
  },
  {
    ref: { d: 'eu-gpai-legacy-models' },
    text: '既存の汎用AIモデル: 対応期限',
    sub: '2025-08-02より前に市場に出したモデルが対象',
    oldChip: `改正前: 附属書I系の高リスク義務はこの日の予定でした（${OLD_ANNEX1_DATE}）`,
  },
  { ref: { d: 'eu-annex3-highrisk' }, text: '附属書III系: 高リスク義務', kind: 'looser', chip: '延期', oldDate: OLD_ANNEX3_DATE },
  { ref: { d: 'eu-annex1-highrisk' }, text: '附属書I系: 高リスク義務', kind: 'looser', chip: '延期', oldDate: OLD_ANNEX1_DATE },
  { ref: { m: '2030-08-02' }, text: '公的機関向けの既存高リスク: 対応期限' },
];

/**
 * @param {{date:string}[]} milestones ガイドの milestones
 * @param {{id:string,date:string}[]} deadlines data/deadlines.json
 * @returns {{date:string, kind:string, items:object[]}[]} 日付順・同じ日付は1枚にまとめたカード
 */
export function resolveTimeline(milestones, deadlines) {
  const items = TIMELINE_ITEMS.map((it) => {
    let date;
    if (it.ref.m) {
      const m = milestones.find((x) => x.date === it.ref.m);
      if (!m) throw new Error(`図4: ガイドの milestones に ${it.ref.m} が無い`);
      date = m.date;
    } else {
      const d = deadlines.find((x) => x.id === it.ref.d);
      if (!d) throw new Error(`図4: deadlines.json に ${it.ref.d} が無い`);
      date = d.date;
    }
    return { ...it, date };
  });
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const cards = [];
  for (const it of items) {
    const last = cards[cards.length - 1];
    if (last && last.date === it.date) last.items.push(it);
    else cards.push({ date: it.date, kind: 'base', items: [it] });
  }
  const rank = { base: 0, unique: 1, looser: 2, stricter: 3 };
  for (const c of cards) {
    for (const it of c.items) if ((rank[it.kind ?? 'base'] ?? 0) > rank[c.kind]) c.kind = it.kind;
  }
  return cards;
}
