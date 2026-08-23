#!/bin/bash
# darari-nu.com/atlas (Cloudflare Pages) への再デプロイ。
# GitHub Actionsの日次パイプライン(collect→triage→summarize→commit)が終わった後、
# このMac上のLaunchAgent(com.darari.ai-reg-atlas-cf-deploy)から定期実行される。
# CLOUDFLARE_API_TOKENは使わず、`wrangler`のCLI OAuthログイン(このMacに保存済み)を使う。
#
# Astroのbase設定はHTML内リンクの表記だけを書き換え、ビルド出力の物理ディレクトリ構造は
# 変えない。そのためdist/をそのままデプロイすると/atlas/配下の実ファイルが存在せず
# Cloudflareが404の代わりにルートindex.htmlを返してしまう(スタイル崩壊の原因になった実績あり)。
# 必ずatlas/サブフォルダに移してからデプロイすること。
set -euo pipefail

REPO_DIR="$HOME/Claudecode/260612_ai-reg-atlas"
cd "$REPO_DIR"

echo "==== $(date '+%Y-%m-%d %H:%M:%S') deploy-cloudflare start ===="

git fetch origin main
git merge --ff-only origin/main

npm ci --silent

rm -rf dist deploy_atlas
ASTRO_SITE=https://darari-nu.com ASTRO_BASE=/atlas npm run build

mkdir -p deploy_atlas/atlas
cp -r dist/* deploy_atlas/atlas/

npx wrangler pages deploy deploy_atlas --project-name=ai-reg-atlas --branch=main --commit-dirty=true

rm -rf dist deploy_atlas

echo "==== $(date '+%Y-%m-%d %H:%M:%S') deploy-cloudflare done ===="
