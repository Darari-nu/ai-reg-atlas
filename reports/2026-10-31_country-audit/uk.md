# 英国（uk.json / countries.yaml）点検結果（2026年10月31日時点）

**確認方法:** ファイルは read_file と grep で読みました。Web は web_fetch で開けたか、検索結果に出たものだけを根拠にしています。

**先に伝えておくこと:**
- `config/countries.yaml` の uk ブロック（158–166行）にコメントはありません。点検できるのは `official_sources` の RSS だけでした（後述）。
- Commons Library の調査報告（CBP-10003）の PDF は web_fetch で開けませんでした。以下はこの PDF について検索結果に出た断片だけを根拠にしています。

## 1. 直すべき箇所

| # | JSON のパス | 今の記述 | 正しい記述 | 出典 | 確度 |
|---|---|---|---|---|---|
| 1 | `axes.enforcement_body.detail`、同 `sources`、`diff_vs_eu.absent[AI専属監督機関].source`、`timeline[2026-01-20].source` | 「DSIT が政策の中心」。出典はすべて DSIT の組織ページ。 | DSIT は 2026年に廃止されました。gov.uk の DSIT ページに「replaced by」として BIST、DCMS、Cabinet Office が載っています（同ページは「DSIT existed until 2026」とも書いています）。AI 戦略と AI Security Institute は Cabinet Office へ移りました。<br>廃止日は報道で 2026-07-20 です（Wikipedia と smeweb）。<br>オンライン安全と GDS は DCMS に移りました（Defend Digital Me の7月資料、検索結果の抜粋）。<br>AISI の gov.uk ページにも「Part of Cabinet Office」とあります。 | https://www.gov.uk/government/organisations/department-for-science-innovation-and-technology<br>https://www.gov.uk/government/organisations/ai-security-institute<br>https://www.smeweb.com/andy-burnham-scraps-governments-technology-department/ | 高（省庁再編の事実）。中（廃止日 7/20 は報道ベース） |
| 2 | 同上（`enforcement_body.detail`） | 「ICO」と表記。 | 2026-09-30 に ICO の法人格は Information Commission に切り替わりました。組織の通称は ICO のままです。 | https://www.dataguidance.com/news/uk-ico-become-information-commission-september-30-2026<br>https://questions-statements.parliament.uk/written-statements/detail/2026-09-14/hcws337 | 高 |
| 3 | `axes.gpai_obligations.detail` | 「フロンティアAI法案は2025年の政府方針で予告されたが提出時期は流動的」 | 2026-05-13 の国王演説（King's Speech）に AI 専用法案はありませんでした。AI は Regulating for Growth Bill のサンドボックス権限などに織り込まれています。<br>10月の Commons Library 報告は、AI 固有の法律はなく AISI にも法定権限はない、と述べています（検索結果の断片）。<br>AI 担当大臣は10月に「必要なら立法する」と発言しました。サイバー安全・強靱性法案（Cyber Security and Resilience Bill）に AI 対策を載せる案は「検討中」の段階です。<br>下院 BIST 委員会は、AISI に法的根拠を与えるべきかも含む長期調査を始めました。 | https://www.osborneclarke.com/insights/regulatory-outlook-may-2026-artificial-intelligence<br>https://www.lewissilkin.com/insights/2026/05/13/kings-speech-2026-commercial-technology-and-regulatory-developments-102msjh<br>https://www.osborneclarke.com/insights/regulatory-outlook-october-2026-artificial-intelligence<br>https://www.theregister.com/ai-and-ml/2026/10/15/uk-keeps-ai-safeguards-in-the-maybe-pile-for-cyber-security-bill/5303026 | 高 |
| 4 | `status` | `"consultation"` | 現在進行中の「AI 立法」の意見募集は確認できませんでした。Commons Library の断片に「政府は AI 立法の意見募集を始めていない」旨があります。<br>`schema/regulation.schema.json` の enum は proposed / draft / consultation / enacted / in_force で、「立法なし」に当たる値がありません。<br>値を変えるか、`consultation` のまま注記するかは運用判断です。 | https://researchbriefings.files.parliament.uk/documents/CBP-10003/CBP-10003.pdf（検索結果の断片のみ） | 中〜低（事実は固いが、どの enum 値にするかは判断） |
| 5 | `axes.prohibited_uses.detail` | 「非同意の性的ディープフェイク作成は Online Safety Act 関連の刑事規定で対応」 | 「作成・作成依頼」の罪は、Data (Use and Access) Act 2025 第138条です。性犯罪法2003の s66E を新設するもので、2026-02-06 に施行されました。<br>日付は BABL AI と DLA Piper が 2/6、gov.uk の警察向けガイダンスは「2026年2月」としています。<br>さらに Crime and Policing Act 2026 第99条が、ヌード化ツール等（purported intimate image generator）の作成・供給を処罰します。正式引用は 2026 c.20 です。正式裁判では最長3年の拘禁で、2026-06-29 に施行されました。<br>Crime and Policing Act 2026 には、CSAM 生成に使う AI モデルの罪や、チャットボット関連の罪もあります。<br>OSA 第216条の改正で、大臣が AI サービス向けの規則を作れるようになりました。<br>顔認識は、警察改革法案（Police Reform Bill）に枠組みを入れると発表されています。法律にはなっていません。 | https://babl.ai/uk-government-introduces-crackdown-on-deepfakes-creation/<br>https://www.dlapiper.com/en/insights/topics/algorithm-to-advantage/how-the-law-is-catching-up-with-ai-deepfakes<br>https://assets.publishing.service.gov.uk/media/6ad08b93c84c8ff1bc8b81e3/Making_or_Supplying_Purported_Intimate_Image_Generators_-_Non-Statutory_Guidance_for_the_Police_-_in_English__2_.pdf（PDF を開いて確認）<br>https://www.wiggin.co.uk/insight/intimate-image-abuse-and-ai-chatbots-crime-and-policing-act-becomes-law/<br>https://www.legislation.gov.uk/ukpga/2026/20/part/5/chapter/4 | 高（作成罪・第99条）。中（顔認識は計画段階） |
| 6 | `axes.penalties` | AI 固有の罰則はなく、UK GDPR の上限（1,750万ポンドまたは売上4%）が実質上限。 | UK GDPR の上限は2026年8月時点でも同じで、誤りではありません。<br>ただし「AI 固有の制裁なし」は不正確になりました。上の刑事罰（第99条は最長3年）が AI 生成物・ツールに直接かかります。 | https://www.arnoldporter.com/en/perspectives/advisories/2026/08/the-icos-new-statutory-duty-to-produce-an-ai-code-of-practice<br>https://assets.publishing.service.gov.uk/media/6ad08b93c84c8ff1bc8b81e3/Making_or_Supplying_Purported_Intimate_Image_Generators_-_Non-Statutory_Guidance_for_the_Police_-_in_English__2_.pdf | 高 |
| 7 | `axes.transparency.detail`、`diff_vs_eu.unique[ATRS].note` | 「中央政府機関に必須」 | gov.uk のハブは、ATRS は全省庁と、公共サービスを提供するか市民と直接接する arm's-length bodies に必須としています。それ以外の公共部門には推奨です。<br>2024-12 に適用範囲と除外の方針が出ています。 | https://www.gov.uk/government/collections/algorithmic-transparency-recording-standard-hub | 高（細かい精度の話） |
| 8 | `timeline[2023-11-02]` | 日付 2023-11-02 | ブレッチリー宣言の gov.uk ページは first-published が 2023-11-01 です。サミット自体は 11/1–2 です。日付を 11-01 にするか、イベント名を「サミット（11/1–2）」にするのが整合的です。 | https://www.gov.uk/government/publications/ai-safety-summit-2023-the-bletchley-declaration | 高 |
| 9 | `timeline[2026-01-20]`、`last_changed` | 「2026-01-20 フロンティアAIへの的を絞った立法の検討継続」。出典は DSIT 組織ページ。 | この日付の出来事を裏づける資料は見つけられませんでした。出典の DSIT 組織ページは、廃止後の案内に書き換わっています。<br>項目の削除か、出典の差し替えを推奨します。<br>これに連動して `last_changed` の再設定も必要です。 | 該当資料なし | 中（見つからないことの確認であり、事実が無いとまでは言えない） |
| 10 | `config/countries.yaml:165`（RSS） | DSIT の atom フィード。 | フィード自体は取得できましたが、最新エントリは 2026-08-24 です。DSIT 廃止後は更新が止まる見込みです。<br>代替として cabinet-office と ai-security-institute の同形式 URL を試したところ、エントリ0件で使えませんでした。<br>正しい代替 URL は未確認です。 | https://www.gov.uk/search/news-and-communications.atom?organisations%5B%5D=department-for-science-innovation-and-technology（開いて確認） | 高（フィードの現状）。代替 URL は不明 |

**追記を勧める点（誤りではない）:**
- `risk_classification` や `prohibited_uses` に、DUAA による自動意思決定（ADM）規制の改正を入れるとよいです。主要なデータ保護規定は 2026-02-05 に施行されました（SI 2026/82）。
- 2023年の白書は gov.uk 上で「historic」扱いです。意見募集は2023-06-21 に終了しています。

## 2. 足すべき新しい動き（timeline 候補）

| 日付 | 出来事 | 出典 |
|---|---|---|
| 2026-02-05 | DUAA の主要なデータ保護規定が施行（Commencement No.6、SI 2026/82）。ADM 改革を含む。 | https://www.legislation.gov.uk/uksi/2026/82/regulation/2/made<br>https://www.pearlcohen.com/uk-data-use-and-access-act-main-provisions-enter-into-force/ |
| 2026-02-06 | 同意のない性的ディープフェイクの作成・作成依頼が犯罪に（DUAA 第138条、s66E）。 | https://babl.ai/uk-government-introduces-crackdown-on-deepfakes-creation/ |
| 2026-03-18 | 著作権と AI の法定報告書と影響評価を公表。TDM 例外＋オプトアウト案は「推奨案」でなくなり、現時点で4案のいずれも進めない。 | https://assets.publishing.service.gov.uk/media/69ba692226909a14239612e4/CP2602959_-_Report_on_Copyright_and_Artificial_Intelligence_web.pdf<br>https://www.osborneclarke.com/insights/opted-out-uk-government-moves-away-preferred-position-ai-and-copyright-following-report |
| 2026-03-31 | ICO が ADM・プロファイリングの指針案の意見募集を開始（5/29 締切）。最終版は冬の見込み。 | https://www.arnoldporter.com/en/perspectives/advisories/2026/08/the-icos-new-statutory-duty-to-produce-an-ai-code-of-practice |
| 2026-04-29 | Crime and Policing Act 2026 が Royal Assent。 | https://www.wiggin.co.uk/insight/intimate-image-abuse-and-ai-chatbots-crime-and-policing-act-becomes-law/<br>https://assets.publishing.service.gov.uk/media/6ad08b93c84c8ff1bc8b81e3/Making_or_Supplying_Purported_Intimate_Image_Generators_-_Non-Statutory_Guidance_for_the_Police_-_in_English__2_.pdf |
| 2026-05-12 | SI 2026/425 が施行。ICO に AI・ADM の法定行動規範（Code of Practice）の作成義務が生じた。規範の施行は2027年の見込み。 | https://www.arnoldporter.com/en/perspectives/advisories/2026/08/the-icos-new-statutory-duty-to-produce-an-ai-code-of-practice |
| 2026-05-13 | 国王演説。AI 専用法案はなし。Regulating for Growth Bill でサンドボックス権限を設ける方針。 | https://www.osborneclarke.com/insights/uk-kings-speech-what-can-business-expect-year |
| 2026-06-29 | Crime and Policing Act 2026 第99条（ヌード化ツール等の作成・供給の罪）が施行。 | https://assets.publishing.service.gov.uk/media/6ad08b93c84c8ff1bc8b81e3/Making_or_Supplying_Purported_Intimate_Image_Generators_-_Non-Statutory_Guidance_for_the_Police_-_in_English__2_.pdf |
| 2026-07-20 頃 | DSIT 廃止。AI 戦略と AISI は Cabinet Office へ。Kanishka Narayan 氏は AI 担当大臣（Minister of State for AI）で閣議出席。 | https://www.gov.uk/government/organisations/department-for-science-innovation-and-technology<br>https://www.smeweb.com/andy-burnham-scraps-governments-technology-department/ |
| 2026-09-14 | 人権合同委員会（JCHR）が報告書を公表。リスクベースの AI 法案と、法定の独立監督機関を勧告。 | https://publications.parliament.uk/pa/jt5902/jtselect/jtrights/160/report.html<br>https://committees.parliament.uk/committee/93/human-rights-joint-committee/news/217859/wideranging-ai-bill-needed-to-address-severe-human-rights-risks-posed-by-ai/ |
| 2026-09-30 | ICO が Information Commission に移行。 | https://www.dataguidance.com/news/uk-ico-become-information-commission-september-30-2026 |
| 2026-10-08 | ICO がエージェンティック AI の call for evidence を開始（11/20 締切）。 | https://ico.org.uk/about-the-ico/ico-and-stakeholder-consultations/2026/10/agentic-ai-call-for-evidence/ |

**日付と出典の注記:**
- 10月の AI 担当大臣の Imperial College 講演は、日付が検索結果の1件（freepressjournal）の「10月12日」しか確認できていません。timeline に入れるなら日付を「2026-10」とするのが安全です。出典は https://www.imperial.ac.uk/news/articles/2026/ai-minister-announces-measures-to-protect-against-ai-risks-in-speech-at-imperial/ です。
- 同じ頃（10月）の ICO の基盤モデル開発者向け報告は、Osborne Clarke の10月号（https://www.osborneclarke.com/insights/regulatory-outlook-october-2026-artificial-intelligence）に載っています。
- 下院 BIST 委員会の調査の開始日は確認できていません。

## 3. 未確認のまま残る点

- **Regulating for Growth Bill の提出状況。** 国王演説での発表は確認しましたが、7月時点の Osborne Clarke は「forthcoming」でした。議会への提出日は確認できていません。
- **Crime and Policing Act 2026 のうち、チャットボット関連の罪と CSAM モデルの罪の施行日。** 第99条だけ 6/29 を確認しました。
- **ICO の最終 ADM 指針の公表時期。** Arnold & Porter 自身が「冬」と「今夏」の両方を書いています。法定コードは2027年の見込みですが、確定ではありません。
- **DSIT 廃止の正式な施行日。** 報道は 7/20、別の資料は 7/22 前後とし、一致していません。
- **JCHR 報告への政府回答の期限（11月中旬）。** ppc.land のみの記述です。
- **JSON の次の記述は、今回の調査では検証していません。** DRCF による調整、CMA・FCA・Ofcom の個別の動き、「リアルタイム顔認識は警察の運用ガイダンスの枠内」という点です。
- **Commons Library の PDF（CBP-10003）の本文。** 開けず、検索結果の断片だけを根拠にしました。
- **`status` の enum 値。** 「立法なし」を表す値がなく、どれにするかは運営側の判断です。
- **信頼できない情報。** aisecurityandsafety.org に「UK AI Safety Act が2025年末に議会提出された」とするページがありますが、国王演説や Commons Library の記述と矛盾します。根拠にしていません。
