# カンボジア（kh）点検結果（2026年10月末時点）

`data/regulations/kh.json` と `config/countries.yaml` の kh ブロックを、Web 上の一次資料などと突き合わせました。

- **書き換え・実行はしていません。**
- **確度の目安:** 高は公的機関のページ本文で確認できたもの。中は複数報道で一致するもの。低は報道間で食い違うもの。
- **記載の範囲:** URL は検索結果に出たものか、実際に開けたものだけです。
- **未確認の扱い:** kh ブロックには「未確認」と明記したコメントがありません。`countries.yaml:309-314` にあるのは取得元の説明だけです。ほかの国のブロックにある「未確認:」行に当たるものが kh にはない、ということです。

## 1. 直すべき箇所

| # | JSON のパス / 行 | 今の記述 | 正しい記述 | 出典 URL | 確度 |
|---|---|---|---|---|---|
| 1 | `axes.timeline[2].source`（kh.json:65）。`axes.gpai_obligations.sources[0]`（:26）も同じ | 2026-04-07 の「MISTI×UN-ESCAP のレポート」の出典として UNESCO の記事を挙げている | この UNESCO 記事は別の出来事です。**2025-07-01 に CADT・UNESCO・MPTC が出した AI 準備度評価（RAM）報告書の公表**を伝えるものです（記事は 2025-07-09 付）。2026-04-07 の MISTI×ESCAP レポートの出典は、The Star（4/8）、Xinhua（4/7）、MISTI のレポート PDF に差し替える必要があります。日付と主体（MISTI×ESCAP）自体は正しいです。 | https://www.thestar.com.my/aseanplus/aseanplus-news/2026/04/08/cambodia-launches-ai-report-to-guide-innovation-ethics-inclusion<br>http://www.xinhuanet.com/english/asiapacific/20260407/b802ecc588eb4671aaa3cb3711504634/c.html<br>https://cdn.misti.gov.kh/documents/20260409081135T17VXSvZjhsH.pdf<br>（取り違え元）https://www.unesco.org/en/articles/cambodia-launches-ai-readiness-assessment-report-guide-ethical-and-inclusive-digital-transformation | 高 |
| 2 | `axes.timeline[1].date`（:58） | 2026-02-11 | MPTC の記事本文は「2026年2月5日」、世界政府サミット（ドバイ）のパネルで発表したとしています。11日とする根拠は見つかりませんでした。CADT 側の記事は「2月15日」と書いていて、MPTC と食い違います。MPTC の公式記事を採り、**2026-02-05** に直すのが妥当です。 | https://mptc.gov.kh/en/2026/02/h-e-seng-sopheap-participates-in-the-world-governments-summit-in-dubai-to-present-cambodias-national-ai-strategy-and-digital-government-progress/<br>（食い違う側）https://cadt.edu.kh/h-e-seng-sopheap-attends-world-governments-summit-in-dubai-to-showcase-national-ai-strategy-and-cambodias-digital-government-progress/ | 中〜高 |
| 3 | `regulation_name`（:3）、`risk_classification.summary` と `detail`（:8-9）、`timeline[0]`（:53-55）の「策定」 | 国家AI戦略2025–2030を「策定」済み・「設定」済みとして書いている | **2026年10月末時点で、採択・公布を示す一次資料は見つかりませんでした。**<br>・OECD.AI のページは "Draft"、ステータスは「Proposed or under development」です。<br>・MPTC の2026-02の記事も "Draft National AI Strategy" と呼んでいます。<br>・「デジタル政府委員会と省庁横断AIワーキンググループが監督」は、OECD.AI が草案の実施体制として説明している内容で、稼働の確認はできていません。<br>表現は「草案（意見募集済み）」に改めるのが安全です。 | https://oecd.ai/en/dashboards/policy-initiatives/national-artificial-intelligence-strategy-2025-2030<br>https://mptc.gov.kh/en/2026/02/h-e-seng-sopheap-participates-in-the-world-governments-summit-in-dubai-to-present-cambodias-national-ai-strategy-and-digital-government-progress/ | 中〜高 |
| 4 | `timeline[0].date`（:53） | 2025-06-30 | この日付の根拠は見つかりませんでした。確認できたのは次の3点です。<br>・MPTC が2025-06-11 に進捗の告知と意見募集の開始を発表。<br>・草案 v5 PDF の表紙は「June 2025」。<br>・2025-07-01 の国家ワークショップで草案を議論。<br>「2025-06-11 草案の意見募集開始」に直し、7/1 は別項目にするのが無難です。 | https://opendevelopmentcambodia.net/announcements/announcement-on-progress-of-preparing-and-opening-public-consultation-on-draft-national-artificial-intelligence-strategy/<br>https://cadt.edu.kh/official-launching-of-the-artificial-intelligence-readiness-assessment-report-in-cambodia/ | 中 |
| 5 | `axes.enforcement_body`（:44-45） | 「MISTI（倫理枠組み）」を分担機関に入れている | MISTI は2026-04のレポートを出した事実は確認できます。しかし、倫理枠組みの所管と指定された根拠は見つかりませんでした。<br>確認できた資料では、倫理・ガバナンスの枠組み作りは **MPTC** が担っています。MPTC の2025-04のプレスリリースは次の3つを挙げています。<br>・「国家AIガバナンス枠組み」の準備<br>・「AIガバナンスと倫理のカンボジア指針」の準備<br>・国家デジタル経済社会評議会への提出計画<br>RAM の実施主体は CADT×UNESCO（MPTC 支援）です。MISTI を所管機関のように書くのは過大なので、「報告書を出した省」程度に弱めるべきです。 | https://ai.gov.kh/press-release-on-process-of-artificial-intelligence-governance/<br>https://asset.cambodia.gov.kh/mptc/2025/04/20250424-PR-Key-AI-Work-Final.pdf | 中 |
| 6 | `axes.penalties.detail`（:38）、`axes.prohibited_uses.detail`（:17） | 「既存の刑法・電気通信法が間接的な受け皿」 | 2026年に**技術利用詐欺対策法**（Law on Combating Technology-based Fraud）が成立・公布されました。AI 専用の法律ではありませんが、オンライン詐欺の運営者に刑事罰を科すため、「既存法」の列挙に加えるべきです。AI 固有の罰則がないという結論は変わりません。詳細は下の2を参照してください。 | https://www.khmertimeskh.com/501876372/cambodia-enacts-new-law-to-combat-online-scams/<br>https://m.en.freshnewsasia.com/index.php/en/localnews/69527-2026-04-07-07-38-38.html | 高（成立・施行）／低（罰金額） |
| 7 | `penalties.sources`、`prohibited_uses.sources`、`transparency.sources`（いずれも mptc.gov.kh/en/ のトップのみ）、`diff_vs_eu` の looser と absent | 「無い」ことの根拠を MPTC のトップページとしている | トップページは更新される一覧なので、「規制がない」ことの裏付けになりません。この結論自体は現状の資料と矛盾しませんが、根拠としては弱いです。たとえば OECD.AI の草案ページ（法的拘束力のない戦略である点）などに差し替えるのが望ましいです。 | https://oecd.ai/en/dashboards/policy-initiatives/national-artificial-intelligence-strategy-2025-2030 | 中 |

### 問題なしと確認できた点
- **MISTI×ESCAP レポート（4/7）:** 日付、題名、主体は The Star の記事と一致します。レポートが AI ガバナンスの戦略的枠組みを示したという要約も支持されます。
- **UNESCO 国別ページ:** `https://www.unesco.org/ethics-ai/en/cambodia` は実在します（RAM の国別プロファイル）。
- **AI 専用の横断法がないという結論:** 2026年10月末までに、AI 法案が提出・成立した形跡は見つかりませんでした。「見つからなかった」ことしか言えず、ないことの証明ではありません。

### `countries.yaml` の kh ブロック（:303-314）
- **コメントの検証:** 「MPTCは既存(健全)＋公式RSSを追加」と、Open Development Cambodia（ODC）の AI タグフィードの説明は、今回は検証できませんでした。
  - 2つの RSS を実際に取得して確かめることはできていません。
  - 実在を確認できたのは MPTC の記事ページ（2026年分）と ODC の AI タグページ（検索結果）です。
- **コメントの追加:** 他国のブロックにある「未確認:」行の形式に合わせるなら、kh にも未確認事項を1行足せます。候補は下の3にあります。

## 2. 足すべき新しい動き（timeline 候補）

| 日付 | 出来事 | 出典 URL | 確度 |
|---|---|---|---|
| 2025-07-01 | AI 準備度評価（RAM）報告書の公表。CADT×UNESCO、MPTC 支援。草案国家AI戦略の国家ワークショップで公表。現行 timeline には無く、#1 の取り違えの正体です。 | https://cadt.edu.kh/official-launching-of-the-artificial-intelligence-readiness-assessment-report-in-cambodia/ | 高 |
| 2026-03-30 / 2026-04-03 | 技術利用詐欺対策法を国民議会が全会一致で可決（3/30、112票）。上院も4/3に可決。 | https://www.akp.gov.kh/post/detail/366277<br>https://www.france24.com/en/live-news/20260403-cambodian-lawmakers-approve-anti-cybercrime-law | 高 |
| 2026-04-05 または 04-06 | 同法を王令で公布し、即日施行。**公布日は資料で割れています。** Khmer Times は「日曜（4/5）」、Fresh News は「4/6」としています。 | https://www.khmertimeskh.com/501876372/cambodia-enacts-new-law-to-combat-online-scams/<br>https://m.en.freshnewsasia.com/index.php/en/localnews/69527-2026-04-07-07-38-38.html | 高（公布・即日施行）／低（正確な日付） |
| 2026-04-30 | MPTC が「MPTC AI 振興戦略」草案の意見聴取ワークショップを開催。約80人が参加。 | https://mptc.gov.kh/en/2026/04/h-e-sam-sethserey-presided-over-the-workshop-to-gather-input-on-the-draft-artificial-intelligence-development-promotion-strategy-of-the-ministry-of-post-and-telecommunications/ | 高 |
| 2026-07-06 | ジュネーブの「AIガバナンスに関するグローバル対話」に参加。MPTC は、ASEAN の流れに沿い、原則に基づくアプローチをとると発表。 | https://mptc.gov.kh/en/2026/07/cambodia-joins-over-170-nations-to-shape-global-ai-governance/ | 高 |
| 2026-07-16 | 上海で世界人工知能協力機構（WAICO）設立協定に署名（MPTC 大臣）。 | https://mptc.gov.kh/en/2026/07/minister-chea-vandeth-represents-cambodia-as-a-signatory-to-the-agreement-on-the-establishment-of-the-world-artificial-intelligence-cooperation-organization/ | 高 |
| 2026-08-05 | 個人データ保護法案の検証ワークショップ（MPTC、EU 代表部が共催）。法案は「正式な立法手続きに進む前」の段階。 | https://mptc.gov.kh/en/2026/08/ministry-of-post-and-telecommunications-holds-validation-workshop-on-the-draft-law-on-personal-data-protection/ | 高 |
| 2026-09-14〜17 | リヤドの UNESCO 第4回「AI 倫理グローバルフォーラム」に代表団を派遣。ただし内容は検索結果の冒頭までしか読めていません。 | https://cadt.edu.kh/cambodian-delegation-participates-in-the-4th-unesco-global-forum-on-the-ethics-of-artificial-intelligence-gfeai-2026-in-riyadh-saudi-arabia/ | 中 |

- **優先度:** AI 規制の段階を左右するのは、技術利用詐欺対策法と個人データ保護法案の2つです。それ以外は動きの記録です。
- **`diff_vs_eu` と `data_protection` の記述:** 個人データ保護法案は、`penalties.detail` の「データ保護法制自体も整備途上」の裏付けになります。出典に使えます。

## 3. 未確認のまま残る点

- **国家AI戦略が正式に採択されたか。**
  - 採択・公布を示す資料は見つかりませんでした。
  - 草案としての確認は2026-02（MPTC の記事）までです。
  - それ以降の状況は不明です。
- **「国家AIガバナンス枠組み」と「AIガバナンスと倫理の指針」が公表されたか。**
  - MPTC の2025-04のプレスリリースは作業計画を示しただけです。
  - 2025年8月に評議会へ提出する予定でしたが、その後の結果は見つかりませんでした。
- **技術利用詐欺対策法の罰金額。** 報道で割れています。
  - 国民議会可決時: 最大 $250,000 とする報道（ASEAN Now）。
  - 上院可決時: 最大 20億リエル（約 $500,000）とする AFP 報道。
  - さらに別の二次情報サイトの数字もあります。
  - 公布された法文を確認できていないので、金額は書かないほうが安全です。
- **同法に、AI やディープフェイクに特化した条文があるか。** 確認できていません。
- **デジタル政府委員会と省庁横断AIワーキンググループが実際に稼働しているか。** OECD.AI の記載（草案の内容）以外の一次資料は見つかりませんでした。
- **MISTI レポートの本文の細部**（具体的な法整備の提言など）は、PDF の抽出結果がほぼ表紙のみで読めていません。
- **MPTC の RSS と ODC の AI タグフィードの取得可否**（上記のとおり未検証）。
- **世界政府サミット2026の開催日。** 公式の日程は確認していません。2月5日は MPTC の記述に頼っています。
