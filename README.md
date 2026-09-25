# AI Reg Atlas

> 世界のAI規制を、EU基準の「差分」で読む。

EU AI Actを基準に、13カ国・地域（EU・日本・米国・英国・中国・韓国・シンガポール・カナダ・ブラジル・インド・豪州・台湾・カンボジア）のAI規制の差分が一目でわかる、毎日自動更新される静的サイト。

- **サイト（本番）**: https://darari-nu.com/atlas/
- **サイト（予備・中継を通さない直URL）**: https://ai-reg-atlas.pages.dev/atlas/
- **仕様書**: `REQUESTS.md`（一撃実装仕様 v2.0）。**ホスティングの記述だけは古い**（GitHub Pages 前提のまま。実物は Cloudflare Pages 1本。デプロイ節と改訂履歴が正）
- 一次ソース主義 / 差分主義（stricter・looser・absent・unique の4分類） / 完全自動運用

## 初めて読む人へ（どこを見ればいいか）

| 知りたいこと | 見る場所 |
|---|---|
| 毎日何が起きているのか | 下の「アーキテクチャ」。`pipeline.yml` が1日1回、収集→選別→要約→検証→commit まで自動で行う |
| サイトはどこに出ているのか | 「デプロイ」。公開は Cloudflare Pages の1箇所（GitHub Pages 併載は 2026-09-19 に終了） |
| なぜ今こうなっているのか | 「改訂履歴」（日付順）。判断を覆した経緯もそこに残している |
| 動かなくなったら | 「状態ファイル」の復旧方法、「Gemini のモデルと待ち時間」のログの読み方 |
| 手元で動かすには | 「セットアップ」と「DRY_RUN」（`DRY_RUN=1` を付ければ実データを汚さずに試せる） |

**設計の根っこ**: 出典は、実際に取得できた一次ソース、または許可リストにある信頼できる報道（サイト上で「報道」と明示）だけ。検証を通らないデータは commit しない。
AIの判断は「確認前」と「人が確認済み」を見た目で区別する（年表の○と●）。この3つは崩さないこと。

## アーキテクチャ

```
① pipeline.yml  [ワークフロー名: daily-pipeline]  (cron 21:23 UTC = JST 6:23 / 予備 4:23 UTC = JST 13:23)
  collect.mjs    countries.yaml の全ソース巡回（official_sources / watch_feeds / news_queries）
  triage.mjs     新着を40件ずつ束ねて Gemini Flash-Lite で選別・事象dedupe（一部バッチ失敗でも続行）
  summarize.mjs  実URL本文を機械ゲート → Gemini Flash が3行要約＋差分影響を生成
                 （503/枠切れは予備モデルへ切替。待ち時間は1ステップ累計600秒で打ち切り）
  validate.mjs   JSON Schema検証（失敗ならcommitしない）
  → data/ をcommit&push → 同一ワークフロー内で Astroビルド（通ることの確認のみ）
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

公式ソース（`official_sources`）だけは、1回目の判定で `relevant=false` でもすぐには `triage-irrelevant` を記録しない。RSS（`watch_feeds`/`news_queries`）は `last_seen` の仕組みで `pub <= last_seen` の記事を二度と候補に出さないため一度きりの判定で確定してよいが、一次情報は temperature 既定(1.0)による1回ごとの判定の揺れで取りこぼすと再挑戦の機会が来ない。そこで同じ実行の中でもう一度だけ判定し（セカンドルック）、どちらかで `relevant=true` なら残す。ログは `[triage] second_look in=N rescued=M`（Nがセカンドルックに回した件数、Mが救済した件数）、救済分は `second_look rescued:`、2回とも落ちたものは `second_look still irrelevant:`（週次の確認用、それぞれ最大10行）。

報道由来の更新（`source_kind: media`）は `regulation_patch` を自動適用しない（`shouldAutoApplyPatch`）。status変更やtimeline追記の提案があれば `needs-review` Issue に回し、`data/regulations/{cc}.json` は人が公式発表で確認してから直す。同じ出来事の二重登録を防ぐため、報道由来のレコードだけは書き込み直前に類似タイトル判定（`titleBigramSimilarity` / `findSimilarRecord`。前後1か月・3日以内・類似度0.6以上）をかけ、見つかれば `duplicate-similar-record` として捨てる（公式ソースには適用しない）。

## デプロイ

ワークフローは3本。**表示名とファイル名が違うので注意**（`workflow_run` は表示名で紐づく）。

| ファイル | ワークフロー名 | 起動条件 |
|---|---|---|
| `.github/workflows/pipeline.yml` | `daily-pipeline` | cron 21:23 UTC・4:23 UTC / 手動 |
| `.github/workflows/cf-deploy.yml` | `cf-deploy` | `daily-pipeline` の完了 / 手動 |
| `.github/workflows/ci.yml` | `ci` | PR / main への push |

**公開先は1箇所。** `astro.config.mjs` の既定値が本番（`https://darari-nu.com` / `/atlas`）で、
`cf-deploy.yml` は同じ値を環境変数でも明示している。

| 出力先 | ワークフロー | URL |
|---|---|---|
| Cloudflare Pages（本番） | `cf-deploy.yml` | https://darari-nu.com/atlas/ |
| 同上・中継を通さない直URL（予備） | 同上 | https://ai-reg-atlas.pages.dev/atlas/ |

`darari-nu.com/atlas/` は ai-kaizen-hub 側の Pages Function が中継している。
**その中継が壊れても `ai-reg-atlas.pages.dev/atlas/` で同じサイトが見える**（実測で確認済み）。

**パイプラインとデプロイは独立している。**`cf-deploy` は `workflow_run: completed` で発火するので、
`daily-pipeline` が Gemini の 429 等で途中失敗しても、最後に commit された `data/` は
必ず Cloudflare 側に反映される（デプロイをパイプラインから切り離した理由がこれ）。

### 定期実行が「ちょうどの時刻」だと取りこぼされる（2026-09-22 判明）

GitHub の scheduled workflow は混雑時に遅延し、**実行そのものが捨てられることがある**。
`0 21 * * *`（毎時0分）は世界中の利用者が集中するため影響が大きい。

- 実測: 2026-09-11〜20 の定期実行は **毎回 106〜165 分遅れて** 開始していた
- そして 2026-09-21・22 は実行記録そのものが無い（ワークフローは有効、定義も正常、Actions も有効）

対策は2つ:

1. cron を半端な分に置く（`23 21 * * *` = JST 6:23）
2. 昼にもう1本（`23 4 * * *` = JST 13:23）置き、**当日すでに巡回済みならスキップ**する。
   判定は `guard` ジョブが `data/meta.json` の `last_sweep` の日付と UTC の当日を比べるだけ
   （手動実行 `workflow_dispatch` は常に走る）

`guard` がスキップした場合も daily-pipeline 自体は success で終わるため、`cf-deploy` は
いつもどおり発火して同じ内容を再デプロイする（40秒程度。実害はないので許容している）。

### GitHub Pages 併載をやめた（2026-09-19 判断）

`darari-nu.github.io/ai-reg-atlas/` への併載を停止し、公開ページを1つにした。
2026-09-04 には「止めない」と判断していたが、その根拠が2つとも消えたため覆した。

- 「外部リンクが切れる」→ オーナー判断で許容（貼り先に心当たりがない）
- 「予備の出口が無くなる」→ **`ai-reg-atlas.pages.dev/atlas/` が予備として機能する**ことを実測で確認。
  こちらは中継を通さないぶん依存が少ない
- 併載していた理由（同じ内容が2ドメインに出て取り違える）の実害の方が大きいと判断した

停止にあたって先に済ませたこと（順番に意味がある）:

1. 巡回ロボットの User-Agent の名乗り先を `darari-nu.com/atlas/about/` に変更
   （`collect.mjs` / `summarize.mjs`。各国政府サイトに提示する自己紹介URLなので、404 にすると
   身元不明のボットとして弾かれうる）
2. `astro.config.mjs` の既定値を本番の site / base に変更
3. `pipeline.yml` から `upload-pages-artifact` / `deploy-pages` と `pages`・`id-token` 権限、
   `environment: github-pages` を削除（ビルドは「通ることの確認」として残す）
4. GitHub Pages 自体を無効化（リポジトリ設定）

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
npm run dev       # http://localhost:4321/atlas/
npm run build     # dist/ に静的出力
npm run validate  # data/ 全JSONのスキーマ検証
npm test          # 実APIを使わないテスト（品質ゲート・triage分割・Geminiのリトライ/フォールバック・
                  # 鮮度・派生年表・地球儀投影・countries.yaml検証・状態ファイル・差分変化の判定ゲート・
                  # legal_stage による年表の絞り込み・重複レコードの機械チェック・enum の整合・Gemini usage の積算・
                  # source_domains.yaml検証・source_kind の判定と既存データの機械チェック・
                  # regulation_patch自動適用の判定（報道は不適用）・出来事の重複排除のsource_group順・
                  # 類似タイトル判定（titleBigramSimilarity/findSimilarRecord）。183件）
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
| `GEMINI_MAX_ATTEMPTS` | `3` | モデル列を何周するか（1周＝列の全モデルを待たずに1回ずつ試す） |

`TRIAGE_BATCH_SIZE` など収集・選別側の変数は次の表にまとめてある。

失敗時のログは `[gemini] HTTP 429 model=... kind=quota-daily quota=GenerateRequestsPerDay...` の形で出る。
`kind=quota-daily` なら日次無料枠切れ（その日はそのモデルを使わない）、`http-retryable` なら一時的な混雑。

`temperature` は既定(1.0)のままにしている。Gemini 3 系は 1.0 未満だとループや性能低下が起きうると公式ガイドが強く推奨しているため
（出力のぶれは構造化出力・enum・機械ゲートで受け止める設計）。
成功時のログは、選別が `[triage] ... gemini={... "usage":{calls,prompt,output,thoughts}}`、要約が `[summarize] gemini {... "usage":{...}}` の形で出る（要約側は `=` なし）。`calls` は成功した呼び出し回数、
`prompt`/`output`/`thoughts` は `usageMetadata` から積算したトークン数の累計（無料枠の消費見積もり用。HTTPエラーは数えない）。

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
- `watch_feeds`: 任意。個別に選んだ報道・専門機関の RSS。`{ url, type: rss }`。許可リスト（`trusted_media`）を通さずに出典になるので、追加は慎重に。
- `news_queries`: Bingニュース検索RSS（`collect.mjs`の`newsRssUrl`）。Bingのリンクは`bing.com/news/apiclick.aspx?...&url=<元記事>`の形で転送されるので、`unwrapBingNewsUrl`で`url`パラメータから元記事のURLを取り出す。取り出した候補は`config/source_domains.yaml`の許可リスト（`trusted_media`）に載っているドメインか、公式ドメイン（政府系TLD・`source_domains.yaml`の`official`・`countries.yaml`の`official_sources`のホスト）でなければ`collect`で落とす（`isTrustedMediaUrl` / `classifySourceKind`）。許可リストに無い報道は出典にできない。落ちた候補の上位ホストは`[collect] dropped_untrusted top hosts: ...`にログが出るので、実在する報道機関なら`config/source_domains.yaml`の`trusted_media`に追記して許可リストを育てる運用にする。

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
| 日次 | Actions | 巡回→選別→要約→検証→commit→Cloudflareへデプロイ（全自動） |
| 週次 | 人間 | `diff-change` / `needs-review` Issueの確認、要約品質の抜き取り、年表の○（未確認の派生イベント）で●へ昇格させたいものがないか |
| 月次 | 人間 | ソース死活確認（`[collect] skip` が続くソース）、Gemini枠消費確認、`data/state/` の肥大チェック、国追加検討 |

## 仕様書からの意図的な簡略点（Phase 1）

- 地球儀のクリックは、cobeにヒットテストが無いため canvas の上に重ねたHTMLリンク（`<a>`）で実現している。座標変換（緯度経度→画面座標、回転量からの逆算）は `src/lib/globeProjection.mjs` の純関数。Tabキーで国のリンクを辿ると、その国が正面に回る（`Globe.tsx` の `focusin` ハンドラ）。
  **cobe 0.6.5 には、`onRender` で `markers` を差し替えるとマーカー数のuniformに `length*2` ではなく `length` がそのまま入るバグがあり、後半のマーカーが描画されなくなる**（初期化時の描画は正しい）。`Globe.tsx` では `size: 0` のダミーマーカーを本数ぶん追加してuniformの辻褄を合わせて回避している（同ファイルの `buildMarkers` / `DUMMY_MARKER` のコメント参照）。
- `/updates/` の検索はReactアイランドでなく素のJS（サーバーレンダリングしたカードをdata属性でフィルタ。表示は同等）
- 比較表のセル分類はシードデータから人手導出した初期値（自動再計算はPhase 3）
- `design/sample.html`（承認済みモック）は未受領のため未同梱。受領後に追加する

## データの注意

`data/` のシード（13カ国・地域の規制サマリー）はAIが下書きした**人間レビュー前のドラフト**を含む。
誤りを見つけたらPRかIssueで指摘してほしい。出典のない記述は受け付けない。

更新レコードには `discovered_at`（サイトが発見した日。`summarize.mjs` がレコード生成時に `buildUpdateRecord` 経由で付与）を持つものがある。無い旧レコードはトップのNEW欄や鮮度計算で `date`（公表日）を代用する（`src/lib/freshness.mjs` の `discoveryDate`）。年表（`/timeline` や国別ページ）に○で出る「派生イベント」は、更新レコードから機械的に生成した**更新フィード由来・人間による確認前の自動検知**であり、`axes.timeline` に人手で載せた種データ（seed）とは扱いが異なる（`src/lib/derivedTimeline.mjs`）。

更新レコードは `legal_stage`（法的段階。要約AIが本文から判定し `scripts/summarize.mjs` が付与）を持つ。値は次の7つ: `in_force`（施行済み・適用開始）、`enacted`（議会で可決・公布済み。未施行を含む）、`final_guidance`（草案・意見募集でない確定版の公式指針・ガイドライン・標準、閣議決定された国家計画・戦略）、`bill`（法案・法改正案の提出・審議・委員会可決・一院可決、行政府の立法提案）、`draft_or_consultation`（指針や法案の草案公表、意見募集の開始）、`announcement`（方針表明・首脳の発言・記者会見・議会答弁・会議の開催・事件の公表・提言や要請・書簡）、`other`（特定企業への処分・勧告・執行命令、統計・報告書、協定・MOU・署名、任命、事業の開始、非公式な解説）。年表の○（派生イベント）は、このうち**法令の節目にあたる5段階**（施行=in_force・成立=enacted・確定指針=final_guidance・法案=bill・草案/意見募集=draft_or_consultation）のレコードからだけ作る（`announcement`・`other`・legal_stage 無しは年表に出さない。`src/lib/derivedTimeline.mjs` の `TIMELINE_LEGAL_STAGES`）。更新一覧（`/updates/`）は legal_stage に関わらず全レコードを今までどおり出す（役割分担: 年表＝法令の節目、更新一覧＝ニュース全部）。

同じ出典URLかつ同じ公表日のレコードが既にある場合、summarize は新規登録をせずに `duplicate-existing-url` として drop する（`scripts/lib/pipeline.mjs` の `isDuplicateRecord`）。同じURLでも公表日が違えば別の出来事として扱う（EUの政策ハブページのように1つのURLから複数の出来事が出るため）。

差分変化（`impact.diff_changed`）は「法的な変化があり、かつEUとの差分一覧（`diff_vs_eu`）の項目が実際に動く」ときだけ true にする。法案の提出・審議、草案・意見募集、方針表明・会見・会議、事件の公表だけでは true にしない（「EUと違う話だ」は理由にならない）。要約AIの判定はそのままレコードに書かず、`scripts/lib/pipeline.mjs` の機械ゲート `decideDiffChanged`（legal_stage が in_force/enacted/final_guidance のいずれか、かつ diff_items が1件以上）を通した値を使う。

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
| 2026-09-04 | GitHub Pages を止めるか検討し、**止めない**と決定。のちに 2026-09-19 で覆した |
| 2026-09-13 | Gemini 障害対策。既定モデルを `-latest` から固定名へ（予備モデルへの自動切替つき）、429/503 のエラー本文をログに出す、待ち時間に累計上限、triage を40件ずつ分割、RSS の相対リンクを絶対化、`pipeline.yml` に `timeout-minutes: 90`、`ci.yml` で `npm test` を実行 |
| 2026-09-13 | summarize の記事取得にも r.jina.ai 中継を追加（cac.gov.cn が Actions から取れず全滅していた）。scrape_hash の一覧リンクは日付を読み、30日より古いものを collect で落とす。Issue 起票ステップが `hashFiles('/tmp/...')` で常にスキップされていたのを修正し、同名の開いた Issue は重ねて立てない。ラベル `needs-review` / `diff-change` を作成 |
| 2026-09-19 | **GitHub Pages 併載を終了し公開ページを1つに**（理由はデプロイ節）。ロボットの名乗り先と astro の既定値を本番URLへ移し、pipeline.yml から Pages デプロイと関連権限を削除 |
| 2026-09-19 | Geminiのモデル列に 3.8-flash を追加し、リトライを「待つ前に全モデルを1周」方式へ変更（混雑モデルは1分待っても混雑、空きモデルは即答のため。9/16・9/18 は主モデルの503で157〜204秒待っていた） |
| 2026-09-22 | 更新レコードの見出しを日本語に統一。要約プロンプトに title の言語と書き方（「主体（略称）、何をした」）の指示が無く、英語の一次ソースだと英語の見出しがサイトに出ていた（2026-09-21-eu-001）。プロンプト・スキーマに明記し、それでも日本語でなければ `summary.what` に差し替える安全装置（`ensureJapaneseTitle`）を追加。該当1件の見出しを手で日本語化 |
| 2026-09-22 | 定期実行の cron を `0 21` から `23 21`（＋昼に取りこぼし拾いの `23 4`）へ変更し、当日巡回済みならスキップする `guard` ジョブを追加。毎時0分は混雑で106〜165分遅れており、9/21・9/22 は実行が消えていた |
| 2026-09-19 | `data/state/`（last_seen・seen_urls・queue）に日次状態を持ち越し、既知URLの再triageと要約のあふれを解消（`data/.cache/` は不使用に）。地球儀に地域・州レベルのマーカーとHTMLオーバーレイのクリック遷移を追加（cobe 0.6.5のマーカー差し替えバグを回避）。国別ページ・トップ・鮮度表示を更新レコード（discovered_at）基準に統一し、派生年表（更新フィード由来の未確認イベント）を年表に合流 |
| 2026-09-24 | 差分変化（`diff_changed`）の誤判定を修正。要約プロンプトに対象国の現行 diff_vs_eu を渡し、`legal_stage`（法的段階）と `diff_items`（変化した差分項目）をモデルに出させ、機械ゲート `decideDiffChanged`（`scripts/lib/pipeline.mjs`）で両方揃ったときだけ true にする。既存12件のうち法的な変化が無かった10件を false に付け直した |
| 2026-09-25 | 年表を「法令の節目」だけにした。更新レコードに `legal_stage`（7値）を保存し、年表の派生イベント（○）は施行・成立・確定指針・法案・草案/意見募集の5段階のレコードからだけ作る（`src/lib/derivedTimeline.mjs` の `TIMELINE_LEGAL_STAGES`）。更新一覧は今までどおり全件表示。既存42件（重複2件を削除した残り）に legal_stage を付与。今後の重複防止に、同じ出典URL・同じ公表日のレコードが既にあれば書かない機械チェック（`isDuplicateRecord`）を summarize に追加 |
| 2026-09-25 | `/claude-api prompt-audit` の指摘を反映。temperature 0.2 を外し既定(1.0)へ（Gemini 3 系への公式ガイド推奨）、Gemini のトークン消費を `usage`（calls/prompt/output/thoughts）としてログに記録、triage の「関係あり」判定を要約側と同じ基準（AI固有の規定を含む場合だけ true）に統一、summarize の `regulation_patch.status` を「対象国の主たるAI規制そのものの段階変化」に限定（Issue #13 の誤提案対策）、bootstrap の下書きプロンプトをスキーマが返す3項目（regulation_name/status/approach）だけの指示に整理。取り下げ: triage に `thinkingLevel: 'low'` を付ける案は、実APIで確認したところ flash-lite 系はもともと思考0で、3.1-flash-lite はむしろ low 指定で思考が増えた（0→124）ため見送り |
| 2026-09-25 | 選別の取りこぼし対策（Fable監査の追い作業2点）。(A) triage の「関係あり」基準に一文追加: ディープフェイク・AI生成物・自動化された意思決定の規定は、刑法・選挙法・消費者法などの中にあってもAI固有の規定として true。(B) 公式ソース（`official_sources`）の候補で `relevant=false` になったものだけ、同じ実行の中でもう一度選別にかけ、どちらかで `relevant=true` なら残す「セカンドルック」を追加（`irrelevantItems` / `needsSecondLook` / `SECOND_LOOK_GROUPS`、`scripts/lib/pipeline.mjs`）。temperature を既定(1.0)に戻したことで1回ごとの判定が揺れ、RSSの記事は last_seen の仕組みで一度しか候補に出ないため、一次情報だけは1回の揺れで取りこぼさないようにした。取り下げ: 当初案の「公式ソースは seen_urls に記憶しない」は採らなかった。RSSは `pub <= last_seen` の記事を二度と候補にしない（`collect.mjs` の `collectRss`）ので、記憶しなくても再挑戦の機会が来ない（効くのは scrape_hash の一覧が変わって同じリンクが再抽出される場合だけ） |
| 2026-09-26 | オーナー裁定で出典の原則を「一次ソースだけ」から「一次ソース＋許可リストにある信頼できる報道」へ広げた。Google ニュース検索（`news_queries`）を Bing ニュースRSSへ置き換え、転送URL（`bing.com/news/apiclick.aspx?...&url=<元記事>`）を`unwrapBingNewsUrl`で元記事URLに展開。許可リスト（`trusted_media`）と公式ドメイン（`official`）は新設の`config/source_domains.yaml`の1箇所で管理し、`isTrustedMediaUrl`/`classifySourceKind`で候補を絞る（`collect.mjs`、ログ`[collect] news kept=N dropped_untrusted=M`）。更新レコードに出典の種別`source_kind`（`official`|`media`）を追加し、報道由来のときサイトに「報道」バッジを出す。報道由来の`diff-change` Issueには「公式発表で確認すること」の一文を追記。既存42件（official 38・media 4: `artificialintelligenceact.eu` 2件・`dataprivacybr.org` 2件）に`source_kind`を機械的に付け直した。**Fable監査の指摘を反映**（同日追加コミット）: 報道由来のレコードは`regulation_patch`を自動適用せず`needs-review` Issueに回すよう変更（`shouldAutoApplyPatch`）。`OFFICIAL_TLD_RE`の`gov`系ccTLDを`gov`単独と`gov.(uk\|in\|br\|au\|sg\|cn\|tw\|kh\|hk\|nz\|ie)`に限定し（`gov.ai`等の誤判定を修正）、`source_domains.yaml`の`official`に`ico.org.uk`等10件を追加（既存42件の判定は不変と確認済み）。同じ出来事の二重登録対策として`dedupeByEvent`と`sortForSummarize`の同順位判定にsource_group順を追加し、報道由来のレコードには書き込み直前に類似タイトル判定（`titleBigramSimilarity`/`findSimilarRecord`）を追加した。類似判定のしきい値は実測で0.2（重複3組0.24〜0.27、別の出来事14組は最大0.18）、選別（`triage.mjs`）で同一出来事に同じ`canonical_event`を付けさせるようプロンプトを1文追記した |

## ライセンス

- コード: MIT（`LICENSE`）
- `data/` 配下: CC BY 4.0（出典明記で再利用可）

## 免責

本サイト・本リポジトリはAIによる自動要約を含む情報提供であり、法的助言ではありません。
実務判断は必ず一次ソースと専門家の確認を経てください。
