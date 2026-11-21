// summarize がその回に新しく保存した更新レコードから、Discord 通知（type: 'updates'）を作る純関数。
// リンクは自サイトの更新カード（UpdateCard の id は `u-<record.id>`）。1件も無ければ null（通知を積まない）。
import { siteUrl } from './siteUrl.mjs';

/** records: 新しく保存した更新レコード。flagOf: 国コード→国旗。 */
export function buildUpdatesNotification(records, { flagOf = () => '', nameOf = () => '', env = process.env } = {}) {
  const list = (records ?? []).filter((r) => r && r.id && r.title);
  if (list.length === 0) return null;
  return {
    type: 'updates',
    items: list.map((r) => ({
      flag: flagOf(r.country) || '',
      country_ja: nameOf(r.country) || '',
      title: r.title,
      url: siteUrl(`/updates/#u-${r.id}`, env),
    })),
  };
}

/**
 * 通知ファイルに updates 通知を1件足す。何があっても例外を投げない（通知は付け足しでパイプラインの終了コードを変えない）。
 * read(): ファイルの中身（文字列）／write(text)。非配列・壊れた中身は [] から始める。失敗は URL を含まない短い警告だけ。
 */
export function pushUpdatesNotification(records, { flagOf, nameOf, read, write, log = console, env = process.env } = {}) {
  try {
    const note = buildUpdatesNotification(records, { flagOf, nameOf, env });
    if (!note) return false;
    let list = [];
    try {
      const parsed = JSON.parse(read());
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      // ファイル無し・壊れていれば [] から
    }
    list.push(note);
    write(JSON.stringify(list, null, 2));
    return true;
  } catch (e) {
    log.warn(`[summarize] updates notification skipped (${e?.name ?? 'Error'})`);
    return false;
  }
}
