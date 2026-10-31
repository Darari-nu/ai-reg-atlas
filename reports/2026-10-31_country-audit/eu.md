# AI Reg Atlas EU 点検結果（2026年10月末時点）

結論から言うと、`eu.json` に事実の誤りは見つかりませんでした。直すべき点は、出典の差し替えや記述の抜け、並び順が中心です。

- **突き合わせた中身**
  - Omnibus の条文（第2条2項、第3条14号、第5条1項(ba)(bb)・1a項、第6条1a項、第75条1項、第99条6a項、第111条4項、第113条）
  - 発効・施行日
  - 第101条のGPAI罰金の起算日
  - 諮問フォーラム174名
  - 5月19日のドラフト指針
- **条文の読み方**
  - eur-lex の ELI ページは、取得できたのがメタデータだけでした。取得できたのは、成立日 2026-07-08 と発効日 2026-07-27 です。
  - 条文の本文は、`artificialintelligenceact.eu` の Omnibus 統合テキスト（下記 A）で確認しました。
- **作業の制約:** 途中で Web ツールの利用上限に達しました。そのため、`countries.yaml` の加盟国ノート（独・仏・伊・蘭）は一次資料で確かめられていません。
- **確度の目安:** 高は条文または公式ページを開いて確認、中は複数の二次情報で一致、低は単一の二次情報です。

## 1. 直すべき箇所

| # | JSONパス | 今の記述 | 正しい／望ましい記述 | 出典 | 確度 |
|---|---|---|---|---|---|
| 1 | `axes.timeline` の並び（83〜92行目と93行目以降） | 2027-12-02 と 2028-08-02 が、2026-06-01〜2026-12-02 の項目より前にある | 日付の昇順に並べ替える。ファイルを読んだ限りの構造上の指摘で、外部資料は不要 | （`eu.json` 自体） | 高 |
| 2 | `axes.timeline[date=2026-08-02].event` | 第50条の透明性義務だけを書いている | 同日に、欧州委員会（AI Office）によるGPAI義務の執行権限（罰金を含む）も始まったと追記する。`gpai_obligations` と `penalties` の本文とは整合する | https://digital-strategy.ec.europa.eu/en/faqs/guidelines-obligations-general-purpose-ai-providers （開いて確認） | 高 |
| 3 | `timeline[2027-12-02]` と `timeline[2028-08-02]` の `source` | 汎用ページ `regulatory-framework-ai` を出典にしている。同ページの該当箇所は「政治合意の結果」という表現で、採択前の書き方 | 改正後の第113条を出典にする。Annex III系は第113条3項(c)(i)で2027-12-02、Annex I系は(ii)で2028-08-02 | https://artificialintelligenceact.eu/ai-act-explorer/digital-omnibus/ （開いて確認）、https://eur-lex.europa.eu/eli/reg/2026/1744/oj | 高 |
| 4 | `axes.risk_classification.sources[3]` | Gibson Dunn の記事を出典にしている | この記事の公開日は 2026-05-27 で、内容は「暫定的な政治合意」「採択と官報掲載は数週間後の見込み」。成立後の資料に差し替える。例として White & Case（発効の解説）や EUR-Lex がある | https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/ （開いて確認）、https://www.whitecase.com/insight-alert/eu-ai-omnibus-enters-force-amending-ai-act （検索で実在確認） | 高 |
| 5 | `axes.penalties.detail` の「中堅企業（SMC）」 | 「中堅企業（SMC）」と書いている | 条文の定義は small mid-cap enterprise（勧告 (EU) 2025/1099 の附属書2号）なので、「小規模中堅企業（SMC）」と書く。第99条6a項は「4項と5項の罰金」にだけ「低い方」を適用する。4項は1,500万ユーロ/3%、5項は750万ユーロ/1%に当たる。禁止行為違反の第3項（3,500万ユーロ/7%）には適用されない。現行の記述は誤りではないが、この点を明記すると誤読を防げる | https://artificialintelligenceact.eu/ai-act-explorer/digital-omnibus/ （第3条追加定義と第99条6a項） | 高 |
| 6 | `axes.penalties.detail`（抜け） | Omnibus による第99条の他の変更が書かれていない | 次の2点を追記できる。①第99条4項に(da)号が加わり、第25条2項・4項の義務（バリューチェーン上の義務）が1,500万ユーロ/3%の区分に入った。②第99条1項は、加盟国の罰則に警告や非金銭的措置を含められると明記した | 同上 | 高 |
| 7 | `axes.risk_classification.detail`（機械規則の記述） | 「機械規則 (EU) 2023/1230 は Annex I のセクションAからセクションBへ移り」 | 改正条文は、Annex I セクションAの1号（機械指令 2006/42/EC）を削除し、セクションBに21号として機械規則 (EU) 2023/1230 を加えるもの。前文は「Regulation 2023/1230 を A から B へ移す」と書いている。そのため現行の記述は前文に沿っていて誤りとまでは言えない。厳密に書くなら「機械指令（後継の機械規則）」とする | 同上（第41条）。前文の根拠も同ページ | 中（表現の精度の問題） |
| 8 | `axes.prohibited_uses.detail`（補足） | 第5条1項(bb)の例外が書かれていない | (bb)（児童性的虐待素材）には、国内法上の「正当な権限がある」場合の抗弁が適用される例外がある。(ba)の対象は、特定可能な人物の「性的部位」または「性的に露骨な行為」を写実的に生成・加工するものに限られる | 同上（第5条の改正部分） | 高 |
| 9 | `axes.enforcement_body.detail`（現状の補足） | 「各加盟国は2025-08-02までに市場監視当局・通知当局を指定」とだけ書いている | 実際には指定が遅れている。ある追跡ページは「9加盟国が両当局を指定済み、12が部分的、6が未着手」としている（更新日不明、検索結果の経過日数からは2026年6月頃と推測）。別の集計サイトは、2026-10-24時点の状況を載せているとしている。検索結果の抜粋でしか見ておらず、数字は断定できない。載せるなら「遅れている」程度にとどめる | https://artificialintelligenceact.eu/national-implementation-plans/ 、https://aiactguide.net/authorities/ （どちらも検索で実在確認のみ） | 低 |
| 10 | `config/countries.yaml` の `eu-es`（`status: in_force`） | ノートは AESIA（スペインAI監督庁）の設置を述べている。`status` は `in_force` | 集計サイト aiactguide.net の抜粋によると、スペインには国内AI法がなく、法案 121/000096 は 2026-10-06 に失効し（RD 806/2026）、AESIA は RD 729/2023 に基づいて存在する。この `status` が何の施行を指すのかが曖昧なので、「AESIA は存在するが、国内AI法は未成立」とノートを直す案を検討できる。単一の二次情報で、本文を開いていないため要再確認 | https://aiactguide.net/authorities/ （検索で実在確認のみ） | 低 |

## 2. 足すべき新しい動き（`timeline` 候補）

| 日付 | 出来事 | 出典 | 確度 |
|---|---|---|---|
| 2025-07-10 | GPAI実践規範が公表された。本文には書いてあるが、`timeline` には無い | https://digital-strategy.ec.europa.eu/en/policies/contents-code-gpai （開いて確認） | 高 |
| 2026-06-01 | 科学パネルも同日に任命された。Advisory Forum の174名（700件超の応募から選抜）は、既存の項目どおり確認できた。ALLAI の声明は「6月3日に紹介」としているが、欧州委員会の発表日は 6/1 | https://digital-strategy.ec.europa.eu/en/news/ai-act-enforcement-gets-independent-expert-support （検索で実在確認）、https://artificialintelligenceact.eu/the-advisory-forum-what-is-it-and-how-does-it-work/ （開いて確認） | 高 |
| 2026-06-10 | AI生成コンテンツのマーキング・ラベリングに関する実践規範（最終版）を欧州委員会が公表 | https://digital-strategy.ec.europa.eu/en/news/commission-publishes-code-practice-marking-and-labelling-ai-generated-content （検索で実在確認）、https://ec.europa.eu/commission/presscorner/detail/en/ip_26_1328 （検索で実在確認） | 高 |
| 2026-07-08 | Omnibus（規則 (EU) 2026/1744）が採択・署名された。ELI のメタデータにある文書日は 2026-07-08 | https://eur-lex.europa.eu/eli/reg/2026/1744/oj （メタデータのみ取得） | 高 |
| 2026-07-08〜09 | 実践規範について、欧州委員会が 7/8 に意見を出し、AI Board が 7/9 に同意した。この日付は法律事務所系の解説（bratby.law）にしかない。欧州委員会の公式ページが確認しているのは「適切な任意の手段と確認した」という点まで | https://bratby.law/ai-transparency-code-of-practice-adequacy/ （検索で実在確認）、https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content （検索で実在確認） | 中 |
| 2026-07-20 | 第50条の透明性義務に関する欧州委員会の最終ガイドラインを採択（C(2026) 5054 final） | https://digital-strategy.ec.europa.eu/en/news/commission-publishes-guidelines-transparency-obligations-providers-and-deployers-certain-ai-systems （検索で実在確認）、https://www.paulweiss.com/insights/client-memos/eu-finalises-transparency-rules-for-ai-generated-content （検索で実在確認） | 高（日付）／中（文書番号は1サイトのみ） |
| 2026-07-24 | Omnibus が官報に掲載された。発効日 7/27 は既存の項目と一致 | https://www.whitecase.com/insight-alert/eu-ai-omnibus-enters-force-amending-ai-act （検索で実在確認） | 高 |
| 2026-07-31頃 | 最初の整合規格 EN 18286:2026（AI品質マネジメントシステム）を CEN-CENELEC が公表。ただし第40条の推定適合が効くのは、参照が官報に載ってから。CDT の10月号は、欧州委員会が「最近」この参照を公表したと伝えているが、日付は特定できない | https://docs.modulos.ai/frameworks/eu-ai-act/harmonized-standards/en-18286 （検索で実在確認）、https://cdt.org/insights/cdt-europes-ai-bulletin-october-2026/ （検索で実在確認） | 中〜低（二次情報のみ） |
| 2026-10-12 | AI Office の手続規則（第75c〜75d条の執行手続）に関する実施法案の意見募集が始まり、11/9 まで | https://www.lexology.com/library/detail.aspx?g=cdc3a626-bf58-48c1-a9b3-d80923381e31 （検索で実在確認）、https://cdt.org/insights/cdt-europes-ai-bulletin-october-2026/ | 中 |
| 2026-10-14 | Virkkunen 上級副委員長が、AI Office が先進モデルの提供者へ最初の情報提供要求（RFI）を送ったと表明した。Euronews は、OpenAI と Anthropic が対象になったと報じている。同記事は、AI Office の調査権限の範囲（開発段階まで及ぶか）に対し、法律専門家が異論を唱えているとも伝えている | https://www.euronews.com/2026/10/14/eus-ai-rules-face-first-enforcement-test-over-lab-incidents （検索で実在確認）、上記 Lexology | 中（発言日と要求の送付は複数の報道が一致。内容の詳細は二次情報） |

今後の期限として、Omnibus が定めた次の日付も入れられます。出典は上記 A の統合テキストで、確度は高です。

- **2027-08-02:** 各加盟国の国内サンドボックスの稼働期限（Omnibus の改正第113条より）。
- **2030-08-02:** 公的機関向けに用いられるハイリスクAIの対応期限（第111条2項）。

## 3. 未確認のまま残る点

- **`eu.json` 内の「未確認」表記:** `eu.json` に「未確認」という語はありません。
  - 近い表記は `countries.yaml` の冒頭コメント（4〜9行目）にあります。2026-09-19 追加分の「成立日・施行日・執行機関は一次ソースで裏を取るまで確定値としない」という注意書きです。
  - 別ファイルの `data/guides/eu-ai-act-high-risk.json` にも、「未確認」の記述が2か所あります。
- **ガイドの「未確認」2点:**
  - 617行目は、SME・小規模中堅企業向けの簡易技術文書様式の公表状況です。条文上は、欧州委員会が簡易様式を作り、第三者機関がそれを受け入れると定めています（第11条1項）。様式が実際に出たかは確認できませんでした。
  - 1201行目は、使用説明書の言語の定めです。確かめられませんでした。
- **ハイリスク分類ガイドラインの最終化:**
  - 2026-05-19 公表のドラフトは確認できました。
  - 検索で見えた欧州委員会のページは、10月19日更新ながら本文は「ドラフト」のままです（https://digital-strategy.ec.europa.eu/en/policies/guidelines-ai-high-risk-systems ）。最終版が採択されたかは確認できません。
- **加盟国ノート（`countries.yaml` の `eu-de` `eu-fr` `eu-it` `eu-nl`）:** 以下はいずれも確かめられていません。上限到達前に開けた資料がなく、コメントの正否は不明です。
  - ドイツの AI 市場監視法（審議中という記述）。
  - フランス CNIL の位置づけ。
  - イタリア法 132/2025 が「EU初の国内AI法」であること。
  - オランダ DCA の位置づけ。
  - 補足として、集計サイトの抜粋は、イタリアの ACN が市場監視当局として通知済み（2026年4月時点）としています。ただし同じ抜粋に国名の取り違えが混じっているため、根拠にはしませんでした。
- **GPAI実践規範の位置づけ:** 法律事務所系の解説（bratby.law）は、GPAI実践規範に一般的効力を与える実施法の権限が、Omnibus で削除されたと書いています。条文自体は確認していないため、`gpai_obligations` を直すかどうかは判断できません。
- **Omnibus の別の部分:** CDT の10月号は、データ・GDPR 側の Digital Omnibus について、理事会が立場を固めたと伝えています。AI Act への影響は確認していません。
- **`countries.yaml` のその他のコメント:** 次の2つは確認していません。
  - 17行目の「旧EC RSSは破損」。
  - 2行目の「URLは2026-06-12時点」。

**出典の確認状況**

- **本文を開いて確認:**
  - 上記 A: https://artificialintelligenceact.eu/ai-act-explorer/digital-omnibus/
  - 上記のほか https://ai-resources.eu/atti-normativi/ue/digital-omnibus-ai/ と https://brubru.beresol.eu/eucanon/2026-1744_aiomnibus/
  - `eu.json` に載っている公式ページのうち、上の表に出ていないもの（`ai-office`、`artificialintelligenceact.eu/article/113/`、`transparency-rules-article-50/`）
- **メタデータのみ取得:** eur-lex の2件（2026/1744 と 2024/1689）。
- **検索結果で実在を確認しただけ:** 上記の表で「検索で実在確認」と書いたもの。
