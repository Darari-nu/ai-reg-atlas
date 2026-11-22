import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_CONTENT_CHARS, buildContent, buildPosts, formatNotification } from '../scripts/notify-discord.mjs';
import { nearestDate, parseLooseDate } from '../scripts/lib/pipeline.mjs';
import { SITE_URL, siteUrl } from '../scripts/lib/siteUrl.mjs';
import { buildUpdatesNotification, pushUpdatesNotification } from '../scripts/lib/updatesNotice.mjs';

describe('parseLooseDate（トルコ語の月名）', () => {
  it('日 月名 年', () => {
    assert.equal(parseLooseDate('28 Ekim 2026'), '2026-10-28');
    assert.equal(parseLooseDate('5 Kasım 2026'), '2026-11-05');
    assert.equal(parseLooseDate('5 KASIM 2026'), '2026-11-05');
    assert.equal(parseLooseDate('1 Ocak 2027'), '2027-01-01');
    assert.equal(parseLooseDate('12 Ağustos 2026'), '2026-08-12');
    assert.equal(parseLooseDate('12 AĞUSTOS 2026'), '2026-08-12');
    assert.equal(parseLooseDate('12 Agustos 2026'), '2026-08-12');
    assert.equal(parseLooseDate('3 Mayıs 2026'), '2026-05-03');
    assert.equal(parseLooseDate('7 Eylül 2026'), '2026-09-07');
    assert.equal(parseLooseDate('9 Aralık 2026'), '2026-12-09');
    assert.equal(parseLooseDate('2 Şubat 2026'), '2026-02-02');
    assert.equal(parseLooseDate('4 Mart 2026'), '2026-03-04');
    assert.equal(parseLooseDate('1 Nisan 2026'), '2026-04-01');
    assert.equal(parseLooseDate('15 Haziran 2026'), '2026-06-15');
    assert.equal(parseLooseDate('1 Temmuz 2026'), '2026-07-01');
  });
  it('年の後ろに数字が続く・月名の後ろに文字が続くときは拒否', () => {
    assert.equal(parseLooseDate('28 Ekim 20260'), null);
    assert.equal(parseLooseDate('5 Kasımda 2026'), null);
  });
  it('大文字の İ / ı（KASİM・ARALIK）', () => {
    assert.equal(parseLooseDate('5 KASİM 2026'), '2026-11-05');
    assert.equal(parseLooseDate('1 ARALIK 2026'), '2026-12-01');
    assert.equal(parseLooseDate('2 ŞUBAT 2026'), '2026-02-02');
    assert.equal(parseLooseDate('3 MAYIS 2026'), '2026-05-03');
    assert.equal(nearestDate('xx <a>link</a> 5 KASİM 2026 yy', 3, 14), '2026-11-05'); // 位置の計算はそのまま
  });
  it('既存の英語・西仏独は変わらない', () => {
    assert.equal(parseLooseDate('22 July 2026'), '2026-07-22');
    assert.equal(parseLooseDate('Jul 22, 2026'), '2026-07-22');
    assert.equal(parseLooseDate('22/07/2026'), '2026-07-22');
    assert.equal(parseLooseDate('03 de noviembre de 2026'), '2026-11-03');
    assert.equal(parseLooseDate('1er novembre 2026'), '2026-11-01');
    assert.equal(parseLooseDate('26 octobre 2026'), '2026-10-26');
    assert.equal(parseLooseDate('12. Februar 2025'), '2025-02-12');
    assert.equal(parseLooseDate('3 Mai 2026'), '2026-05-03');
  });
});

describe('siteUrl', () => {
  it('既定値', () => {
    assert.equal(SITE_URL, 'https://darari-nu.com/atlas');
    assert.equal(siteUrl('/explain/x/', {}), 'https://darari-nu.com/atlas/explain/x/');
    assert.equal(siteUrl('digest/2026-W41/', {}), 'https://darari-nu.com/atlas/digest/2026-W41/');
  });
  it('ASTRO_SITE / ASTRO_BASE で差し替え', () => {
    assert.equal(siteUrl('/explain/x/', { ASTRO_SITE: 'https://example.com/', ASTRO_BASE: '/a' }), 'https://example.com/a/explain/x/');
    assert.equal(siteUrl('/updates/', { ASTRO_BASE: '' }), 'https://darari-nu.com/atlas/updates/'); // 空文字は既定の /atlas（astro.config.mjs と同じ ||）
  });
});

describe('formatNotification（リンク）', () => {
  const ex = (links, label = '解説を公開しました') => ({ type: 'explainer', label, count: 1, ...(links ? { links } : {}) });
  const L = (n) => Array.from({ length: n }, (_, i) => ({ title: `題${i + 1}`, url: `https://darari-nu.com/atlas/explain/e${i + 1}/` }));
  it('explainer: links なしは1行のまま', () => {
    assert.equal(formatNotification(ex()), '📝 解説を公開しました');
    assert.equal(formatNotification(ex([])), '📝 解説を公開しました');
  });
  it('explainer: links あり（<> なし）', () => {
    assert.equal(formatNotification(ex(L(2))), '📝 解説を公開しました\n  ・題1 https://darari-nu.com/atlas/explain/e1/\n  ・題2 https://darari-nu.com/atlas/explain/e2/');
  });
  it('explainer: 6件以上は5件＋「ほか N 本」', () => {
    const lines = formatNotification(ex(L(8))).split('\n');
    assert.equal(lines.length, 1 + 5 + 1);
    assert.equal(lines.at(-1), '  ・ほか 3 本');
  });
  const down = { type: 'down', key: 'https://example.com/a', label: 'ラベル', flag: '🇹🇷', since: '2026-11-19', reason: 'fetch failed', days: 3 };
  it('recovered / down に情報源 URL（<>）、down は Issue 一覧も', () => {
    assert.equal(formatNotification({ ...down, type: 'recovered' }, {}), '🟢 🇹🇷 ラベル が復旧しました\n  <https://example.com/a>');
    const d = formatNotification(down, {}).split('\n');
    assert.equal(d[0], '🔴 🇹🇷 ラベル が3日続けて読み取れません（11/19〜・理由: fetch failed）');
    assert.equal(d[1], '  <https://example.com/a>');
    assert.equal(d[2], '  GitHub で人の確認が要るもの（Issue 一覧） <https://github.com/Darari-nu/ai-reg-atlas/issues?q=is%3Aopen+label%3Aneeds-review>');
    assert.ok(formatNotification(down, { GITHUB_REPOSITORY: 'foo/bar' }).includes('https://github.com/foo/bar/issues?q='));
  });
  const up = (n) => ({
    type: 'updates',
    items: Array.from({ length: n }, (_, i) => ({ flag: '🇹🇷', country_ja: 'トルコ', title: `更新${i + 1}`, url: `https://darari-nu.com/atlas/updates/#u-${i + 1}` })),
  });
  it('updates: 件数と行（<> あり）', () => {
    assert.equal(formatNotification(up(2)), '🆕 新しい更新 2 件\n  ・🇹🇷 更新1 <https://darari-nu.com/atlas/updates/#u-1>\n  ・🇹🇷 更新2 <https://darari-nu.com/atlas/updates/#u-2>');
  });
  it('updates: 9件以上は8件＋「ほか N 件 → <updates ページ>」', () => {
    const lines = formatNotification(up(11), {}).split('\n');
    assert.equal(lines[0], '🆕 新しい更新 11 件');
    assert.equal(lines.length, 1 + 8 + 1);
    assert.equal(lines.at(-1), '  ・ほか 3 件 → <https://darari-nu.com/atlas/updates/>');
  });
  it('長くても2000字に収める', () => {
    const long = { type: 'updates', items: Array.from({ length: 8 }, (_, i) => ({ flag: '🇹🇷', title: 'あ'.repeat(200), url: `https://darari-nu.com/atlas/updates/#u-${i}` })) };
    const c = buildContent([long, long, long]);
    assert.ok(c.length <= MAX_CONTENT_CHARS);
    assert.ok(c.endsWith('…'));
  });
});

describe('buildUpdatesNotification', () => {
  it('0件は null（積まない）', () => {
    assert.equal(buildUpdatesNotification([]), null);
    assert.equal(buildUpdatesNotification(undefined), null);
  });
  it('レコードから items を作る（url は UpdateCard の id u-<id>）', () => {
    const n = buildUpdatesNotification(
      [{ id: '2026-11-18-tr-001', country: 'tr', title: 'KVKK が指針を公表' }],
      { flagOf: (cc) => ({ tr: '🇹🇷' })[cc], env: {} },
    );
    assert.equal(n.type, 'updates');
    assert.deepEqual(n.items, [{ flag: '🇹🇷', country_ja: '', title: 'KVKK が指針を公表', url: 'https://darari-nu.com/atlas/updates/#u-2026-11-18-tr-001' }]);
    assert.equal(formatNotification(n, {}), '🆕 新しい更新 1 件\n  ・🇹🇷 KVKK が指針を公表 <https://darari-nu.com/atlas/updates/#u-2026-11-18-tr-001>');
  });
});

describe('buildUpdatesNotification（国名）', () => {
  const rec = [{ id: 'a-1', country: 'tr', title: '題' }];
  it('country_ja を埋める。行では国旗が無いときだけ使う', () => {
    const withFlag = buildUpdatesNotification(rec, { flagOf: () => '🇹🇷', nameOf: () => 'トルコ', env: {} });
    assert.equal(withFlag.items[0].country_ja, 'トルコ');
    assert.equal(formatNotification(withFlag, {}), '🆕 新しい更新 1 件\n  ・🇹🇷 題 <https://darari-nu.com/atlas/updates/#u-a-1>');
    const noFlag = buildUpdatesNotification(rec, { flagOf: () => '', nameOf: () => 'トルコ', env: {} });
    assert.equal(formatNotification(noFlag, {}), '🆕 新しい更新 1 件\n  ・トルコ 題 <https://darari-nu.com/atlas/updates/#u-a-1>');
  });
});

describe('pushUpdatesNotification（非致命）', () => {
  const rec = [{ id: 'a-1', country: 'tr', title: '題' }];
  const quiet = () => {
    const logs = [];
    return { logs, log: { warn: (m) => logs.push(m), log() {} } };
  };
  it('既存の配列に足して書く', () => {
    let out = null;
    const { log } = quiet();
    assert.equal(pushUpdatesNotification(rec, { read: () => '[{"type":"down"}]', write: (t) => (out = JSON.parse(t)), log, env: {} }), true);
    assert.equal(out.length, 2);
    assert.equal(out[1].type, 'updates');
  });
  it('配列でない中身・壊れた中身・無いファイルは [] から始める', () => {
    for (const read of [() => '{"a":1}', () => 'not json', () => { throw new Error('ENOENT'); }]) {
      let out = null;
      const { log } = quiet();
      assert.equal(pushUpdatesNotification(rec, { read, write: (t) => (out = JSON.parse(t)), log, env: {} }), true);
      assert.equal(out.length, 1);
    }
  });
  it('書き込みが例外でも投げず、警告に URL を含めない', () => {
    const { log, logs } = quiet();
    const ok = pushUpdatesNotification(rec, { read: () => '[]', write: () => { throw new Error('EACCES https://secret.example/x'); }, log, env: {} });
    assert.equal(ok, false);
    assert.equal(logs.length, 1);
    assert.ok(!logs[0].includes('http'));
  });
  it('0件は何も書かない', () => {
    let wrote = 0;
    assert.equal(pushUpdatesNotification([], { read: () => '[]', write: () => wrote++, env: {} }), false);
    assert.equal(wrote, 0);
  });
});

describe('buildPosts（通知の区切りで分ける）', () => {
  const down = (i) => ({ type: 'down', key: `https://example.com/${'p'.repeat(40)}/${i}`, label: `情報源${i}`, flag: '🇯🇵', since: '2026-10-01', reason: 'no-dated-links', days: 3 });
  it('URL つき down 10件（2000字超）→ 2回・全件の見出しが入り <htt… で切れない', () => {
    const items = Array.from({ length: 10 }, (_, i) => down(i));
    assert.ok(items.map((n) => formatNotification(n, {})).join('\n').length > 2000);
    const posts = buildPosts(items, {});
    assert.equal(posts.length, 2);
    assert.equal(posts.reduce((a, p) => a + p.count, 0), 10);
    for (const p of posts) {
      assert.ok(p.content.length <= 2000);
      assert.ok(!/<https?:\/\/[^>\n]*$/.test(p.content) && !p.content.includes('<htt…'));
    }
    const all = posts.map((p) => p.content).join('\n');
    for (let i = 0; i < 10; i++) assert.ok(all.includes(`情報源${i} が3日続けて`));
  });
  it('1回10件まで', () => {
    const posts = buildPosts(Array.from({ length: 23 }, (_, i) => ({ type: 'explainer', label: `L${i}` })), {});
    assert.deepEqual(posts.map((p) => p.count), [10, 10, 3]);
  });
  it('1件だけで2000字超なら、その1件を行の区切りで切って … を付ける', () => {
    const huge = { type: 'updates', items: Array.from({ length: 8 }, (_, i) => ({ flag: '🇹🇷', title: 'あ'.repeat(80), url: `https://darari-nu.com/atlas/updates/#u-${'x'.repeat(300)}-${i}` })) };
    assert.ok(formatNotification(huge, {}).length > 2000);
    const posts = buildPosts([down(1), huge, down(2)], {});
    assert.equal(posts.reduce((a, p) => a + p.count, 0), 3);
    const big = posts.find((p) => p.content.includes('🆕 新しい更新'));
    assert.ok(big.content.length <= 2000);
    assert.ok(big.content.endsWith('…'));
    assert.ok(!big.content.endsWith('<…') && !/<https?:\/\/[^>\n]*…$/.test(big.content));
    assert.ok(posts.every((p) => p.content.length <= 2000));
  });
});
