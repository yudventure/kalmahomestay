'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../src/app');
const { todayISO } = require('../src/inquiry');
const { can } = require('../src/staff');

const AUTH = { Authorization: 'Basic ' + Buffer.from('admin:rahasia').toString('base64') };
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(200, 3)]);
let app, base, server, dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalma-content-'));
  app = createApp({ adminLang: 'id', dataDir, db: null, adminPassword: 'rahasia', siteUrl: 'https://kalma.test', payments: { enabled: false, percent: 100 } });
  await app.locals.repo.init();
  server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

const form = (p, body, headers = AUTH) => fetch(base + p, { method: 'POST', redirect: 'manual', headers: { ...headers, Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
const get = async (p, headers = AUTH) => (await fetch(base + p, { headers, redirect: 'manual' }));

test('public relations staff manage the website and social media, nothing else', () => {
  assert.equal(can('pr', 'website'), true);
  assert.equal(can('pr', 'content'), true);
  for (const area of ['reservations', 'finance', 'hr', 'payroll', 'users']) assert.equal(can('pr', area), false, area);
  assert.equal(can('manager', 'content'), true);
  assert.equal(can('reservation', 'content'), false);
});

test('a PR team member plans content in the calendar, writes the script and uploads material', async () => {
  await form('/admin/users', { name: 'Putri PR', username: 'putri', role: 'pr', password: 'panjang123' });
  const login = await fetch(base + '/admin/login', { method: 'POST', redirect: 'manual', headers: { Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ username: 'putri', password: 'panjang123' }) });
  const pr = { Cookie: login.headers.get('set-cookie').split(';')[0] };

  const menu = await (await get('/admin', pr)).text();
  assert.match(menu, /Sosial media/);
  assert.match(menu, /href="\/admin\/content"[^>]*>Kalender konten</);
  assert.match(menu, /href="\/admin\/website\/media"/);
  assert.doesNotMatch(menu, /href="\/admin\/finance"/);
  assert.equal((await get('/admin/finance', pr)).status, 403);
  assert.equal((await get('/admin/inquiries', pr)).status, 403);

  const today = todayISO();
  const fresh = await (await get(`/admin/content/new?date=${today}`, pr)).text();
  assert.match(fresh, new RegExp(`name="publish_date" type="date" value="${today}"`));
  assert.match(fresh, /Hook \(0 sampai 3 detik\):/, 'the script starts from a simple template');

  let r = await form('/admin/content', { title: '' }, pr);
  assert.equal(r.status, 400);
  r = await form('/admin/content', {
    title: 'Pagi pertama di Bungalow Laguna', publish_date: today, publish_time: '19.00', status: 'naskah', platforms: 'instagram',
    format: 'reels', pillar: 'homestay', assignee: 'putri', hook: 'Bangun tidur, buka pintu, langsung laut.', caption: 'Selamat pagi dari Kalma',
    hashtags: '#rajaampat', link: 'javascript:alert(1)',
  }, pr);
  assert.equal(r.status, 303);
  const id = Number(r.headers.get('location').match(/content\/(\d+)/)[1]);
  const post = await app.locals.repo.table('content_posts').get(id);
  assert.deepEqual([post.status, post.publish_time, post.platforms, post.created_by, post.link], ['naskah', '19:00', 'instagram', 'putri', null]);

  const cal = await (await get('/admin/content', pr)).text();
  assert.match(cal, new RegExp(`href="/admin/content/${id}">\\s*<small>19:00 IG</small>\\s*<b>Pagi pertama di Bungalow Laguna</b>`));
  assert.match(await (await get('/admin', pr)).text(), /1 konten tayang hari ini/);

  // move on the board
  await form(`/admin/content/${id}/status`, { status: 'tayang' }, pr);
  assert.equal((await app.locals.repo.table('content_posts').get(id)).status, 'tayang');
  assert.match(await (await get('/admin/content/board', pr)).text(), /Sudah tayang <small>1<\/small>/);

  // material through the upload button, private to the team
  const page = await (await get(`/admin/content/${id}`, pr)).text();
  assert.match(page, new RegExp(`action="/admin/content/${id}/files/document"[^>]*enctype="multipart/form-data"`));
  assert.match(page, new RegExp(`action="/admin/content/${id}/files/video"`));
  const fd = new FormData();
  fd.append('file', new Blob([PDF]), 'brief.pdf');
  r = await fetch(base + `/admin/content/${id}/files/document`, { method: 'POST', body: fd, redirect: 'manual', headers: { ...pr, Origin: base } });
  assert.match(r.headers.get('location'), /ok=uploaded#materi/);
  const file = await app.locals.media.list({ where: { owner_type: 'content', owner_id: id } });
  assert.equal(file.length, 1);
  assert.equal(file[0].public, false);
  assert.equal((await get(`/admin/files/${file[0].id}`, pr)).status, 200);
  assert.equal((await fetch(base + `/media/${file[0].file}`)).status, 404);

  await form(`/admin/content/${id}/delete`, {}, pr);
  assert.equal(await app.locals.repo.table('content_posts').get(id), null);
  assert.equal((await app.locals.media.list({ where: { owner_type: 'content' } })).length, 0);
});

test('the homepage speaks of world-class hospitality and email confirmations', async () => {
  const en = await (await fetch(base + '/')).text();
  assert.match(en, /World-class hospitality/);
  assert.doesNotMatch(en, /Local family/);
  assert.match(en, /Booking confirmations are sent by email\. Please check your inbox and spam folder\./);
  assert.match(await (await fetch(base + '/id')).text(), /Keramahan kelas dunia/);
});
