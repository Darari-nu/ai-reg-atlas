# REQUESTS.md — AI Reg Atlas 完全実装仕様書 v2.0

> 本書は実装AI（Codex / Claude Code）に渡す**一撃実装用**の完全仕様書である。
> 「なぜ作るか」から「workflow YAMLの中身」「Geminiプロンプト」まで全て記載する。
> 不明点があっても本書内の原則から推論し、勝手に機能を追加・削除しないこと。
> 実装順序は §14-7 に従う。

-----

# 0. 存在理由とプロジェクト判定

## 0-1. 解決する課題

各国のAI法規制は「提案→ドラフト→意見募集→確定→延期→施行」と動き続ける。
例：EU AI Actは2026-05-19にハイリスクAI分類のドラフトガイドラインが公表され、Digital Omnibusにより適用が2027-12-02（Annex III系）／2028-08-02（Annex I系）へ延期された。

企業のAIガバナンス担当者はこれを複数国について同時に追い、社内規定に展開する必要があるが：

- 情報源が国ごとにバラバラ（RSSの有無、言語の壁。中国CACはRSSなし）
- 「何が変わったか」より「**自社にとってEUとの差分は何か**」が知りたいのに、それを示すサイトがない
- 実務では「最も厳しいEUに合わせ、他国は差分だけ見る」のが合理的

## 0-2. 提供価値（一言）

**「EU AI Actを基準に、世界のAI規制の差分が一目でわかる、毎日自動更新される地図」**

## 0-3. プロジェクト判定

|観点            |判定                     |
|--------------|-----------------------|
|販売・決済・会員・問い合わせ|なし                     |
|管理画面          |GitHubリポジトリ＋Actionsが兼ねる|
|外部連携          |Gemini API（無料枠）        |
|定期処理          |日次cron                 |
|個人情報          |一切保存しない                |

→ **自動更新パイプライン付き静的サイト**。DBサーバー・認証・サーバーサイド処理は作らない。

-----

# 1. コンセプト

|項目   |内容                                   |
|-----|-------------------------------------|
|サイト名 |**AI Reg Atlas**                     |
|タグライン|世界のAI規制を、EU基準の「差分」で読む。               |
|ミッション|AIガバナンス実務者が原文に最短でたどり着ける世界地図を提供する     |
|バリュー |①一次ソース主義（必ず原文リンク） ②差分主義（全文より差分） ③完全自動|
|主ユーザー|企業のAIガバナンス担当・法務・AI推進担当               |
|最終ゴール|実務者の定点観測サイト化。運営者のnote/Substackへの導線   |
|収益モデル|サイト自体は無課金。間接収益（送客・専門性証明）             |
|運用者  |個人1名。日次は全自動、人間は週次レビューのみ              |
|文章トーン|中立・簡潔・実務的。要約は断定を避け必ず出典を添える           |

## 1-1. 作らないもの（Non-Goals）— 実装AIはこれを追加してはならない

- ❌ 課金・会員・ログイン・問い合わせフォーム
- ❌ 全世界網羅（初期6カ国。拡張はYAML追記のみで可能な構造にする）
- ❌ 法的助言（免責明記）
- ❌ リアルタイム速報（日次更新で十分）
- ❌ サーバーサイド検索・DB・CMS

-----

# 2. ペルソナと導線

|ペルソナ  |誰か            |ゴール                |
|------|--------------|-------------------|
|A. 実務者|AIガバナンス担当     |**3クリック以内に一次ソース着地**|
|B. 関心層|AI規制に興味ある読者   |地球儀で世界の今を掴む        |
|C. 運営者|コンテンツ製造機としての自分|毎朝フィードで記事ネタを拾う     |

```
トップ（ダーク地球儀＋NEW3件）
 ├─ 国クリック → 国別ページ（ライト）
 │     ├─ EU差分サマリー（4分類）
 │     ├─ [差分をコピー]ボタン
 │     └─ 一次ソースリンク          ← Aのゴール（3クリック以内）
 ├─ 比較表 → ヒートマップ → セルクリックで国別ページ該当軸へ
 ├─ タイムライン → 施行日・延期の年表
 └─ 更新 → アーカイブ＋検索          ← Cの定点観測
```

- ヘッダーに「比較表」直行リンク常設（Aは地球儀をスキップできる）
- 国別ページは個別URL（`/country/jp/`）で共有可能
- トップに「最終巡回時刻」と直近更新を表示（再訪動機）

-----

# 3. サイトマップ

## 3-1. 公開ページ

|ページ    |URL                                     |テーマ|
|-------|----------------------------------------|---|
|トップ    |`/`                                     |ダーク|
|国別詳細   |`/country/{cc}/`（eu, jp, us, uk, cn, kr）|ライト|
|比較表    |`/matrix/`                              |ライト|
|タイムライン |`/timeline/`                            |ライト|
|更新アーカイブ|`/updates/`                             |ライト|
|About  |`/about/`                               |ライト|

## 3-2. 管理画面（＝GitHub）

|役割     |実体                     |
|-------|-----------------------|
|ダッシュボード|Actions実行履歴            |
|データ管理  |`data/` のJSON（手動修正はPR） |
|ソース管理  |`config/countries.yaml`|
|通知     |差分検知時の自動Issue起票        |
|監査ログ   |Gitコミット履歴              |

-----

# 4. データ設計

## 4-1. 原則

- **DBサーバーは使わない。リポジトリ内JSONがデータベース**（読み＝静的fetch、書き＝Actionsのcommit、履歴＝Git）
- **収集した記事全文・生HTMLは要約生成後に破棄。永久保存は構造化レコードのみ**（更新フィードは年間約550KB想定）
- scrape_hash方式では生HTMLを保存せず正規化後のSHA-256ハッシュのみ保存する

## 4-2. ファイル構成（data層）

```
config/
  countries.yaml        # 監視対象国の定義（国の追加はここに1ブロック）
data/
  eu_baseline.json      # EU AI Actの構造化データ（差分の基準）
  regulations/{cc}.json # 国別の最新状態（上書き更新）
  updates/{YYYY-MM}.json# 月別更新フィード（追記）
  hashes.json           # scrape_hash対象のURL→ハッシュ
  meta.json             # { "last_sweep": ISO8601, "status": "ok|partial|failed" }
schema/
  regulation.schema.json
  update.schema.json    # JSON Schema。CIで全データを検証
```

## 4-3. countries.yaml（国追加インターフェース）

```yaml
countries:
  - code: jp
    name_ja: 日本
    name_en: Japan
    flag: "🇯🇵"
    lat: 36.2048
    lng: 138.2529
    official_sources:           # 一次ソース（確証用）
      - url: https://example.go.jp/rss.xml
        type: rss               # rss | scrape_hash
      - url: https://example.go.jp/ai-policy/
        type: scrape_hash
    news_queries:               # 二次ソース（検知用→Google News RSSに展開）
      - "日本 AI 規制"
      - "Japan AI regulation law"
```

- `news_queries` は `https://news.google.com/rss/search?q={URLエンコード済みクエリ}&hl=ja&gl=JP&ceid=JP:ja` に展開
- 初期6カ国の定義は §14-5 に記載（URLは実装時に死活確認すること）

## 4-4. 国別データ（regulations/{cc}.json）

```json
{
  "jurisdiction": "jp",
  "regulation_name": "AI推進法",
  "status": "in_force",
  "approach": "soft_law",
  "axes": {
    "risk_classification": { "summary": "", "detail": "", "sources": [] },
    "prohibited_uses":     { "summary": "", "detail": "", "sources": [] },
    "gpai_obligations":    { "summary": "", "detail": "", "sources": [] },
    "transparency":        { "summary": "", "detail": "", "sources": [] },
    "penalties":           { "summary": "", "detail": "", "sources": [] },
    "enforcement_body":    { "summary": "", "detail": "", "sources": [] },
    "timeline":            [ { "date": "", "event": "", "source": "" } ]
  },
  "diff_vs_eu": {
    "stricter": [ { "topic": "", "note": "", "source": "" } ],
    "looser":   [],
    "absent":   [],
    "unique":   []
  },
  "last_checked": "2026-06-11T00:00:00Z",
  "last_changed": "2026-06-01T00:00:00Z"
}
```

- `status` 値域：`proposed | draft | consultation | enacted | in_force`
- `approach` 値域：`risk_based | sectoral | soft_law`
- 7軸はEU AI Act構造に合わせて固定。全国同一の軸で構造化することが差分の前提
- `sources` は一次ソースURL必須。出典のない要約はデータに反映しない
- `last_checked`（巡回日時）と `last_changed`（内容変更日時）を必ず区別する
- EUのみ `diff_vs_eu` の代わりに `"is_baseline": true`

## 4-5. 更新フィード（updates/{YYYY-MM}.json 内の配列要素）

```json
{
  "id": "2026-05-19-eu-001",
  "date": "2026-05-19",
  "country": "eu",
  "axis": "risk_classification",
  "change_type": "guideline_draft",
  "title": "ハイリスクAI分類のドラフトガイドライン公表",
  "summary": {
    "what": "1行目:何が起きたか（事実）",
    "who": "2行目:誰に効くか（対象者）",
    "when_impact": "3行目:いつから・EU差分への影響"
  },
  "detail": "任意。10〜15行の詳細版",
  "so_what": "実務インパクト一言（例:EU準拠の社内規定なら追加対応不要）",
  "impact": { "diff_changed": false, "diff_note": "" },
  "sources": ["https://..."],
  "country_anchor": "/country/eu/#tl-2026-05-19"
}
```

**要約の設計原則**：

- 更新カードが要約するのは「規制」ではなく「**変化（差分）**」のみ。規制の全体像は国別ページの7軸が常設で担う
- summaryはWhat/Who/When+影響の3行テンプレートをGeminiプロンプトで強制（§14-4）
- ステータス・日付・国・変更種別などのメタ情報は本文に書かずバッジ・日付欄が運ぶ
- `change_type` 値域：`new_regulation | status_change | guideline_draft | deadline_change | diff_change | other`
- `impact.diff_changed: true` のレコードはIssue自動起票の対象

## 4-6. 非公開データ

- `GEMINI_API_KEY` … GitHub Actions Secretsのみ。**クライアントJS・リポジトリ内に絶対に置かない**
- 個人情報：扱わない

-----

# 5. 業務ロジック

## 5-1. 差分の4分類（このサイトの中核概念）

|分類      |意味           |実務での読み方        |色|
|--------|-------------|---------------|-|
|stricter|EUより厳しい      |EU準拠では不足。追加対応  |赤|
|looser  |EUより緩い       |EU準拠でカバー済み（安心） |緑|
|absent  |EUにある規定が存在しない|EU準拠で自動カバー     |灰|
|unique  |EUにない独自規定    |**見落とし注意。個別対応**|紫|

## 5-2. 日次パイプライン

```
1. 収集    countries.yamlの全ソース巡回
            - rss: フィード取得、前回以降の新着を抽出
            - scrape_hash: HTML取得→スクリプト/空白除去で正規化→SHA-256→
              hashes.jsonと比較→変化時のみGeminiに新着リンク抽出を依頼
            - news_queries: Google News RSS取得
2. 選別    新着全件（タイトル＋抜粋）を1プロンプトに束ねて Flash-Lite へ
            →「AI規制関連か／どの国か／既存updatesと重複か」をJSON返答
3. 確証    関連ありの項目の一次ソースURLをfetchし本文取得（HTML→テキスト化）
4. 要約    Flash が §4-5 スキーマで要約＋差分影響を生成（responseSchema強制）
5. 反映    regulations/{cc}.json・updates/{YYYY-MM}.json・meta.json を更新
6. 検証    schema/ のJSON Schemaで全データをバリデーション（失敗ならcommitしない）
7. commit  「chore(data): sweep YYYY-MM-DD」でcommit
8. 通知    impact.diff_changed=true があれば gh CLI でIssue起票（label: diff-change）
9. デプロイ 同一ワークフロー内で Astroビルド→actions/deploy-pages
```

**エラー処理**：

- 個別ソースの取得失敗 → スキップしてログ、パイプラインは継続
- GeminiのJSONパース失敗 → 1回リトライ→失敗ならその項目をスキップしIssue起票
- 429 → 指数バックオフ（60s→120s→240s、最大3回）
- 全体失敗 → meta.json の status を "failed" にしてcommit（鮮度表示で利用者に伝わる）

## 5-3. Gemini API利用ルール

- レート制限は**プロジェクト単位**。複数キー・複数プロジェクトでの枠回避は規約違反のため行わない
- **選別＝Flash-Lite系／要約＝Flash系**（モデル別に枠が分かれる。具体的モデル名は実装時に公式docsの最新を確認）
- **バッチ原則**：1記事1リクエスト禁止。新着は束ねる。想定消費は1日15リクエスト以下
- 構造化出力：`generationConfig.response_mime_type: "application/json"` ＋ `response_schema` を必ず指定
- それでも壊れた出力が来る前提でスキーマバリデーション必須

## 5-4. データ品質ルール

- 出典のない要約は反映しない
- 既存データと矛盾する情報をGeminiが検出した場合、自動上書きせず `needs-review` ラベルでIssue起票（解釈が割れる箇所は人間が最終判断）

-----

# 6. UI設計

## 6-1. デザイン方針：ハイブリッド

> **「ロビーは演出、執務室は実務」のホテル方式。**

|エリア                   |テーマ                       |
|----------------------|--------------------------|
|トップ                   |ダーク（EU旗の紺＋金の星。ミッションコントロール）|
|国別・比較表・タイムライン・更新・About|ライト（紙白。読みやすさ最優先）          |

コンセプト：**「EUの旗は紺地に金の星。このサイトは紺の宇宙に、規制が動いた国が金の星として灯る。」**

## 6-2. 技術選定

**推奨：Astro ＋ Reactアイランド（静的ビルド→GitHub Pages）**

|部分        |技術                                                 |理由                                 |
|----------|---------------------------------------------------|-----------------------------------|
|骨格        |Astro（output: 'static'）                            |HTML第一主義。デフォルトJSゼロ＝「基本はHTML」方針と合致  |
|リッチ部分     |Reactアイランド（地球儀・NEWカード・比較表・更新検索のみ）                  |21st.devのReact/Tailwindコンポーネントを移植可能|
|地球儀       |cobe（軽量5KB）を第一候補、globe.glを比較候補                     |Phase 1で見た目比較して選定                  |
|スタイル      |Tailwind CSS（Astro統合）＋ §6-6 トークンをtailwind.configに定義|                                   |
|国別・タイムライン等|純Astroコンポーネント（ビルド時にJSONを静的展開）                      |SEO・速度                             |
|更新検索      |クライアントJS。年単位JSONを遅延fetch→メモリ内フィルタ                  |DBレス                               |

**代替（フォールバック）**：ビルドレス素HTML/CSS/JS＋globe.gl CDN。Astro環境構築に失敗した場合のみ。

**21st.dev活用ルール**：

- Magic MCP（21st.dev/mcp）でのコンポーネント生成可
- ただし**生成物は必ず§6-6トークンに色・フォントを置換**。デフォルト配色のままの使用禁止
- 参照カテゴリ：Hero／Card／Table／Badge／Timeline

## 6-3. ワイヤーフレーム

### トップ（PC・ダーク）

```
┌─────────────────────────────────────┐
│ ロゴ AI Reg Atlas        比較表 タイムライン 更新 About │
├──────────────────────┬──────────────┤
│  回転地球儀            │  NEW（直近3件）        │
│  ・6カ国マーカー        │  ▸ 展開式カード×3      │
│  ・7日以内更新国は      │                      │
│    金パルス発光        │  [すべての更新を見る→]  │
│  ・タグラインを左下重ね  │                      │
│       （左 約7割）      │      （右 約3割）      │
├──────────────────────┴──────────────┤
│ 6カ国ステータスバー（国旗＋規制名＋状態バッジ横一列）      │
├─────────────────────────────────────┤
│ フッター：免責／AI生成明示／最終巡回時刻／SNS            │
└─────────────────────────────────────┘
```

- スマホ（<768px）：地球儀非表示→「タグライン→NEW3件→6カ国カード縦並び」
- WebGL非対応環境も同フォールバック

### 国別（ライト）

```
パンくず ＞ 国旗＋国名＋ステータスバッジ＋アプローチ  [差分をコピー]
─────────────────────────────
EU差分サマリー：4分類カード横並び（件数を大きくMono表示・カウントアップ）
  stricter(赤) │ looser(緑) │ absent(灰) │ unique(紫)
  ※カードクリックで該当リストへスクロール
─────────────────────────────
7軸詳細：アコーディオン（summary常時表示、detail開閉。unique該当軸にタグ）
─────────────────────────────
タイムライン（縦・日付降順、各項目 id="tl-YYYY-MM-DD"、出典リンク付き）
─────────────────────────────
出典一覧 ／ フッター
```

- **ファーストビューで差分件数が見えることを必須要件とする**
- EUページは差分サマリーの代わりに「BASELINE（基準）」表示

### 比較表（ライト）

- 縦軸＝6カ国（EUは基準行として最上段固定）、横軸＝7軸。セル色＝4分類
- セルクリック→該当国ページ該当軸へアンカー遷移
- スマホ：横スクロールテーブル、先頭列（国旗）固定

### 更新（ライト）

- 上から ①フィルターチップ列（国旗／軸／変更種別。トグル・複数選択可）
  ②フリーワード検索ボックス（title・summary対象、クライアントJS部分一致）
  ③月別グループの時系列カードリスト
- カードはトップのNEWと同一コンポーネント（クリックでその場展開：3行要約／so_what／影響バッジ／一次ソース／国別ページアンカーリンク）

## 6-4. デザイントークン（確定仕様）

### カラー

|トークン             |値        |用途                       |
|-----------------|---------|-------------------------|
|`--navy-deep`    |`#0A1024`|ダーク背景                    |
|`--navy-soft`    |`#141B36`|ダーク面カード                  |
|`--star-gold`    |`#FFC700`|アクセント唯一色。マーカー・パルス・ダーク面リンク|
|`--paper`        |`#FAFAF7`|ライト背景                    |
|`--ink`          |`#1A2233`|ライト本文                    |
|`--diff-stricter`|`#D64550`|赤                        |
|`--diff-looser`  |`#2E9E6B`|緑                        |
|`--diff-absent`  |`#8A94A6`|灰                        |
|`--diff-unique`  |`#7C5CE0`|紫                        |

- アクセントは金1色のみ。差分4色は意味色（バッジ・セル・サマリーカード専用、装飾使用禁止）

### タイポグラフィ（三役）

|役割    |フォント               |用途                         |
|------|-------------------|---------------------------|
|ディスプレイ|Shippori Mincho    |タグライン・ページ見出しのみ。多用禁止        |
|本文    |Zen Kaku Gothic New|全本文・UI                     |
|データ   |IBM Plex Mono      |日付・国コード・件数・バッジ・LAST SWEEP表示|

### モーション（5箇所限定）

|箇所       |演出                             |
|---------|-------------------------------|
|地球儀      |低速オートローテーション（ドラッグで停止）          |
|更新国マーカー  |金パルス2.4s周期（last_changed 7日以内のみ）|
|NEWカード展開 |高さ200ms ease-out               |
|ダーク→ライト遷移|フェード300ms                      |
|差分件数     |初回表示時カウントアップ600ms              |

- `prefers-reduced-motion: reduce` で全停止（地球儀は静止画に差し替え）
- 上記以外のアニメーション追加禁止

### 「AIが作った感」の回避（モックレビューからのフィードバック反映・必須）

1. **均一なカードの繰り返しを避ける**：NEWカードは1件目のみ視覚的に大きく（日付・国旗を強調、序列をつける）。同じ形の箱を等間隔に並べただけのレイアウトを禁止
1. **本物の情報密度**：ダミー的な短文を等量並べない。実データの文字量の揺らぎをそのまま見せる（揃えすぎない）
1. **余白に意図を**：セクション間余白を均等割りにせず、地球儀まわりは広く・データ部は詰める
1. **角丸とシャドウの既定値禁止**：rounded-xl+shadow-mdの全面適用をしない。ダーク面は罫線（1px, 低透明度白）基調、ライト面は紙らしくシャドウ最小
1. 実装後にPC/スマホのスクリーンショットを撮り、上記4点をセルフレビューしてから完了とする

## 6-5. 主要コンポーネント

1. **Globe**（Reactアイランド）：6カ国マーカー、金パルス、クリックで国別ページへ遷移
1. **UpdateCard**（Reactアイランド）：展開式。NEW欄と/updates/で共用
1. **DiffSummary**（Astro＋軽量JS）：4分類件数カード、カウントアップ、アンカースクロール
1. **CopyButton**：差分内容を以下のプレーンテキスト形式でクリップボードへ

```
【{国名}のAI規制とEU AI Actの差分】{YYYY-MM-DD時点}
規制名: {regulation_name}（状態: {status}）
■ EUより厳しい: {stricter各topic}
■ EUより緩い: {looser各topic}
■ 規定なし: {absent各topic}
■ 独自規定: {unique各topic}
出典: {sources URL列挙}
※AI Reg Atlas（AI自動要約・法的助言ではありません） {ページURL}
```

1. **StatusBar**：6カ国チップ（国旗＋規制名＋状態バッジ）
1. **Footer**：免責／「要約生成: Gemini API」明示／`LAST SWEEP {meta.json}`（全ページ）

-----

# 7. 外部サービス

|用途    |サービス                                 |費用                |
|------|-------------------------------------|------------------|
|ホスティング|GitHub Pages                         |無料                |
|定期実行  |GitHub Actions（cron 21:00 UTC＝JST朝6時）|publicリポジトリ＝分数制限なし|
|DB    |リポジトリ内JSON                           |無料                |
|AI    |Gemini API無料枠（Flash／Flash-Lite）      |無料                |
|地球儀   |cobe または globe.gl（npm）               |無料                |
|分析    |初期なし                                 |—                 |

障害方針：Gemini障害→当日スキップ翌日リトライ／RSS死亡→Google News網が補完、月次死活確認で修理。

-----

# 8. セキュリティ

## 8-1. 秘密情報は世界に1つだけ

このシステムの秘密は `GEMINI_API_KEY` のみ。置き場所は次の2箇所に限定する。

|環境            |置き場所                |備考                   |
|--------------|--------------------|---------------------|
|GitHub Actions|Actions Secrets     |ログでは自動マスクされる         |
|ローカル開発        |`.env`（**施主が手動で作成**）|`scripts/` はdotenvで読む|

- **`.gitignore` に `.env` `data/.cache/` `node_modules/` `dist/` を必ず含める**（リポジトリ初期化の最初のcommitで入れること）
- `.env.example`（キー名のみ・値は空）を同梱し、READMEにセットアップ手順を記載
- キーをコード・チャット・Issue・コミットメッセージに書くことを禁止
- キー漏えい時手順（AI Studioで失効→再発行→`gh secret set`→`.env`更新）をREADMEに記載

## 8-2. publicリポジトリの意味（施主了解事項）

- **コード・プロンプト・workflow・data/のJSONは全て公開される**。これは意図的（サイト自体が公開情報であり、データの透明性はむしろ信頼性になる）
- Actionsの実行ログも公開される。よって**ログに記事本文・取得HTMLを出力しない**（タイトル・URL・件数のみ）
- LICENSEを置く（推奨：コード=MIT、data/=CC BY 4.0。出典明記で再利用可）
- フォークからのPRにはSecretsが渡らない（GitHub標準仕様）ため、第三者PRでキーは漏れない

## 8-3. プロンプトインジェクション対策（収集型システム固有のリスク）

巡回先のWebページに「これまでの指示を無視して〜」等の細工テキストが仕込まれる可能性がある。対策：

- Geminiの出力は**responseSchemaで構造を強制**し、スキーマ外の出力は破棄
- `sources` に書けるURLは**collect.mjsが実際にfetchしたURLのみ**（モデルが生成したURLは採用しない）
- `regulation_patch` の適用は §5-4 の矛盾チェックを通過したもののみ。怪しい変更はneeds-review Issueへ
- 要約文に含まれるURL・HTMLタグはレンダリング時にエスケープ（リンクはsources欄からのみ生成）

## 8-4. その他

- 公開サイトは完全静的＝攻撃面極小
- CIにgitleaksを入れ、シークレット混入をブロック
- npm依存はlockファイルで固定（`npm ci`）

-----

# 9. 運用

|頻度|担当     |作業                                         |
|--|-------|-------------------------------------------|
|日次|Actions|パイプライン（§5-2）全自動                            |
|週次|人間     |diff-change／needs-review Issueの確認、要約品質の抜き取り|
|月次|人間     |ソース死活確認、Gemini枠消費確認、国追加検討                  |

**国の追加手順**：`countries.yaml`に1ブロック追記→commit→翌日から自動監視。初回は「この国のAI規制の現状サマリーを§4-4スキーマで生成」するブートストラップモード（`npm run bootstrap -- --country=xx`）でシードJSONを作成し、人間レビュー後にマージ。

**通知**：差分変化＝Issue（label: diff-change）／パイプライン失敗＝Actions標準通知／将来＝Discord Webhook接続可能な設計（通知部を関数として分離しておく）。

-----

# 10. SEO・OGP

- 全ページ静的HTML生成（SPAハッシュルーティング禁止）
- 国別title：「{国名}のAI規制の現状とEU AI Actとの差分 | AI Reg Atlas」
- OGP：共通キービジュアル1枚（Phase 1）、国別自動生成（Phase 3）
- `sitemap.xml`・`robots.txt` をビルド時生成
- 更新フィードにArticle構造化データ

-----

# 11. 法務・免責（AIガバナンス系サイトとして特に重要）

- **全ページフッター＋Aboutに免責**：「本サイトはAIによる自動要約を含む情報提供であり、法的助言ではありません。実務判断は必ず原文と専門家の確認を」
- **AI利用の透明性明示**：「この要約はGemini APIにより自動生成されています」を要約ブロックとフッターに表示
- 要約は短く、必ず一次ソースリンクを添える（原文の代替にならない設計）
- ソース巡回はrobots.txt尊重・日次1回・適切なUser-Agent名を名乗る

-----

# 12. テスト・受け入れ基準

## 12-1. CI（PR・push時）

- [ ] `data/` 全JSONがschema/に適合
- [ ] gitleaksでシークレット混入なし
- [ ] Astroビルド成功

## 12-2. 機能テスト

- [ ] トップ→国別→一次ソースが3クリック以内
- [ ] スマホ（<768px）で地球儀→リスト表示に切替
- [ ] `prefers-reduced-motion` で全アニメーション停止
- [ ] コピーボタンの出力が§6-5フォーマットに一致
- [ ] 更新検索：チップ複数選択＋フリーワードの組み合わせが機能
- [ ] 地球儀なし（JS無効）でも全情報にHTMLで到達可能

## 12-3. パイプラインテスト

- [ ] RSS1本死亡→継続して他ソース処理
- [ ] Gemini不正JSON→リトライ→スキップ→Issue起票
- [ ] 429→バックオフ動作
- [ ] 新着ゼロの日もmeta.json更新がcommitされる（cron停止防止）
- [ ] diff_changed=trueでIssueが起票される

-----

# 13. ロードマップ

## Phase 1：見える化（自動化なし）

- リポジトリ初期化（§14-1構造）、スキーマ・countries.yaml確定
- 6カ国の手動シードデータ（ブートストラップモード利用可、人間レビュー必須）
- トップ／国別×6／About 実装（地球儀・NEWカード・差分サマリー・コピー・フッター）
- スマホフォールバック、免責、鮮度表示
- **完了条件**：6カ国の現状とEU差分が閲覧でき、3クリックで原文着地。§6-4セルフレビュー済み

## Phase 2：自動化

- Actions日次cron＋収集（rss/news/scrape_hash）＋Gemini選別・要約＋検証＋commit＋同一ワークフローデプロイ
- エラー処理一式（§5-2）
- **完了条件**：1週間、人間が触らずに更新フィードが育つ

## Phase 3：差分エンジン強化＋発信連携

- 比較表／タイムライン／更新アーカイブ検索ページ
- 差分変化の自動再計算＋Issue起票
- OGP自動生成・sitemap
- Discord Webhook通知
- **完了条件**：「今週の世界AI規制」記事が更新フィードだけで書ける

-----

# 14. 実装詳細（Codex向け・ここからが本体）

## 14-0. 初期セットアップ（CLI。ghが認証済みなら実装AIが実行してよい）

```bash
# 0. 人間にしかできないこと（事前に施主が実施）
#    - gh auth login（初回のみ）
#    - Google AI StudioでGeminiキー発行 → ローカルに .env を作成（GEMINI_API_KEY=...）
#    - gh secret set GEMINI_API_KEY は施主が自分のターミナルで対話実行する
#      （実装AIはキーの値に触れないこと）

# 1. リポジトリ作成（作業フォルダから）
gh repo create ai-reg-atlas --public --source=. --push

# 2. Pagesを「GitHub Actions」ソースで有効化
gh api -X POST repos/{owner}/ai-reg-atlas/pages -f build_type=workflow

# 3. デザイン参照モックの同梱
mkdir -p design && cp ai-reg-atlas-sample.html design/sample.html
git add design && git commit -m "docs: add design reference" && git push
```

- 最初のcommitに `.gitignore`（`.env` / `data/.cache/` / `node_modules/` / `dist/`）と `.env.example` を必ず含める（§8-1）

## 14-1. リポジトリ構造

```
ai-reg-atlas/
├ .github/workflows/
│   ├ pipeline.yml          # 日次：収集→要約→commit→build→deploy
│   └ ci.yml                # PR：schema検証＋gitleaks＋build
├ config/countries.yaml
├ data/                     # §4-2
├ schema/
├ scripts/                  # Node 20+, ESM
│   ├ collect.mjs           # ソース巡回→新着候補リスト生成
│   ├ triage.mjs            # Gemini Flash-Lite選別
│   ├ summarize.mjs         # Gemini Flash要約→data反映
│   ├ validate.mjs          # JSON Schema検証（ajv）
│   ├ bootstrap.mjs         # 新国シード生成
│   └ lib/gemini.mjs        # APIクライアント（バックオフ・responseSchema共通化）
├ src/
│   ├ layouts/DarkLayout.astro, LightLayout.astro
│   ├ pages/index.astro, country/[cc].astro, matrix.astro,
│   │        timeline.astro, updates.astro, about.astro
│   ├ components/Globe.tsx, UpdateCard.tsx, MatrixTable.tsx,
│   │            UpdateSearch.tsx,            # ← Reactアイランド
│   │            DiffSummary.astro, AxisAccordion.astro,
│   │            StatusBar.astro, CopyButton.astro, Footer.astro
│   └ styles/tokens.css
├ public/ (favicon, OGP画像, robots.txt)
├ astro.config.mjs（site設定・React統合・Tailwind統合）
├ tailwind.config.mjs（§6-4トークン定義）
└ package.json
```

## 14-2. pipeline.yml（要旨）

```yaml
name: daily-pipeline
on:
  schedule: [{ cron: "0 21 * * *" }]
  workflow_dispatch: {}
permissions:
  contents: write
  pages: write
  id-token: write
  issues: write
concurrency: { group: pipeline, cancel-in-progress: false }
jobs:
  sweep-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: node scripts/collect.mjs
      - run: node scripts/triage.mjs
        env: { GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }} }
      - run: node scripts/summarize.mjs
        env: { GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }} }
      - run: node scripts/validate.mjs
      - name: commit data
        run: |
          git config user.name "atlas-bot"
          git config user.email "bot@users.noreply.github.com"
          git add data/
          git diff --cached --quiet || git commit -m "chore(data): sweep $(date -u +%F)"
          git push
      - run: npx astro build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
      - uses: actions/deploy-pages@v4
```

- **ビルド〜デプロイを同一ワークフロー内で行う**（GITHUB_TOKENのpushは別ワークフローを起動しないため。§15-2）
- Issue起票はsummarize.mjs内から `GITHUB_TOKEN` でREST API（または actions/github-script）

## 14-3. collect.mjs の仕様

- countries.yamlを読み、ソース種別ごとに処理：
  - `rss`：fetch→パース（`rss-parser`）→ `data/.cache/last_seen.json` のpubDate以降を新着とする
  - `scrape_hash`：fetch→`<script>`/`<style>`除去・空白正規化→SHA-256→`data/hashes.json`比較→変化時は本文テキストを一時変数に保持（**保存しない**）し、新着リンク抽出をtriage対象に回す
  - `news_queries`：Google News RSS化してfetch（重複URLは正規化して排除）
- 出力：`/tmp/candidates.json`（title, url, snippet, country_hint, source_type）
- タイムアウト15s／ソース。失敗はログしてスキップ

## 14-4. Geminiプロンプト雛形

### triage.mjs（Flash-Lite、新着全件を1リクエストに束ねる）

```
あなたはAI法規制の専門アナリストです。以下の記事候補リストを評価してください。
対象国コード: eu, jp, us, uk, cn, kr
既存の更新フィード（直近60日のid/title一覧）: {existing_list}

各候補について判定:
- relevant: AI法規制・ガイドライン・施行令・公的ガイダンスに関するか（ニュース解説のみ・製品発表・株価は false）
- country: 対象国コード（複数可・対象外なら除外）
- duplicate: 既存フィードと同一事象か
- priority: high（法令・公式文書の発行/変更） / low（動向解説）

候補: {candidates_json}
```

- responseSchemaで `[{index, relevant, country[], duplicate, priority}]` を強制

### summarize.mjs（Flash、確証済み本文を渡す）

```
あなたはAI法規制の専門アナリストです。以下の一次ソース本文から、
更新レコードを生成してください。事実のみを書き、推測には「〜の見込み」と明記。

制約:
- summary.what / who / when_impact は各60文字以内・体言止め可
- so_what は企業のAIガバナンス担当者向けの実務インパクト1文
- EU AI Act基準（添付のeu_baseline.json）と比較し、diff_vs_euへの影響を
  stricter/looser/absent/unique の観点で判定。影響なしなら diff_changed=false
- 出典は与えられたURLのみ。本文にない情報を書かない

eu_baseline: {eu_baseline_json}
対象国の現行データ: {current_regulation_json}
一次ソース本文: {article_text}
```

- responseSchemaは§4-5構造＋ `regulation_patch`（regulations/{cc}.jsonへの差分更新。変更なしならnull）
- `regulation_patch` 適用時に既存値と矛盾（statusの後退等）があれば適用せずneeds-review Issue

## 14-5. countries.yaml 初期値（**URLは実装時に必ず死活確認・修正すること**）

```yaml
countries:
  - code: eu
    name_ja: EU
    flag: "🇪🇺"
    lat: 50.85
    lng: 4.35
    official_sources:
      - { url: "https://digital-strategy.ec.europa.eu/en/related-content?topic=119&type=news&format=rss", type: rss }
    news_queries: ["EU AI Act", "EU AI Act guidelines"]
  - code: jp
    name_ja: 日本
    flag: "🇯🇵"
    lat: 36.20
    lng: 138.25
    official_sources:
      - { url: "https://www8.cao.go.jp/cstp/ai/index.html", type: scrape_hash }
      - { url: "https://www.soumu.go.jp/menu_news/s-news/index.html", type: scrape_hash }
    news_queries: ["日本 AI 規制 法律", "AI推進法"]
  - code: us
    name_ja: 米国
    flag: "🇺🇸"
    lat: 38.90
    lng: -77.04
    official_sources:
      - { url: "https://www.nist.gov/news-events/news/rss.xml", type: rss }
    news_queries: ["US AI regulation law", "state AI law enacted"]
  - code: uk
    name_ja: 英国
    flag: "🇬🇧"
    lat: 51.50
    lng: -0.12
    official_sources:
      - { url: "https://www.gov.uk/search/news-and-communications.atom?organisations%5B%5D=department-for-science-innovation-and-technology", type: rss }
    news_queries: ["UK AI regulation"]
  - code: cn
    name_ja: 中国
    flag: "🇨🇳"
    lat: 39.90
    lng: 116.40
    official_sources:
      - { url: "https://www.cac.gov.cn/zcwj/index.htm", type: scrape_hash }
    news_queries: ["China AI regulation CAC", "中国 AI 規制"]
  - code: kr
    name_ja: 韓国
    flag: "🇰🇷"
    lat: 37.57
    lng: 126.98
    official_sources:
      - { url: "https://www.msit.go.kr", type: scrape_hash }
    news_queries: ["Korea AI Basic Act", "韓国 AI基本法"]
```

- Actionsから中国系サイトへの到達性は不安定な可能性あり。失敗時はnews_queriesが補完する設計なので、到達不可でもエラー扱いにしない（warnログのみ）

## 14-6. デザイン参照

- リポジトリに `design/sample.html`（施主承認済みのモックHTML）を同梱する。**色・フォント・パルス・カード展開・ライト遷移の挙動はこれを正とする**。ただし§6-4「AI感の回避」4項目はモックから改善すること
- 21st.dev Magic MCPで生成する場合もトークン置換必須

## 14-7. 実装順序（Codexはこの順で進める）

1. リポジトリ初期化：Astro+React+Tailwind、tokens定義、schema/、CI（ci.yml）
1. シードデータ：eu_baseline.json→bootstrap.mjsで6カ国regulations生成→人間レビュー用PR
1. ページ実装：DarkLayout/LightLayout→トップ→国別→About（Phase 1完了条件を満たす）
1. セルフレビュー：PC/スマホのスクリーンショット→§6-4チェック→修正
1. パイプライン：collect→triage→summarize→validate→pipeline.yml（workflow_dispatchで手動テスト→cron有効化）
1. Phase 3ページ：matrix→timeline→updates（検索）→OGP/sitemap→Discord通知

-----

# 15. ハマりどころ（必読）

1. **リポジトリはpublic**：Actions標準ランナーの分数制限がなくなる
1. **GITHUB_TOKENのpushは他ワークフローを起動しない**：デプロイは同一ワークフロー内で `actions/deploy-pages` を使い完結させる（§14-2）
1. **60日無活動でscheduled workflowは停止**：新着ゼロの日も `meta.json` の `last_sweep` を更新しcommitする（鮮度表示と一石二鳥）
1. **cronの実行時刻は保証されない**：数十分の遅延を前提にする
1. **Pages設定**：リポジトリ設定でPagesのソースを「GitHub Actions」にする（ブランチデプロイではない）
1. **Geminiの構造化出力**：response_mime_type＋response_schema必須。それでも壊れる前提でajv検証
1. **Tailwindのパージ**：動的クラス名（`bg-diff-${type}`等）はパージで消える。safelistに4分類色を登録するか、完全なクラス名で分岐する
1. **cobe/globe.glはSSR不可**：Astroアイランドは `client:only="react"` で読み込む

-----

# 16. 実装者への最初の5問の答え

1. **誰のためか** → AIガバナンス実務者（と、過去にそうだった運営者自身）
1. **何をしてほしいか** → EU差分を確認し、原文に飛び、社内資料に使ってもらう
1. **必要なページは** → トップ／国別×6／比較表／タイムライン／更新／About
1. **保存するデータは** → 国別規制JSON（7軸＋差分4分類）、更新フィード、設定YAML。生データは破棄。個人情報ゼロ
1. **誰がどう運用するか** → 日次は全自動、人間は週次レビューのみ。国追加はYAML1ブロック
