import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import {
  ageTier,
  countWithin,
  daysAgo,
  fmtDaysAgo,
  globeMarkers,
  latestDateByCountry,
  sortByDiscovery,
} from './freshness.mjs';
import { deriveTimelineEvents, mergeTimeline } from './derivedTimeline.mjs';
import { buildUpcomingDeadlines, todayJst } from './upcomingDeadlines.mjs';

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

// 国の下位区分（米国の州など）。地球儀のマーカーに出すための最小限の情報
export type Subregion = {
  code: string;
  name_ja: string;
  name_en?: string;
  lat: number;
  lng: number;
  note: string;
  status?: Regulation['status'];
  sources: string[];
};

export type Country = {
  code: string;
  name_ja: string;
  name_en?: string;
  flag: string;
  lat: number;
  lng: number;
  subregions?: Subregion[];
};

export type UpdateRecord = {
  id: string;
  date: string;
  country: string;
  axis: string;
  change_type: string;
  legal_stage?: string;
  source_kind?: 'official' | 'media';
  title: string;
  summary: { what: string; who: string; when_impact: string };
  detail?: string;
  so_what: string;
  impact: { diff_changed: boolean; diff_note?: string };
  sources: string[];
  country_anchor: string;
  discovered_at?: string;   // 発見日。古いレコードには無いので date でフォールバックする
  canonical_event?: string;
  publication_date?: string;
  effective_date?: string | null;
  deadline_date?: string | null;
};

// 地球儀のマーカー（国 → その国の小地域の順に並ぶ）
export type GlobeMarker = {
  code: string;
  kind: 'country' | 'subregion';
  name_ja: string;
  flag: string;
  lat: number;
  lng: number;
  href: string;
  ageDays: number | null;
};

// 年表の1項目。種データと更新フィード由来の派生イベントを同じ形で扱う
export type TimelineEvent = {
  date: string;
  event: string;
  source: string;
  kind: 'seed' | 'derived' | 'derived-effective' | 'derived-deadline';
  scheduled: boolean;
  updateId?: string;
};

// 解説記事（Claude による下書き → darari の OK で published）。サイトに出るのは published だけ
export type Explainer = {
  id: string;
  status: 'draft' | 'published';
  model: string;
  created_at: string;
  published_at?: string;
  record_id: string;
  source_kind: 'official' | 'media';
  headline: string;
  lead: string;
  facts: { text: string; source_url: string }[];
  who_is_affected: string;
  japan_impact: string;
  next_steps: string;
  unknowns: string[];
  glossary: { term: string; explanation: string }[];
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

// published の解説だけを返す（下書きは絶対にサイトに出さない）。data/explainers が無ければ空
let explainerCache: Explainer[] | null = null;
export function getPublishedExplainers(): Explainer[] {
  if (explainerCache) return explainerCache;
  const dir = path.join(ROOT, 'data/explainers');
  const all: Explainer[] = [];
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const ex = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Explainer;
      if (ex.status === 'published') all.push(ex);
    }
  }
  explainerCache = all;
  return all;
}

export function hasExplainer(updateId: string): boolean {
  return getPublishedExplainers().some((e) => e.id === updateId);
}

export function explainerPath(id: string): string {
  return `/explain/${id}/`;
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

/* ---------- 鮮度・発見日順（純ロジックは freshness.mjs） ---------- */

// 純ロジックの再エクスポート（後続ページはここから import する）
export { daysAgo, fmtDaysAgo, countWithin, ageTier, sortByDiscovery };

// ビルド時の日付。サイトは毎日再ビルドされるので「今日」として扱ってよい
export function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

// 発見日の新しい順。getUpdates() の並び（公表日順）は変えない
export function getUpdatesByDiscovery(): UpdateRecord[] {
  return sortByDiscovery(getUpdates()) as UpdateRecord[];
}

export function getUpdatesForCountry(cc: string): UpdateRecord[] {
  return getUpdatesByDiscovery().filter((u) => u.country === cc);
}

// 国ごとの最新の発見日
export function getLatestByCountry(): Record<string, string> {
  return latestDateByCountry(getUpdates());
}

export function latestUpdateDate(cc: string): string | null {
  return getLatestByCountry()[cc] ?? null;
}

// その国が最後に動いてから何日経ったか。更新レコードが無ければ null
export function updateAgeDays(cc: string, today: string = todayYmd()): number | null {
  const latest = latestUpdateDate(cc);
  return latest ? daysAgo(latest, today) : null;
}

// 更新レコードの飛び先。軸に紐づかないものは国ページの更新欄へ送る
// （既存レコードの country_anchor が一律 #axis-risk_classification になっているのを表示側で矯正する）
export function updateAnchor(u: UpdateRecord): string {
  if (u.axis === 'general' || u.axis === 'timeline') return `/country/${u.country}/#updates`;
  return u.country_anchor;
}

export function getSubregions(cc: string): Subregion[] {
  return getCountries().find((c) => c.code === cc)?.subregions ?? [];
}

// 地球儀のマーカー。順序は国 → その国の小地域（DOM順＝Tab順）
export function getGlobeMarkers(today: string = todayYmd()): GlobeMarker[] {
  const markers = globeMarkers(getCountries(), getLatestByCountry(), today) as Array<
    Omit<GlobeMarker, 'href'> & { path: string }
  >;
  return markers.map(({ path, ...m }) => ({ ...m, href: withBase(path) }));
}

// 国の年表＝種データ（regulations の axes.timeline）＋ 更新フィード由来の派生イベント
export function getCountryTimeline(cc: string): TimelineEvent[] {
  const seed = getRegulation(cc).axes.timeline;
  return mergeTimeline(seed, deriveTimelineEvents(getUpdatesForCountry(cc), seed)) as TimelineEvent[];
}

/* ---------- これからの期限 ---------- */

// 人が確認した期限（data/deadlines.json）。「やること」は解釈（AIによる整理）として出す
export type CuratedDeadline = {
  id: string;
  country: string;
  date: string;
  kind: 'obligation_applies' | 'transition_end' | 'in_force' | 'consultation_deadline' | 'other';
  title: string;
  what_to_do: string[];
  applies_to: string;
  sources: string[];
  verified: string;
};

export type UpcomingDeadline = {
  id: string;
  source: 'curated' | 'auto';
  country: string;
  date: string;
  daysLeft: number;
  kind: CuratedDeadline['kind'];
  title: string;
  sources: string[];
  what_to_do?: string[];
  applies_to?: string;
  verified?: string;
  updateId?: string;
  hasExplainer?: boolean;
  whenImpact?: string;
};

export const DEADLINE_KIND_LABELS: Record<string, string> = {
  obligation_applies: '義務の適用',
  transition_end: '移行期間の終了',
  in_force: '施行',
  consultation_deadline: '意見募集の締切',
  other: '期限',
};

export function getCuratedDeadlines(): CuratedDeadline[] {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'data/deadlines.json'), 'utf8'));
}

// 今日（JST）以降の期限を日付順に。人が確認した分＋意見募集・案の更新レコードの effective_date / deadline_date（自動）
export function getUpcomingDeadlines(today: string = todayJst()): UpcomingDeadline[] {
  return buildUpcomingDeadlines({
    curated: getCuratedDeadlines(),
    updates: getUpdates(),
    today,
    explainerIds: new Set(getPublishedExplainers().map((e) => e.id)),
  }) as UpcomingDeadline[];
}
