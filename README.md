# AI Reg Atlas

> 世界のAI規制を、EU基準の「差分」で読む。

EU AI Actを基準に、13カ国・地域（EU・日本・米国・英国・中国・韓国・シンガポール・カナダ・ブラジル・インド・豪州・台湾・カンボジア）のAI規制の差分が一目でわかる、毎日自動更新される静的サイト。

- **サイト**: https://darari-nu.github.io/ai-reg-atlas/
- **仕様書**: `REQUESTS.md`（一撃実装仕様 v2.0）
- 一次ソース主義 / 差分主義（stricter・looser・absent・unique の4分類） / 完全自動運用

## アーキテクチャ

```
GitHub Actions (cron 21:00 UTC = JST 6:00)
  collect.mjs    countries.yaml の全ソース巡回（RSS / scrape_hash / Google News）
  triage.mjs     新着を1リクエストに束ねて Gemini Flash-Lite で選別
  summarize.mjs  一次ソース本文を確証fetch → Gemini Flash が3行要約＋差分影響を生成
  validate.mjs   JSON Schema検証（失敗ならcommitしない）
  → data/ をcommit → 同一ワークフロー内で Astroビルド → GitHub Pages デプロイ
  → diff_changed / needs-review は Issue 自動起票
```

- DBなし。`data/` のJSONがデータベース（履歴はGit）
- 収集した記事本文・生HTMLは要約後に破棄。保存するのは構造化レコードのみ
- フロント: Astro（静的）＋ Reactアイランド（地球儀 cobe のみ）＋ Tailwind

## セットアップ

```bash
npm install
npm run dev       # http://localhost:4321/ai-reg-atlas/
npm run build     # dist/ に静的出力
npm run validate  # data/ 全JSONのスキーマ検証
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

### キーが未設定でも壊れない

`triage.mjs` / `summarize.mjs` はキー未設定を検知すると安全にスキップし、
`meta.json` の更新だけ行う（scheduled workflow の60日停止対策も兼ねる）。

## 国の追加

1. `config/countries.yaml` に1ブロック追記
2. `npm run bootstrap -- --country=xx` でシードJSONドラフト生成
3. 人間レビュー → PR → マージ。翌日から自動監視に入る

## 運用

| 頻度 | 担当 | 作業 |
|---|---|---|
| 日次 | Actions | 巡回→選別→要約→検証→commit→デプロイ（全自動） |
| 週次 | 人間 | `diff-change` / `needs-review` Issueの確認、要約品質の抜き取り |
| 月次 | 人間 | ソース死活確認、Gemini枠消費確認、国追加検討 |

## 仕様書からの意図的な簡略点（Phase 1）

- 地球儀マーカーのクリック遷移は未実装（cobeにヒットテストがないため）。国別ページへの導線はステータスバーとヘッダーが担う
- `/updates/` の検索はReactアイランドでなく素のJS（サーバーレンダリングしたカードをdata属性でフィルタ。表示は同等）
- 比較表のセル分類はシードデータから人手導出した初期値（自動再計算はPhase 3）
- `design/sample.html`（承認済みモック）は未受領のため未同梱。受領後に追加する

## データの注意

`data/` のシード（6カ国の規制サマリー）はAIが下書きした**人間レビュー前のドラフト**を含む。
誤りを見つけたらPRかIssueで指摘してほしい。出典のない記述は受け付けない。

## ライセンス

- コード: MIT（`LICENSE`）
- `data/` 配下: CC BY 4.0（出典明記で再利用可）

## 免責

本サイト・本リポジトリはAIによる自動要約を含む情報提供であり、法的助言ではありません。
実務判断は必ず一次ソースと専門家の確認を経てください。
