# ベトナム（vn）点検結果（2026年10月末時点）

**調べた範囲と限界:** 検索の利用上限に達したため、9月以降の動きと下記「3」の項目は追加で調べられていません。出典 URL はすべて、実際に開いたか、検索結果に出たものだけです。どちらかは各項目に書きました。

## 1. 直すべき箇所

| # | JSON のパス / 場所 | 今の記述 | 正しい記述 | 出典 | 確度 |
|---|---|---|---|---|---|
| 1 | `axes.risk_classification.detail`（vn.json:9）末尾 | 「首相が定める高リスクAI一覧は、出典記事の時点では未公布（その後の存否は未確認）」 | **公布済み。** 首相決定 **33/2026/QD-TTg**（2026-06-30 付）が高リスクAI一覧を定めた。**2026-08-15 施行。** 一覧は教育・民族宗教・医療・銀行・司法手続・運輸の **6分野46システム**（教育3、民族宗教7、医療2、銀行2、司法1、運輸31）。決定は政令142の分類基準を引き、各システムの適合性評価の経路も示す。 | 決定本文（luatvietnam 英訳）https://english.luatvietnam.vn/decision-no-33-2026-qd-ttg-of-the-prime-minister-promulgating-the-list-of-high-risk-artificial-intelligence-systems-439294-doc1.html（開いた）／Tilleke https://www.tilleke.com/insights/vietnam-introduces-sectoral-list-of-high-risk-ai-systems/85/（開いた）／Allen & Gledhill https://www.allenandgledhill.com/perspectives/articles/33373/vnkh-vietnam-identifies-high-risk-ai-systems-across-six-sectors（開いた） | 高。決定本文と法律事務所2件が一致。官報原本は未確認で、本文は民間データベースの英訳。 |
| 2 | 同上（vn.json:9）「第13条（自己評価、または首相の一覧に載るものは登録・認定機関による第三者評価）」 | 首相の一覧に載れば第三者評価、と読める | 第13条2項は、**「強制適合認証の対象リストに載る高リスクAI」だけ**を登録・認定機関による評価とする。その他の高リスクAIは、提供者の自己評価か、登録・認定機関への委託を選べる。首相は高リスク一覧に、強制認証対象の一覧を含めて公布する（4項）。Decision 33 の付表は、システムごとにどちらの経路かを示す。 | 法律の英訳（政府公式ニュース）https://en.baochinhphu.vn/viet-nams-law-on-artificial-intelligence-111260715113551787.htm（開いた。第13条）。Tilleke 上記も同旨。 | 高 |
| 3 | `axes.enforcement_body.detail`（vn.json:51）末尾「国家AI戦略…を政府が承認…（承認日・決定番号は未確認）」 | 承認日・番号は未確認 | **首相決定 1671/QD-TTg、2026-08-28 付**（署名は Hồ Quốc Dũng 副首相）。法第19条は首相が戦略を発出すると定めるので、「政府が承認」より「首相決定」が正確。報道日は 08-29。 | 決定の頁（thuvienphapluat）https://thuvienphapluat.vn/van-ban/Cong-nghe-thong-tin/Decision-1671-QD-TTg-2026-approval-of-National-Strategy-on-Artificial-Intelligence-till-2030-727808.aspx ／ VietnamPlus https://en.vietnamplus.vn/vietnam-approves-ai-strategy-targeting-regional-hub-status-by-2030-post351187.vnp | 中〜高。thuvienphapluat の頁は直接開けず（`url_not_accessible`）、検索結果の抜粋で日付・番号・署名者を確認。VietnamPlus は検索結果の抜粋のみで本文は開いていない。政府ニュースの記事は開いたが決定番号は載っていない。 |
| 4 | `config/countries.yaml:323` のコメント | 「未確認: …首相の高リスクリスト（Decision 33/2026/QD-TTg の存否で割れる）…」 | Decision 33/2026/QD-TTg は存在する（上記#1）。「存否で割れる」は解消済みなので、この項目は削除し、「Decision 33 が公布済み」と書く。 | 同上 | 高 |
| 5 | `axes.enforcement_body.detail` と `risk_classification.detail` の「出典記事の時点」という書き方 | 古い記事を基準にした留保 | 一覧については#1で解消。ポータルの稼働は後述「3」のとおり未確認。 | — | — |

**補足（誤りではないが書き足すとよい点）**
- `prohibited_uses`（vn.json:18）に「ethnic minorities（少数民族）」が欠けている。第7条2項(c)の脆弱集団に少数民族と民事行為能力の欠ける人が含まれる。現状の「子ども・高齢者・障害者など」は例示なので誤りではない。
- 第7条は社会的スコアリングなどを個別に禁じていないが、Decision 33 の一覧には生体情報を使うものが載る。
  - 教育分野で、生体情報による学習者の行動監視。
  - 司法手続で、大規模な生体識別システム。
  - 一覧は高リスク扱いで、禁止ではない。`prohibited_uses` や `diff_vs_eu.looser` の説明に「個別禁止はないが、一部は高リスク一覧に入る」と書くと誤解が減る。出典は Allen & Gledhill の上記記事（開いた）。
- Decision 33 の対象になる高リスク扱いでは、実質的な人間の確認なしに結果だけで判断するもの、という条件が付く項目が多い。Tilleke も同様に述べる。

**確認できて、現行記述が正しいもの**
- 法の可決日は 2025-12-10（国会第15期第10回会期）、番号は 134/2025/QH15、施行日は 2026-03-01。
- 8章35条、移行期間は医療・教育・金融が18カ月、その他が12カ月（第34・35条）。
- 第33条によるデジタル技術法 71/2025/QH15 の第IV章などの廃止。
- 第29条の罰則構造と賠償責任、第30条のMOST主管、第14条6項の外国提供者の扱い。
- 政令142の公布日（2026-04-30）、施行日（2026-05-01）、事故報告の期限（72時間／5営業日／15日）、全AIへの透明性義務（Tilleke。開いた）。

## 2. 足すべき新しい動き（timeline）

| 日付 | 出来事 | 出典 |
|---|---|---|
| 2026-06-30 | 首相決定 33/2026/QD-TTg を公布（高リスクAI一覧）。 | Tilleke https://www.tilleke.com/insights/vietnam-introduces-sectoral-list-of-high-risk-ai-systems/85/ ／決定本文 luatvietnam（上記#1の URL） |
| 2026-08-15 | Decision 33 が施行（6分野46システム）。 | Allen & Gledhill（上記#1の URL） |
| 2026-08-28 | 国家AI戦略（2030年まで、2045年展望）を首相決定 1671/QD-TTg で承認。 | 上記#3の thuvienphapluat（抜粋のみ確認） |
| 2027-03-01（予定） | 移行期限。法の12カ月（既存システム）に加え、Decision 33 の一覧に載る既存システムと、施行後6カ月以内に稼働する一覧対象システムの期限。 | 決定本文第4条（luatvietnam）。Tilleke 同旨 |
| 2027-09-01（予定） | 医療・教育・金融分野の一覧対象システムの期限。法第35条の18カ月とも一致。 | 同上 |

2027年の2日付は決定の条文どおりの「予定」で、timeline に入れるなら「期限」と明記してください。

## 3. 未確認のまま残る点

- **制裁金額と処罰政令の有無。**
  - 法律本体は金額を定めず、政府が別途定めるとする（第29条5項。確認済み）。
  - AI専用の処罰政令が出たことを示す資料は、今回の調査では見つからなかった。ただし検索を使い切ったため、「ない」とも言えない。
  - 検索結果の見出しに、サイバーセキュリティ・個人情報分野の処罰政令（330/2026/ND-CP）とデータ分野の処罰政令（363/2026/ND-CP）が出た。AI関連の条項を含むかは、本文を開いておらず不明。
  - 科学技術分野の処罰政令の草案ページ（mst.gov.vn/van-ban-phap-luat/du-thao/2549.htm）は開いたが、AI への言及は見当たらなかった。
  - 2025年11月の報道に出る「最大20億ドン」などは法案段階の数字。MLex の見出し（本文は未確認）は成立法で売上連動の罰則が外れたと伝える。現行の確定値としては使えない。
- **国家AI単一窓口ポータルの稼働。** 6月5日付の Tilleke は未稼働と書く。その後は確認できていない。
- **2026年9〜10月の新しい法令・指針・改正。** 検索の上限に達し、調べていない。政令142の後続の通達など MOST の指針は確認できていない。
- **官報の一次確認。**
  - Decision 33 と Decision 1671 の官報掲載と原本は確認できていない。
  - 法律の条文は、政府公式ニュースの英訳（"For reference only" 付き）で確認した。ベトナム語の官報原本とは突き合わせていない。
- **`countries.yaml:322` の指摘（baochinhphu の日付を mm/dd と dd/mm で誤読する件）。** 実際の取得挙動は読むだけでは検証できない。記事の日付表記自体（例: "August 29, 2026 7:40 AM GMT+7"）は米国式だった。
