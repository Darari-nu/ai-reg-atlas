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
  triage.mjs     新着を40件ずつ束ねて Gemini Flash-Lite で選別・事象dedupe（一部バッチ失敗でも続行）
  summarize.mjs  実URL本文を機械ゲート → Gemini Flash が3行要約＋差分影響を生成
                 （503/枠切れは予備モデルへ切替。待ち時間は1ステップ累計600秒で打ち切り）
  validate.mjs   JSON Schema検証（失敗ならcommitしない）
  → data/ をcommit&push → 同一ワークフロー内で Astroビルド → GitHub Pages デプロイ
  → diff_changed / needs-review は Issue 自動起票

② cf-deploy.yml  (① の完了で発火 / workflow_run。①の成否は問わない)
  ASTRO_SITE=https://darari-nu.com ASTRO_BASE=/atlas で再ビルド
  → dist/ を deploy_atlas/atlas/ に詰め替え
  → npx wrangler@4 pages deploy（Cloudflare Pages プロジェクト: ai-reg-atlas）
  → darari-nu.com/atlas/ で公開（ai-kaizen-hub 側の Pages Function が中継）

③ ci.yml  (pull_request / push to main)
  gitleaks でシークレット混入をブロック → npm test → validate.mjs → astro build
```

- DBなし。`data/` のJSONがデータベース（履歴はGit）
- 収集した記事本文・生HTMLは要約後に破棄。保存するのは構造化レコードのみ
- フロント: Astro（静的）＋ Reactアイランド（地球儀 cobe のみ）＋ Tailwind

### 状態ファイル（data/state/）

日をまたいで持ち越す状態は `data/state/*.json`（`data/.cache/` は .gitignore 済みで CI では毎回空になるため使わなくなった）。読み書きは `scripts/lib/state.mjs` に集約。

| ファイル | 内容 | 読み書きするスクリプト |
|---|---|---|
| `last_seen.json` | `{ feedURL: ISO日時 }`。フィードごとの最終収集時刻 | `collect.mjs` が読み書き。遡り上限は `threshold = max(前回, 今 − LAST_SEEN_MAX_LOOKBACK_DAYS日)`（`clampLookback`） |
| `seen_urls.json` | `{ url: { verdict, date } }`。既知URLの選別結果 | `triage.mjs` / `summarize.mjs` が書き込み、`triage.mjs` がバッチを作る前に `isSkippable` で除外。TTL `SEEN_URL_TTL_DAYS`（既定30日）を超えた分は毎回 `pruneSeenUrls` で捨てる |
| `queue.json` | その日に要約しきれなかった候補の繰り越し配列 | `summarize.mjs` が読み書き。TTL 7日・`attempts` 3回未満・上限50件（`QUEUE_TTL_DAYS` / `QUEUE_MAX_ATTEMPTS` / `QUEUE_MAX`、`enqueue` / `dequeueItems`） |

いずれも壊れたら中身を `{}`（`last_seen.json` / `seen_urls.json`）か `[]`（`queue.json`）に戻せば安全に再開できる（`readStateFile` は壊れたJSONを warn して fallback を返すので、パイプライン自体は止まらない）。

`isSkippable` が再 triage・再要約を止める `SKIP_VERDICTS`（`scripts/lib/state.mjs`）: `gemini-unusable` / `no-ai-reg-keyword` / `body-too-short` / `stale-publication-date` / `triage-irrelevant`。`blocked-or-js-only-page` や fetch 失敗は一時的な失敗として含めず、翌日また試す。

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

### なぜ2箇所に出したままなのか（2026-09-04 判断）

GitHub Pages 側を止めるか検討したが、**止めない**と決めた。

- 止めても本番(Cloudflare)は無事。`cf-deploy` は独立しているので影響しない
- 止める理由は「同じ内容が2ドメインで検索インデックスされる」ことだが、
  デメリットはその程度
- 一方、止めると `darari-nu.github.io/ai-reg-atlas/` に**古い内容が残り続ける**。
  外部に出したリンクもそこを指したまま古い情報を見せることになる。これが一番悪い
- 中途半端に止めるくらいなら、両方最新である状態を維持するほうが安全

**将来やるなら**、止めるだけで済ませず次のどちらかまでセットで行うこと。

- GitHub Pages を無効化して 404 にする（外部リンクは切れる）
- 両方の build に `<link rel="canonical">` を入れて darari-nu.com/atlas に寄せる
  （現状 canonical タグは無い。外部リンクは生かしたまま重複を解消できる）

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
npm test          # 実APIを使わないテスト（品質ゲート・triage分割・Geminiのリトライ/フォールバック・
                  # 鮮度・派生年表・地球儀投影・countries.yaml検証・状態ファイル。106件）
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

### Gemini のモデルと待ち時間（Repository Variables で差し替え可）

コードを触らずに、GitHub の Settings → Secrets and variables → Actions → **Variables** で変えられる。
未設定ならコードの既定値が使われる。`-latest` エイリアスは指す先が予告なく変わり、混雑・無料枠が読めないので既定にしない
（2026-09 時点で `gemini-flash-latest` の中身は最新の 3.8-flash で、503 が連日続いていた）。2.5 系は新規キーでは 404（提供終了）。

| 名前 | 既定値 | 意味 |
|---|---|---|
| `GEMINI_MODEL_TRIAGE` | `gemini-3.5-flash-lite` | triage の主モデル |
| `GEMINI_FALLBACK_TRIAGE` | `gemini-3.1-flash-lite,gemini-3.8-flash,gemini-3.5-flash` | 主モデルが混雑・日次枠切れ・404 のとき順に使う（カンマ区切り） |
| `GEMINI_MODEL_SUMMARIZE` | `gemini-3.6-flash` | summarize / bootstrap の主モデル |
| `GEMINI_FALLBACK_SUMMARIZE` | `gemini-3.8-flash,gemini-3.5-flash,gemini-3.5-flash-lite` | 同上のフォールバック |
| `GEMINI_WAIT_BUDGET_SEC` | `600` | 1ステップでバックオフに使ってよい待ち時間の累計。超えたら残りを打ち切る |
| `TRIAGE_BATCH_SIZE` | `40` | triage 1リクエストあたりの候補数（出力が 8192 トークンで切れないように） |

失敗時のログは `[gemini] HTTP 429 model=... kind=quota-daily quota=GenerateRequestsPerDay...` の形で出る。
`kind=quota-daily` なら日次無料枠切れ（その日はそのモデルを使わない）、`http-retryable` なら一時的な混雑。

### パイプラインの環境変数（Repository Variables で差し替え可）

| 名前 | 既定値 | 意味 |
|---|---|---|
| `SUMMARIZE_MAX_PER_RUN` | `8` | summarize が1回の実行で要約する件数の上限（バッチ原則・無料枠保護）。超えた分は `queue.json` に繰り越す |
| `LAST_SEEN_MAX_LOOKBACK_DAYS` | `14` | `last_seen.json` の遡り上限日数。状態が古くても `今 − この日数` より前は再収集しない |
| `SEEN_URL_TTL_DAYS` | `30` | `seen_urls.json` に記録した選別結果を覚えておく日数。切れたら忘れてもう一度拾い直す |
| `SCRAPE_HASH_MAX_AGE_DAYS` | `30` | `scrape_hash` ソースで候補化する日付付きリンクの上限鮮度（collect.mjs） |
| `TRIAGE_BATCH_SIZE` | `40` | triage 1リクエストあたりの候補数（出力が 8192 トークンで切れないように） |

**混雑時は「待つ」より「隣のモデル」。** どのモデルが空いているかは時間帯で入れ替わる
（2026-09-19 の実測: 同じ内容を4回ずつ投げて 3.5-flash 0/4・3.8-flash 2/4・3.6-flash 3/4 成功。
数日前のログでは逆に 3.5-flash が救世主だった）。そのため主モデル1本に賭けず、
**列を待たずに1周し、全部が混雑していたときだけバックオフして次の周回に入る**
（`geminiJSON`。周回数は `GEMINI_MAX_ATTEMPTS`、待ち合計は `GEMINI_WAIT_BUDGET_SEC` で頭打ち）。

## 国の追加

1. `config/countries.yaml` に1ブロック追記
2. `npm run bootstrap -- --country=xx` でシードJSONドラフト生成
3. 人間レビュー → PR → マージ。翌日から自動監視に入る

### ソースの増やし方

国ブロック内に次の3種をyamlで追加する。コード側に国別・媒体別の分岐は足さない。

- `official_sources`: 権威ソース。`{ url, type: rss|scrape_hash }`。更新レコードの出典にできる。
- `watch_feeds`: 任意。良質な非Google RSS。`{ url, type: rss }`。実URLが取れるため出典にできる。
- `news_queries`: Google News検索。検知専用。`news.google.com`は機械ゲートでdropし、更新レコードの`sources`には入れない。

国ブロックには任意で `subregions:`（地域・州レベル）も追記できる。国の下位区分（米国の州・EU加盟国・中国の直轄市など）を地球儀のマーカー表示専用に載せるためのもので、`official_sources` / `watch_feeds` は持たず自動監視の対象にはならない。現在は米国5州（カリフォルニア・コロラド・ニューヨーク・テキサス・ユタ）、EU5カ国（ドイツ・フランス・イタリア・スペイン・オランダ）、中国3市（北京・上海・深圳）、カナダのケベック州を初期データとして収録済みで、いずれも**AIが下書きした人間レビュー前のドラフト**（`config/countries.yaml` 内のコメント参照）。成立日・施行日・所管機関は一次ソースで裏を取るまで確定値として扱わないこと。

`scrape_hash`はページ全体の変化を検知した後、日付付きリンク・見出しを個別候補化する。リンクの日付（URL→タイトル→周辺の順に読む）が `SCRAPE_HASH_MAX_AGE_DAYS`（既定30日）より古いものは候補にしない。構造抽出できない場合は`needs-review`に回し、全文をGeminiへ渡さない。

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

- 地球儀のクリックは、cobeにヒットテストが無いため canvas の上に重ねたHTMLリンク（`<a>`）で実現している。座標変換（緯度経度→画面座標、回転量からの逆算）は `src/lib/globeProjection.mjs` の純関数。Tabキーで国のリンクを辿ると、その国が正面に回る（`Globe.tsx` の `focusin` ハンドラ）。
  **cobe 0.6.5 には、`onRender` で `markers` を差し替えるとマーカー数のuniformに `length*2` ではなく `length` がそのまま入るバグがあり、後半のマーカーが描画されなくなる**（初期化時の描画は正しい）。`Globe.tsx` では `size: 0` のダミーマーカーを本数ぶん追加してuniformの辻褄を合わせて回避している（同ファイルの `buildMarkers` / `DUMMY_MARKER` のコメント参照）。
- `/updates/` の検索はReactアイランドでなく素のJS（サーバーレンダリングしたカードをdata属性でフィルタ。表示は同等）
- 比較表のセル分類はシードデータから人手導出した初期値（自動再計算はPhase 3）
- `design/sample.html`（承認済みモック）は未受領のため未同梱。受領後に追加する

## データの注意

`data/` のシード（13カ国・地域の規制サマリー）はAIが下書きした**人間レビュー前のドラフト**を含む。
誤りを見つけたらPRかIssueで指摘してほしい。出典のない記述は受け付けない。

更新レコードには `discovered_at`（サイトが発見した日。collect.mjsが付与）を持つものがある。無い旧レコードはトップのNEW欄や鮮度計算で `date`（公表日）を代用する（`src/lib/freshness.mjs` の `discoveryDate`）。年表（`/timeline` や国別ページ）に○で出る「派生イベント」は、更新レコードから機械的に生成した**更新フィード由来・人間による確認前の自動検知**であり、`axes.timeline` に人手で載せた種データ（seed）とは扱いが異なる（`src/lib/derivedTimeline.mjs`）。

### サイト側の変更

国別ページの「この国の最近の更新」節、トップの「今週の動き」帯、鮮度表示（地球儀の点の大きさ・色、ステータスバーの経過日数）は、いずれも規制サマリーの `last_changed` ではなく更新レコード（発見日基準）を根拠にするよう切り替えた。

## 改訂履歴

構成を変えたら**必ずここに1行足す**。README とワークフローの実物がズレると、
後から見た人間もAIも本番経路を読み違える（2026-09-03 に実際に起きた）。

| 日付 | 変更 |
|---|---|
| 2026-06-12 | リポジトリ開設。GitHub Pages 単独で公開開始 |
| 2026-08-23 | darari-nu.com/atlas（Cloudflare Pages）を追加。当初は Mac の LaunchAgent + `scripts/deploy-cloudflare.sh` で運用 |
| 2026-08-23 | デプロイを `cf-deploy.yml`（GitHub Actions）へ移行。LaunchAgent は停止 |
| 2026-09-03 | README を実物に合わせて全面更新（Cloudflare 経路が未記載のままだった）。`ci.yml` とワークフロー対応表を追記、「6カ国」→「13カ国・地域」を訂正。この改訂履歴を新設 |
| 2026-09-04 | GitHub Pages を止めるか検討し、**止めない**と決定（理由はデプロイ節）。構成変更なし |
| 2026-09-13 | Gemini 障害対策。既定モデルを `-latest` から固定名へ（予備モデルへの自動切替つき）、429/503 のエラー本文をログに出す、待ち時間に累計上限、triage を40件ずつ分割、RSS の相対リンクを絶対化、`pipeline.yml` に `timeout-minutes: 90`、`ci.yml` で `npm test` を実行 |
| 2026-09-19 | Geminiのモデル列に 3.8-flash を追加し、リトライを「待つ前に全モデルを1周」方式へ変更（混雑モデルは1分待っても混雑、空きモデルは即答のため。9/16・9/18 は主モデルの503で157〜204秒待っていた） |
| 2026-09-13 | summarize の記事取得にも r.jina.ai 中継を追加（cac.gov.cn が Actions から取れず全滅していた）。scrape_hash の一覧リンクは日付を読み、30日より古いものを collect で落とす。Issue 起票ステップが `hashFiles('/tmp/...')` で常にスキップされていたのを修正し、同名の開いた Issue は重ねて立てない。ラベル `needs-review` / `diff-change` を作成 |
| 2026-09-19 | `data/state/`（last_seen・seen_urls・queue）に日次状態を持ち越し、既知URLの再triageと要約のあふれを解消（`data/.cache/` は不使用に）。地球儀に地域・州レベルのマーカーとHTMLオーバーレイのクリック遷移を追加（cobe 0.6.5のマーカー差し替えバグを回避）。国別ページ・トップ・鮮度表示を更新レコード（discovered_at）基準に統一し、派生年表（更新フィード由来の未確認イベント）を年表に合流 |

## ライセンス

- コード: MIT（`LICENSE`）
- `data/` 配下: CC BY 4.0（出典明記で再利用可）

## 免責

本サイト・本リポジトリはAIによる自動要約を含む情報提供であり、法的助言ではありません。
実務判断は必ず一次ソースと専門家の確認を経てください。
