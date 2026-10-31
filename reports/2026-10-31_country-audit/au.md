# 豪州（au）点検結果（2026年10月末時点）

**前提と制約**
- 読んだファイルは `data/regulations/au.json` と `config/countries.yaml:281-291` です。
- 調査の途中で Web 検索の利用回数上限に達しました。後半の追加確認（AI Safety Institute の一次資料、ヌーディファイ（nudify）アプリ規制、著作権の動き、Children's Online Privacy Code）はできていません。
- JSON 内に「未確認」と書かれた箇所はありませんでした（`未確認|TODO|要確認` で検索して該当なし）。そのため第3節は「点検で確認しきれなかった点」を挙げています。
- 出典は、検索結果に実際に出た URL だけを使っています。多くは検索結果の抜粋で確認したもので、ページ全文を開いたものではありません。その場合は確度を下げて書いています。
- 一次資料（政府・議会・法令本文）と、法律事務所・報道などの二次資料は区別して書きました。

## 1. 直すべき箇所

### 1-1. 最重要：「義務的ガードレールを検討中」は古い
政府は National AI Plan（2025-12-02公表）で、義務的ガードレールを進めない方針を示したとされています。

| 項目 | 内容 |
|---|---|
| 該当パス | `regulation_name`（au.json:3）、`status`（:4）、`axes.risk_classification.summary` と `.detail`（:8-9）、`axes.gpai_obligations.detail` の「将来の義務的ガードレールと整合する設計」（:23）、`diff_vs_eu.looser[0].note`（:72）、`diff_vs_eu.unique[1]`「任意→義務の二段構え設計」（:95-97） |
| 今の記述 | 「高リスクAIへの義務的ガードレール検討中」「導入方法は引き続き検討中」。`status` は `consultation` |
| 正しい記述（案） | 2025-12-02の National AI Plan が「ライトタッチ」方針を確認し、既存法と既存規制当局で対応する。2024-09に意見募集した義務的ガードレールは進まない。AI専用法を明示的に排除してはいない。 |
| 出典 | https://www.mallesons.com/au/en/insights/latest-thinking/australias-ai-plan-where-is-australia-going-with-ai.html （KWM、二次資料）<br>https://www.maddocks.com.au/insights/the-new-national-plan-for-australias-ai-enabled-future （Maddocks、二次資料） |
| 確度 | 中〜高。2つの法律事務所が一致して書いています。ただし National AI Plan 本文（一次資料）は今回開けていません。 |

- `status` の値域は `proposed | draft | consultation | enacted | in_force` です（REQUESTS.md:201）。`consultation` は不適切になった可能性が高いです。どの値にするかは編集側の判断です。`approach: soft_law` は妥当に見えます。
- `unique[1]` は「同じ10項目で任意→義務」という設計が前提でした。この前提が崩れているので、項目ごと削除するか書き換えるのが妥当です。

### 1-2. 任意AI安全基準（VAISS）は後継ガイダンスに置き換え済み
| 項目 | 内容 |
|---|---|
| 該当パス | `axes.gpai_obligations.summary` と `.detail`（:22-23）、`diff_vs_eu.looser[0]`、`absent[1]`、`unique[1]` の出典 |
| 今の記述 | 任意基準（VAISS）が10ガードレールを提示する、という現在形の記述 |
| 正しい記述（案） | 2025-10-21に National AI Centre が「Guidance for AI Adoption」（6つの必須プラクティス）を公表した。政府は VAISS を発展させた「更新・簡素化版」と説明している。VAISS のページは残っているが、冒頭でこの置き換えを案内している。 |
| 出典 | https://www.industry.gov.au/publications/voluntary-ai-safety-standard （一次資料。検索結果の本文で確認）<br>補足：https://certrak.com.au/ai-regulation-australia/voluntary-ai-safety-standard/ （二次資料） |
| 確度 | 置き換えの事実は高い。「10項目が6項目に統合された」という説明は二次資料のみで、中程度です。 |

### 1-3. timeline の2025-12-01の項目が事実と合っていない
| 項目 | 内容 |
|---|---|
| 該当パス | `axes.timeline[2]`（:60-64）、`last_changed`（:102） |
| 今の記述 | `2025-12-01`「国家AI能力計画の策定作業（規制アプローチの方向性整理）」 |
| 正しい記述（案） | 2025-12-02に「National AI Plan」が公表された。名称も日付も異なる。 |
| 出典 | KWM（上記1-1と同じ）。日付「2 December 2025」は同記事の記述 |
| 確度 | 日付・名称ともに中〜高 |

- `enforcement_body.detail`（:44）の「国家AI能力計画」も、同じく National AI Plan に直すべきです。

### 1-4. 政府機関向け AI ポリシーが改訂されている
| 項目 | 内容 |
|---|---|
| 該当パス | `axes.transparency.detail`（:30）、`axes.timeline[1]`（:55-59）、出典URL（:32、:58、:92） |
| 今の記述 | 2024-09の AI 利用ポリシーが現行であるかのような書き方 |
| 正しい記述（案） | v1.1が2024-09-01に施行された。v2.0が2025-12-15に施行され、v2.1の軽微な更新が2026-10-21に公表された。 |
| 出典 | https://www.digital.gov.au/ai/ai-in-government-policy （検索結果の抜粋）<br>https://www.digital.gov.au/ai/ai-in-government-policy/aims （v2.0のページ） |
| 確度 | 日付は中〜高。v2.0 の義務内容の詳細は確認できていません。 |

- v1.1の期限は、アカウンタブル・オフィサーが2024-11-30まで、透明性声明が2025-02-28までです。出典は https://www.digital.gov.au/policy/ai/policy で、fetch で本文を確認しました。ただしその取得時点は2025-11-01です。
- 現行の URL は `/ai/ai-in-government-policy` のようです。JSON が使う `/policy/ai/policy` はv1.1の内容を返しました。リンクが今も生きているかは確認できていません。
- 今は新URLへ差し替えるのが安全です。

### 1-5. プライバシー法の罰則の書き方が不足している
| 項目 | 内容 |
|---|---|
| 該当パス | `axes.penalties.detail`（:37） |
| 今の記述 | 「最大5,000万AUDまたは売上30%等の制裁金（2022年強化）」 |
| 正しい記述（案） | 重大な侵害（serious interference）は、次の3つのうち最大額を上限とする。5,000万AUD、不当利益の3倍、または対象期間の売上の30%。2024年改正（POLA）で3段階の制度になった。重大でない侵害には、法人で最大330万AUDの低い民事罰が適用される。「repeated」だけでは罰則の対象にならず、各侵害が個別に対象となる。 |
| 出典 | https://www.kennedyslaw.com/en/thought-leadership/article/2024/a-small-but-significant-first-step-forward-new-australian-privacy-act-reforms-enacted/ （二次資料） |
| 確度 | 中。出典は2024年の解説記事です。この3段階制度の施行日は確認できていません。 |

- 「2022年強化」は、記事が「existing level」と書く部分と整合します。ただし2022年改正そのものの一次資料は確認していません。
- 「30%」の算定基準は、売上の対象期間によって異なります。Kennedys は「12か月以上の期間の売上」と書いており、法文での正確な表現は未確認です。
- 出典URL `https://www.oaic.gov.au/`（:39）はトップページで、根拠として弱いです。

### 1-6. ディープフェイク刑事化の記述に具体性を加えたい
| 項目 | 内容 |
|---|---|
| 該当パス | `axes.prohibited_uses.detail`（:16） |
| 今の記述 | 「2024年の刑法改正で非同意のディープフェイク性的素材の共有を犯罪化」 |
| 追記すべき内容 | 法律名は Criminal Code Amendment (Deepfake Sexual Material) Act 2024（No. 78, 2024）。通信サービスを使って、18歳以上と見える人物の性的素材を同意なく送信した場合は懲役6年。加重類型は懲役7年。加重類型の1つは、Online Safety Act 2021 の民事罰命令などが先行する反復の場合。もう1つは、その素材を作成または改変した者の場合。 |
| 出典 | https://www.ato.gov.au/law/view/pdf/acts/20240078.pdf （法律本文の PDF。検索結果の抜粋で確認）<br>https://www.codea.com.au/publication/the-criminal-code-amendment-deepfake-sexual-material-act-2024-policy-reform-to-strengthen-online-safety-in-australia/ （二次資料） |
| 確度 | 高 |

- 範囲の注意点があります。この犯罪は「送信」が要件です。codea は、作成や改変だけでは、通信サービスで送信しない限り犯罪にならないとしています。
- 18歳未満の素材は、別の児童虐待素材の犯罪でカバーされます。
- 出典URL `https://www.ag.gov.au/`（:18、:80）もトップページで弱いです。上記の法律本文の PDF に差し替えるのが望ましいです。

### 1-7. AI Safety Institute の記述が古い
| 項目 | 内容 |
|---|---|
| 該当パス | `axes.enforcement_body.detail`（:44） |
| 今の記述 | 「AI Safety Institute相当として2025年にAI安全関連機能の整備が進む」 |
| 正しい記述（案） | 2025年11月に AI Safety Institute の設立が発表された。資金は4年間で2,990万豪ドル。2026年初頭に稼働する予定とされた。2026-05-29の ABC 報道によると、Kate Conroy 氏が初代ゼネラルマネージャーに選ばれた。同報道は、省の広報担当者が正式な開所時期を示さず「まもなく稼働」とだけ述べたとも伝えている。 |
| 出典 | https://www.abc.net.au/news/2026-05-29/kate-conroy-leading-ai-safety-institute/106736306 （ABC、報道）<br>https://www.crn.com.au/news/2025/legislation-and-regulation/fed-govt-australian-ai-safety-institute （CRN） |
| 確度 | 設立発表と人事は中〜高。稼働の状況は確認できていません（第3節）。 |

- 「AI Safety Institute」は規制当局ではなく、評価・助言の拠点です。`enforcement_body.summary` の「AI専属の監督機関はない」は、今の資料の範囲では維持できます。

## 2. 足すべき新しい動き（timeline 候補）

| 日付 | 出来事 | 出典 | 確度 |
|---|---|---|---|
| 2025-10-21 | Guidance for AI Adoption（6つの必須プラクティス）公表。VAISS を置き換え | https://www.industry.gov.au/publications/voluntary-ai-safety-standard | 高 |
| 2025-11（日は未確定） | AI Safety Institute の設立発表。資金は4年で2,990万豪ドル | https://www.abc.net.au/news/2026-05-29/kate-conroy-leading-ai-safety-institute/106736306 | 中 |
| 2025-12-02 | National AI Plan 公表。義務的ガードレールは進めず、既存法で対応する方針 | https://www.mallesons.com/au/en/insights/latest-thinking/australias-ai-plan-where-is-australia-going-with-ai.html<br>https://www.maddocks.com.au/insights/the-new-national-plan-for-australias-ai-enabled-future | 中〜高 |
| 2025-12-15 | 政府機関向け AI 利用ポリシー v2.0 施行 | https://www.digital.gov.au/ai/ai-in-government-policy | 中〜高 |
| 2026-05-29 | AI Safety Institute 初代ゼネラルマネージャーに Kate Conroy 氏を選任（報道日） | https://www.abc.net.au/news/2026-05-29/kate-conroy-leading-ai-safety-institute/106736306 | 中 |
| 2026-08-31 | Privacy Amendment (Personal Data Protection) Bill 2026 の公開草案と協議ペーパーを公表（第2弾改正）。意見募集の締切は2026-09-18。政府は年内の国会提出を目指す | https://www.gadens.com/insights/tranche-2-privacy-reforms-key-changes<br>https://www.lk.law/2026/09/australias-privacy-act-reforms-inside-the-second-tranche/ | 中（二次資料2件が一致） |
| 2026-10-21 | 政府機関向け AI 利用ポリシー v2.1（軽微な更新）公表 | https://www.digital.gov.au/ai/ai-in-government-policy | 中 |
| 2026-12-10（予定） | プライバシーポリシーでの自動意思決定（ADM）の開示義務が開始 | https://www.lk.law/2026/09/australias-privacy-act-reforms-inside-the-second-tranche/<br>https://jws.com.au/what-we-think/second-tranche-of-australian-privacy-act-reform-exposure-draft-legislation-key-proposals-and-practical-implications/ | 中〜高 |

**補足**
- 2025-06-10にプライバシー侵害の不法行為（statutory tort）が施行されました。出典は https://jws.com.au/what-we-think/second-tranche-of-australian-privacy-act-reform-exposure-draft-legislation-key-proposals-and-practical-implications/ （二次資料）で、確度は中です。これは AI 専用ではありません。AI 事案にも届きうる既存法の話として、`penalties` の本文に1文足す扱いが妥当です。
- Gadens は、2026-08の草案に AI 専用の義務は含まれず、上記の自動意思決定の透明性だけが AI 関連だと指摘しています。
- timeline 候補のうち、2026-08-31と2026-12-10はプライバシー法の動きです。AI 規制の timeline に入れるかどうかは、サイトの編集方針で決めてください。

## 3. 未確認のまま残る点

1. **National AI Plan の本文（一次資料）。** 方針転換の根拠は法律事務所の解説だけです。政府の公式ページ（industry.gov.au など）で、文言と公表日を確認してください。
2. **2024-09-05という日付。** 提案ペーパーと VAISS の公表日として JSON にありますが、今回の検索結果では日付そのものを確認できませんでした。いずれも2024-09の公表とする点は VAISS ページなどと矛盾しません。
3. **AI Safety Institute の稼働状況。**
   - 設立発表日は、ABC が「2025年11月」としています。「11月25日」と日付まで書くのは cryptobriefing だけで、信頼できる出典として使いにくいです。
   - 同じ記事が書く次の2点も、一次資料が見つからず採用していません。
     - 2026-07-07に実際のモデル試験を開始した。
     - 2026-05-24に英国と協力覚書（MOU）を結んだ。
   - ABC は、英国の機関と連携する動きがあることまでは書いていますが、MOU の日付までは確認できません。
   - 「早期2026年に稼働」とした資料と、2026-05末時点でも「まもなく稼働」とした ABC の報道にずれがあります。開所日は未確認です。
4. **プライバシー法の罰則3段階の施行日、および「30%」の売上の算定基準。** 二次資料のみで、法文は確認していません。
5. **政府機関向けポリシー v2.0 の具体的な義務内容。** 施行日は確認できましたが、v1.1との差分は読めていません。transparency の記述（:30）を書き換えるには、一次資料の確認が必要です。
6. **`config/countries.yaml:287` のコメント。**
   - 内容は「industry.gov.auはドメイン自体がAU外から到達不能のため2026-08に差し替え」です。
   - 今回の検索では industry.gov.au のページ本文が取得できました。fetch ツールは、2025-09-21時点のキャッシュらしき内容を返しました。
   - GitHub Actions など実際の巡回環境から到達できるかどうかは、この調査では判断できません。コメントが正しいかどうかは分からないままです。
   - 巡回元が `oaic.gov.au/news`（scrape_hash）と `pm.gov.au` の RSS だけになっています。AI 政策の一次発信元である DISR と DTA を拾えていない点は、運用上の懸念として残ります。
7. **検索上限で確認できなかった項目。** 次の点は調べていないので、動きがあるかどうかも分かりません。
   - AI 生成の性的画像を作るアプリ（ヌーディファイ）の規制
   - 著作権（AI 学習用のテキスト・データマイニング例外など）
   - Children's Online Privacy Code の進捗
   - eSafety Commissioner の AI 関連の動き
   - 州レベルの AI 関連法
