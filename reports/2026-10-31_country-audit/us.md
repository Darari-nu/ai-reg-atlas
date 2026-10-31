ファイルは読み終えました。次に Web で一次資料を確認します。# AI Reg Atlas 米国データの点検結果（2026年10月末時点）

`data/regulations/us.json` と `config/countries.yaml` の us ブロックを、Web の資料と突き合わせました。

## 前提

- **米国ブロックのコメントについて**: `config/countries.yaml` の us ブロック（88〜157行）には `#` コメントがありません。点検対象は各州の `note:` 欄です。他国のブロックにある「未確認:」コメントに当たるものは、米国にはありません。
- **調査の制約**: 途中で検索の上限に達しました。そのためテキサス州TRAIGAの罰則額、ユタ州法の2025〜26年改正、商務省の「過重な州法」評価書の結果は、自分では確認できていません。
- **出典の区別**: 下の出典URLは、次の2種類に分けて書きます。
  - 【開】: 実際にページを開いて本文を読んだもの。
  - 【検】: 検索結果に実在を確認しただけで、本文は開けていないもの。
- **一次資料の有無**: 開けた一次資料は、コロラド州知事室の発表、大統領令14365の本文、FTCの発表の3つです。それ以外の多くは法律事務所の解説です。確度はその前提で付けました。

---

## 1. 直すべき箇所

### 1-1. コロラド州AI法は廃止・置換された（最重要）

**対象**
- `axes.risk_classification.detail`
- `axes.penalties.detail`
- `diff_vs_eu.unique[0]`（州法パッチワーク）
- `config/countries.yaml` の us-co（note と `status: enacted`、`sources`）

**今の記述**
- 「コロラド州AI法（SB24-205）は『高リスクAIシステム』概念を導入し…（施行は延期され2026年中予定）」
- us-co の note は「『高リスクAI』の開発者と利用者に合理的注意義務と影響評価を課す。…施行日は延期されている」

**正しい記述**
- **成立**: 2026-05-14 に知事が SB26-189（Automated Decision-Making Technology）に署名しました。SB24-205 を廃止して置き換える法律です。
  - 出典: 知事室の発表【開】（日付は同ページ）。
  - 出典: Holland & Knight【開】、Eckert Seamans【開】（廃止・再制定と明記）。
- **施行日**: 2027-01-01 です（H&K【開】、Eckert【開】）。2026年中の施行ではなく、2026-06-30 の施行日も消えています。
- **中身**:
  - 「高リスクAI」ではなく、「重大な決定」に使う自動意思決定技術（ADMT）が対象です。
  - 次の義務が外れました（Eckert【開】）。
    - 差別防止の合理的注意義務
    - 利用者のリスク管理プログラム
    - 年次の影響評価
    - 司法長官への自己報告
  - 代わりに、開発者から利用者への開示、消費者への通知、不利な決定後30日以内の説明、再検討や人による審査の請求権、3年間の記録保存が入りました。
- **執行**:
  - 司法長官のみが執行し、私人訴権はありません。
  - 違反はコロラド州消費者保護法上の欺瞞的取引慣行として扱われます。
  - 違反通知後60日の是正猶予があり、猶予は2030-01-01 に失効します（H&K【開】）。
  - 司法長官は2027-01-01 までに規則を定める必要があります（H&K【開】）。
- **執行停止**: 実際の執行は止まっています。
  - xAI が2026-04-09 に提訴しました。
  - 司法省が 04-24 に介入しました。
  - 04-27 に連邦治安判事が執行を止める命令を出しました（Eckert【開】、Astraea【開】）。
  - Astraea によると、この停止は後継法にも及び、期間は州が規則を確定してから先の予備的差止め判断の14日後までです。ただしこれは Astraea のみの情報で、停止の範囲は確度が中です。

**出典URL**
- https://governorsoffice.colorado.gov/governor/news/governor-polis-signs-bills-law-making-colorado-even-better-place-do-business-breaking-down 【開】
- https://www.hklaw.com/en/insights/publications/2026/05/colorado-governor-signs-sb-189 【開】
- https://www.eckertseamans.com/legal-updates/colorado-repeals-and-replaces-its-landmark-ai-statute-what-businesses-need-to-know 【開】

**確度**: 廃止・置換・署名日・施行日・執行機関は高です。執行停止の細部は中です。

**補足**
- `status: enacted` は「成立済み・未施行」として残せます。ただし note は全面的に書き換える必要があります。
- `sources` の leg.colorado.gov/bills/sb24-205 は廃止法の頁です。`https://leg.colorado.gov/bills/sb26-189` を足してください。
- この頁は私が開いた時点では「05/01 Introduced」までしか載っておらず、署名の記録はありませんでした。根拠には使えません【開】。

### 1-2. 大統領令14365（2025-12-11）の欠落

**対象**: `axes.gpai_obligations.detail`、`axes.enforcement_body`、`diff_vs_eu.looser[0]`

**今の記述**
- 連邦の動きは2025-01の大統領令14179だけです。
- 「連邦は規制緩和方針」とだけあります。

**正しい記述**
- 2025-12-11 に大統領令14365「Ensuring a National Policy Framework for Artificial Intelligence」が出ました。官報は 90 FR 58499（2025-12-16 掲載）です。
- 本文の内容（UCSB の本文【開】）:
  - 30日以内に、司法長官が州AI法に異議を申し立てる AI Litigation Task Force を作る。
  - 90日以内に、商務長官が「過重な州法」の評価書を公表する。
  - 同じく90日以内に、BEAD補助金の条件を示す。
  - 州法との関係を整理するFTCの方針声明を出す。
  - 連邦の統一枠組みを定める法案の勧告を作る。ただし児童安全などは州法の先占対象から外す。
  - 前文にコロラド州の差別禁止法への名指し批判がある。
- 「連邦は規制を緩めた」だけでなく、**州法を連邦が押し返す動き**が主題です。`enforcement_body` の「分担」の記述にも、司法省のTask Forceを足す必要があります。

**出典URL**
- https://www.presidency.ucsb.edu/documents/executive-order-14365-ensuring-national-policy-framework-for-artificial-intelligence 【開】
- https://www.federalregister.gov/documents/2025/12/16/2025-23092/ensuring-a-national-policy-framework-for-artificial-intelligence 【検】

**確度**: 高。

### 1-3. カリフォルニア州SB53の罰則が具体化できる

**対象**: `axes.penalties.detail`（「SB53は民事罰」）、`axes.gpai_obligations`

**今の記述**: 「カリフォルニア州SB53は民事罰」

**正しい記述**
- 1違反あたり最大100万ドルの民事罰を、司法長官が執行します。
- 施行は2026-01-01 です。
- 重大インシデントは Cal OES（州緊急事態管理局）に15日以内に報告します。切迫した死亡・重傷の危険がある場合は24時間以内に当局へ通報します。
- 対象は、10^26演算超で学習した「フロンティアモデル」の開発者です。年間売上5億ドル超の「大規模フロンティア開発者」には、さらに重い義務があります。

**出典URL**: https://www.mofo.com/resources/insights/251001-california-enacts-ai-safety-transparency-regulation-tfaia-sb-53 【開】

**確度**: 中〜高。法律事務所の解説です。SB53の条文そのもの（leginfo）は取得がタイムアウトして確認できませんでした。

### 1-4. カリフォルニア州AI透明性法（SB942）の施行日と対象

**対象**: `axes.transparency.detail`、sources（2023-24会期のSB942のみ）

**今の記述**: 「SB942は大規模生成AIプロバイダにAI検出ツール提供と来歴表示を義務付け」。施行日の記載はありません。

**正しい記述**
- **施行日**: AB853（2025）で、当初の2026-01-01 から**2026-08-02**に延期されました。今は施行済みです（CalMatters の法案頁【検】、BigID【検】）。
- **罰則**: 1違反5,000ドル、司法長官のみが執行します（SB942の法案頁【検】）。
- **対象**: 「大規模」という限定は古い可能性があります。Astraea【開】は、2026年のSB1000で利用者数の下限がなくなったと書いています。これは Astraea 1社の記述なので、確度は低です。

**出典URL**
- https://calmatters.digitaldemocracy.org/bills/ca_202520260ab853 【検】
- https://calmatters.digitaldemocracy.org/bills/ca_202320240sb942 【検】
- https://astraea.law/insights/ai-regulation-tracker-2026 【開】

**確度**: 施行日は中〜高。対象範囲（利用者数の下限）は低。

### 1-5. TAKE IT DOWN法の「施行」段階

**対象**: `axes.transparency.detail`

**今の記述**: 「TAKE IT DOWN法（2025-05成立）が非同意の性的合成画像の削除義務を規定」

**正しい記述**
- 月は合っています。
- FTCは2026-05-19 に執行を始めました。申立てから48時間以内の削除が義務で、違反はFTC規則違反として扱われます。
- 「成立済み」だけでなく、「2026-05-19 から執行段階」と書くべきです。
- 成立日が2025-05-19 であることは、私は直接確認していません。公法番号 Pub. L. 119-12 は Astraea の脚注から取りました。

**出典URL**
- https://www.ftc.gov/news-events/news/press-releases/2026/05/ftc-begins-enforcing-take-it-down-act 【開】（FTC発表）

**確度**: 執行開始は高。成立日は未確認。

### 1-6. ニューヨーク州RAISE法（countries.yaml の us-ny note）

**今の記述**: 「RAISE法（S6953）…適用対象は計算資源の規模で線引きされる。執行は州司法長官。」

**正しい記述**
- 最終版は、2026-03-27 に知事が署名した**修正法**です。ニューヨーク州法2026年第96章、S8828/A9449 とされています。
  - 修正法の署名日は Wiley【開】に、法律番号と法案番号は regulations.ai【検】に出ています。
- **施行**: 2027-01-01 です。
- **範囲**:
  - 計算資源に加えて年間売上5億ドル超でも線を引きます。CA SB53と同じ閾値です。
  - 72時間以内のインシデント報告を求めます。CAの15日より厳しいです。
- **罰則**: 司法長官が、初回は最大100万ドル、再違反は最大300万ドルの民事罰を科します。
  - 別に、新設の「Office」（監督局）が、開示書の未提出などに1日1,000ドルの罰則を科せます。
  - 私人訴権はありません。
- us-ny の `status: enacted` は妥当です（未施行のため）。`sources` に汎用トップページしかないので、法案頁を足してください。

**出典URL**
- https://www.wiley.law/alert-New-York-Finalizes-RAISE-Act-for-Frontier-AI-Models-Law-Takes-Effect-January-1-2027 【開】
- https://regulations.ai/regulations/RAI-US-NY-A9449S8-2026 【検】

**確度**: 高。

### 1-7. 出典として弱い／ずれているURL

- **Google News の RSS 中継URL**: `timeline` の2024-09-29（SB1047拒否権）と 2024-10-24（国家安全保障メモランダム）の出典です。一次資料ではなく、開けるかも確認していません。州知事室・ホワイトハウスなどの一次資料に差し替えてください。
- **FTCブログの一覧**: `penalties`・`enforcement_body`・`diff_vs_eu.absent[1]` が出典に使っている https://www.ftc.gov/business-guidance/blog は一般的な一覧頁です。主張を裏付ける個別記事に差し替えるのが望ましいです。
- **NCSL 2025年版**: `prohibited_uses` と `diff_vs_eu` が NCSL の「2025 legislation」頁を使っています。2026年の州法（例: 後述のチャットボット規制の波）は反映されません。2026年版があるかは未確認です。
- **timeline の並び順**: 2024年の2件が2026年の後ろに入っています。日付順に並べ替えてください。

### 1-8. 確認はできなかったが怪しい点

**大統領令14179の説明**
- 現行は「大統領令14179署名（前政権AI大統領令を撤回）」です。
- 記憶では、前政権の大統領令14110を撤回したのは14179ではなく、2025-01-20 の別の大統領令（14148）です。14179 は見直しを指示する内容だったはずです。
- 今回はこの点を一次資料で確認できていません。確度は低です。要確認として扱ってください。

**連邦機関の記述**
- 「EEOC・CFPBが既存権限でAIを扱う」という記述は、少なくとも活動の実態が後退している可能性があります。
- Astraea【開】は、CFPBが2025-05-12 にAI関連の通達を撤回したこと、EEOCのAI指針頁が消えたことを書いています。
- これは Astraea 1社の記述で、確度は低〜中です。

---

## 2. 足すべき新しい動き（timeline 案）

確度は高・中・低で付けました。

| 日付 | 出来事 | 出典URL | 確度 |
|---|---|---|---|
| 2025-12-11 | 大統領令14365署名。州AI法への対抗（Task Force、商務省評価、BEAD条件、FTC声明、立法勧告）を指示。官報掲載は 2025-12-16 | https://www.presidency.ucsb.edu/documents/executive-order-14365-ensuring-national-policy-framework-for-artificial-intelligence 【開】、https://www.federalregister.gov/documents/2025/12/16/2025-23092/ensuring-a-national-policy-framework-for-artificial-intelligence 【検】 | 高 |
| 2026-01-01 | CA SB53 施行（`timeline` に成立日はあるが施行日がない） | https://www.mofo.com/resources/insights/251001-california-enacts-ai-safety-transparency-regulation-tfaia-sb-53 【開】 | 高 |
| 2026-01-09 | 司法長官が司法省の AI Litigation Task Force を設置 | https://astraea.law/insights/ai-regulation-tracker-2026 【開】（司法長官メモの出典を脚注に記載） | 中 |
| 2026-03-20 | ホワイトハウスが「National Policy Framework for AI」（議会への立法勧告）を公表。拘束力なし | https://www.hklaw.com/en/insights/publications/2026/03/white-house-releases-a-national-policy-framework-for-artificial 【開】 | 高 |
| 2026-03-27 | NY RAISE法の修正法に知事が署名。2027-01-01 施行 | https://www.wiley.law/alert-New-York-Finalizes-RAISE-Act-for-Frontier-AI-Models-Law-Takes-Effect-January-1-2027 【開】 | 高 |
| 2026-04-09／04-24／04-27 | xAI がコロラド州AI法を提訴（04-09）。司法省が介入（04-24）。連邦治安判事が執行停止を命令（04-27） | https://www.eckertseamans.com/legal-updates/colorado-repeals-and-replaces-its-landmark-ai-statute-what-businesses-need-to-know 【開】、https://www.jenner.com/en/news-insights/client-alerts/doj-joins-xai-in-lawsuit-challenging-colorado-ai-act 【検】 | 高（日付は複数の事務所で一致） |
| 2026-05-14 | コロラド州 SB26-189 署名（SB24-205 を廃止・置換、2027-01-01 施行） | https://governorsoffice.colorado.gov/governor/news/governor-polis-signs-bills-law-making-colorado-even-better-place-do-business-breaking-down 【開】 | 高 |
| 2026-05-19 | FTCが TAKE IT DOWN 法の執行を開始 | https://www.ftc.gov/news-events/news/press-releases/2026/05/ftc-begins-enforcing-take-it-down-act 【開】 | 高 |
| 2026-07-01（FTCが公表）／07-07（官報掲載） | FTCが AI の「正確性の抑圧」に関する Section 5 方針声明案を公表。意見募集は 07-31 まで。州法との先占の論理を含む | https://www.mcdonaldhopkins.com/insights/news/the-ftc-wants-your-ai-to-tell-the-truth 【開】、https://www.federalregister.gov/documents/2026/07/07/2026-13628/policy-statement-concerning-the-suppression-of-accuracy-in-artificial-intelligence-systems 【検】 | 中〜高。10月末時点で確定版は出ていないとの記述あり（Astraea のみ） |
| 2026-08-02 | CA AI透明性法（SB942、AB853で改正）が施行 | https://calmatters.digitaldemocracy.org/bills/ca_202520260ab853 【検】 | 中〜高 |
| 2026-09-09〜09-30 | カリフォルニア州が2026年会期でAI関連法を27本署名（うち09-30に13本）、4本に拒否権。多くは2027-01-01 施行 | https://astraea.law/insights/ai-regulation-tracker-2026 【開】 | 低〜中（1社の集計） |

**今後の日付**
- **2027-01-01**: コロラドの新法（SB26-189）とニューヨークのRAISE法が施行されます。「2027年1月に州法が集中施行」という注記を入れる価値があります。

---

## 3. 未確認のまま残る点

**商務省の「過重な州法」評価書**
- 大統領令の期限は2026-03-11 です。
- Astraea は「10月29日時点で官報に出ていない」と書いています。BEAD条件の通知も同様です。
- これは Astraea 1社の記述で、商務省・NTIAの原文では確認できていません。
- 「公表されていない」とは言い切れません。

**州法の連邦先占の実績**
- Astraea は、先占を理由に州AI法が無効化された例はなく、Task Force が州を訴えた例も見つからない、と書いています。
- 唯一の裁判は、xAI v. コロラド州への司法省の介入（平等保護の論点）です。
- これも1社の整理で、裁判記録の原文は確認していません。

**連邦の包括AI法案**
- 「FRONTIER Act」が唯一の先占法案とされています（Astraea）。
- 法案の中身、委員会の日程は確認していません。

**テキサス州TRAIGA**
- 施行（2026-01-01）と司法長官の専属執行は、Astraea の記述で確認しました。
- 罰則額と是正猶予の細目は確認できていません。署名日（2025-06-22 とされる）も未確認です。

**ユタ州**
- 2025年以降の改正は未確認です。
- 私の記憶では、2025年改正で開示義務の範囲が絞られ、日没条項が延長されたはずです。
- 一次資料での確認はしていません。
- Astraea は、ユタ州HB276（来歴表示、2027-01-01 施行）を挙げています。

**カリフォルニア州SB53の条文**
- leginfo（条文そのもの）は取得がタイムアウトしました。
- 罰則額・期限は法律事務所の解説に基づきます。

**2024年の2件**
- 次の2件は、日付も事実関係も、今回は確認していません。
  - SB1047 への拒否権（2024-09-29）
  - 国家安全保障メモランダム（2024-10-24）
- 出典の差し替えも未了です。

**州のチャットボット法・その他の2026年州法**
- Astraea は、2026年に10州がコンパニオンチャットボット法を成立させたと書いています。
- ワシントン州 HB1170 やユタ州 HB276 などの個別の州法も載っています。
- これらは1社の集計で、個別には未確認です。
- 米国頁に載せるかは、編集判断です。

**大統領令14179の効果**
- 1-8 のとおり、「前政権の大統領令の撤回」の根拠が未確認です。

---

## 修正の優先順位

1. コロラド州の記述（1-1）。事実が逆転しているので最優先です。
2. 大統領令14365と、州法への連邦の対抗の追加（1-2、timeline）。
3. SB53の罰則、SB942の施行日、NY RAISE法の更新（1-3、1-4、1-6）。
4. 出典URLの差し替えと、timeline の並べ替え（1-7）。
