import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BOT_USER_AGENT, BROWSER_USER_AGENT, userAgentFor } from '../scripts/lib/userAgent.mjs';

describe('userAgentFor', () => {
  for (const url of ['https://mptc.gov.kh/en/', 'https://mptc.gov.kh/en/feed/', 'https://www.mptc.gov.kh/x']) {
    it(`ブラウザ UA: ${url}`, () => assert.equal(userAgentFor(url), BROWSER_USER_AGENT));
  }
  for (const url of [
    'https://www.imda.gov.sg/resources/x',
    'https://r.jina.ai/https://mptc.gov.kh/en/',
    'https://evilmptc.gov.kh/',
    'https://mptc.gov.kh.example.com/',
    'not a url',
  ]) {
    it(`ボット UA: ${url}`, () => assert.equal(userAgentFor(url), BOT_USER_AGENT));
  }
});

import { fetchWithUa } from '../scripts/lib/userAgent.mjs';

function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const r = routes[url];
    return { status: r.status, headers: new Headers(r.location ? { location: r.location } : {}), ok: r.status < 400 };
  };
  return { impl, calls };
}

describe('fetchWithUa', () => {
  it('MPTC→302→example.com: 前はブラウザ UA、後はボット UA', async () => {
    const { impl, calls } = fakeFetch({
      'https://mptc.gov.kh/a': { status: 302, location: 'https://example.com/b' },
      'https://example.com/b': { status: 200 },
    });
    const res = await fetchWithUa('https://mptc.gov.kh/a', {}, impl);
    assert.equal(res.status, 200);
    assert.equal(calls[0].init.headers['User-Agent'], BROWSER_USER_AGENT);
    assert.equal(calls[1].init.headers['User-Agent'], BOT_USER_AGENT);
    assert.equal(calls[0].init.redirect, 'manual');
  });
  it('ボット UA のホストは自動リダイレクトのまま素通し', async () => {
    const { impl, calls } = fakeFetch({ 'https://example.com/x': { status: 200 } });
    await fetchWithUa('https://example.com/x', {}, impl);
    assert.equal(calls.length, 1);
    assert.notEqual(calls[0].init.redirect, 'manual');
    assert.equal(calls[0].init.headers['User-Agent'], BOT_USER_AGENT);
  });
  it('サブドメイン→本体はブラウザ UA のまま', async () => {
    const { impl, calls } = fakeFetch({
      'https://www.mptc.gov.kh/': { status: 301, location: 'https://mptc.gov.kh/' },
      'https://mptc.gov.kh/': { status: 200 },
    });
    await fetchWithUa('https://www.mptc.gov.kh/', {}, impl);
    assert.equal(calls[1].init.headers['User-Agent'], BROWSER_USER_AGENT);
  });
  it('リダイレクトの輪は too many redirects', async () => {
    const { impl } = fakeFetch({ 'https://mptc.gov.kh/': { status: 302, location: '/' } });
    await assert.rejects(fetchWithUa('https://mptc.gov.kh/', {}, impl, 3), /too many redirects/);
  });
  it('相対 Location を解決する', async () => {
    const { impl, calls } = fakeFetch({
      'https://mptc.gov.kh/en/': { status: 302, location: '/km/home' },
      'https://mptc.gov.kh/km/home': { status: 200 },
    });
    await fetchWithUa('https://mptc.gov.kh/en/', {}, impl);
    assert.equal(calls[1].url, 'https://mptc.gov.kh/km/home');
  });
  it('追加ヘッダーは残し UA は上書き、signal は各ホップに渡す', async () => {
    const { impl, calls } = fakeFetch({
      'https://mptc.gov.kh/a': { status: 302, location: 'https://example.com/b' },
      'https://example.com/b': { status: 200 },
    });
    const signal = new AbortController().signal;
    await fetchWithUa('https://mptc.gov.kh/a', { signal, headers: { 'X-Return-Format': 'markdown', 'User-Agent': 'evil' } }, impl);
    for (const c of calls) {
      assert.equal(c.init.headers['X-Return-Format'], 'markdown');
      assert.equal(c.init.signal, signal);
    }
    assert.equal(calls[0].init.headers['User-Agent'], BROWSER_USER_AGENT);
    assert.equal(calls[1].init.headers['User-Agent'], BOT_USER_AGENT);
  });
});
