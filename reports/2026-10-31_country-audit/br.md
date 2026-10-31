Returns a JSON string. Parse it.Primary source confirmed. Let me see the most recent entries in the tramitação.Retry the timeouts.# ブラジル（br）点検結果（2026年10月末時点）

## 調べられた範囲と限界
- 法案の段階は、下院の議案ファイルを直接開いて確認しました。
- 罰則と禁止事項は、上院ニュースの記事を直接開いて確認しました。
- 上院議案ドシエ（`.../materia/157233`）は、取得が2回タイムアウトして開けませんでした。条文そのもの（`prop_mostrarintegra?codteor=2868197`）も `url_not_accessible` で開けませんでした。条文に当たる必要がある点は、下の「未確認」に回しています。
- 検索の上限に達したため、途中で追加検索ができなくなりました。TSE 2026年決議の番号などは、その影響で確認が足りません。

## 0. 先に結論
- **status "draft" と、上院可決・下院審議中という大枠は2026-10-27時点でも正しいです。**
  - 下院議案ファイルの状況は「Aguardando Parecer do(a) Relator(a) na Comissão Especial」です。
  - 最終の動きは2026-10-26と2026-10-27の関連法案の併合（apensação）だけです。
  - https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=2487262
- **ただし、ファイルの記述には古い点が複数あります。** 所管機関の前提（ANPDの法的地位）、timeline の欠落、TSE の最新ルールが特に古くなっています。

## 1. 直すべき箇所

| # | JSON パス | 今の記述 | 正しい記述 | 出典 | 確度 |
|---|---|---|---|---|---|
| 1 | `axes.enforcement_body.summary` / `.detail` | 「ANPD（国家データ保護庁）」。detail は「ANPD（国家データ保護庁）」、`SIA` の「ANPDをコーディネーター」とする。 | ANPD は2026-02-25公布のLei 15.352/2026で、Autoridade（庁）から **Agência Nacional de Protecção de Dados（国家データ保護**機関**＝規制機関）** に転換済み。特別自治体（autarquia）で、司法省に紐づき、機能・技術・財政面の自治を持つ。200のポストも新設された。法案側のSIA調整役としての位置づけ（上院可決案）は、そのままで正しい。 | https://www.camara.leg.br/noticias/1248401-entra-em-vigor-lei-que-cria-a-agencia-nacional-de-protecao-de-dados/ ／ https://www12.senado.leg.br/noticias/materias/2026/02/26/sancionada-lei-que-cria-a-agencia-nacional-de-protecao-de-dados | 高（議会公式ニュースを開いて確認） |
| 2 | `axes.timeline` | 最後の項目が「2025-06-01 下院で審議継続（特別委員会・公聴会）」。出典は `https://www.camara.leg.br/`（トップページ）。 | 日付が実際の出来事と合わない。下院受領は **2025-03-17**（議案ファイルの「Apresentação」）、特別委員会への付託は 2025-04-29。委員会の設置・報告者指名の2025-05-20 は二次情報のみ。出典も議案ファイルに差し替える。 | 議案ファイル（上記）。2025-04-29の付託は同ファイルの despacho 欄で確認。2025-05-20 は monitor.lcfconsulting.com.br（民間）の記載で、公式ページで裏取りできていない。 | 2025-03-17・04-29＝高 ／ 05-20＝中 |
| 3 | `last_changed` | `2025-06-01T00:00:00Z` | 後述「2. 足すべき動き」を入れるなら、少なくとも 2026-02-25（ANPD の機関化）以降へ更新が妥当。更新する日付は貴サイトの運用ルール次第（私は規則を確認していない）。 | ― | 中（運用判断） |
| 4 | `axes.transparency.detail` / `diff_vs_eu.unique[1]` | 「TSEが2024年にディープフェイクの選挙利用を制限する決議を出しており、既に拘束力がある」。出典は `https://www.tse.jus.br/`（トップページ）。 | 2024年分は **Res.-TSE 23.732（2024-02-27）** と特定できる。AI生成の合成コンテンツには、明示・目立つ・利用しやすい形での表示義務（9-B条）がある。2026年選挙向けには **2026-03-02にTSEが追加の規則改正を承認**している（下記2）。出典URLをトップページから個別ページへ変えるべき。 | https://www.tse.jus.br/legislacao/compilada/res/2024/resolucao-no-23-732-de-27-de-fevereiro-de-2024 ／ https://www.tse.jus.br/comunicacao/noticias/2026/Marco/tse-aprova-calendario-eleitoral-e-regulamenta-uso-de-ia-nas-eleicoes-2026 | 高（どちらも開いて確認） |
| 5 | `axes.penalties.detail` | 「5,000万レアルまたは企業グループのブラジル国内売上の2%」 | 上院ニュースは「R$5,000万、または**グループ・コングロマリットの総売上**の2%（1件あたり）」と書き、「ブラジル国内」とは書いていない。上院ニュースだけでは「国内」を支持できない。条文で確認できるまで、断定表現は避けるか出典を条文に替える。他の制裁（警告、特定データ処理の禁止、開発・提供・運用の一部または全部の停止）は同ニュースに記載あり。 | https://www12.senado.leg.br/noticias/materias/2024/12/10/senado-aprova-regulamentacao-da-inteligencia-artificial-texto-vai-a-camara | 「国内」の部分＝確認できず ／ 金額・2%＝高 |
| 6 | `axes.prohibited_uses.summary` | 「社会的スコアリングや自律型**致死**兵器等の禁止」 | 上院ニュースは「**自律型兵器システム**（人の介入なしに標的を選んで攻撃できるもの）」で、「致死」とは書いていない。また「社会的スコアリング」は、行動や人格に基づいて財・サービス・公共政策へのアクセスを不当に分類することの禁止、という書かれ方。 | 上記上院ニュース | 中〜高（ニュース記事ベース。条文では未確認） |
| 7 | `axes.prohibited_uses.detail` | 「公権力による社会的スコアリング、脆弱性悪用、特定の予測的治安維持等」 | 記事では「公権力」に限る書き方ではない。「性格・行動特性による犯罪予測の禁止」は記事にある。ほかに、児童の性的搾取に当たる資料の生成・流通を目的とするシステムの禁止、サブリミナル技術と脆弱性悪用の禁止も載っている。「公権力による」の限定が条文にあるかは未確認。 | 上記上院ニュース | 中 |
| 8 | `axes.risk_classification.detail` | 「2024-12に連邦上院が可決し下院へ送付」 | 正しい。ただし「送付」は上院可決直後ではなく、下院の受領記録が2025-03-17。 | 議案ファイル（apresentação 17/03/2025） | 高 |

補足です。
- 1行目（regulation_name）の「上院可決・下院審議中」は正しいです。
- 「AI固有の罰則はまだない」「現行はLGPDが間接適用」という趣旨は、今回の調査で覆す材料はありませんでした。ただし、2026年の法的状況を網羅確認したわけではありません。

## 2. 足すべき新しい動き（timeline 候補）

| 日付 | 出来事 | 出典 | 確度 |
|---|---|---|---|
| 2025-03-17 | 下院が PL 2338/2023 を上院から受領（優先審議の扱い） | 下院議案ファイル https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=2487262 | 高 |
| 2025-12-08 | 政府（行政府）が **PL 6237/2025**（SIA＝AI開発・規制・ガバナンス国家体系の創設）を提出。後に PL 2338 に併合。 | 下院議案ファイル https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=2594000 | 高（提出日・併合の事実）。内容の細部は未読。 |
| 2026-02-25 | Lei 15.352/2026 公布。ANPD が Agência Nacional de Proteção de Dados に転換 | https://www.camara.leg.br/noticias/1248401-entra-em-vigor-lei-que-cria-a-agencia-nacional-de-protecao-de-dados/ | 高 |
| 2026-03-02 | TSE が2026年選挙向けに、選挙宣伝規則（Res.-TSE 23.610/2019）の改正を承認。AI生成の合成コンテンツについて、表示義務に反した公開・共有などを禁止。 | https://www.tse.jus.br/comunicacao/noticias/2026/Marco/tse-aprova-calendario-eleitoral-e-regulamenta-uso-de-ia-nas-eleicoes-2026 | 高（承認日と内容）。決議番号は未確認（下記） |
| 2026-03-19 | 下院が PL 6237/2025 などAI関連の多数の法案を PL 2338 に併合 | 下院議案ファイル（apensação 19/03/2026、PL 6237/2025・PL 6270/2025 など） | 高 |
| 2026-10-26 / 10-27 | 関連法案の併合のみ（PL 3615/2026 → PL 6708/2025、PL 3560/2026 → PL 728/2026）。実体審議の前進ではない。 | 下院議案ファイル（上記） | 高 |

任意で追加できるものです。確度はいずれも下がります。
- **2026-01-14：ANPD が X 社の Grok に関する申立てを受理し、Nota Técnica 1/2026 を作成。**
  - 根拠は IAPP の寄稿記事（法律事務所の弁護士による意見記事）だけです。
  - ANPD 公式ページは取得がタイムアウトして確認できていません。
  - https://iapp.org/news/a/ia-generativa-y-protecci-n-de-datos-en-brasil-posicionamiento-de-la-anpd-en-la-nota-t-cnica-n-1-2026
  - 掲載するなら「一次資料未確認」の注記を付けるのが安全です。
- **「2026-08-24：報告者が採決は10月の選挙後と表明」「2026-05-19の採決見送り」**は、民間の monitor.lcfconsulting.com.br の記載です。
  - 下院公式の議案ファイルの動き（2026-05-14、05-20、05-25など）には、この発言自体は出てきません。
  - 事実として入れるなら出典が弱く、入れないほうが無難です。

## 3. 未確認のまま残る点
1. **罰則の条文**
   - 2%が「ブラジル国内」売上かどうか。
   - 「5,000万レアルまたは2%」が「どちらか高いほう」か「2%の算定に上限5,000万レアル」か。
   - 上院議案と下院の条文本文が開けなかったためです。
2. **「公権力による」社会的スコアリングの限定、GPAI の「システミックリスク管理」**（`gpai_obligations.detail`）
   - 上院ニュースでは「システミックリスク」という語を確認していません（キーワード検索は未実施）。
   - 条文での確認が必要です。
   - 「生成AI・汎用AIへの提供前の予備的リスク評価」は、民間の monitor.lcfconsulting.com.br の記載と整合するだけで、一次資料では未確認です。
3. **TSE 2026年改正の決議番号**
   - Migalhas の検索結果は「Res. 23.755（2026-03-02）」と書いていますが、TSEの個別ページでは確認できていません。
   - 追加検索が上限に達したため、番号は書けません。
4. **PL 6237/2025 の中身**
   - ANPD を「残余規制者（regulador residual）」とする点は、Teletime（業界紙）の見出しと検索結果の抜粋だけです。
   - 本文は取得が3回タイムアウトしたため未読です。
   - Planalto のページは検索で実在を確認しましたが、本文は読めていません。
5. **特別委員会の設置日・報告者指名（2025-05-20）、委員長・報告者の人名**
   - 公式の委員会ページ（`.../comissao-especial-sobre-inteligencia-artificial-pl-2338-23`）は2回タイムアウトしました。
   - Câmara の議員ページ（Aguinaldo Ribeiro）の検索結果の抜粋に、「Comissão Especial sobre Inteligência Artificial (PL 2338/23)」の委員として載っていることだけは確認しました。
6. **`countries.yaml` の br ブロックのコメント**（257〜268行）
   - 「2026-08-19時点: ローカルからは200だがGitHub Actions上で連日timeout」という記述の真偽は、私にはリポジトリ外から検証できません。
   - 下院の RSS URL（`.../CIENCIA-E-TECNOLOGIA`）は、今回は開いていません。
   - 一方、同じコメントが指す下院議案ファイルは今回開けました。貴サイトの取得が失敗する原因は、ネットワーク側の可能性があります。
   - 上院議案ドシエ（`official_sources` の1本目）は、私の環境ではタイムアウトしました。サイト側で「生存中」とされているのは、私の結果と食い違います。ただし、これが私の環境固有の問題かは判断できません。
7. **ANPD の AI 関連の新しい動きの網羅**
   - 「2026-2027 年の優先課題マップ（2025-12公表）に AI が入った」旨は複数の民間記事で見ましたが、ANPD 公式ページが開けず、一次確認は未了です。
   - 2026年のその他の AI 関連の ANPD 措置（調査・制裁）は、網羅できていません。
8. **その他**
   - 2026年の AI 関連法令・指針のうち、AI 専用の連邦法が成立した形跡は、今回見た範囲ではありません。
   - 見ていない分野（金融・保険の所管機関の AI 規則、保健・著作権の個別法など）は調べていません。

## 参考（今回開いた主な一次資料）
- 下院 PL 2338/2023 議案ファイル（2026-10-27時点）：https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=2487262
- 下院 PL 6237/2025 議案ファイル：https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=2594000
- 上院ニュース（2024-12-10 可決）：https://www12.senado.leg.br/noticias/materias/2024/12/10/senado-aprova-regulamentacao-da-inteligencia-artificial-texto-vai-a-camara
- TSE Res. 23.732/2024：https://www.tse.jus.br/legislacao/compilada/res/2024/resolucao-no-23-732-de-27-de-fevereiro-de-2024
- TSE 2026-03-02 の決議承認ニュース：https://www.tse.jus.br/comunicacao/noticias/2026/Marco/tse-aprova-calendario-eleitoral-e-regulamenta-uso-de-ia-nas-eleicoes-2026
- ANPD の機関化（下院・上院のニュース）：上記表1行目の2つのURL
