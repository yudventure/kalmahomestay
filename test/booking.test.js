'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../src/app');
const { todayISO } = require('../src/inquiry');
const { DEFAULTS } = require('../src/activities');

const contact = { whatsapp: '6281111111111', whatsappDisplay: '+62 811', email: 'host@kalma.test', instagram: '@kalma', instagramUrl: 'https://instagram.com/kalma' };
const AUTH = { Authorization: 'Basic ' + Buffer.from('admin:rahasia').toString('base64') };
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]), Buffer.alloc(200, 1)]);
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return todayISO(d); };
let app, base, server, dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalma-book-'));
  app = createApp({ dataDir, db: null, adminPassword: 'rahasia', siteUrl: 'https://kalma.test', contact, payments: { enabled: false, percent: 100 } });
  await app.locals.repo.init();
  await app.locals.activities.seed();
  server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

const json = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const form = (p, body, headers = AUTH) => fetch(base + p, { method: 'POST', redirect: 'manual', headers: { ...headers, Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
const page = async (p) => (await fetch(base + p)).text();
const guest = { name: 'Dewi', email: 'dewi@mail.com', phone: '+62 813 1111 2222', agree: '1' };

test('the first diving and trip list is written once and every text follows the house style', async () => {
  const rows = await app.locals.activities.list();
  assert.equal(rows.length, DEFAULTS.length);
  assert.equal(await app.locals.activities.seed(), false, 'never seeded twice');
  for (const a of DEFAULTS) {
    for (const [k, v] of Object.entries(a)) {
      if (typeof v !== 'string') continue;
      assert.doesNotMatch(v, /[—–;]/, `${a.slug}.${k} has no dashes or semicolons`);
      assert.doesNotMatch(v.replace(/\d{2}[.:]\d{2}/g, ''), /\w:\s/, `${a.slug}.${k} has no colon inside a sentence`);
    }
  }
  assert.ok(DEFAULTS.every((a) => a.price === null || a.price === 0), 'prices are left for the owner to fill in');
  // fits the MySQL columns (migrations/009_activities.sql)
  const MAX = { slug: 80, title_id: 160, title_en: 160, duration: 40, duration_en: 40, start_time: 40, category: 12, level: 12 };
  for (const a of DEFAULTS) for (const [k, n] of Object.entries(MAX)) assert.ok(String(a[k] || '').length <= n, `${a.slug}.${k} fits ${n} characters`);
});

test('each service card opens its own detail page with a matching button', async () => {
  const home = await page('/id');
  assert.match(home, /href="\/layanan\/homestay" class="btn btn--cta btn--sm">Lihat detail homestay</);
  assert.match(home, /href="\/layanan\/diving-snorkeling" class="btn btn--light btn--sm">Lihat pilihan diving (&amp;|&) snorkeling</);
  assert.match(home, /href="\/layanan\/trip" class="btn btn--light btn--sm">Lihat semua trip</);
  assert.match(await page('/'), /href="\/en\/services\/trips"/);

  const stay = await page('/layanan/homestay');
  assert.match(stay, /<h1>Homestay<\/h1>/);
  assert.equal((stay.match(/class="room-card"/g) || []).length, 3);
  assert.match(stay, /href="\/pesan\?room=laguna">Pesan kamar ini</);

  const dive = await page('/layanan/diving-snorkeling');
  assert.match(dive, /Trip snorkeling Arborek &amp; Manta Sandy/);
  assert.match(dive, /<h3>Sudah termasuk<\/h3>/);
  assert.match(dive, /<h3>Yang perlu dibawa<\/h3>/);
  assert.match(dive, /Gratis untuk tamu/, 'house reef snorkeling is free');
  assert.match(dive, /href="\/pesan\?trip=snorkeling-arborek-manta">Pesan &amp; minta harga</);
  assert.doesNotMatch(dive, /\?trip=snorkeling-house-reef/, 'free activities need no booking');
  const trips = await page('/en/services/trips');
  assert.match(trips, /Island hopping to Piaynemo &amp; Telaga Bintang/);
  assert.match(trips, /href="\/layanan\/trip" hreflang="id"/);
  assert.equal((await fetch(base + '/layanan/nope')).status, 404);
});

test('the footer shows the WhatsApp logo, no survey and no floating button; dates use the Kalma calendar', async () => {
  const home = await page('/id');
  assert.match(home, /aria-label="WhatsApp" class="foot__wa"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="fill" d="M20\.52 3\.48/);
  assert.doesNotMatch(home, /survey|wa-float/);
  assert.match(home, /<form class="search" id="quick" method="get" action="\/pesan">/);
  assert.match(home, /<input id="q-in" type="date" name="checkin" data-dp="range" data-dp-end="q-out">/);
  assert.match(home, /src="\/js\/datepicker\.js\?v=/);
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'datepicker.css'), 'utf8');
  assert.doesNotMatch(css, /prefers-reduced-motion/);
});

test('availability lists the nights each room is full', async () => {
  const { inquiryId } = await app.locals.repo.addInquiry({ lang: 'id', name: 'Ayu', contact: 'ayu@mail.com', checkin: day(30), checkout: day(32), guests: '2', room: 'laguna' });
  await app.locals.repo.updateInquiry(inquiryId, { status: 'confirmed' });
  app.locals.clearAvailability();
  const data = await (await fetch(base + '/api/availability')).json();
  assert.deepEqual(data.rooms.laguna, [day(30), day(31)]);
  assert.deepEqual(data.rooms.pantai, []);
  const r = await json('/api/checkout', { ...guest, room: 'laguna', checkin: day(31), checkout: day(33), guests: '2' });
  assert.equal(r.status, 409);
});

test('the booking page has three steps, a room choice and a summary', async () => {
  const html = await page(`/pesan?room=keluarga&checkin=${day(5)}&checkout=${day(8)}&guests=4`);
  assert.match(html, /<h1>Pesan homestay<\/h1>/);
  assert.match(html, /<li class="is-on" data-step="1"><span>1<\/span>Pilih tanggal<\/li>/);
  assert.match(html, /<input type="radio" name="room" value="keluarga" checked>/);
  assert.match(html, new RegExp(`name="checkin" value="${day(5)}" data-dp="range"`));
  assert.match(html, /<input name="guests" id="bk-guests" inputmode="numeric" value="4"/);
  assert.match(html, /<div class="bk-cal" data-dp-inline data-for="bk-in"><\/div>/);
  assert.match(html, /Pembayaran online sedang disiapkan\./, 'tells the guest what happens without Midtrans keys');
  assert.match(html, /Kirim pesanan/);
  assert.doesNotMatch(html, /wa\.me\/[^"]*\?text=/, 'no WhatsApp booking detour');
  assert.match(await page('/en/book?trip=burung-cendrawasih'), /<h1>Book an activity<\/h1>[^]*Bird of paradise watching/);
});

test('activities can be booked: without a price as a request, with a price paid online', async () => {
  let r = await json('/api/checkout', { ...guest, trip: 'kayak-senja', date: day(4), people: '2' });
  let body = await r.json();
  assert.equal(r.status, 201);
  assert.equal(body.mode, 'request');
  let saved = await app.locals.repo.getInquiryByOrder(body.orderId);
  assert.deepEqual([saved.item, saved.room, saved.checkin, saved.guests, saved.total], ['Kayak senja menyusuri pantai', null, day(4), '2', null]);
  assert.match(await page(body.doneUrl), /Kayak senja menyusuri pantai/);

  // the owner sets a price in the admin
  const kayak = await app.locals.activities.find({ slug: 'kayak-senja' });
  await app.locals.activities.update(kayak.id, { price: 250000 });
  r = await json('/en/api/checkout', { ...guest, trip: 'kayak-senja', date: day(4), people: '3' });
  body = await r.json();
  assert.equal(body.total, 750000);
  saved = await app.locals.repo.getInquiryByOrder(body.orderId);
  assert.equal(saved.total, 750000);

  assert.match((await (await json('/api/checkout', { ...guest, trip: 'kayak-senja', date: day(4), people: '9' })).json()).error, /1 sampai 6 orang/);
  assert.equal((await json('/api/checkout', { ...guest, trip: 'snorkeling-house-reef', date: day(4), people: '1' })).status, 400, 'free activity');
  assert.equal((await json('/api/checkout', { ...guest, trip: 'kayak-senja', date: day(-1), people: '2' })).status, 400);
  const admin = await (await fetch(base + '/admin/inquiries', { headers: AUTH })).text();
  assert.match(admin, /Kayak senja menyusuri pantai/);
});

test('staff manage activities in the admin, with a photo upload button', async () => {
  const list = await (await fetch(base + '/admin/website/activities', { headers: AUTH })).text();
  assert.match(list, /Aktivitas &amp; trip/);
  assert.match(list, /Fun dive Cape Kri &amp; Sardine Reef/);
  assert.match(list, /href="\/admin\/website\/activities"[^>]*>Aktivitas &amp; trip</, 'menu entry');
  assert.doesNotMatch(list, /Survei tamu/, 'survey is out of the menu');

  let r = await form('/admin/website/activities', { category: 'trip', title_id: '', price_kind: 'minta' });
  assert.equal(r.status, 400);
  assert.match(await r.text(), /Judul \(Indonesia\) wajib diisi/);
  r = await form('/admin/website/activities', {
    category: 'trip', title_id: 'Mancing & bakar ikan', title_en: 'Fishing & grill', price_kind: 'per_orang', price: '300.000',
    min_people: '2', max_people: '5', level: 'mudah', duration: '4 jam', duration_en: '4 hours', summary_id: 'Memancing bersama nelayan.', active: '1',
    includes_id: 'Perahu\nAlat pancing', sort: '9',
  });
  assert.equal(r.status, 303);
  const id = Number(r.headers.get('location').match(/activities\/(\d+)/)[1]);
  const row = await app.locals.activities.get(id);
  assert.deepEqual([row.slug, row.price, row.min_people, row.max_people, row.active], ['mancing-dan-bakar-ikan', 300000, 2, 5, true]);
  const trips = await page('/layanan/trip');
  assert.match(trips, /id="mancing-dan-bakar-ikan"/);
  assert.match(trips, /Rp 300\.000/);
  assert.match(trips, /href="\/pesan\?trip=mancing-dan-bakar-ikan">Pesan sekarang</);

  // photo through the upload button
  const edit = await (await fetch(base + `/admin/website/activities/${id}`, { headers: AUTH })).text();
  assert.match(edit, new RegExp(`action="/admin/website/activities/${id}/photo"[^>]*enctype="multipart/form-data"`));
  const fd = new FormData();
  fd.append('file', new Blob([JPG]), 'mancing.jpg');
  r = await fetch(base + `/admin/website/activities/${id}/photo`, { method: 'POST', body: fd, redirect: 'manual', headers: { ...AUTH, Origin: base } });
  assert.match(r.headers.get('location'), /ok=uploaded/);
  const url = app.locals.media.activityUrl(id);
  assert.match(url, /^\/media\/[a-f0-9]{24}\.jpg$/);
  assert.equal((await fetch(base + url)).status, 200);
  assert.match(await page('/layanan/trip'), new RegExp(`--img:url\\(${url}\\)`));

  // hide, then delete (photo goes too)
  await form(`/admin/website/activities/${id}`, { category: 'trip', title_id: 'Mancing & bakar ikan', price_kind: 'gratis' });
  assert.doesNotMatch(await page('/layanan/trip'), /mancing-dan-bakar-ikan/, 'unticked = hidden');
  await form(`/admin/website/activities/${id}/delete`, {});
  assert.equal(await app.locals.activities.get(id), null);
  assert.equal((await fetch(base + url)).status, 404);
});
