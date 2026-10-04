import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_CONTENT_CHARS, buildContent, formatNotification, run } from '../scripts/notify-discord.mjs';

const SECRET = 'https://discord.com/api/webhooks/123/SECRET-TOKEN';

function makeNotes(n) {
  return Array.from({ length: n }, (_, i) => ({
    type: 'down',
    key: `https://example.com/${i}`,
    label: `日本 scrape_hash example.com/${i}`,
    flag: '🇯🇵',
    since: '2026-10-01',
    reason: 'no-dated-links',
    days: 3,
  }));
}

function harness(notes, { env = { DISCORD_WEBHOOK_URL: SECRET }, fetchImpl } = {}) {
  const calls = [];
  const logs = [];
  const log = {
    log: (...a) => logs.push(a.join(' ')),
    warn: (...a) => logs.push(a.join(' ')),
  };
  const f = fetchImpl ?? (async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 204 };
  });
  const wrapped = async (url, init) => {
    if (!fetchImpl) return f(url, init);
    calls.push({ url, body: JSON.parse(init.body) });
    return fetchImpl(url, init);
  };
  return { calls, logs, exec: () => run({ env, fetchImpl: wrapped, readFile: () => JSON.stringify(notes), log }) };
}

describe('formatNotification', () => {
  it('down と recovered の文面', () => {
    const [n] = makeNotes(1);
    assert.equal(formatNotification(n), '🔴 🇯🇵 日本 scrape_hash example.com/0 が3日続けて読み取れません（10/01〜・理由: no-dated-links）');
    assert.equal(formatNotification({ ...n, type: 'recovered' }), '🟢 🇯🇵 日本 scrape_hash example.com/0 が復旧しました');
  });
});

describe('run', () => {
  it('webhook 未設定なら fetch を呼ばない', async () => {
    const h = harness(makeNotes(3), { env: {} });
    assert.equal(await h.exec(), 0);
    assert.equal(h.calls.length, 0);
  });

  it('0件・ファイル無しなら fetch を呼ばない', async () => {
    const h = harness([]);
    assert.equal(await h.exec(), 0);
    assert.equal(h.calls.length, 0);
    const calls = [];
    const code = await run({
      env: { DISCORD_WEBHOOK_URL: SECRET },
      fetchImpl: async (...a) => calls.push(a),
      readFile: () => {
        throw new Error('ENOENT');
      },
      log: { log() {}, warn() {} },
    });
    assert.equal(code, 0);
    assert.equal(calls.length, 0);
  });

  it('10件ずつにまとめて送る（23件→3回）', async () => {
    const h = harness(makeNotes(23));
    await h.exec();
    assert.equal(h.calls.length, 3);
    assert.deepEqual(h.calls.map((c) => c.body.content.split('\n').length), [10, 10, 3]);
    assert.ok(h.calls.every((c) => c.url === SECRET));
    assert.deepEqual(h.calls[0].body.allowed_mentions, { parse: [] });
  });

  it('content は2000字で切る', () => {
    const long = makeNotes(10).map((n) => ({ ...n, label: 'あ'.repeat(400) }));
    const content = buildContent(long);
    assert.ok(content.length <= MAX_CONTENT_CHARS);
    assert.ok(content.endsWith('…'));
  });

  it('HTTP 500 でも exit 0 で、URL もトークンもログに出ない', async () => {
    const h = harness(makeNotes(2), { fetchImpl: async () => ({ ok: false, status: 500 }) });
    assert.equal(await h.exec(), 0);
    const all = h.logs.join('\n');
    assert.match(all, /HTTP 500/);
    assert.ok(!all.includes('SECRET-TOKEN'));
    assert.ok(!all.includes('discord.com'));
  });

  it('fetch が例外（メッセージにURLを含む）でも exit 0 で、URL がログに出ない', async () => {
    const h = harness(makeNotes(2), {
      fetchImpl: async (url) => {
        throw new Error(`failed to fetch ${url}`);
      },
    });
    assert.equal(await h.exec(), 0);
    const all = h.logs.join('\n');
    assert.ok(!all.includes('SECRET-TOKEN'));
    assert.ok(!all.includes('discord.com'));
  });

  it('成功時のログにも URL が出ない', async () => {
    const h = harness(makeNotes(2));
    await h.exec();
    assert.ok(!h.logs.join('\n').includes('SECRET-TOKEN'));
  });
});
