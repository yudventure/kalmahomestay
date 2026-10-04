'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { createApp } = require('../src/app');
const { createFileRepo } = require('../src/db/file');
const { createInstagramSync, isStory } = require('../src/instagram');

const contact = { whatsapp: '6281111111111', whatsappDisplay: '+62 811', email: 'host@kalma.test', instagram: '@kalma', instagramUrl: 'https://instagram.com/kalma' };

// A fake graph.instagram.com: two posts, one with a second page of comments.
let ig, api, calls = [], fail = false;
const comment = (id, username, text, like_count = 0) => ({ id, username, text, like_count, timestamp: '2026-09-01T10:00:00+0000' });
const COMMENTS = {
  m1: [
    comment('101', 'rina.travels', 'Tempatnya tenang banget, airnya jernih dan tuan rumahnya ramah sekali!', 7),
    comment('102', 'kalma.rajaampat', 'Terima kasih banyak Rina, sampai jumpa lagi ya!', 1),
    comment('103', 'budi', '@sinta kesini yuk'),
    comment('104', 'spam_bot', 'Cek promo murah di https://spam.example sekarang juga ya'),
  ],
  m2: [comment('201', 'tom.dives', '@kalma.rajaampat Best snorkeling trip of my life, the reef was unreal', 3)],
};

before(async () => {
  ig = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    calls.push(url.pathname);
    res.setHeader('Content-Type', 'application/json');
    if (fail) { res.statusCode = 400; return res.end(JSON.stringify({ error: { message: 'Invalid OAuth access token' } })); }
    const send = (o) => res.end(JSON.stringify(o));
    if (url.pathname === '/me') return send({ user_id: '1', username: 'kalma.rajaampat' });
    if (url.pathname === '/me/media' && url.searchParams.get('after') === 'page2') {
      return send({ data: [{ id: 'm3', permalink: 'https://www.instagram.com/p/CCC/', comments_count: 0, media_type: 'CAROUSEL_ALBUM' }] });
    }
    if (url.pathname === '/me/media') {
      return send({ data: [
        { id: 'm1', permalink: 'https://www.instagram.com/reel/AAA/', comments_count: 4, media_product_type: 'REELS', media_type: 'VIDEO' },
        { id: 'm2', permalink: 'https://www.instagram.com/p/BBB/', comments_count: 1, media_product_type: 'FEED', media_type: 'IMAGE' },
      ], paging: { next: `${api}/me/media?after=page2&access_token=${url.searchParams.get('access_token')}` } });
    }
    if (url.pathname === '/refresh_access_token') return send({ access_token: 'refreshed-' + url.searchParams.get('access_token'), expires_in: 5184000 });
    const m = url.pathname.match(/^\/(m\d)\/comments$/);
    if (m) {
      const all = COMMENTS[m[1]];
      if (m[1] === 'm1' && !url.searchParams.get('after')) {
        return send({ data: all.slice(0, 2), paging: { next: `${api}/m1/comments?after=2&access_token=${url.searchParams.get('access_token')}` } });
      }
      return send({ data: m[1] === 'm1' ? all.slice(2) : all });
    }
    res.statusCode = 404;
    send({ error: { message: 'not found' } });
  });
  await new Promise((r) => ig.listen(0, r));
  api = `http://127.0.0.1:${ig.address().port}`;
});

after(() => ig.close());

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalma-ig-'));
  return { dir, repo: createFileRepo(dir) };
}

test('only story-like comments from guests are kept', () => {
  assert.ok(isStory({ username: 'a', text: 'Tempatnya tenang banget dan bersih' }, 'kalma'));
  assert.ok(!isStory({ username: 'kalma', text: 'Terima kasih banyak sudah menginap' }, 'kalma'), 'owner replies');
  assert.ok(!isStory({ username: 'a', text: '@b @c ayo kesini' }, 'kalma'), 'tag-a-friend');
  assert.ok(!isStory({ username: 'a', text: '😍😍🔥' }, 'kalma'), 'emoji only');
  assert.ok(!isStory({ username: 'a', text: 'Promo murah cek www.spam.example sekarang' }, 'kalma'), 'links');
});

test('a daily sync saves guest comments, refreshes the token and respects hidden comments', async () => {
  const { dir, repo } = tmpRepo();
  await repo.init();
  let clock = Date.parse('2026-10-04T00:00:00Z');
  const sync = createInstagramSync({ repo, token: 'tok-1', api, log: () => {}, now: () => clock });

  const s = await sync.syncNow();
  assert.equal(s.ok, true, s.error);
  assert.equal(s.count, 2);
  assert.deepEqual(sync.comments.map((c) => c.name), ['@rina.travels', '@tom.dives'], 'most liked first');
  assert.equal(sync.comments[1].quote, 'Best snorkeling trip of my life, the reef was unreal', 'leading mention removed');
  assert.equal(sync.comments[0].url, 'https://www.instagram.com/reel/AAA/');
  assert.deepEqual(sync.comments.map((c) => c.kind), ['reel', 'post']);
  assert.equal(calls.filter((c) => c === '/me/media').length, 2, 'follows posts back to the first one');
  assert.equal((await repo.getSetting('ig_token')).token, 'refreshed-tok-1');

  // not due again within a day
  calls = [];
  assert.equal(await sync.maybeSync(), null);
  assert.equal(calls.length, 0);

  // hidden comments stay hidden after the next sync, which uses the refreshed token
  await repo.setIgCommentHidden('101', true);
  await sync.reload();
  assert.deepEqual(sync.comments.map((c) => c.name), ['@tom.dives']);
  clock += 25 * 60 * 60 * 1000;
  calls = [];
  await sync.maybeSync();
  assert.ok(calls.includes('/me/media'));
  assert.deepEqual(sync.comments.map((c) => c.name), ['@tom.dives']);
  assert.equal((await repo.getSetting('ig_token')).token, 'refreshed-refreshed-tok-1');

  // a comment deleted on Instagram disappears; a new token in hPanel replaces the stored one
  COMMENTS.m2 = [];
  const fresh = createInstagramSync({ repo, token: 'tok-2', api, log: () => {}, now: () => clock });
  await fresh.syncNow();
  assert.deepEqual((await repo.listIgComments()).map((c) => c.id), ['101']);
  assert.equal((await repo.getSetting('ig_token')).token, 'refreshed-tok-2');
  COMMENTS.m2 = [comment('201', 'tom.dives', '@kalma.rajaampat Best snorkeling trip of my life, the reef was unreal', 3)];
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a failed sync keeps the saved comments and retries after an hour', async () => {
  const { dir, repo } = tmpRepo();
  await repo.init();
  let clock = Date.parse('2026-10-04T00:00:00Z');
  const sync = createInstagramSync({ repo, token: 'tok', api, log: () => {}, now: () => clock });
  await sync.syncNow();
  fail = true;
  try {
    clock += 25 * 60 * 60 * 1000;
    const s = await sync.maybeSync();
    assert.equal(s.ok, false);
    assert.match(s.error, /Invalid OAuth/);
    assert.equal(sync.comments.length, 2);
    clock += 30 * 60 * 1000;
    assert.equal(await sync.maybeSync(), null, 'waits an hour after a failure');
    clock += 31 * 60 * 1000;
    assert.notEqual(await sync.maybeSync(), null);
  } finally {
    fail = false;
  }
  assert.equal(createInstagramSync({ repo, token: '', api }).enabled, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Instagram comments appear under guest stories and can be hidden in the admin', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalma-ig-app-'));
  const app = createApp({ dataDir, db: null, adminPassword: 'rahasia', siteUrl: 'https://kalma.test', contact, instagram: { token: 'tok' }, instagramApi: api });
  await app.locals.repo.init();
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const auth = { Authorization: 'Basic ' + Buffer.from('admin:rahasia').toString('base64') };
  try {
    let html = await (await fetch(base + '/en')).text();
    assert.match(html, /Sample view\. Real guest stories will appear here/, 'labelled samples before the first sync');
    assert.match(html, /bubble__tag--sample">Sample</);

    const sync = await fetch(base + '/admin/instagram/sync', { method: 'POST', headers: { ...auth, Origin: base }, redirect: 'manual' });
    assert.equal(sync.headers.get('location'), '/admin/instagram?ok=ig-synced');

    html = await (await fetch(base + '/en')).text();
    assert.match(html, /Tempatnya tenang banget/);
    assert.doesNotMatch(html, /bubble__tag--sample|Sample view/, 'samples disappear once real comments exist');
    assert.match(html, /<b>@rina\.travels<\/b>\s*<a class="bubble__tag" href="https:\/\/www\.instagram\.com\/reel\/AAA\/"[^>]*>Reels<\/a>/);
    assert.match(html, /class="bubbles"/);
    assert.doesNotMatch(html, /Terima kasih banyak Rina/);

    const page = await (await fetch(base + '/admin/instagram', { headers: auth })).text();
    assert.match(page, /2 komentar cerita dari @kalma\.rajaampat/);

    const hide = await fetch(base + '/admin/instagram/101/visibility', { method: 'POST', headers: { ...auth, Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'hidden=1', redirect: 'manual' });
    assert.equal(hide.status, 303);
    html = await (await fetch(base + '/en')).text();
    assert.doesNotMatch(html, /Tempatnya tenang banget/);
    assert.match(html, /Best snorkeling trip/);

    // comments pasted in by hand show up right away and can be deleted
    const form = (body) => fetch(base + '/admin/instagram/add', { method: 'POST', headers: { ...auth, Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body), redirect: 'manual' });
    assert.equal((await form({ username: '@sari', text: 'Sunset di dermaga Kalma juara!', kind: 'post', link: 'https://www.instagram.com/p/ZZZ/' })).headers.get('location'), '/admin/instagram?ok=ig-added');
    assert.equal((await form({ username: 'sari', text: 'ok', kind: 'post' })).headers.get('location'), '/admin/instagram?err=ig-invalid');
    assert.equal((await form({ username: 'sari', text: 'Bagus sekali tempatnya', link: 'javascript:alert(1)' })).headers.get('location'), '/admin/instagram?err=ig-invalid');
    html = await (await fetch(base + '/')).text();
    assert.match(html, /<b>@sari<\/b>\s*<a class="bubble__tag" href="https:\/\/www\.instagram\.com\/p\/ZZZ\/"[^>]*>Foto<\/a>/);
    const manual = (await app.locals.repo.listIgComments()).find((c) => c.username === 'sari');
    assert.equal(manual.media_kind, 'post');
    assert.equal((await fetch(base + '/admin/instagram/201/delete', { method: 'POST', headers: { ...auth, Origin: base }, redirect: 'manual' })).status, 404, 'synced comments are hidden, not deleted');
    assert.equal((await fetch(base + `/admin/instagram/${manual.id}/delete`, { method: 'POST', headers: { ...auth, Origin: base }, redirect: 'manual' })).status, 303);
    assert.doesNotMatch(await (await fetch(base + '/')).text(), /Sunset di dermaga/);

    const forged = await fetch(base + '/admin/instagram/201/visibility', { method: 'POST', headers: { ...auth, Origin: 'https://evil.example', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'hidden=1' });
    assert.equal(forged.status, 403);
  } finally {
    server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
