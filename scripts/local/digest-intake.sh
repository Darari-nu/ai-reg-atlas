#!/bin/bash
# 週1ダイジェスト原稿を、この Mac から HP リポの 10_drafts/65_外部原稿/ に「置くだけ」する（launchd から週1で呼ぶ）。
#   - Atlas を `git fetch origin main`（作業ツリーは pull しない。主チェックアウトがどのブランチでも影響を受けない）
#   - origin/main の data/digests/*.md のうち、状態ファイルに無いものを HP 側へ書き出して状態ファイルに追記
#   - HP 側に同じ週の原稿（*_atlas-digest-YYYY-Www.md）があればコピーしない（状態ファイルには記録する）
#   - HP の置き場の親フォルダ（10_drafts）が無い＝DevSSD が未マウントなら何もしない。fetch に失敗したら何もしない（ログだけ）
# あとは dispatch の巡回（15分ごとの intake.mjs --scan）が企画室に G-xx として登録する。HP のコミットはこのスクリプトでは行わない。
# node には依存しない（launchd の PATH は最小限）。日付計算は macOS の date を使う。
#
# 環境変数で差し替えられる（検査・別環境用。既定は本番の場所）:
#   ATLAS_DIR   Atlas のリポジトリ
#   HP_INBOX    コピー先（HP リポの 10_drafts/65_外部原稿）
#   STATE_FILE  コピー済みの週を覚える状態ファイル
#   LOG_FILE    ログ
set -u

ATLAS_DIR="${ATLAS_DIR:-/Volumes/DevSSD/Vibe_Website/260612_ai-reg-atlas}"
HP_INBOX="${HP_INBOX:-/Volumes/DevSSD/Vibe_Website/260805_Darari-nu_HP/10_drafts/65_外部原稿}"
STATE_FILE="${STATE_FILE:-$HOME/.local/state/ai-reg-atlas/digest-intake.txt}"
LOG_FILE="${LOG_FILE:-$HOME/Library/Logs/ai-reg-atlas-digest-intake.log}"

export PATH="/usr/bin:/bin:/opt/homebrew/bin:/usr/local/bin:${PATH:-}"

mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null
log() { printf '%s %s\n' "$(/bin/date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG_FILE"; }

if [ ! -d "$ATLAS_DIR/.git" ] && [ ! -f "$ATLAS_DIR/.git" ]; then
  log "skip: Atlas が見つからない（DevSSD が未マウント？）: $ATLAS_DIR"
  exit 0
fi
if [ ! -d "$(dirname "$HP_INBOX")" ]; then
  log "skip: HP の置き場の親フォルダが無い（DevSSD が未マウント？）: $(dirname "$HP_INBOX")"
  exit 0
fi

if ! git -C "$ATLAS_DIR" fetch -q origin main >> "$LOG_FILE" 2>&1; then
  log "skip: git fetch origin main に失敗（何もしない）"
  exit 0
fi

files="$(git -C "$ATLAS_DIR" ls-tree --name-only origin/main data/digests/ 2>/dev/null | grep '\.md$')"
if [ -z "$files" ]; then
  log "done: copied=0 skipped=0 (origin/main に data/digests の原稿なし)"
  exit 0
fi

mkdir -p "$(dirname "$STATE_FILE")" "$HP_INBOX"
touch "$STATE_FILE"

# 週ラベル YYYY-Www から、HP 側のファイル名の日付（その週の次の月曜＝配信する月曜）を YYYYMMDD で出す
release_date() {
  local y w u off
  y="${1%%-W*}"; w="${1##*-W}"; w=$((10#$w))
  u="$(/bin/date -j -f '%Y-%m-%d' "$y-01-04" '+%u' 2>/dev/null)" || return 1   # 1月4日は必ず第1週。月=1..日=7
  off=$(( -(u - 1) + (w - 1) * 7 + 7 ))
  /bin/date -j -v+"${off}"d -f '%Y-%m-%d' "$y-01-04" '+%Y%m%d' 2>/dev/null
}

copied=0
skipped=0
for path in $files; do
  name="$(basename "$path")"       # 2026-W41.md
  week="${name%.md}"               # 2026-W41
  if grep -qxF "$name" "$STATE_FILE"; then skipped=$((skipped + 1)); continue; fi

  # HP 側に同じ週の原稿が既にあれば置かない
  existing="$(ls "$HP_INBOX"/*_atlas-digest-"$week".md 2>/dev/null | head -n 1)"
  if [ -n "$existing" ]; then
    log "skip: HP 側に既にある: $(basename "$existing")"
    echo "$name" >> "$STATE_FILE"
    skipped=$((skipped + 1))
    continue
  fi

  d="$(release_date "$week")"
  if [ -z "$d" ]; then
    log "warn: 日付を出せない: $name"
    continue
  fi
  dest="$HP_INBOX/${d}_atlas-digest-${week}.md"
  tmp="$dest.tmp.$$"
  if git -C "$ATLAS_DIR" show "origin/main:$path" > "$tmp" 2>>"$LOG_FILE" && [ -s "$tmp" ] && [ ! -e "$dest" ] && mv "$tmp" "$dest"; then
    echo "$name" >> "$STATE_FILE"
    log "copied: $name -> $dest"
    copied=$((copied + 1))
  else
    rm -f "$tmp"
    log "warn: コピーに失敗: $name"
  fi
done

log "done: copied=$copied skipped=$skipped"
exit 0
