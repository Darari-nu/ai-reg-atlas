# インド（in）点検結果：in.json と countries.yaml の in ブロック（2026年10月末時点）

**調査の限界**
- 途中で検索ツールの回数上限に達し、AIGEG（後述）の一次資料などを追えていません。
- 「開いて確認」と書いたURLは `web_fetch` で本文を読んだものです。「検索で実在確認」は検索結果に出ただけで、本文は読んでいません。
- 法律事務所や解説サイトだけが根拠の事項は、確度を下げて書きました。

## 1. 直すべき箇所

| # | JSONパス | 今の記述 | 正しい記述 | 出典 | 確度 |
|---|---|---|---|---|---|
| 1 | `axes.transparency.summary` と `.detail` | 「合成コンテンツの法定表示義務はない」「EU第50条相当の義務なし」 | 2026-02-10 に MeitY が IT Rules 2021 の改正を官報告示した（G.S.R. 120(E)、2026-02-20 施行）。「合成生成情報（SGI）」を定義した。許可されるSGIには、目立つラベルと、消せない来歴メタデータ（仲介者のリソースに紐づく識別子を含む）が義務になった。大規模SNS（登録500万人超）は、利用者にSGIか申告させ、申告を技術的に検証する。**法律ではなく IT 法に基づく下位規則**である。 | https://www.jdsupra.com/legalnews/india-introduces-mandatory-labelling-8102704/（開いて確認）<br>https://www.pib.gov.in/PressReleasePage.aspx?PRID=2295500&reg=1&lang=1（開いて確認。2026-08-06付PIBも同改正に言及）<br>官報番号は https://blog.ipleaders.in/it-rules-2026/ と MeitY の FAQ PDF（https://www.meity.gov.in/static/uploads/2025/10/065b6deb585441b5ccdf8be42502a49c.pdf）（どちらも検索で確認） | 高 |
| 2 | `axes.prohibited_uses.detail` | 「ディープフェイクはIT法の仲介者責任ルールと削除要請で対応」 | SGIツールを提供する仲介者に、違法SGIを自動化ツールなどで事前に防ぐ義務がある。対象は児童性的搾取、同意のない性的画像、わいせつ、偽の文書・電子記録、爆発物・武器の合成描写、人物や出来事の欺瞞的描写など。AI固有の「禁止リスト」はなお無いが、「個別対応のみ」という書き方は古い。 | JD Supra（上と同じ。開いて確認） | 高（法律事務所1本の要約。官報原文は未読） |
| 3 | `axes.transparency.detail` ほか | 「削除要請」の運用 | 政府・裁判所の命令への対応期限が、従来の36時間から**3時間**になった。 | JD Supra（開いて確認） | 高 |
| 4 | `axes.enforcement_body.detail` | IndiaAIミッションは「約1.03兆ルピー」 | 承認額は **₹10,371.92 crore**。1 crore＝1,000万なので約1,037億ルピー（約0.1兆）で、**桁が10倍違う**。承認日は 2024-03-07 で、timeline の日付は正しい。 | https://www.pmindia.gov.in/en/news_updates/cabinet-approves-ambitious-indiaai-mission-to-strengthen-the-ai-innovation-ecosystem/（検索で確認）<br>https://oecd.ai/en/dashboards/policy-initiatives/india-ai-mission（検索で確認。10,371.92 crore） | 高 |
| 5 | `axes.penalties.summary` | 「DPDP法（最大250億ルピー）」 | 「250 crore」は約25億ルピーで、**10倍の換算ミス**の可能性が高い。算術としては確実。ただし「上限250 crore」という金額そのものは、今回、一次資料で確認できていない（法の附則は未読）。 | 該当出典なし | 換算ミスは高、金額は未確認 |
| 6 | `axes.penalties.detail` と `.summary` | 「DPDP法2023（施行準備中）」。IT法の制裁を「間接適用」 | DPDP規則2025が2025-11-13に告示された（官報はその翌日）。段階施行で、Board関連規則は即日。同意管理者の登録（規則4）は 2026-11-13、主要義務と罰則の実効は 18か月後で 2027-05-13 前後と計算される（日付は第三者の計算）。IT Rules の違反は、仲介者のデューデリジェンス不履行として扱われる。 | PIB https://www.pib.gov.in/PressReleasePage.aspx?PRID=2190014&reg=3&lang=2（検索で確認。18か月の段階施行）<br>https://veritect.ai/digital-data-ai-law/dpdp-rules-2025-phased-rollout（検索で確認） | 中。段階の枠組みは高、具体日付は中。官報番号は 843(E)（privybyidfy、dpdprules.org）と 846(E)（veritect）で割れる。 |
| 7 | `axes.risk_classification.detail` | 「AIガバナンス・ガイドライン策定の検討は続く」 | ガイドラインは **2025-11-05 に MeitY が公表済み**。自主的な枠組みで、7つの原則（sutras）、6本柱、AIGG・TPEC・AI Safety Institute の3機関を置く。拘束力のあるリスク分類は無い。日付は Digital Policy Alert が 11-04 としているが、PIB・Lexology・DSCI は 11-05。 | https://www.pib.gov.in/PressReleasePage.aspx?PRID=2186639（検索で確認）<br>https://www.dsci.in/resource/content/summary-india-ai-governance-guidelines（検索で確認）<br>https://casrai.org/guides/india-ai-governance-guidelines（検索で確認。拘束力なし、DIA停滞中に言及） | 高（公表日）。7原則・6本柱・3機関は casrai と DSCI の解説に基づく。 |
| 8 | `axes.gpai_obligations.summary` と `.detail` | 「2024年のMeitY勧告」。timeline は 2024-03-15 のみ | 3/1 の勧告（未検証AIのラベル付けと、政府の事前の明示的許可）を、3/15 の改訂勧告が置き換えて許可制を外した。記述内容は正しいが、3/1 の項目が無い。 | https://www.azbpartners.com/bank/meity-liberalizes-ai-advisory-dated-march-1-2024-following-industry-concerns-and-issues-revised-advisory-on-march-15-2024/（検索で確認）<br>https://www.jsalaw.com/newsletters-and-updates/revised-meity-advisory-on-deployment-of-ai-models/（検索で確認） | 高 |
| 9 | `axes.enforcement_body.detail` | 「規制機関ではなく振興機関が主役」 | MeitY が中心という点は変わらない。2026-04 に AI Governance and Economic Group（AIGEG）が設置されたという報道がある。ガイドラインが提案した独立規制機関は含まれないとされる。SGI の苦情には Grievance Appellate Committee（gac.gov.in）の不服申立てもある。 | Medianama https://www.medianama.com/2026/10/223-meity-consultation-paper-ai-regulation/（検索結果の抜粋のみ。本文は取得がタイムアウト）<br>PIB 2295500（GAC。開いて確認） | AIGEGは低〜中（単一媒体・抜粋のみ）、GACは高 |
| 10 | `status` | `"proposed"` | `src/lib/data.ts:27` の許容値は proposed / draft / consultation / enacted / in_force。インドには横断AI法が無いので「提案」は不正確だが、5.の IT Rules 改正は施行済みで、新しい協議文書（後述）も予告されている。どの値に寄せるかは**サイトの定義次第**で、私には決められない。 | — | 判断事項 |
| 11 | `last_changed` | `2024-03-15` | 上の改正を反映するなら少なくとも `2026-02-10`（施行は 02-20）。 | JD Supra | 高 |
| 12 | 全 `sources` | 多くが `https://www.meity.gov.in/` のトップページ | 各項目を個別資料に差し替えられる。候補は上表のURL。 | — | 助言 |

**countries.yaml の in ブロック（275〜280行目）**
- 276行目に「MeitY自体の AI Governance Guidelines 等は現状取得手段なし」とあります。
  - 私の環境では pib.gov.in の個別リリース（PRID=2295500、2231208）を開けました。meity.gov.in/static/uploads/ 配下のPDFも検索に出ます。
  - GitHub Actions からの可否は私には判断できません。ただ「取得手段なし」と言い切る根拠は弱く、PIBのMeitY一覧や MeitY の document library を試す余地があります。
- `official_sources` が TRAI の RSS 1本だけで、2026年の主な動き（IT Rules 改正、協議文書）は `news_queries` 頼みです。ここはコメントではなく設計上の穴です。

## 2. 足すべき新しい動き（timeline）

| 日付 | 出来事 | 出典 | 確度 |
|---|---|---|---|
| 2024-03-01 | MeitY が AI モデルの勧告を発出（ラベル付けと政府の事前許可）。3/15 に置換。 | azbpartners・JSA（上記） | 高 |
| 2025-11-05 | MeitY が India AI Governance Guidelines を公表（自主的枠組み）。 | https://www.pib.gov.in/PressReleasePage.aspx?PRID=2186639 | 高 |
| 2025-11-13 | DPDP 規則 2025 を告示。段階施行（即日／12か月／18か月）。 | PIB PRID=2190014 | 中〜高（告示日は 11-13 と、官報掲載の 11-14 が混在） |
| 2026-02-10 | IT Rules 改正（SGI・ラベル・来歴メタデータ・3時間削除）を告示。G.S.R. 120(E)。 | JD Supra（開いて確認）、PIB 2295500（開いて確認） | 高 |
| 2026-02-20 | 上記改正の施行。 | JD Supra（開いて確認） | 高 |
| 2026-02-18〜19 | AI Impact Summit（ニューデリー）。「New Delhi Declaration on AI Impact」を採択（PIBは92か国・機関が賛同）。報道では88・89とも。 | https://www.pib.gov.in/PressReleasePage.aspx?PRID=2231208&amp=&reg=1&amp=&lang=1（開いて確認） | 日付と事実は高。国数は割れる。 |
| 2026-03-30 | 「IT Rules 第2次改正案」を公開して意見募集。仲介者に MeitY の通知・勧告・指示を遵守させる新規定（rule 3(4)）を含む。期限は 4/29 まで延長（4/10付通知）。 | MeitY の延長通知 https://www.meity.gov.in/static/uploads/2026/04/964ca48ac7d0c92e3bba5d32d9a59fcb.pdf（検索で確認）、案文 https://www.meity.gov.in/static/uploads/2026/03/30591fc6e322dcbcc9dae84a0f02e9e7.pdf（検索で確認） | 公開日と延長は高。確定したかは未確認。 |
| 2026-04 | AIGEG の設置（報道）。 | Medianama（上記） | 低〜中 |
| 2026-10-08 | Vaishnaw 大臣が、1か月以内に AI 規制の協議文書を出すと発言。Medianama によれば6月に「専用のAI法」について業界と協議中と述べたとされる。 | Medianama https://www.medianama.com/2026/10/223-meity-consultation-paper-ai-regulation/、https://www.careerindia.com/news/india-ai-regulation-2026-meity-consultation-safety-deepfakes-compliance-011-66783.html（どちらも検索で確認。本文は未読） | 発言の存在は中。内容は未確認。 |
| 2026-10-30 | MeitY が「DEPA for AI Training」（機密データでAIを学習する枠組み）を Bengaluru で発表。 | https://cio.eletsonline.com/artificial-intelligence/meity-depa-ai-training-framework-sealed-rooms-sensitive-data-ispirt/76548/（検索で確認） | 中。草案かハンドブックかは記事内で揺れている。 |

## 3. 未確認のまま残る点

- **DPDP罰則の上限額**：「250 crore」を一次資料で確認していません（上の5.）。
- **DPDP の施行前倒し**：2026-01 に「18か月→12か月」案が報じられた（Business Standard、2026-01-22）。第三者サイト dpdprules.org は、2026-10-12 時点で変更する文書は見つからないと書いています。私は MeitY の一次資料では確かめていません。
- **Removal of Difficulties Order**：同サイトは、DPDP法第9条・第10条の語句を変える S.O. 5458(E)（2026-10-05）があると書いています。官報や MeitY では確認できておらず、AI規制に直接は効きません。
- **第2次改正案の最終化**：Digital Policy Alert は、延長された協議が閉じて「検討中」としています（検索結果の抜粋）。告示されたかは確認できていません。
- **IT Rules 違反の効果**：安全港（IT法79条）の喪失かどうかは、JD Supra の続きの本文が読めておらず未確認です。
- **AIGEG**：構成と権限は一次資料で未確認です。
- **協議文書の中身**：10月8日の予告どおり11月に出るか、内容が何か（専用法の骨子か）は未確認です。
- **Digital India Act**：「停滞中」は casrai（2026年9月確認と記載）などの二次情報です。MeitY の一次資料では確認していません。
- **3/1勧告の正式名称・文書番号と、その後の拘束力**：未確認です。
