# AI Reg Atlas

> 世界のAI規制を、EU基準の「差分」で読む。

EU AI Actを基準に、13カ国・地域（EU・日本・米国・英国・中国・韓国・シンガポール・カナダ・ブラジル・インド・豪州・台湾・カンボジア）のAI規制の差分が一目でわかる、毎日自動更新される静的サイト。

- **サイト（本番）**: https://darari-nu.com/atlas/
- **サイト（GitHub Pages・併載）**: https://darari-nu.github.io/ai-reg-atlas/
- **仕様書**: `REQUESTS.md`（一撃実装仕様 v2.0）
- 一次ソース主義 / 差分主義（stricter・looser・absent・unique の4分類） / 完全自動運用

## アーキテクチャ

```
① pipeline.yml  [ワークフロー名: daily-pipeline]  (cron 21:00 UTC = JST 6:00)
  collect.mjs    countries.yaml の全ソース巡回（official_sources / watch_feeds / news_queries）
  triage.mjs     新着を1リクエストに束ねて Gemini Flash-Lite で選別・事象dedupe
  summarize.mjs  実URL本文を機械ゲート → Gemini Flash が3行要約＋差分影響を生成
  validate.mjs   JSON Schema検証（失敗ならcommitしない）
  → data/ をcommit&push → 同一ワークフロー内で Astroビルド → GitHub Pages デプロイ
  → diff_changed / needs-review は Issue 自動起票

② cf-deploy.yml  (① の完了で発火 / workflow_run。①の成否は問わない)
  ASTRO_SITE=https://darari-nu.com ASTRO_BASE=/atlas で再ビルド
  → dist/ を deploy_atlas/atlas/ に詰め替え
  → npx wrangler@4 pages deploy（Cloudflare Pages プロジェクト: ai-reg-atlas）
  → darari-nu.com/atlas/ で公開（ai-kaizen-hub 側の Pages Function が中継）

③ ci.yml  (pull_request / push to main)
  gitleaks でシークレット混入をブロック → validate.mjs → astro build
```

- DBなし。`data/` のJSONがデータベース（履歴はGit）
- 収集した記事本文・生HTMLは要約後に破棄。保存するのは構造化レコードのみ
- フロント: Astro（静的）＋ Reactアイランド（地球儀 cobe のみ）＋ Tailwind

## デプロイ

ワークフローは3本。**表示名とファイル名が違うので注意**（`workflow_run` は表示名で紐づく）。

| ファイル | ワークフロー名 | 起動条件 |
|---|---|---|
| `.github/workflows/pipeline.yml` | `daily-pipeline` | cron 21:00 UTC / 手動 |
| `.github/workflows/cf-deploy.yml` | `cf-deploy` | `daily-pipeline` の完了 / 手動 |
| `.github/workflows/ci.yml` | `ci` | PR / main への push |

**同じコードベースを2箇所に出している。**`astro.config.mjs` が環境変数で切り替える。

| 出力先 | ワークフロー | ASTRO_SITE / ASTRO_BASE | URL |
|---|---|---|---|
| Cloudflare Pages（本番） | `cf-deploy.yml` | `https://darari-nu.com` / `/atlas` | https://darari-nu.com/atlas/ |
| GitHub Pages（併載） | `pipeline.yml` の末尾 | 未設定（既定値） | https://darari-nu.github.io/ai-reg-atlas/ |

**この2本は独立している。**`cf-deploy` は `workflow_run: completed` で発火するので、
① が Gemini の 429 等で途中失敗しても、最後に commit された `data/` は
必ず Cloudflare 側に反映される（デプロイをパイプラインから切り離した理由がこれ）。

### 触るときの注意

- **`atlas/` サブフォルダへの詰め替えは必須。** Astro の `base` は HTML 内リンクの表記を
  変えるだけで、ビルド出力の物理ディレクトリ構造は変えない。`dist/` をそのまま置くと
  `/atlas/` 配下に実ファイルが無く、CSS/JS が全滅する（過去にスタイル崩壊した実績あり）
- **`CLOUDFLARE_API_TOKEN` に空白や改行を混ぜない。** Authorization ヘッダが不正になり、
  Cloudflare は「ヘッダ無し」扱いの `9106` を返す。原因が分かりにくいので
  `cf-deploy.yml` の中で事前に弾いている
- `wrangler-action@v3` は使わない（古い wrangler を入れた上にトークンを渡し損ねて 9106 で落ちた）。
  素の `npx wrangler@4` を直接叩く

### 旧方式（廃止済み・残骸に注意）

`scripts/deploy-cloudflare.sh` は、このMacの LaunchAgent
`com.darari.ai-reg-atlas-cf-deploy` から定期実行していた**旧デプロイ方式**。
2026-08-23 に `cf-deploy.yml`（GitHub Actions）へ移行し、plist は `.disabled` に
リネームして停止済み。スクリプトだけリポに残っている。**現在の本番経路ではない。**


## セットアップ

```bash
npm install
npm run dev       # http://localhost:4321/ai-reg-atlas/
npm run build     # dist/ に静的出力
npm run validate  # data/ 全JSONのスキーマ検証
npm test          # 実APIを使わないパイプライン品質ゲートのテスト
```

### Gemini APIキー（人間がやること）

1. [Google AI Studio](https://aistudio.google.com/) でキー発行
2. ローカル: `.env` を作成（`.env.example` をコピーして値を入れる）
3. GitHub: 自分のターミナルで対話実行する

```bash
gh secret set GEMINI_API_KEY --repo Darari-nu/ai-reg-atlas
```

キーはこの2箇所のみ。コード・Issue・コミットメッセージに書かない。
**漏えい時**: AI Studioで失効 → 再発行 → `gh secret set` → `.env` 更新。

### リポジトリに登録済みの Secrets

| 名前 | 用途 | 使うワークフロー |
|---|---|---|
| `GEMINI_API_KEY` | triage / summarize の要約生成 | `pipeline.yml` |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Pages へのデプロイ | `cf-deploy.yml` |

`CLOUDFLARE_ACCOUNT_ID` は Secret ではなく `cf-deploy.yml` に平文で直書きしてある
（機密ではないが、Secrets を探しても見つからないので迷わないよう明記）。

### キーが未設定でも壊れない

`triage.mjs` / `summarize.mjs` はキー未設定を検知すると安全にスキップし、
`meta.json` の更新だけ行う（scheduled workflow の60日停止対策も兼ねる）。

## 国の追加

1. `config/countries.yaml` に1ブロック追記
2. `npm run bootstrap -- --country=xx` でシードJSONドラフト生成
3. 人間レビュー → PR → マージ。翌日から自動監視に入る

### ソースの増やし方

国ブロック内に次の3種をyamlで追加する。コード側に国別・媒体別の分岐は足さない。

- `official_sources`: 権威ソース。`{ url, type: rss|scrape_hash }`。更新レコードの出典にできる。
- `watch_feeds`: 任意。良質な非Google RSS。`{ url, type: rss }`。実URLが取れるため出典にできる。
- `news_queries`: Google News検索。検知専用。`news.google.com`は機械ゲートでdropし、更新レコードの`sources`には入れない。

`scrape_hash`はページ全体の変化を検知した後、日付付きリンク・見出しを個別候補化する。構造抽出できない場合は`needs-review`に回し、全文をGeminiへ渡さない。

### DRY_RUN

`DRY_RUN=1`を付けると、`data/`への書き込みは`/tmp/dry/data/`へ退避される。監査用dropログは通常どおり`/tmp/dropped.json`に出る。

```bash
DRY_RUN=1 npm run sweep
DRY_RUN=1 npm run validate
```

## 運用

| 頻度 | 担当 | 作業 |
|---|---|---|
| 日次 | Actions | 巡回→選別→要約→検証→commit→**2箇所へデプロイ**（全自動） |
| 週次 | 人間 | `diff-change` / `needs-review` Issueの確認、要約品質の抜き取り |
| 月次 | 人間 | ソース死活確認、Gemini枠消費確認、国追加検討 |

## 仕様書からの意図的な簡略点（Phase 1）

- 地球儀マーカーのクリック遷移は未実装（cobeにヒットテストがないため）。国別ページへの導線はステータスバーとヘッダーが担う
- `/updates/` の検索はReactアイランドでなく素のJS（サーバーレンダリングしたカードをdata属性でフィルタ。表示は同等）
- 比較表のセル分類はシードデータから人手導出した初期値（自動再計算はPhase 3）
- `design/sample.html`（承認済みモック）は未受領のため未同梱。受領後に追加する

## データの注意

`data/` のシード（13カ国・地域の規制サマリー）はAIが下書きした**人間レビュー前のドラフト**を含む。
誤りを見つけたらPRかIssueで指摘してほしい。出典のない記述は受け付けない。

## 改訂履歴

構成を変えたら**必ずここに1行足す**。README とワークフローの実物がズレると、
後から見た人間もAIも本番経路を読み違える（2026-09-03 に実際に起きた）。

| 日付 | 変更 |
|---|---|
| 2026-06-12 | リポジトリ開設。GitHub Pages 単独で公開開始 |
| 2026-08-23 | darari-nu.com/atlas（Cloudflare Pages）を追加。当初は Mac の LaunchAgent + `scripts/deploy-cloudflare.sh` で運用 |
| 2026-08-23 | デプロイを `cf-deploy.yml`（GitHub Actions）へ移行。LaunchAgent は停止 |
| 2026-09-03 | README を実物に合わせて全面更新（Cloudflare 経路が未記載のままだった）。`ci.yml` とワークフロー対応表を追記、「6カ国」→「13カ国・地域」を訂正。この改訂履歴を新設 |

## ライセンス

- コード: MIT（`LICENSE`）
- `data/` 配下: CC BY 4.0（出典明記で再利用可）

## 免責

本サイト・本リポジトリはAIによる自動要約を含む情報提供であり、法的助言ではありません。
実務判断は必ず一次ソースと専門家の確認を経てください。
