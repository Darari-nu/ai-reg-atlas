import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  SYSTEM_PROMPT,
  buildDigestInput,
  checkDigest,
  checkDigestFile,
  deadlineLines,
  digestToMarkdown,
  generateDigest,
  isoWeekLabel,
  selectWeekRecords,
  targetWeek,
} from '../scripts/lib/digest.mjs';
import { run } from '../scripts/digest.mjs';
import { formatNotification } from '../scripts/notify-discord.mjs';

const SRC = 'https://example.gov/news/1';
const countries = { kr: { name_ja: '韓国', flag: '🇰🇷' }, eu: { name_ja: 'EU', flag: '🇪🇺' }, us: { name_ja: '米国', flag: '🇺🇸' } };
const rec = (over = {}) => ({
  id: '2026-10-06-kr-001',
  date: '2026-10-06',
  discovered_at: '2026-10-06',
  country: 'kr',
  source_kind: 'official',
  legal_stage: 'in_force',
  title: '韓国、AI基本法の施行令を公表',
  summary: { what: '施行令が公表された', who: 'x', when_impact: 'y' },
  so_what: '韓国向けの提供者は確認が必要',
  sources: [SRC],
  ...over,
});
const week = { from: '2026-10-05', to: '2026-10-11', label: '2026-W41' };
const digest = (over = {}) => ({
  title: '韓国でAI基本法の施行令が公表',
  summary: '韓国で施行令が公表され、EUでも指針が更新されました。',
  picks: [{ record_id: '2026-10-06-kr-001', headline: '韓国がAI基本法の施行令を公表', what: '施行令が公表されました。', one_liner: '韓国向けにサービスがあるなら、対象かどうかを確認するのがよさそうです。' }],
  others: [],
  ...over,
});
const usage = { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const okMsg = (out = digest()) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(out) }], usage });
const apiErr = (status) => Object.assign(new Error(`status ${status}`), { status });
const quiet = { log: () => {}, warn: () => {} };
const mockClient = (fn) => ({ messages: { create: fn } });

describe('対象週の決定（JST・ISO週）', () => {
  it('月曜の朝に走らせると直前の月〜日になる', () => {
    assert.deepEqual(targetWeek('2026-10-12'), { from: '2026-10-05', to: '2026-10-11', label: '2026-W41' });
  });
  it('日曜・水曜に走らせても直前の完全な1週間', () => {
    assert.equal(targetWeek('2026-10-11').from, '2026-09-28');
    assert.equal(targetWeek('2026-10-14').from, '2026-10-05');
  });
  it('年またぎ: 2027-01-04（月）の前週は2026年の第53週', () => {
    assert.deepEqual(targetWeek('2027-01-04'), { from: '2026-12-28', to: '2027-01-03', label: '2026-W53' });
  });
  it('年またぎ: 2025-12-29 の週は 2026-W01、2024-12-30 の週は 2025-W01', () => {
    assert.equal(isoWeekLabel('2025-12-29'), '2026-W01');
    assert.equal(isoWeekLabel('2024-12-30'), '2025-W01');
    assert.equal(targetWeek('2026-01-05').label, '2026-W01');
  });
});

describe('先週分の選定と入力', () => {
  it('週の範囲内（発見日、無ければ date）だけ拾い、出典の無いものは除く', () => {
    const rs = [
      rec(),
      rec({ id: 'a', discovered_at: '2026-10-04' }), // 前日（日曜）= 範囲外
      rec({ id: 'b', discovered_at: '2026-10-12' }), // 翌週
      rec({ id: 'c', discovered_at: undefined, date: '2026-10-11' }), // date で拾う
      rec({ id: 'd', sources: [] }),
    ];
    assert.deepEqual(selectWeekRecords(rs, week).map((r) => r.id).sort(), ['2026-10-06-kr-001', 'c']);
  });
  it('法的段階が進んだ公式資料を先に並べる', () => {
    const rs = [rec({ id: 'x', legal_stage: 'announcement' }), rec({ id: 'y', legal_stage: 'in_force', source_kind: 'media' }), rec({ id: 'z', legal_stage: 'in_force' })];
    assert.deepEqual(selectWeekRecords(rs, week).map((r) => r.id), ['z', 'y', 'x']);
  });
  it('入力に URL を含めない（URL はコード側で付ける）', () => {
    const input = buildDigestInput({ records: [rec()], explainers: [{ id: '2026-10-06-kr-001', lead: 'lead', facts: [{ text: 'f', source_url: SRC }] }], countries, week });
    assert.ok(!JSON.stringify(input.records).includes('http'));
    assert.equal(input.records[0].explainer_lead, 'lead');
  });
  it('システムプロンプトは固定文（日付や件数を含まない）', () => {
    assert.ok(!/20\d\d/.test(SYSTEM_PROMPT));
  });
});

describe('checkDigest', () => {
  const input = () => buildDigestInput({ records: [rec(), rec({ id: '2026-10-07-eu-001', country: 'eu' })], countries, week });
  it('正常な出力は通る', () => {
    assert.deepEqual(checkDigest(digest(), input()), { ok: true, reasons: [] });
  });
  it('record_id が入力外なら不合格', () => {
    const r = checkDigest(digest({ picks: [{ ...digest().picks[0], record_id: '2026-10-06-xx-999' }] }), input());
    assert.ok(r.reasons.includes('pick[0]-record-not-in-input'));
    const o = checkDigest(digest({ others: [{ record_id: 'nope', line: '別の動き' }] }), input());
    assert.ok(o.reasons.includes('other[0]-record-not-in-input'));
  });
  it('本文に URL が入ったら不合格（URL はコード生成のものだけ）', () => {
    const r = checkDigest(digest({ picks: [{ ...digest().picks[0], what: '詳細は https://evil.example/x を参照' }] }), input());
    assert.ok(r.reasons.includes('url-in-text(pick[0].what)'));
  });
  it('picks が0件・4件、重複、改行入りは不合格', () => {
    assert.ok(checkDigest(digest({ picks: [] }), input()).reasons.includes('picks-count(0)'));
    const p = digest().picks[0];
    assert.ok(checkDigest(digest({ picks: [p, p] }), input()).reasons.includes('pick[1]-duplicate'));
    assert.ok(checkDigest(digest({ title: 'a\nb' }), input()).reasons.includes('newline-in-text(title)'));
  });
  it('others が picks と重複・6件は不合格', () => {
    assert.ok(checkDigest(digest({ others: [{ record_id: '2026-10-06-kr-001', line: 'x' }] }), input()).reasons.includes('other[0]-duplicate'));
  });
  it('報道由来で入力の文面と長く連続一致したら不合格、公式なら許す', () => {
    const long = '韓国政府は人工知能の安全性を確保するため事業者に対し新たな義務を課す方針を明らかにしたと発表した。';
    const inMedia = buildDigestInput({ records: [rec({ source_kind: 'media', summary: { what: long, who: '', when_impact: '' } })], countries, week });
    const copied = digest({ picks: [{ ...digest().picks[0], what: long }] });
    assert.ok(checkDigest(copied, inMedia).reasons.includes('copied-from-source(pick[0])'));
    const inOfficial = buildDigestInput({ records: [rec({ summary: { what: long, who: '', when_impact: '' } })], countries, week });
    assert.equal(checkDigest(copied, inOfficial).ok, true);
  });
});

describe('Markdown 化（kiji-intake の形）', () => {
  const base = 'https://darari-nu.com/atlas';
  const make = (extra = {}) =>
    digestToMarkdown({
      digest: digest(extra.digest),
      input: { week },
      records: [rec(), rec({ id: '2026-10-07-eu-001', country: 'eu', sources: ['https://eu.example/p'] })],
      publishedIds: new Set(['2026-10-06-kr-001']),
      countries,
      deadlines: extra.deadlines ?? ['- 2026-11-01（あと20日）EU：テスト → https://darari-nu.com/atlas/timeline/#dl-x'],
      base,
    });
  it('frontmatter が必須項目を満たし、URL は record_id からコードが組み立てる', () => {
    const { markdown, title } = make();
    assert.equal(title, '今週のAI規制：韓国でAI基本法の施行令が公表（2026/10/05週）');
    assert.equal(checkDigestFile(markdown).ok, true);
    assert.ok(markdown.includes('mode: sozai'));
    assert.ok(markdown.includes(`${base}/explain/2026-10-06-kr-001/`)); // 解説が公開済み
    assert.ok(markdown.includes(SRC));
    assert.ok(markdown.includes('🇰🇷 韓国'));
  });
  it('解説が無ければ国別ページの該当更新へ', () => {
    const { markdown } = make({ digest: { picks: [{ ...digest().picks[0], record_id: '2026-10-07-eu-001' }] } });
    assert.ok(markdown.includes(`${base}/country/eu/#u-2026-10-07-eu-001`));
  });
  it('期限が無いときは無い旨の1行', () => {
    assert.ok(make({ deadlines: [] }).markdown.includes('いまのところありません'));
  });
  it('frontmatter の値にダブルクォート・改行を入れない', () => {
    const { markdown } = make({ digest: { summary: '"引用"と\n改行' } });
    assert.ok(/^summary: 引用 と 改行$/m.test(markdown));
  });
});

describe('これからの期限（90日以内）', () => {
  it('90日より先は出さず、日付順・URL はコード生成', () => {
    const curated = [
      { id: 'a', country: 'eu', date: '2026-11-01', kind: 'in_force', title: '近い期限', what_to_do: [], applies_to: '', sources: [], verified: '2026-10-01' },
      { id: 'b', country: 'eu', date: '2027-06-01', kind: 'in_force', title: '遠い期限', what_to_do: [], applies_to: '', sources: [], verified: '2026-10-01' },
    ];
    const lines = deadlineLines({ curated, updates: [], today: '2026-10-12', countries });
    assert.equal(lines.length, 1);
    assert.equal(lines[0], '- 2026-11-01（あと20日）EU：近い期限 → https://darari-nu.com/atlas/timeline/#dl-a');
  });
});

describe('generateDigest（API はモック）', () => {
  const input = buildDigestInput({ records: [rec()], countries, week });
  it('output_config.format 付きで1回呼び、パースして usage を返す', async () => {
    let args;
    const res = await generateDigest({ client: mockClient(async (a) => ((args = a), okMsg())), input });
    assert.equal(res.status, 'ok');
    assert.equal(args.model, 'claude-sonnet-5-5');
    assert.equal(args.max_tokens, 16000);
    assert.equal(args.output_config.effort, 'medium');
    assert.ok(args.output_config.format);
    assert.equal(args.temperature, undefined);
    assert.equal(res.usage.output_tokens, 500);
  });
  it('402 は abort、429 は skip、refusal / max_tokens / 壊れた JSON は skip', async () => {
    assert.equal((await generateDigest({ client: mockClient(async () => { throw apiErr(402); }), input })).status, 'abort');
    assert.equal((await generateDigest({ client: mockClient(async () => { throw apiErr(429); }), input })).status, 'skip');
    assert.equal((await generateDigest({ client: mockClient(async () => ({ stop_reason: 'refusal', content: [], usage })), input })).reason, 'refusal');
    assert.equal((await generateDigest({ client: mockClient(async () => ({ stop_reason: 'max_tokens', content: [], usage })), input })).reason, 'max_tokens');
    assert.equal((await generateDigest({ client: mockClient(async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{' }], usage })), input })).reason, 'parse-failed');
  });
});

describe('run()（ダイジェスト生成）', () => {
  const deps = (over = {}) => {
    const written = {};
    const notes = [];
    return {
      written,
      notes,
      opts: {
        env: { ANTHROPIC_API_KEY: 'test' },
        today: '2026-10-12',
        loadRecords: () => [rec()],
        loadExplainers: () => [],
        loadCurated: () => [],
        loadCountries: () => countries,
        fileExists: () => false,
        writeDigest: (f, t) => (written[f] = t),
        pushNotification: (n) => notes.push(n),
        createClient: () => mockClient(async () => okMsg()),
        log: quiet,
        ...over,
      },
    };
  };
  it('先週のレコードから 2026-W41.md を作り、通知を1件積む', async () => {
    const d = deps();
    assert.equal(await run(d.opts), 0);
    assert.deepEqual(Object.keys(d.written), ['2026-W41.md']);
    assert.equal(checkDigestFile(d.written['2026-W41.md']).ok, true);
    assert.equal(formatNotification(d.notes[0]), '📝 今週のダイジェスト原稿ができました');
  });
  it('キーが無ければ API を呼ばず exit 0', async () => {
    let called = 0;
    const d = deps({ env: {}, createClient: () => { called++; return mockClient(async () => okMsg()); } });
    assert.equal(await run(d.opts), 0);
    assert.equal(called, 0);
    assert.deepEqual(d.written, {});
  });
  it('先週の更新が0件なら API を呼ばない', async () => {
    let called = 0;
    const d = deps({ loadRecords: () => [rec({ discovered_at: '2026-09-01', date: '2026-09-01' })], createClient: () => { called++; return mockClient(async () => okMsg()); } });
    assert.equal(await run(d.opts), 0);
    assert.equal(called, 0);
    assert.deepEqual(d.written, {});
  });
  it('既に原稿があれば API を呼ばず、上書きしない', async () => {
    let called = 0;
    const d = deps({ fileExists: (f) => f === '2026-W41.md', createClient: () => { called++; return mockClient(async () => okMsg()); } });
    assert.equal(await run(d.opts), 0);
    assert.equal(called, 0);
    assert.deepEqual(d.written, {});
  });
  it('402 なら何も書かず exit 0', async () => {
    const d = deps({ createClient: () => mockClient(async () => { throw apiErr(402); }) });
    assert.equal(await run(d.opts), 0);
    assert.deepEqual(d.written, {});
    assert.deepEqual(d.notes, []);
  });
  it('record_id が入力外の出力は保存しない', async () => {
    const bad = digest({ picks: [{ ...digest().picks[0], record_id: 'zzz' }] });
    const d = deps({ createClient: () => mockClient(async () => okMsg(bad)) });
    assert.equal(await run(d.opts), 0);
    assert.deepEqual(d.written, {});
  });
  it('予期しない例外でも exit 0', async () => {
    const d = deps({ loadRecords: () => { throw new Error('boom'); } });
    assert.equal(await run(d.opts), 0);
  });
});

describe('checkDigestFile', () => {
  const ok = `---\ntitle: t\nsource: s\nmode: sozai\nsummary: x\n---\n${'あ'.repeat(200)}\n`;
  it('必須項目と本文200字', () => {
    assert.equal(checkDigestFile(ok).ok, true);
    assert.deepEqual(checkDigestFile(ok.replace('title: t\n', '')).reasons, ['missing-title']);
    assert.ok(checkDigestFile(ok.replace('あ'.repeat(200), 'あ'.repeat(50))).reasons.some((r) => r.startsWith('body-too-short')));
    assert.deepEqual(checkDigestFile('本文だけ').reasons, ['no-frontmatter']);
  });
});

describe('digest-intake.sh（一時ディレクトリ相手）', () => {
  const SH = path.resolve('scripts/local/digest-intake.sh');
  const setup = () => {
    const t = fs.mkdtempSync(path.join(os.tmpdir(), 'digest-intake-'));
    const atlas = path.join(t, 'atlas');
    fs.mkdirSync(path.join(atlas, '.git'), { recursive: true });
    fs.mkdirSync(path.join(atlas, 'data/digests'), { recursive: true });
    fs.writeFileSync(path.join(atlas, 'data/digests/2026-W41.md'), '---\ntitle: a\n---\nbody\n');
    const hpDrafts = path.join(t, 'hp/10_drafts');
    fs.mkdirSync(hpDrafts, { recursive: true });
    const env = { ...process.env, ATLAS_DIR: atlas, HP_INBOX: path.join(hpDrafts, '65_外部原稿'), STATE_FILE: path.join(t, 'state/digest-intake.txt'), LOG_FILE: path.join(t, 'log.txt'), ATLAS_PULL: '0' };
    return { t, atlas, env, inbox: env.HP_INBOX };
  };
  const sh = (env) => execFileSync('bash', [SH], { env, encoding: 'utf8' });

  it('新規だけコピーし、2回目は何もしない。ファイル名は配信する月曜の日付', () => {
    const { env, inbox, atlas } = setup();
    sh(env);
    assert.deepEqual(fs.readdirSync(inbox), ['20261012_atlas-digest-2026-W41.md']);
    assert.equal(fs.readFileSync(env.STATE_FILE, 'utf8'), '2026-W41.md\n');
    // 2回目: 何も増えない
    sh(env);
    assert.equal(fs.readdirSync(inbox).length, 1);
    assert.equal(fs.readFileSync(env.STATE_FILE, 'utf8'), '2026-W41.md\n');
    // 新しい週だけ増える
    fs.writeFileSync(path.join(atlas, 'data/digests/2026-W42.md'), '---\ntitle: b\n---\nbody\n');
    sh(env);
    assert.deepEqual(fs.readdirSync(inbox).sort(), ['20261012_atlas-digest-2026-W41.md', '20261019_atlas-digest-2026-W42.md']);
  });
  it('HP 側に同じ週の原稿があればコピーしない（HP 側は変更しない）', () => {
    const { env, inbox } = setup();
    fs.mkdirSync(inbox);
    fs.writeFileSync(path.join(inbox, '20261013_atlas-digest-2026-W41.md'), 'existing');
    sh(env);
    assert.deepEqual(fs.readdirSync(inbox), ['20261013_atlas-digest-2026-W41.md']);
    assert.equal(fs.readFileSync(path.join(inbox, '20261013_atlas-digest-2026-W41.md'), 'utf8'), 'existing');
  });
  it('置き場の親フォルダが無い（未マウント）なら何もしない', () => {
    const { env, t } = setup();
    env.HP_INBOX = path.join(t, 'unmounted/10_drafts/65_外部原稿');
    sh(env);
    assert.equal(fs.existsSync(path.join(t, 'unmounted')), false);
    assert.equal(fs.existsSync(env.STATE_FILE), false);
    assert.ok(fs.readFileSync(env.LOG_FILE, 'utf8').includes('未マウント'));
  });
});
