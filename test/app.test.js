'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../src/app');
const { todayISO, replyLink } = require('../src/inquiry');

let server, base, dataDir;

function addDays(n) {
  const d = new Date(); d.setDate(d.getDate() + n); return todayISO(d);
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalma-test-'));
  const app = createApp({
    dataDir, adminPassword: 'rahasia',
    siteUrl: 'https://kalma.test',
    contact: { whatsapp: '6281111111111', whatsappDisplay: '+62 811', email: 'host@kalma.test', instagram: '@kalma', instagramUrl: 'https://instagram.com/kalma' },
  });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const valid = () => ({ name: 'Rina', contact: '0812 3456 7890', checkin: addDays(10), checkout: addDays(13), guests: '2', room: 'pantai', msg: 'Vegetarian' });

test('home page renders in Indonesian with contact settings', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /<html lang="id">/);
  assert.match(html, /Bangun dengan suara ombak\./);
  assert.match(html, /Rp 850\.000/);
  assert.match(html, /wa\.me\/6281111111111/);
  assert.match(html, /<link rel="canonical" href="https:\/\/kalma\.test\/">/);
  assert.doesNotMatch(html, /<%|t\('/, 'no unrendered template tags');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});

test('English page renders at /en', async () => {
  const html = await (await fetch(base + '/en')).text();
  assert.match(html, /<html lang="en">/);
  assert.match(html, /Wake up to the sound of waves\./);
  assert.match(html, /Lagoon Bungalow/);
  assert.match(html, /href="\/en" hreflang="en" lang="en" aria-current="page"/);
});

test('static assets and brand files are served, guideline sources are not', async () => {
  assert.equal((await fetch(base + '/css/style.css')).status, 200);
  assert.equal((await fetch(base + '/js/main.js')).status, 200);
  assert.equal((await fetch(base + '/brand/tokens.css')).status, 200);
  assert.equal((await fetch(base + '/brand/assets/kalma-wordmark.png')).status, 200);
  assert.equal((await fetch(base + '/brand/deck/content.py')).status, 404);
  assert.equal((await fetch(base + '/.env')).status, 404);
});

test('inquiry API validates input', async () => {
  let r = await post('/api/inquiry', { ...valid(), name: '' });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, 'Boleh tahu namamu?');

  r = await post('/en/api/inquiry', { ...valid(), checkout: valid().checkin });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, 'Check-out must be after check-in.');

  r = await post('/api/inquiry', { ...valid(), checkin: addDays(-3) });
  assert.equal(r.status, 400);

  r = await post('/api/inquiry', { ...valid(), checkin: 'besok' });
  assert.equal(r.status, 400);
});

test('valid inquiry is saved and returns a prefilled WhatsApp link', async () => {
  const r = await post('/api/inquiry', valid());
  assert.equal(r.status, 201);
  const body = await r.json();
  assert.ok(body.whatsappUrl.startsWith('https://wa.me/6281111111111?text='));
  const text = decodeURIComponent(body.whatsappUrl.split('text=')[1]);
  assert.match(text, /Nama: Rina/);
  assert.match(text, /Kamar: Rumah Pantai/);
  assert.match(text, /Catatan: Vegetarian/);
  assert.ok(body.mailtoUrl.startsWith('mailto:host@kalma.test?subject='));

  const saved = fs.readFileSync(path.join(dataDir, 'inquiries.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(saved.at(-1).name, 'Rina');
  assert.equal(saved.at(-1).room, 'pantai');
});

test('unknown room and guest values are normalized', async () => {
  const r = await post('/api/inquiry', { ...valid(), room: 'presidential', guests: '99' });
  assert.equal(r.status, 201);
  const text = decodeURIComponent((await r.json()).whatsappUrl.split('text=')[1]);
  assert.match(text, /Tamu: 2/);
  assert.match(text, /Kamar: bebas/);
});

test('honeypot submissions are accepted silently but not stored', async () => {
  const before = fs.readFileSync(path.join(dataDir, 'inquiries.jsonl'), 'utf8');
  const r = await post('/api/inquiry', { ...valid(), website: 'http://spam' });
  assert.equal(r.status, 200);
  assert.equal(fs.readFileSync(path.join(dataDir, 'inquiries.jsonl'), 'utf8'), before);
});

test('form POST without JavaScript redirects to WhatsApp, or re-renders with the error', async () => {
  const form = (o) => fetch(base + '/inquiry', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o) });
  let r = await form(valid());
  assert.equal(r.status, 303);
  assert.match(r.headers.get('location'), /^https:\/\/wa\.me\/6281111111111\?text=/);

  r = await form({ ...valid(), name: '' });
  assert.equal(r.status, 400);
  const html = await r.text();
  assert.match(html, /Boleh tahu namamu\?/);
  assert.match(html, /value="0812 3456 7890"/, 'keeps what the guest typed');
});

test('user input is escaped in the re-rendered form', async () => {
  const r = await fetch(base + '/inquiry', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: '', country: '"><script>alert(1)</script>' }) });
  const html = await r.text();
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});

test('admin requires the password and lists inquiries', async () => {
  assert.equal((await fetch(base + '/admin')).status, 401);
  const bad = 'Basic ' + Buffer.from('admin:salah').toString('base64');
  assert.equal((await fetch(base + '/admin', { headers: { Authorization: bad } })).status, 401);
  const good = 'Basic ' + Buffer.from('admin:rahasia').toString('base64');
  const r = await fetch(base + '/admin', { headers: { Authorization: good } });
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /Rina/);
  assert.match(html, /wa\.me\/6281234567890/, 'reply link converts 08… to 628…');
});

test('admin is disabled when no password is configured', async () => {
  const app = createApp({ dataDir, adminPassword: '' });
  const s = await new Promise((r) => { const x = app.listen(0, () => r(x)); });
  const res = await fetch(`http://127.0.0.1:${s.address().port}/admin`);
  s.close();
  assert.equal(res.status, 404);
});

test('inquiry still works when saving fails', async () => {
  const blocker = path.join(dataDir, 'not-a-dir');
  fs.writeFileSync(blocker, 'x'); // a file where a directory is expected → mkdir/append fails
  const app = createApp({ dataDir: path.join(blocker, 'sub') });
  const s = await new Promise((r) => { const x = app.listen(0, () => r(x)); });
  const origError = console.error; console.error = () => {};
  const res = await fetch(`http://127.0.0.1:${s.address().port}/api/inquiry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(valid()) });
  console.error = origError; s.close();
  assert.equal(res.status, 201);
  assert.ok((await res.json()).whatsappUrl);
});

test('replyLink handles phones and emails', () => {
  assert.match(replyLink('+62 812-3456-7890', 'A'), /^https:\/\/wa\.me\/6281234567890\?/);
  assert.match(replyLink('tamu@mail.com', 'A'), /^mailto:tamu@mail\.com\?/);
  assert.equal(replyLink('besok', 'A'), '');
});

test('404, robots and sitemap', async () => {
  const r = await fetch(base + '/en/nothing');
  assert.equal(r.status, 404);
  assert.match(await r.text(), /This page drifted away\./);
  assert.match(await (await fetch(base + '/robots.txt')).text(), /Disallow: \/admin/);
  assert.match(await (await fetch(base + '/sitemap.xml')).text(), /https:\/\/kalma\.test\/en/);
});
