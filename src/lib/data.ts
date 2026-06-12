import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const ROOT = process.cwd();

/* ---------- 型 ---------- */

export type DiffItem = { topic: string; note: string; source: string };
export type Axis = { summary: string; detail: string; sources: string[] };
export type TimelineItem = { date: string; event: string; source: string };

export type Regulation = {
  jurisdiction: string;
  regulation_name: string;
  status: 'proposed' | 'draft' | 'consultation' | 'enacted' | 'in_force';
  approach: 'risk_based' | 'sectoral' | 'soft_law';
  is_baseline?: boolean;
  axes: {
    risk_classification: Axis;
    prohibited_uses: Axis;
    gpai_obligations: Axis;
    transparency: Axis;
    penalties: Axis;
    enforcement_body: Axis;
    timeline: TimelineItem[];
  };
  diff_vs_eu?: { stricter: DiffItem[]; looser: DiffItem[]; absent: DiffItem[]; unique: DiffItem[] };
  last_checked: string;
  last_changed: string;
};

export type Country = {
  code: string;
  name_ja: string;
  name_en?: string;
  flag: string;
  lat: number;
  lng: number;
};

export type UpdateRecord = {
  id: string;
  date: string;
  country: string;
  axis: string;
  change_type: string;
  title: string;
  summary: { what: string; who: string; when_impact: string };
  detail?: string;
  so_what: string;
  impact: { diff_changed: boolean; diff_note?: string };
  sources: string[];
  country_anchor: string;
};

export type Meta = { last_sweep: string; status: 'ok' | 'partial' | 'failed' };

/* ---------- 読み込み（ビルド時に静的展開） ---------- */

export function getCountries(): Country[] {
  const doc = yaml.load(fs.readFileSync(path.join(ROOT, 'config/countries.yaml'), 'utf8')) as {
    countries: Country[];
  };
  return doc.countries;
}

export function getRegulation(cc: string): Regulation {
  return JSON.parse(fs.readFileSync(path.join(ROOT, `data/regulations/${cc}.json`), 'utf8'));
}

export function getAllRegulations(): Regulation[] {
  return getCountries().map((c) => getRegulation(c.code));
}

export function getUpdates(): UpdateRecord[] {
  const dir = path.join(ROOT, 'data/updates');
  const all: UpdateRecord[] = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    all.push(...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  }
  return all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function getMeta(): Meta {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'data/meta.json'), 'utf8'));
}

/* ---------- ラベル ---------- */

export const AXIS_LABELS: Record<string, string> = {
  risk_classification: 'リスク分類',
  prohibited_uses: '禁止用途',
  gpai_obligations: '汎用AI義務',
  transparency: '透明性',
  penalties: '罰則',
  enforcement_body: '執行体制',
  timeline: 'タイムライン',
  general: '全般',
};

export const STATUS_LABELS: Record<string, string> = {
  proposed: '提案',
  draft: 'ドラフト',
  consultation: '意見募集',
  enacted: '成立',
  in_force: '施行中',
};

export const APPROACH_LABELS: Record<string, string> = {
  risk_based: 'リスクベース',
  sectoral: '分野別',
  soft_law: 'ソフトロー',
};

export const DIFF_LABELS: Record<string, string> = {
  stricter: 'EUより厳しい',
  looser: 'EUより緩い',
  absent: '規定なし',
  unique: '独自規定',
};

export const DIFF_READING: Record<string, string> = {
  stricter: 'EU準拠では不足。追加対応',
  looser: 'EU準拠でカバー済み',
  absent: 'EU準拠で自動カバー',
  unique: '見落とし注意。個別対応',
};

export const CHANGE_TYPE_LABELS: Record<string, string> = {
  new_regulation: '新規制',
  status_change: 'ステータス変更',
  guideline_draft: 'ガイドライン案',
  deadline_change: '期限変更',
  diff_change: '差分変化',
  other: 'その他',
};

export const DIFF_KEYS = ['stricter', 'looser', 'absent', 'unique'] as const;
export const AXIS_KEYS = [
  'risk_classification',
  'prohibited_uses',
  'gpai_obligations',
  'transparency',
  'penalties',
  'enforcement_body',
] as const;

/* ---------- パス ---------- */

// base付きの内部リンク（GitHub Pagesプロジェクトページ対応）
export function withBase(p: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}${p}`;
}

/* ---------- 鮮度 ---------- */

export function isRecent(iso: string, days = 7): boolean {
  return Date.now() - new Date(iso).getTime() < days * 24 * 60 * 60 * 1000;
}

export function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
