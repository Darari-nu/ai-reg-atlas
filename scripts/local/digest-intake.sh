#!/bin/bash
# 週1ダイジェスト原稿を、この Mac から HP リポの 10_drafts/65_外部原稿/ に「置くだけ」する（launchd から週1で呼ぶ）。
#   - Atlas を git pull --ff-only
#   - data/digests/*.md のうち、状態ファイルに無いものを HP 側へコピーして状態ファイルに追記
#   - HP 側に同じ週の原稿（*_atlas-digest-YYYY-Www.md）があればコピーしない（状態ファイルには記録する）
#   - HP の置き場の親フォルダ（10_drafts）が無い＝DevSSD が未マウントなら何もしない
# あとは dispatch の巡回（15分ごとの intake.mjs --scan）が企画室に G-xx として登録する。HP のコミットはこのスクリプトでは行わない。
#
# 環境変数で差し替えられる（検査・別環境用。既定は本番の場所）:
#   ATLAS_DIR   Atlas のリポジトリ
#   HP_INBOX    コピー先（HP リポの 10_drafts/65_外部原稿）
#   STATE_FILE  コピー済みの週を覚える状態ファイル
#   LOG_FILE    ログ
#   ATLAS_PULL  0 なら git pull しない（検査用）
set -u

ATLAS_DIR="${ATLAS_DIR:-/Volumes/DevSSD/Vibe_Website/260612_ai-reg-atlas}"
HP_INBOX="${HP_INBOX:-/Volumes/DevSSD/Vibe_Website/260805_Darari-nu_HP/10_drafts/65_外部原稿}"
STATE_FILE="${STATE_FILE:-$HOME/.local/state/ai-reg-atlas/digest-intake.txt}"
LOG_FILE="${LOG_FILE:-$HOME/Library/Logs/ai-reg-atlas-digest-intake.log}"
ATLAS_PULL="${ATLAS_PULL:-1}"

# launchd の PATH は最小限なので node / git の場所を足す
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null
log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG_FILE"; }

if [ ! -d "$ATLAS_DIR/.git" ] && [ ! -f "$ATLAS_DIR/.git" ]; then
  log "skip: Atlas が見つからない（DevSSD が未マウント？）: $ATLAS_DIR"
  exit 0
fi
if [ ! -d "$(dirname "$HP_INBOX")" ]; then
  log "skip: HP の置き場の親フォルダが無い（DevSSD が未マウント？）: $(dirname "$HP_INBOX")"
  exit 0
fi

if [ "$ATLAS_PULL" != "0" ]; then
  if ! git -C "$ATLAS_DIR" pull --ff-only -q >> "$LOG_FILE" 2>&1; then
    log "warn: git pull --ff-only に失敗（手元の状態のまま続ける）"
  fi
fi

DIGESTS="$ATLAS_DIR/data/digests"
if [ ! -d "$DIGESTS" ]; then
  log "nothing: data/digests が無い"
  exit 0
fi

mkdir -p "$(dirname "$STATE_FILE")" "$HP_INBOX"
touch "$STATE_FILE"

# 週ラベル YYYY-Www から、HP 側のファイル名の日付（その週の次の月曜＝配信する月曜）を出す
release_date() {
  node -e '
    const [y, w] = process.argv[1].split("-W").map(Number);
    const jan4 = Date.UTC(y, 0, 4);
    const dow = (new Date(jan4).getUTCDay() + 6) % 7;
    const mon = jan4 - dow * 86400000 + (w - 1) * 7 * 86400000;
    console.log(new Date(mon + 7 * 86400000).toISOString().slice(0, 10).replace(/-/g, ""));
  ' "$1" 2>/dev/null
}

copied=0
for f in "$DIGESTS"/*.md; do
  [ -e "$f" ] || continue
  name="$(basename "$f")"          # 2026-W41.md
  week="${name%.md}"               # 2026-W41
  if grep -qxF "$name" "$STATE_FILE"; then continue; fi

  # HP 側に同じ週の原稿が既にあれば置かない
  existing="$(ls "$HP_INBOX"/*_atlas-digest-"$week".md 2>/dev/null | head -n 1)"
  if [ -n "$existing" ]; then
    log "skip: HP 側に既にある: $(basename "$existing")"
    echo "$name" >> "$STATE_FILE"
    continue
  fi

  d="$(release_date "$week")"
  if [ -z "$d" ]; then
    log "warn: 日付を出せない（node が無い？）: $name"
    continue
  fi
  dest="$HP_INBOX/${d}_atlas-digest-${week}.md"
  if cp -n "$f" "$dest"; then
    echo "$name" >> "$STATE_FILE"
    log "copied: $name -> $dest"
    copied=$((copied + 1))
  else
    log "warn: コピーに失敗: $name"
  fi
done

log "done: copied=$copied"
exit 0
