// 解説ページ（data/guides/*.json）の表示用の小道具。本体と子ページで共有する。
import type { Guide, GuideBlock } from './data';

// 出典URL → 短い表示名（EUR-Lex は条・附属書・前文まで、欧州委員会は「欧州委員会」）
export function srcLabel(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return '出典';
  }
  const frag = u.hash.replace(/^#/, '');
  if (u.hostname === 'eur-lex.europa.eu') {
    const amend = url.includes('32026R1744');
    const law = amend ? '改正規則2026/1744' : 'AI法';
    let m;
    if ((m = frag.match(/^art_(\d+)$/))) return `${law} 第${m[1]}条`;
    if ((m = frag.match(/^anx_([IVX]+)$/))) return `${law} 附属書${m[1]}`;
    if ((m = frag.match(/^rct_(\d+)$/))) return `${law} 前文${m[1]}`;
    return `${law}（EUR-Lex）`;
  }
  if (u.hostname.endsWith('ec.europa.eu')) return '欧州委員会';
  return u.hostname.replace(/^www\./, '');
}

export const uniq = <T,>(xs: T[]) => [...new Set(xs)];

/** 同じ表示名のURLは1つにまとめた {label, url} の一覧 */
export function labeledSources(urls: string[]): { label: string; url: string }[] {
  const seen = new Map<string, string>();
  for (const url of uniq(urls)) {
    const label = srcLabel(url);
    if (!seen.has(label)) seen.set(label, url);
  }
  return [...seen.entries()].map(([label, url]) => ({ label, url }));
}

export function blockSources(b: GuideBlock, g: Guide): string[] {
  switch (b.type) {
    case 'p':
    case 'list':
      return b.sources;
    case 'note':
      return b.sources ?? [];
    case 'table':
      return b.rows.flatMap((r) => r.sources);
    case 'risk_tiers':
      return b.tiers.flatMap((t) => t.sources);
    case 'checklist':
    case 'faq':
      return b.items.flatMap((i) => i.sources);
    case 'flow':
      return b.steps.flatMap((s) => s.sources);
    case 'schedule':
      return g.milestones.flatMap((m) => m.sources);
    default:
      return [];
  }
}
