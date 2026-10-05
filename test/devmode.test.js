'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../src/app');

const AUTH = { Authorization: 'Basic ' + Buffer.from('admin:rahasia').toString('base64') };
let app, base, server, dataDir, staffCookie;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalma-dev-'));
  app = createApp({ adminLang: 'id', dataDir, db: null, adminPassword: 'rahasia', siteUrl: 'https://kalma.test', payments: { enabled: false, percent: 100 } });
  await app.locals.repo.init();
  server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
  // opening the admin gives staff a preview pass for the public site
  const res = await fetch(base + '/admin', { headers: AUTH });
  staffCookie = (res.headers.get('set-cookie') || '').match(/kalma_preview=[^;]+/)[0];
});
after(() => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

const save = (body) => fetch(base + '/admin/website/devmode', { method: 'POST', redirect: 'manual', headers: { ...AUTH, Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
const guest = (p) => fetch(base + p, { redirect: 'manual' });
const staff = (p) => fetch(base + p, { redirect: 'manual', headers: { Cookie: staffCookie } });

test('branded error pages: 404 in the visitor language, previews of every page for staff', async () => {
  const en = await guest('/en/nothing-here');
  assert.equal(en.status, 404);
  const html = await en.text();
  assert.match(html, /Lost at sea/);
  assert.match(html, /class="scene scene--404"/);
  const id = await guest('/layanan/tidak-ada');
  assert.equal(id.status, 404);
  assert.match(await id.text(), /Tersesat di laut/);
  for (const [code, words] of [['401', /Please sign in first/], ['403', /This dock is closed/], ['500', /Our boat hit a small wave/], ['503', /We are tidying up the reef/], ['page', /This page is being refreshed/]]) {
    const r = await fetch(base + `/admin/website/devmode/preview/${code}`, { headers: AUTH });
    assert.match(await r.text(), words, code);
  }
  assert.match(await (await fetch(base + '/admin/website/devmode/preview/403?lang=id', { headers: AUTH })).text(), /Dermaga ini sedang ditutup/);
});

test('homepage sections can be hidden or shown as being refreshed, staff still see them marked', async () => {
  assert.equal((await save({ site_on: '0', sec_experiences: 'hide', sec_faq: 'maint', sec_hero: 'show' })).status, 303);
  const g = await (await guest('/')).text();
  assert.doesNotMatch(g, /id="pengalaman"/);
  assert.doesNotMatch(g, /id="faq"/);
  assert.match(g, /class="sec-maint"/);
  assert.match(g, /This part of the page is being refreshed/);
  assert.match(g, /class="hero"/);
  const s = await (await staff('/')).text();
  assert.match(s, /id="pengalaman" data-dev="Hidden from guests"/);
  assert.match(s, /id="faq" data-dev="Under maintenance for guests"/);
  assert.match(s, /class="dev-bar"/);
  assert.doesNotMatch(s, /class="sec-maint"/);
  const idPage = await (await guest('/id')).text();
  assert.match(idPage, /Bagian ini sedang diperbarui/);
});

test('a single page can be put into maintenance', async () => {
  await save({ site_on: '0', page_book: 'maint' });
  const b = await guest('/en/book');
  assert.equal(b.status, 503);
  assert.match(await b.text(), /This page is being refreshed/);
  assert.equal((await guest('/pesan')).status, 503);
  const api = await fetch(base + '/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(api.status, 503);
  assert.equal((await guest('/en/services/homestay')).status, 200, 'other pages stay open');
  assert.equal((await staff('/en/book')).status, 200, 'staff can still check the page');
});

test('the whole site in maintenance: guests get the maintenance page, the admin and payments keep working', async () => {
  await save({ site_on: '1', site_until: '2026-10-06T18:00', msg_en: 'Back after our reef clean-up.', msg_id: '' });
  for (const p of ['/', '/id', '/en/privacy', '/en/feedback']) {
    const r = await guest(p);
    assert.equal(r.status, 503, p);
    assert.equal(r.headers.get('retry-after'), '3600');
  }
  const en = await (await guest('/')).text();
  assert.match(en, /Back after our reef clean-up\./);
  assert.match(en, /Expected back/);
  assert.match(en, /6 October at 18:00 WIT/);
  const id = await (await guest('/id')).text();
  assert.match(id, /Kami sedang merapikan karang/);
  assert.match(id, /Website Kalma sedang dirawat sebentar/, 'empty Indonesian message uses the standard text');
  assert.equal((await guest('/admin/login')).status, 200);
  assert.equal((await guest('/healthz')).status, 200);
  assert.equal((await guest('/css/home.css')).status, 200);
  assert.notEqual((await fetch(base + '/api/payments/midtrans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 503);
  assert.equal((await staff('/')).status, 200, 'staff preview the real site');
  // the bell tells the team
  assert.match(await (await fetch(base + '/admin', { headers: AUTH })).text(), /Website sedang mode maintenance/);
  // a forged preview cookie does not get through
  assert.equal((await fetch(base + '/', { headers: { Cookie: 'kalma_preview=abc.def' } })).status, 503);
  await save({ site_on: '0' });
  assert.equal((await guest('/')).status, 200);
});
