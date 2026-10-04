'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../src/app');

const contact = { whatsapp: '6281111111111', whatsappDisplay: '+62 811', email: 'host@kalma.test', instagram: '@kalma', instagramUrl: 'https://instagram.com/kalma' };
const AUTH = { Authorization: 'Basic ' + Buffer.from('admin:rahasia').toString('base64') };
let app, base, server, dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalma-fb-'));
  app = createApp({ adminLang: 'id', dataDir, db: null, adminPassword: 'rahasia', siteUrl: 'https://kalma.test', contact, payments: { enabled: false, percent: 100 } });
  await app.locals.repo.init();
  server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

const form = (p, body, headers = {}) => fetch(base + p, { method: 'POST', redirect: 'manual', headers: { ...headers, Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });

test('the header has a "We hear you" button instead of Book, and the hero search books directly', async () => {
  const id = await (await fetch(base + '/id')).text();
  assert.match(id, /<a href="\/masukan" class="nav__hear">[^]*?<span>We hear you<\/span><\/a>/);
  assert.match(await (await fetch(base + '/')).text(), /<a href="\/en\/feedback" class="nav__hear">/);
  assert.doesNotMatch(id, /nav__cta|Cek ketersediaan|band__swirl|foot__perks/);
  assert.match(id, /<form class="search" id="quick"[^]*?<button class="btn btn--cta" type="submit">[^]*?Pesan<\/button>/);
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'home.css'), 'utf8');
  assert.doesNotMatch(css, /\.nav\.is-scrolled \{ border/, 'no line under the header when scrolling');
  assert.match(css, /\.nav \{[^}]*backdrop-filter/);
});

test('guests send suggestions and complaints through a professional form', async () => {
  let page = await (await fetch(base + '/masukan')).text();
  assert.match(page, /Ceritakan apa yang bisa kami perbaiki\./);
  for (const k of ['Saran', 'Keluhan', 'Pujian', 'Pertanyaan']) assert.match(page, new RegExp(`<input type="radio" name="kind" value="[a-z]+" required><span>.*?${k}</span>`));
  assert.doesNotMatch(page, /wa\.me|class="sv__head"/, 'no WhatsApp button and no site header');
  assert.match(page, /<aside class="fb__intro">\s*<div class="fb__brand">\s*<a href="\/id" class="fb__logo"/, 'logo and language switch sit in the blue card');
  assert.match(page, /<a class="fb__home" href="\/id">[^]*?Kembali ke beranda<\/a>/);
  assert.match(page, /name="email" type="email"[^>]*required/);
  assert.match(page, /name="phone" type="tel"[^>]*required/);

  // validation keeps what the guest typed
  let r = await form('/masukan', { message: 'Air panas di kamar mandi tidak menyala.' });
  assert.equal(r.status, 400);
  page = await r.text();
  assert.match(page, /Pilih jenis pesan dulu\./);
  assert.match(page, /Air panas di kamar mandi tidak menyala\./);
  assert.match(await (await form('/en/feedback', { kind: 'saran', message: 'short' })).text(), /at least 10 characters/);
  const ok = { kind: 'saran', message: 'Tambahkan kipas di dapur.', email: 'a@mail.com', phone: '0812 3456 7890' };
  assert.match(await (await form('/masukan', { ...ok, email: '' })).text(), /Isi alamat email yang benar/);
  assert.match(await (await form('/en/feedback', { ...ok, phone: 'abc' })).text(), /valid WhatsApp number/);

  r = await form('/masukan', { kind: 'keluhan', topic: 'kamar', rating: '2', message: 'Air panas di kamar mandi tidak menyala.', name: 'Rina', email: 'Rina@Mail.com', phone: '0812 3456 7890', stay_date: '2026-09-20' });
  assert.equal(r.headers.get('location'), '/masukan?thanks=1');
  assert.match(await (await fetch(base + '/masukan?thanks=1')).text(), /Terima kasih, pesanmu sudah kami terima\./);
  await form('/en/feedback', { kind: 'pujian', rating: '9', topic: 'nope', message: 'The sunset from the jetty was magical!', email: 'tom@mail.com', phone: '+61 412 345 678' });
  assert.equal((await form('/masukan', { kind: 'saran', message: 'Spam spam spam spam', website: 'x' })).headers.get('location'), '/masukan?thanks=1');

  const rows = await app.locals.repo.table('feedback').list({ order: [['id', 'asc']] });
  assert.equal(rows.length, 2, 'the honeypot message is not saved');
  assert.deepEqual([rows[0].kind, rows[0].topic, rows[0].rating, rows[0].status, rows[0].stay_date, rows[0].email, rows[0].phone], ['keluhan', 'kamar', 2, 'baru', '2026-09-20', 'rina@mail.com', '6281234567890']);
  assert.deepEqual([rows[1].lang, rows[1].rating, rows[1].topic], ['en', null, 'lainnya'], 'bad rating and topic are ignored');
});

test('staff see new feedback in the bell and handle it in the inbox', async () => {
  let html = await (await fetch(base + '/admin', { headers: AUTH })).text();
  assert.match(html, /2 masukan tamu baru/);
  html = await (await fetch(base + '/admin/feedback?kind=keluhan', { headers: AUTH })).text();
  assert.match(html, /Air panas di kamar mandi tidak menyala\./);
  assert.doesNotMatch(html, /sunset from the jetty/);
  assert.match(html, /href="mailto:rina@mail\.com\?subject=/, 'reply by email');
  assert.match(html, /href="https:\/\/wa\.me\/6281234567890\?text=/, 'and WhatsApp from the number the guest left');
  const id = (await app.locals.repo.table('feedback').find({ kind: 'keluhan' })).id;
  const r = await form(`/admin/feedback/${id}`, { status: 'selesai', admin_note: 'Sudah diperbaiki, tamu ditelepon.' }, AUTH);
  assert.equal(r.status, 303);
  const row = await app.locals.repo.table('feedback').get(id);
  assert.deepEqual([row.status, row.admin_note, row.handled_by], ['selesai', 'Sudah diperbaiki, tamu ditelepon.', 'admin']);
  assert.match(await (await fetch(base + '/admin', { headers: AUTH })).text(), /1 masukan tamu baru/);
  await form(`/admin/feedback/${id}/delete`, {}, AUTH);
  assert.equal(await app.locals.repo.table('feedback').get(id), null);
});
