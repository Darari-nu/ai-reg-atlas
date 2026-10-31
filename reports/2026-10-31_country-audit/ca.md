Fetch は使えます。この 2 件と、まだ確認できていない項目を取ります。# カナダ（ca）点検結果：2026-10-31 時点

## 調べ方と限界
- 読んだファイルは `data/regulations/ca.json` と `config/countries.yaml` の ca ブロック（233–256 行）です。
- ファイル内に「未確認」という語はありませんでした（ca 関連で grep しました）。そのため、3 の「未確認」は「私が確かめきれなかった点」を指します。
- 途中で Web 検索の回数上限に達しました。以降は、すでに開けたページと、`web_fetch` で開けたページだけを根拠にしています。
- 以下の URL はすべて、実際に開けたか、検索結果に出たものです。
  - 確認の度合いは、開けたものを「開けた」、検索結果のみのものを「検索のみ」と書き分けます。
  - 「検索のみ」の URL は、本文の一部を見ただけで、全文は読んでいません。

---

## 1. 直すべき箇所

| # | JSON のパス | 今の記述 | 正しい記述 | 出典 | 確度 |
|---|---|---|---|---|---|
| 1 | `regulation_name`（3 行目） | 「AIDA は2025年議会**解散**で廃案」 | 廃案の原因は**議会の閉会（プロロゲーション）**で、日付は 2025-01-06 です。同じファイルの timeline（61–62 行）と `risk_classification.detail` は「プロロゲーション」と書いており、記述が食い違っています。 | LEGISinfo C-27（開けた）。44-1 会期が 2025-01-06 で終わったと表示されています。 https://www.parl.ca/legisinfo/en/bill/44-1/c-27 | 高 |
| 2 | `risk_classification.sources`、`prohibited_uses.sources`、`penalties.sources`、`diff_vs_eu.looser/absent` の source | 「廃案」の根拠として ISED の AIDA ページを挙げている | そのページは**アーカイブ済み**（Date modified 2025-12-09）で、「AIDA は〜する予定」という提案時の説明のままです。廃案には触れていません。廃案の根拠は LEGISinfo C-27 に差し替えてください。 | https://ised-isde.canada.ca/site/innovation-better-canada/en/artificial-intelligence-and-data-act（開けた） | 高 |
| 3 | `risk_classification.detail` 末尾、`enforcement_body.summary`／`detail` | 「規制方針を再検討中で、再立法の形は未確定」 | 方針は出ています。2026-06-04 に国家AI戦略「AI for All」が公表されました。弁護士事務所の分析では、包括的なAI法は予告せず、個別の法律で対応する形です。個別の法案は次のとおりです。<br>・C-36（プライバシー法案。自動意思決定システムの透明性を含む）<br>・C-34（SNS・AIチャットボット規制）<br>・C-16（成立済みの刑法改正）<br>・ISED の AI 透明性に関する討議文書（協議） | 公表日 6/4 は ISED 自身の討議文書に明記（開けた）。 https://ised-isde.canada.ca/site/ised/en/have-your-say-advancing-ai-transparency-canada/enhancing-trust-artificial-intelligence-through-increased-transparency<br>戦略本文（開けた）: https://ised-isde.canada.ca/site/ised/en/canadas-national-artificial-intelligence-strategy-ai-all<br>「包括法は発表せず」の評価は Fasken（検索のみ）: https://www.fasken.com/en/knowledge/2026/08/canada-s-national-ai-strategy | 事実は高。「包括法なし」の評価部分は中（事務所の見解） |
| 4 | `enforcement_body`（所管機関） | 「AI専属の監督機関はない」「プライバシーコミッショナーが既存権限で対応」 | 現状は正しいですが、新機関が提案されています。C-36 は、プライバシー法の所管を**新設のデジタル安全・データ保護委員会**（Digital Safety and Data Protection Commission of Canada）へ移す内容です。C-34 は同委員会の前身にあたるデジタル安全委員会を新設します。どちらも法案段階で、成立していません。2026-10-20 時点でも OPC が現行の所管です（下記 2 の OPC 発表）。 | C-36 公式解説（開けた）: https://www.canada.ca/en/innovation-science-economic-development/news/2026/06/government-of-canada-introduces-legislation-to-protect-canadians-privacy-in-the-digital-age.html<br>C-34 政府発表（検索のみ）: https://www.canada.ca/en/canadian-heritage/news/2026/06/government-of-canada-introduces-legislation-to-make-social-media-services-and-ai-chatbots-safer-for-children.html | 高 |
| 5 | `timeline[3].source`（2025-05-13、`https://www.pm.gc.ca/`） | 首相府のトップページ | 個別の記事ではありません。この日付の根拠として確認できたのは BNN の記事です（「初のAI担当大臣」と報じています）。差し替えを推奨します。肩書は C-36 の報道で「Minister of Artificial Intelligence and Digital Innovation」と確認でき、ファイルの訳と合っています。 | https://www.bnnbloomberg.ca/business/politics/2025/05/13/former-journalist-evan-solomon-named-first-ever-federal-ai-minister/（検索のみ） | 中（首相府の一次資料は未確認） |
| 6 | `penalties.detail` | 「AIDAは全世界売上3%等の行政制裁金と刑事罰」 | 金額の層を分けて書くのが安全です。二次資料（法律事務所の解説、検索のみ）によると、3%／C$10M は一般の違反の層、5%／C$25M は第38・39条の犯罪の層とされています。AIDA 公式ページに金額の記載はなく、法案本文は私が開けていません。現ファイルの書き方は大づかみで、誤りと断定はできません。 | https://gowlingwlg.com/en/insights-resources/articles/2023/artificial-intelligence-and-data-act-aida（検索のみ） | 低〜中 |
| 7 | `diff_vs_eu.unique[0].note` | 「G7で唯一「包括AI法を作ろうとして議会日程で失敗した」国」 | 出典の LEGISinfo はカナダの法案履歴だけを示しており、G7 で唯一という主張は裏付けません。他国との比較は私も確認できていません。出典を足すか、削除してください。 | LEGISinfo C-27（開けた） | 根拠なし（誤りとは断定しない） |
| 8 | `prohibited_uses.detail` | 「既存法（刑法等）で対応」とのみ記載 | 刑法が実際に AI 関連で改正されました。C-16（Protecting Victims Act）は 2026-06-18 に国王裁可を受けました。非同意の性的ディープフェイクを、親密画像に関する犯罪の対象に含めます。大半の規定は 2026-07-18 に施行されました。AI 全般の禁止リストではないので、summary は維持して detail に追記する程度で足ります。 | 法務省（検索で内容確認）: https://www.justice.gc.ca/eng/csj-sjc/pl/c16/index.html<br>https://www.canada.ca/en/department-justice/news/2026/07/major-criminal-code-reforms-to-protect-canadians-are-now-law.html | 高 |
| 9 | `last_changed`（107 行） | `2025-05-13` | 2026-06 に複数の動きがあり、古いままです。更新は 2026-06-04 以降が妥当です（運用ルール次第）。 | 上記各出典 | 高 |
| 10 | `countries.yaml` 245 行のコメント「連邦のAIDAが廃案のまま止まっているため、実効的な規律は州法が担う」 | 「止まっている」「州法が担う」 | 連邦でも 2026-06 に C-34・C-36 が提出され、C-16 が成立しました。「止まったまま」は事実と合いません。州法については、ISED の討議文書がオンタリオ州の 2 法を例に挙げています。<br>・Working for Workers Four Act（採用での AI 利用の開示）<br>・Enhancing Digital Security and Trust Act（公共部門の AI 責任枠組み）<br>ケベックだけが担っているわけではありません。 | ISED 討議文書（開けた、上記 URL） | 高 |

### 問題なしと確認できた点
- **timeline[0]（2022-06-16 に C-27 提出）**：LEGISinfo に first reading 2022-06-16 とあります。
- **timeline[2]（2025-01-06）**：上記 1 のとおりです。
- **countries.yaml 243 行のコメント（AIDA ページは旧・廃案のアーカイブ）**：ページ自体がアーカイブ表示で、整合します。
- **自主行動規範（2023-09）**：ISED のコード本文に「September 2023」とあり、署名者の一覧もあります。
- **ISED の AIDA ページの記述**：上記 2 のとおり、記述は提案時の説明のままです。

---

## 2. 足すべき新しい動き（timeline 案）

| 日付 | 出来事 | 出典 | 備考 |
|---|---|---|---|
| 2026-06-04 | 国家AI戦略「AI for All」公表。<br>・AI セーフティ研究所（CAISI）へ $50M<br>・AI 生成コンテンツの透かし等の透明性に取り組む方針<br>・信頼できる AI 認証制度の創設<br>・プライバシー法の近代化とオンライン安全法の導入を明記 | https://ised-isde.canada.ca/site/ised/en/canadas-national-artificial-intelligence-strategy-ai-all | 戦略本文は開けました。日付は ISED 討議文書に明記されています。 |
| 2026-06-10 | C-34「Safe Social Media Act」を提出（第一読会）。SNS と AI チャットボットを対象に、デジタル安全委員会を新設する案です。 | https://www.canada.ca/en/canadian-heritage/news/2026/06/government-of-canada-introduces-legislation-to-make-social-media-services-and-ai-chatbots-safer-for-children.html<br>補足: https://www.torys.com/our-latest-thinking/publications/2026/06/bill-c-34 | 法案名の正式表記は「An Act to enact the Digital Safety Act and the Digital Safety Commission of Canada Act…」で、通称が Safe Social Media Act です（Torys）。法案段階です。 |
| 2026-06-15 | C-36「Protecting Privacy and Consumer Data Act」を提出。<br>・自動意思決定システムの透明性を含む<br>・制裁金は最大 $10M／全世界売上 3%<br>・重大犯罪の罰金は最大 $25M／全世界売上 5%（いずれか高い方）<br>・所管は新設のデジタル安全・データ保護委員会 | https://www.canada.ca/en/innovation-science-economic-development/news/2026/06/government-of-canada-introduces-legislation-to-protect-canadians-privacy-in-the-digital-age.html | 公式解説を開けました。法案段階です。 |
| 2026-06-18 | C-16（Protecting Victims Act）が国王裁可。性的ディープフェイクを刑法の親密画像犯罪の対象に含めました。 | https://www.justice.gc.ca/eng/csj-sjc/pl/c16/index.html | |
| 2026-07-18 | C-16 の大半の規定が施行 | https://www.canada.ca/en/department-justice/news/2026/07/major-criminal-code-reforms-to-protect-canadians-are-now-law.html | 「大半」で、全規定ではありません。 |
| 2026-10-20 | OPC が「子どものプライバシーコード」を公表。<br>・マーケティングや AI による意思決定のための子どもへのプロファイリングを避けることを期待事項に含む<br>・13歳未満は親の同意が必要<br>・意見募集は 2027-01-20 まで、その後に更新の可能性あり | https://www.priv.gc.ca/en/opc-news/news-and-announcements/2026/nr-c_261020/ | 開けました。リポジトリの週次ダイジェスト（W43）は「草案」と書いています。OPC は「launches」と書いており、案か確定かのニュアンスが違います。 |
| 2026-10-23 | OPC が、ISED の「AI 透明性」討議文書への意見書を公表。AI 生成コンテンツ、AI との対話、AI システム情報、AI インシデント、AI エージェントの 5 領域に賛同しています。 | https://www.priv.gc.ca/en/opc-news/news-and-announcements/2026/nr-c_261023/ | 開けました。意見書の URL 名が `sub_ised_20260923` で、提出日は 9/23 の可能性があります（推測）。 |

### 日付を付けにくいが、記載を検討できる動き
- **ISED の AI 透明性討議文書**：ページのメタデータは作成 2026-07-08、更新 2026-08-13 です。公開日と意見募集の締切は確認できませんでした。
- **C-8（サイバーセキュリティ法）の国王裁可**：2026-06 の政府発表は確認できました。日付は 6/15 とする二次資料があるのみです。AI 直接の規制ではないため、入れるかは任意です。

---

## 3. 未確認のまま残る点
1. **C-34・C-36 の 2026-10 末時点の審議段階**：LEGISinfo の 45-1 のページを開けませんでした。C-36 は、6 月時点で第一読会のみと書く事務所記事（McCarthy、検索のみ）があります。8 月時点の ISED 文書でも「法案」の扱いです。10 月末の状況は分かりません。
2. **C-34 の AI チャットボット義務の中身と罰則**：政府発表と Torys の概要は見ましたが、条文レベルは未確認です。
3. **Directive on Automated Decision-Making の現況**：TBS のページは取得が拒否されました（URL は `tbs-sct.canada.ca` 形式）。次の 2 点は、二次資料（nhimg.org のガイド記事）の記述にとどまります。
   - 2025-06-24 に改正されたとする記述
   - 2026-05 に「エージェンティック AI の利用ガイド」が出たとする記述

   GCwiki は、第4次見直しの協議が 2025-01-08 まで続き、公表は 2025 年春〜初夏の予定だったと書いています。実際の改正内容は確認できていません。
4. **C-25（Strong and Free Elections Act）**：ISED 文書が「AI を使った選挙の偽情報に対処する、最近成立した法律」と書いています。成立日と内容は未確認です。
5. **ケベック州（`subregions`、251–253 行）**：Law 25 の施行日、自動意思決定の通知義務、CAI の所管は調べていません。ファイルの記述の可否は判断できません。
6. **AIDA の罰則の正確な条文**：上記 1 の #6 のとおりです。
7. **自主行動規範の公表日が 2023-09-27 かどうか**：開けたページには「September 2023」とだけあります。ISED のコードのページは更新日が 2026-06-04 ですが、内容にどんな変更があったかは確認していません。
8. **`status: "proposed"` の妥当性**：他国の使い方と、スキーマ上の意味を確認していません。C-36・C-34 は法案、C-16 は成立済みの刑法改正、AI 横断法はなし、という状態です。どの値が適切かは運用方針で決まるため、判断を保留します。
9. **`countries.yaml` の公式監視先 3 本（ISED の Atom、OPC の RSS 2 本）が実際に取得できるか**：検証していません。また、`news_queries` に C-36・C-34・「AI for All」を足すかどうかは、私の提案にとどまる運用判断です。
10. **首相府による大臣新設の一次資料（2025-05-13）**：BNN などの報道は確認できましたが、首相府の個別ページは見つけていません。
