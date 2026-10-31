# シンガポール（sg）点検結果（2026-10-31 時点）

**先に結論**
- `sg.json` の既存の日付と事実は、確認できた範囲では正しいです。
- 古くなっているのは次の3点です。
  - 2026年の新しい動きが、timeline と本文のどこにも入っていません。
  - 罰則の書き方が不正確です。
  - 出典 URL がトップページばかりです。
- シンガポールに AI 横断法ができた形跡は見つかっていません。2026年7月の Mayer Brown の記事も「単独の AI 法はない」としています。
- `sg.json` には「未確認」と書かれた箇所がありません。`countries.yaml` の sg ブロックにもありません（読んだのは `sg.json` 全体と `countries.yaml` の 222〜232 行）。そのため、「ファイル内で未確認とされている点」は無く、下の第3節は私が確かめきれなかった点です。

## 1. 直すべき箇所

| # | JSON のパス | 今の記述 | 正しい記述（案） | 出典 | 確度 |
|---|---|---|---|---|---|
| 1 | `axes.penalties.detail` | 「PDPA違反は最大100万SGDまたは年間売上10%の制裁金」 | 上限はシンガポール国内の年間売上高が1,000万SGDを超える組織なら国内売上の10%、それ以外は100万SGD。2022-10-01 以降の違反に適用。「どちらか高い方」ではなく、売上規模で上限が決まる。 | https://sso.agc.gov.sg/SL/PDPA2012-S62-2021?DocDate=20220930&ProvIds=P12A- （Personal Data Protection (Enforcement) Regulations 2021 の第10A条。検索結果の本文で確認） | 高 |
| 2 | `axes.enforcement_body.detail` と `summary` | 金融分野は「MASのFEAT原則・Veritasが補完」 | MAS は2026-10-07 に「AIリスク管理ガイドライン」の確定版を出した。金融機関全般が対象。施行は2027-10-07 で、第3〜4節は2027-10-07 から、第5〜6節は2028-10-07 までに満たせばよい。FEAT・Veritas は残したまま、このガイドラインを追記する。 | https://www.mas.gov.sg/news/media-releases/2026/mas-sets-out-supervisory-expectations-on-responsible-ai-adoption-by-financial-institutions （本文を開いて確認） | 高 |
| 3 | `axes.prohibited_uses.detail` と `axes.transparency.detail` | ディープフェイクは「選挙(integrity of online advertising)関連の個別立法」とだけ書いている | 法律名と日付を書く。Elections (Integrity of Online Advertising) (Amendment) Act 2024 は2024-10-15 に可決、2025-01-22 に施行。選挙候補者のディープフェイクを禁じる。 | 施行日: https://www.eld.gov.sg/gazettes/2025/Elections%20(Integrity%20of%20Online%20Advertising)%20(Amendment)%20Act%202024%20(Commencement)%20Notification%202025.pdf （官報 S 47、検索結果の本文で確認）。可決日: https://insightplus.bakermckenzie.com/bm/technology-media-telecommunications_1/singapore-law-passed-to-ban-deepfakes-during-general-elections | 高（施行日）／中（可決日は法律事務所の記事） |
| 4 | `axes.transparency.summary`、`axes.gpai_obligations` ほか | 「横断的な表示義務はない」「GenAI枠組みと AI Verify が任意の標準」だけ | 横断的な法的義務がないという結論は変わらない。ただし2026年に任意のガイドラインが2本増えた（第2節の a・b・c）。IMDA のチャットボット透明性ガイドラインは任意であることを明記したうえで、`transparency` に追記する。 | https://www.bakermckenzie.com/en/insight/publications/2026/07/singapore-new-transparency-guidelines-for-generative-ai-chatbots | 高 |
| 5 | `last_changed` | 2024-05-30 | 少なくとも2026-10-14（AI TAP 正式開始）以降に更新する。ほかの国の運用ルールがどうなっているかは見ていない。 | 第2節を参照 | 高 |
| 6 | 各 `sources[]`、`timeline[].source` | `imda.gov.sg/`、`pdpc.gov.sg/`、`aiverifyfoundation.sg/` のトップだけ | 個別ページに差し替える。たとえば GenAI 枠組みは https://aiverifyfoundation.sg/resources/mgf-gen-ai/ 。2020年の第2版は https://www.pdpc.gov.sg/news-and-events/announcements/2020/01/second-edition-of-model-ai-governance-framework-now-available 。 | 同左（検索結果で実在を確認） | 高 |

**判断が必要な点（誤りとは言い切れない）**
- **`status: "in_force"`（`sg.json` 4行目）**：横断法はないので、「施行中の法」という読み方をされるおそれがあります。ただし jp も `in_force` と `soft_law` の組み合わせで、プロジェクトの方針かもしれません。方針はこちらでは判断できません。
- **`axes.prohibited_uses.detail` の Online Criminal Harms Act**：この法がディープフェイクに当たるかは、今回確認していません。新たに分かった関連法として、Online Safety (Relief and Accountability) Act 2025 があります。被害の類型に「inauthentic material abuse（偽造素材の悪用）」が含まれます（https://sso.agc.gov.sg/Act/OSRAA2025?ViewType=Pdf&_=20261014150359 の検索結果の抜粋で確認）。

**既存の日付で確認できたもの（修正不要）**

| timeline の日付 | 出来事 | 確認に使った出典 |
|---|---|---|
| 2019-01-23 | Model AI Governance Framework 初版 | https://www.pdpc.gov.sg/help-and-resources/2020/01/model-ai-governance-framework |
| 2020-01-21 | 第2版 | 上の項目 6 の PDPC ページ |
| 2023-06-07 | AI Verify Foundation 設立・AI Verify のオープンソース化 | https://www.sgpc.gov.sg/api/file/getfile/Singapore%20launches%20AI%20Verify%20Foundation%20to%20shape%20the%20future%20of%20international%20AI%20standards%20through%20collaboration.pdf?path=%2Fsgpcmedia%2Fmedia_releases%2Fimda%2Fpress_release%2FP-20230607-1%2Fattachment%2FSingapore+launches+AI+Verify+Foundation+to+shape+the+future+of+international+AI+standards+through+collaboration.pdf |
| 2024-05-30 | GenAI 向け枠組み確定版 | https://aiverifyfoundation.sg/resources/mgf-gen-ai/ （2024-01-16 に提案版を公開し、確定版は2024-05-30 とある） |

- GenAI 枠組みの9次元の列挙は、AIVF のページの「9 dimensions」と矛盾しません。ただし9項目の名称を一つずつ突き合わせてはいません。
- 検索で CASRAI のページが「19 June 2024」と書いていましたが、これは上の一次情報と合わないので採用しません。

## 2. 足すべき新しい動き（timeline 案）

| 日付 | 出来事 | 出典 | 確度 |
|---|---|---|---|
| 2024-10-15 | 選挙ディープフェイク禁止の改正法が可決 | https://insightplus.bakermckenzie.com/bm/technology-media-telecommunications_1/singapore-law-passed-to-ban-deepfakes-during-general-elections | 中 |
| 2025-01-22 | 同改正法が施行 | 官報 URL は第1節の 3 | 高 |
| 2025-11-13 | MAS が AI リスク管理ガイドライン案を意見募集に出した | https://www.mas.gov.sg/news/media-releases/2025/mas-guidelines-for-artificial-intelligence-risk-management （検索結果で確認） | 高 |
| 2026-01-22 | IMDA が Model AI Governance Framework for Agentic AI を公表（ダボス、世界初をうたう） | https://www.mddi.gov.sg/newsroom/singapore-launches-new-model-ai-governance-framework-for-agentic-ai--/ 、https://www.imda.gov.sg/resources/press-releases-factsheets-and-speeches/press-releases/2026/new-model-ai-governance-framework-for-agentic-ai | 高 |
| 2026-03 | MAS が Project MindForge の第2段階を終え、AI リスク管理の運用ハンドブックを公表（日は未確認） | https://www.mayerbrown.com/en/insights/publications/2026/07/ai-regulation-in-singapore-and-hong-kong-a-mid-year-checkpoint | 中（法律事務所の記事のみ） |
| 2026-05-20 | IMDA が Agentic AI 枠組みを更新（事例とベストプラクティスを追加） | https://www.allenandgledhill.com/sg/publication/articles/33285/imda-updates-model-ai-governance-framework-for-agentic-ai | 高 |
| 2026-06-29 | Online Safety Commission が業務を開始。OSRAA の一部の条項（不法行為に関する規定）も同日に施行 | https://www.mddi.gov.sg/newsroom/online-safety-commission-and-online-safety--relief-and-accountability--act-2025-to-start-on-29-june-2026/ | 高 |
| 2026-07-20 | PDPC が「生成AIにおける個人データの利用に関するアドバイザリー・ガイドライン」を公表 | https://www.allenandgledhill.com/sg/perspectives/articles/33389/sgkh-pdpc-issues-advisory-guidelines-on-use-of-personal-data-in-generative-ai | 高 |
| 2026-07-20 | IMDA が「生成AIチャットボットの透明性ガイドライン」を公表（任意） | https://www.bakermckenzie.com/en/insight/publications/2026/07/singapore-new-transparency-guidelines-for-generative-ai-chatbots | 高 |
| 2026-10-07 | MAS が AI リスク管理ガイドラインの確定版を発表（施行2027-10-07、段階適用2028-10-07） | MAS の発表（第1節の 2） | 高 |
| 2026-10-14 | AI Verify Foundation が AI Tester Accreditation Programme を正式開始 | https://aiverifyfoundation.sg/news/press-release-launch-of-the-ai-tester-accreditation-programme/ （ページの公開日メタが2026-10-14。本文の日付は取れていない） | 高 |
| 2026-10-14 | IMDA が AI エージェントのテスト用スターターキットを公開。AI 起因のサイバー脅威に関するタスクフォースも発表 | https://www.asiaone.com/singapore/imda-ai-safety-initiatives-agentic-ai-testing-cybersecurity 、https://littlebigreddot.com/imda-ai-agent-testing-kit-accredited-ai-testers-fairs-2026/ | 中（報道。IMDA の一次ページは未確認） |

**補足**
- AI TAP は、2026-05-18 に ATxSummit で発表され、年内に開始する予定でした。この発表は https://aiverifyfoundation.sg/events/recap-of-ai-assurance-exchange-ise-and-atxsummit-2026/ で確認しています。
- 2026-10-14 の正式開始時に、最初の認定機関が出ています。数は報道では5社です。
- 2026-03 の MindForge は、日を特定できる一次資料を開けていないため、月だけにしています。
- 2026-07-20 の PDPC の内容を一つ挙げます。個人データの公開情報例外について、ペイウォールやアクセス制限があっても自動的に非公開とは扱わない、という判断枠組みが示されています（https://www.inplp.com/publications/singapore-s-new-generative-ai-guidan 、法律事務所系の解説）。
- 上記は拘束力のない任意のガイドラインです。MAS のガイドラインだけは金融機関向けの監督上の期待で、拘束力の程度は未確認です（第3節）。

## 3. 未確認のまま残る点

- **MAS ガイドラインの法的拘束力**：確定版の発表は確認しましたが、法的に拘束力があるのか、監督上の期待にとどまるのかは本文で確かめていません。
- **PDPC 生成AIガイドラインの一次ページ**：pdpc.gov.sg の該当ページ自体は開けていません。日付と内容は、Allen & Gledhill、Eversheds Sutherland、INPLP など法律事務所の記事で確認しました。
- **IMDA のチャットボットガイドラインの一次ページ**：同様に、IMDA 自身のページは開けていません。日付は Baker McKenzie などで確認しました。
- **MindForge の公表日**：2026年3月の何日かは不明です。
- **CSA の勧告（2026-04）と「Securing Agentic AI」の付録（2026-06-17）**：どちらも二次資料で言及されているだけで、一次ページは開けていません。timeline には入れていません。
- **AI Verify の最初の公開**：2022年とする記述（Mayer Brown）はありますが、日付は取れていません。
- **所管機関の細かい点**：PDPC と IMDA の組織上の関係、IMDA が AI 政策を主導しているという書き方の妥当性は、今回は検証していません。「AI専属の監督機関はない」という記述の反証は見つかっていません。
- **Online Criminal Harms Act とディープフェイクの関係**：第1節の通り未確認です。
- **`countries.yaml` の sg のコメント**：「pdpc.gov.sg は代替ページも常に空だったため削除」という記述は、収集側の挙動の話で、こちらでは再現できません。ただし検索結果には pdpc.gov.sg の本文付きページが出ています。
- **`official_sources` の候補**：`aiverifyfoundation.sg/news/` には2026-10-14 のプレスリリースが載っているため、監視先として有効な可能性が高いです。収集側で取得できるかは確かめていません。

作業ディレクトリのファイルは読んだだけで、変更していません。
