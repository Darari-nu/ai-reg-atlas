// 情報源ごとの稼働監視（純関数）。collect が成否を記録し、失敗が数日続いたら「止まった」、
// 止まっていたものが成功したら「復旧した」のイベントを返す。通知・Issue化は呼び出し側の仕事。
// 状態の形: { [key]: { label, country, fail_days, first_failed, last_failed, last_ok, last_reason, alerted } }
// 日付は UTC の YYYY-MM-DD。同じ日に何度失敗しても fail_days は1日ぶんしか増やさない。

// 何日続けて失敗したら「止まった」と通知するか
export const SOURCE_DOWN_DAYS = Number(process.env.SOURCE_DOWN_DAYS || 3);

/**
 * 1つの情報源の成否を記録する。入力の health は書き換えず、新しい health とイベント（無ければ null）を返す。
 * @returns {{ health: object, event: null | { type: 'down'|'recovered', key: string, label: string, country: string, since: string|null, reason: string|null, days: number } }}
 */
export function recordOutcome(health, key, { ok, reason = null, label = key, country = '', date }, threshold = SOURCE_DOWN_DAYS) {
  const prev = health?.[key] ?? {};
  const entry = {
    label,
    country,
    fail_days: prev.fail_days ?? 0,
    first_failed: prev.first_failed ?? null,
    last_failed: prev.last_failed ?? null,
    last_ok: prev.last_ok ?? null,
    last_reason: prev.last_reason ?? null,
    alerted: prev.alerted ?? false,
  };
  let event = null;

  if (ok) {
    if (entry.alerted) {
      event = { type: 'recovered', key, label, country, since: entry.first_failed, reason: entry.last_reason, days: entry.fail_days };
    }
    entry.fail_days = 0;
    entry.first_failed = null;
    entry.last_failed = null;
    entry.last_reason = null;
    entry.alerted = false;
    entry.last_ok = date;
  } else {
    if (entry.last_failed !== date) {
      entry.fail_days += 1; // 同じ日の2回目以降は数えない
      if (entry.fail_days === 1 || !entry.first_failed) entry.first_failed = date;
    }
    entry.last_failed = date;
    entry.last_reason = reason;
    if (entry.fail_days >= threshold && !entry.alerted) {
      entry.alerted = true;
      event = { type: 'down', key, label, country, since: entry.first_failed, reason, days: entry.fail_days };
    }
  }

  return { health: { ...(health ?? {}), [key]: entry }, event };
}

/** config から消えた情報源のエントリを落とす */
export function pruneHealth(health, activeKeys) {
  const active = activeKeys instanceof Set ? activeKeys : new Set(activeKeys);
  const out = {};
  for (const [key, entry] of Object.entries(health ?? {})) if (active.has(key)) out[key] = entry;
  return out;
}
