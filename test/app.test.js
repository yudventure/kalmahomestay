'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp, photoFinder, videoFinder } = require('../src/app');
const { todayISO, replyLink } = require('../src/inquiry');

let server, base, dataDir, repo;

function addDays(n) {
  const d = new Date(); d.setDate(d.getDate() + n); return todayISO(d);
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalma-test-'));
  const app = createApp({
    dataDir, db: null, adminPassword: 'rahasia', googleVerification: 'abc123verify',
    siteUrl: 'https://kalma.test',
    contact: { whatsapp: '6281111111111', whatsappDisplay: '+62 811', email: 'host@kalma.test', instagram: '@kalma', instagramUrl: 'https://instagram.com/kalma' },
  });
  repo = app.locals.repo;
  await repo.init();
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
  assert.match(html, /Bangun dengan suara <em>ombak<\/em>\./);
  assert.match(html, /Rp 850\.000/);
  assert.match(html, /wa\.me\/6281111111111/);
  assert.match(html, /<link rel="canonical" href="https:\/\/kalma\.test\/">/);
  assert.doesNotMatch(html, /<%|t\('/, 'no unrendered template tags');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});

test('English page renders at /en', async () => {
  const html = await (await fetch(base + '/en')).text();
  assert.match(html, /<html lang="en">/);
  assert.match(html, /Wake up to the sound of <em>waves<\/em>\./);
  assert.match(html, /Lagoon Bungalow/);
  assert.match(html, /href="\/en" hreflang="en" lang="en" aria-current="page"/);
});

test('homepage shows the guest-story invite when there are no reviews yet', async () => {
  const html = await (await fetch(base + '/')).text();
  assert.match(html, /class="quote__empty"/);
  assert.doesNotMatch(html, /class="quote__item"/);
});

test('photo slots use real photos from the image folder when present', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalma-img-'));
  fs.writeFileSync(path.join(dir, 'hero-1.jpg'), '');
  fs.writeFileSync(path.join(dir, 'room-laguna.webp'), '');
  fs.writeFileSync(path.join(dir, 'bad name.jpg'), '');
  const photo = photoFinder(dir);
  assert.equal(photo('hero-1'), '--img:url(/img/hero-1.jpg)');
  assert.equal(photo('room-laguna'), '--img:url(/img/room-laguna.webp)');
  assert.equal(photo('hero-2'), '');
  assert.equal(photoFinder(path.join(dir, 'missing'))('hero-1'), '');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('video slots pair mp4 and webm files by name', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalma-vid-'));
  for (const f of ['hero-1.mp4', 'hero-1.webm', 'hero-2.MP4', 'notes.txt']) fs.writeFileSync(path.join(dir, f), '');
  const video = videoFinder(dir);
  assert.deepEqual(video('hero-1'), { mp4: '/video/hero-1.mp4', webm: '/video/hero-1.webm' });
  assert.deepEqual(video('hero-2'), { mp4: '/video/hero-2.MP4' });
  assert.equal(video('hero-3'), null);
  assert.equal(videoFinder(path.join(dir, 'missing'))('hero-1'), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('hero tiles play the bundled clips over their poster photos, and assets are versioned', async () => {
  const html = await (await fetch(base + '/')).text();
  for (let i = 1; i <= 4; i++) {
    assert.match(html, new RegExp(`--img:url\\(/img/hero-${i}\\.jpg\\)`));
    assert.match(html, new RegExp(`<video class="tile__video"[^>]*preload="none"[^>]*data-mp4="/video/hero-${i}\\.mp4"`));
  }
  assert.equal((await fetch(base + '/video/hero-1.mp4')).headers.get('content-type'), 'video/mp4');
  assert.match(html, /href="\/css\/home\.css\?v=[a-z0-9]+"/);
  assert.match(html, /src="\/js\/main\.js\?v=[a-z0-9]+"/);
});

test('static assets and brand files are served, guideline sources are not', async () => {
  assert.equal((await fetch(base + '/css/style.css')).status, 200);
  assert.equal((await fetch(base + '/css/home.css')).status, 200);
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

  const saved = (await repo.listInquiries({})).items[0];
  assert.equal(saved.name, 'Rina');
  assert.equal(saved.room, 'pantai');
  assert.equal(saved.phone, '6281234567890');
  assert.equal(saved.message, 'Vegetarian');
});

test('unknown room and guest values are normalized', async () => {
  const r = await post('/api/inquiry', { ...valid(), room: 'presidential', guests: '99' });
  assert.equal(r.status, 201);
  const text = decodeURIComponent((await r.json()).whatsappUrl.split('text=')[1]);
  assert.match(text, /Tamu: 2/);
  assert.match(text, /Kamar: bebas/);
});

test('honeypot submissions are accepted silently but not stored', async () => {
  const before = (await repo.listInquiries({})).total;
  const r = await post('/api/inquiry', { ...valid(), website: 'http://spam' });
  assert.equal(r.status, 200);
  assert.equal((await repo.listInquiries({})).total, before);
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

const AUTH = 'Basic ' + Buffer.from('admin:rahasia').toString('base64');
const adminGet = (p) => fetch(base + p, { headers: { Authorization: AUTH } });
const adminPost = (p, body, origin = base) => fetch(base + p, {
  method: 'POST', redirect: 'manual',
  headers: { Authorization: AUTH, 'Content-Type': 'application/x-www-form-urlencoded', ...(origin ? { Origin: origin } : {}) },
  body: new URLSearchParams(body),
});

test('admin requires the password', async () => {
  assert.equal((await fetch(base + '/admin')).status, 401);
  const bad = 'Basic ' + Buffer.from('admin:salah').toString('base64');
  assert.equal((await fetch(base + '/admin', { headers: { Authorization: bad } })).status, 401);
  assert.equal((await fetch(base + '/admin/export/customers.csv')).status, 401);
  const r = await adminGet('/admin');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.match(await r.text(), /Permintaan baru/);
});

test('admin lists inquiries and customers, with search and status filter', async () => {
  let html = await (await adminGet('/admin/inquiries')).text();
  assert.match(html, /Rina/);
  html = await (await adminGet('/admin/inquiries?status=confirmed')).text();
  assert.match(html, /Tidak ada permintaan yang cocok/);
  html = await (await adminGet('/admin/customers?q=rina')).text();
  assert.match(html, /\+6281234567890/);
});

test('admin updates inquiry status and notes (same-origin only)', async () => {
  const { id } = (await repo.listInquiries({})).items[0];
  assert.equal((await adminPost(`/admin/inquiries/${id}`, { status: 'confirmed' }, 'https://evil.example')).status, 403);
  assert.equal((await adminPost(`/admin/inquiries/${id}`, { status: 'confirmed' }, null)).status, 403);
  // behind a proxy the Host header may differ; the public SITE_URL origin is accepted
  assert.equal((await adminPost(`/admin/inquiries/${id}`, { status: 'contacted' }, 'https://kalma.test')).status, 303);
  const r = await adminPost(`/admin/inquiries/${id}`, { status: 'confirmed', admin_note: 'DP diterima' });
  assert.equal(r.status, 303);
  const it = await repo.getInquiry(id);
  assert.equal(it.status, 'confirmed');
  assert.equal(it.admin_note, 'DP diterima');
  const page = await (await adminGet(`/admin/inquiries/${id}`)).text();
  assert.match(page, /DP diterima/);
  assert.match(page, /wa\.me\/6281234567890/, 'reply link to the guest');
});

test('admin edits a customer and shows validation errors', async () => {
  const c = (await repo.listCustomers({ q: 'Rina' })).items[0];
  let r = await adminPost(`/admin/customers/${c.id}`, { name: '', phone: '' });
  assert.equal(r.status, 400);
  assert.match(await r.text(), /Nama wajib diisi/);
  r = await adminPost(`/admin/customers/${c.id}`, { name: 'Rina', email: 'bukan-email' });
  assert.equal(r.status, 400);
  r = await adminPost(`/admin/customers/${c.id}`, { name: 'Rina Putri', phone: '0812 3456 7890', email: 'rina@mail.com', notes: 'Tamu langganan' });
  assert.equal(r.status, 303);
  const fresh = await repo.getCustomer(c.id);
  assert.equal(fresh.name, 'Rina Putri');
  assert.equal(fresh.notes, 'Tamu langganan');
  assert.equal((await adminGet('/admin/customers/999999')).status, 404);
  assert.equal((await adminGet('/admin/customers/abc')).status, 404);
});

test('admin CSV exports are escaped against formula injection', async () => {
  await post('/api/inquiry', { ...valid(), name: '=HYPERLINK("x")', contact: 'evil@example.com' });
  const r = await adminGet('/admin/export/customers.csv');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/csv/);
  assert.match(r.headers.get('content-disposition'), /kalma-customers-/);
  const bytes = Buffer.from(await r.arrayBuffer());
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'UTF-8 BOM so Excel reads accents correctly');
  const csv = bytes.subarray(3).toString('utf8');
  assert.match(csv, /^id,name,phone/);
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  assert.match(await (await adminGet('/admin/export/inquiries.csv')).text(), /Rumah Pantai|Bungalow Laguna/);
});

test('admin deletes a customer with all their inquiries', async () => {
  const c = (await repo.listCustomers({ q: 'evil@' })).items[0];
  const r = await adminPost(`/admin/customers/${c.id}/delete`, {});
  assert.equal(r.status, 303);
  assert.equal(await repo.getCustomer(c.id), null);
  assert.equal((await repo.listInquiries({ q: 'evil@' })).total, 0);
});

test('admin is disabled when no password is configured', async () => {
  const app = createApp({ dataDir, db: null, adminPassword: '' });
  const s = await new Promise((r) => { const x = app.listen(0, () => r(x)); });
  const res = await fetch(`http://127.0.0.1:${s.address().port}/admin`);
  s.close();
  assert.equal(res.status, 404);
});

test('inquiry still works when saving fails', async () => {
  const blocker = path.join(dataDir, 'not-a-dir');
  fs.writeFileSync(blocker, 'x'); // a file where a directory is expected → mkdir/append fails
  const app = createApp({ dataDir: path.join(blocker, 'sub'), db: null });
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

const surveyPost = (p, body) => fetch(base + p, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });

test('survey pages render in both languages, noindex', async () => {
  const en = await (await fetch(base + '/en/survey')).text();
  assert.match(en, /Help us make Raja Ampat easier to visit/);
  assert.match(en, /most frustrating part of a trip to Raja Ampat/);
  assert.match(en, /<meta name="robots" content="noindex, follow">/);
  const id = await (await fetch(base + '/survey')).text();
  assert.match(id, /paling bikin repot/);
  assert.match(await (await fetch(base + '/')).text(), /href="\/survey"/, 'homepage footer links to the survey');
});

test('survey requires q1 and q8, keeps answers on error', async () => {
  const r = await surveyPost('/en/survey', 'q1=planning&q4=diving&q8=');
  assert.equal(r.status, 400);
  const html = await r.text();
  assert.match(html, /Please answer the questions marked \*/);
  assert.match(html, /value="planning" checked/);
  assert.match(html, /value="diving" checked/);
});

test('survey saves valid answers, caps multi choices, ignores unknown values', async () => {
  const body = new URLSearchParams();
  body.append('q1', 'yes_once'); body.append('q2', 'Australia');
  ['diving', 'snorkeling', 'views', 'hacked'].forEach((v) => body.append('q4', v)); // max 2
  ['cash', 'signal', 'nope'].forEach((v) => body.append('q9', v));
  body.append('q8', 'The ferry schedule was confusing');
  body.append('q15', 'bogus');
  body.append('q23', 'tom@mail.com');
  const r = await surveyPost('/en/survey', body);
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('location'), '/en/survey?thanks=1');
  assert.match(await (await fetch(base + '/en/survey?thanks=1')).text(), /Thank you so much!/);
  const [saved] = await repo.allSurveyResponses();
  assert.deepEqual(saved.answers, { q1: 'yes_once', q2: 'Australia', q4: ['diving', 'snorkeling'], q8: 'The ferry schedule was confusing', q9: ['cash', 'signal'] });
  assert.equal(saved.contact, 'tom@mail.com');
  assert.equal(saved.lang, 'en');
});

test('survey honeypot is not stored', async () => {
  const before = (await repo.allSurveyResponses()).length;
  const r = await surveyPost('/survey', 'q1=curious&q8=spam&website=x');
  assert.equal(r.status, 303);
  assert.equal((await repo.allSurveyResponses()).length, before);
});

test('admin survey summary, single response, CSV and delete', async () => {
  let html = await (await adminGet('/admin/survey')).text();
  assert.match(html, /Survei tamu/);
  assert.match(html, /The ferry schedule was confusing/);
  assert.match(html, /Hanya tunai \/ tidak ada ATM/);
  const [r] = await repo.allSurveyResponses();
  html = await (await adminGet(`/admin/survey/${r.id}`)).text();
  assert.match(html, /tom@mail\.com/);
  const csv = Buffer.from(await (await adminGet('/admin/export/survey.csv')).arrayBuffer()).subarray(3).toString('utf8');
  assert.match(csv, /^id,created_at,lang,contact,q1,q2,q3,q4/);
  assert.match(csv, /Diving; Snorkeling/);
  assert.equal((await adminPost(`/admin/survey/${r.id}/delete`, {}, 'https://evil.example')).status, 403);
  assert.equal((await adminPost(`/admin/survey/${r.id}/delete`, {})).status, 303);
  assert.equal((await repo.allSurveyResponses()).find((x) => x.id === r.id), undefined);
});

test('sitemap has hreflang alternates and lastmod; verification meta is rendered', async () => {
  const xml = await (await fetch(base + '/sitemap.xml')).text();
  assert.match(xml, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
  assert.equal((xml.match(/<url>/g) || []).length, 2);
  assert.match(xml, /<loc>https:\/\/kalma\.test\/en<\/loc><lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  assert.match(xml, /hreflang="x-default" href="https:\/\/kalma\.test\/"/);
  assert.doesNotMatch(xml, /survey|admin/);
  assert.match(await (await fetch(base + '/')).text(), /<meta name="google-site-verification" content="abc123verify">/);
});

test('health check reports storage', async () => {
  const r = await fetch(base + '/healthz');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, storage: 'file', db: 'ok' });
});

test('health check reports a database problem without taking the site down', async () => {
  const app = createApp({ dataDir, db: null });
  app.locals.dbStatus.ready = false;
  app.locals.dbStatus.error = 'DB_USER atau DB_PASSWORD salah';
  const s = await new Promise((r) => { const x = app.listen(0, () => r(x)); });
  const b = `http://127.0.0.1:${s.address().port}`;
  const h = await fetch(b + '/healthz');
  const home = await fetch(b + '/');
  s.close();
  assert.equal(h.status, 503);
  assert.deepEqual(await h.json(), { ok: false, storage: 'file', db: 'error', hint: 'DB_USER atau DB_PASSWORD salah' });
  assert.equal(home.status, 200);
});

test('404, robots and sitemap', async () => {
  const r = await fetch(base + '/en/nothing');
  assert.equal(r.status, 404);
  assert.match(await r.text(), /This page drifted away\./);
  assert.match(await (await fetch(base + '/robots.txt')).text(), /Disallow: \/admin/);
  assert.equal(await (await fetch(base + '/google32888c7e38348c1f.html')).text(), 'google-site-verification: google32888c7e38348c1f.html');
  assert.match(await (await fetch(base + '/sitemap.xml')).text(), /https:\/\/kalma\.test\/en/);
});
