'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');
const { translateTemplate, exact } = require('../src/admin-i18n');
const DICT = require('../src/admin-i18n-en');

const AUTH = { Authorization: 'Basic ' + Buffer.from('admin:rahasia').toString('base64') };
let app, base, server, dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalma-lang-'));
  app = createApp({ dataDir, db: null, adminPassword: 'rahasia', siteUrl: 'https://kalma.test', adminLang: 'en' });
  await app.locals.repo.init();
  server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

const get = async (p, headers = AUTH) => (await fetch(base + p, { headers, redirect: 'manual' })).text();

test('the admin speaks English by default, ADMIN_LANG=id switches the default', () => {
  assert.equal(loadConfig({}).adminLang, 'en');
  assert.equal(loadConfig({ ADMIN_LANG: 'id' }).adminLang, 'id');
});

test('every admin page is English by default, guest data stays as typed', async () => {
  const login = await get('/admin/login', {});
  assert.match(login, /<html lang="en">/);
  assert.match(login, /Log in to the admin/);
  assert.match(login, /<button type="submit" form="lang-form" name="lang" value="en" aria-pressed="true">EN<\/button>/);

  const { inquiryId } = await app.locals.repo.addInquiry({ lang: 'id', name: 'Baru', contact: 'baru@mail.com', checkin: '2030-01-01', checkout: '2030-01-03', guests: '2', room: 'laguna', msg: 'Saran saya, tambah kipas. Simpan kunci di meja.' });
  const dash = await get('/admin');
  assert.match(dash, /Overview/);
  assert.match(dash, /Things that need your attention today: 1\./);
  assert.match(dash, /1 new inquiry/);
  assert.match(dash, />Users &amp; roles</);
  assert.doesNotMatch(dash, /Ringkasan|Pengguna &amp; peran|Kembali ke situs/);

  const inq = await get(`/admin/inquiries/${inquiryId}`);
  assert.match(inq, /Stay details/);
  assert.match(inq, /Lagoon Bungalow/);
  assert.match(inq, /Saran saya, tambah kipas\. Simpan kunci di meja\./, 'the guest message is never translated');
  assert.match(inq, /<option value="new" selected>New<\/option>/, 'status values stay, labels are English');

  const tx = await get('/admin/finance');
  assert.match(tx, /<option value="Bahan makanan">Groceries<\/option>/, 'stored categories keep their value');
});

test('staff switch the admin to Indonesian from the account menu, and back', async () => {
  const r = await fetch(base + '/admin/lang', { method: 'POST', redirect: 'manual', headers: { ...AUTH, Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'lang=id&next=%2Fadmin%2Ffinance' });
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('location'), '/admin/finance');
  const cookie = r.headers.get('set-cookie').split(';')[0];
  assert.equal(cookie, 'kalma_admin_lang=id');
  const id = await get('/admin', { ...AUTH, Cookie: cookie });
  assert.match(id, /<html lang="id">/);
  assert.match(id, /Ringkasan/);
  assert.match(id, /name="lang" value="id" aria-pressed="true">Indonesia</);
  assert.match(await get('/admin', { ...AUTH, Cookie: 'kalma_admin_lang=en' }), /Overview/);
});

test('the template translator leaves code and data alone', () => {
  const src = '<h1>Simpan perubahan</h1><p class="muted"><%= item.message %> · Belum ada.</p><input placeholder="mis. 07.30" value="<%= v %>"><% var x = \'Ide\', path = \'/admin/website\'; %><button onclick="return confirm(\'Hapus foto ini?\')">Hapus</button>';
  const out = translateTemplate(src);
  assert.equal(out, '<h1>Save changes</h1><p class="muted"><%= item.message %> · Nothing yet.</p><input placeholder="e.g. 07.30" value="<%= v %>"><% var x = \'Idea\', path = \'/admin/website\'; %><button onclick="return confirm(\'Delete this photo?\')">Delete</button>');
  assert.equal(exact('3 konten lewat jadwal'), '3 posts are overdue');
  assert.equal(exact('Sesuatu yang lain'), undefined);
});

test('the English dictionary follows the house style', () => {
  for (const [k, v] of Object.entries(DICT)) {
    assert.doesNotMatch(v.replace(/&[a-z]+;/g, ''), /[—–;]/, `"${k}" has no dashes or semicolons`);
    assert.equal((k.match(/\{n\}/g) || []).length, (v.match(/\{n\}/g) || []).length, `"${k}" keeps its numbers`);
  }
});
