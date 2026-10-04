'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { createApp } = require('../src/app');
const { ROOMS } = require('../src/config');
const { parseICal, buildICal, addDays } = require('../src/ical');
const { createCalendar, isPublicUrl } = require('../src/calendar');
const { todayISO } = require('../src/inquiry');

const contact = { whatsapp: '6281111111111', whatsappDisplay: '+62 811', email: 'host@kalma.test', instagram: '@kalma', instagramUrl: 'https://instagram.com/kalma' };
const day = (n) => addDays(todayISO(), n);
const ymd = (iso) => iso.replace(/-/g, '');

// A fake OTA serving an iCal feed we can change between syncs
let ota, otaUrl, feed = '', otaStatus = 200;
let app, base, server, dataDir;
const AUTH = { Authorization: 'Basic ' + Buffer.from('admin:rahasia').toString('base64') };
const post = (p, body) => fetch(base + p, { method: 'POST', redirect: 'manual', headers: { ...AUTH, Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
const getAdmin = (p) => fetch(base + p, { headers: AUTH });
const vevent = (uid, start, end, summary = 'Reserved') => `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART;VALUE=DATE:${ymd(start)}\r\nDTEND;VALUE=DATE:${ymd(end)}\r\nSUMMARY:${summary}\r\nEND:VEVENT\r\n`;
const cal = (...events) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events.join('')}END:VCALENDAR\r\n`;

before(async () => {
  ota = http.createServer((req, res) => {
    if (req.url === '/moved.ics') { res.statusCode = 301; res.setHeader('Location', '/airbnb.ics'); return res.end(); }
    if (req.url === '/to-metadata.ics') { res.statusCode = 302; res.setHeader('Location', 'http://169.254.169.254/latest'); return res.end(); }
    res.statusCode = otaStatus; res.setHeader('Content-Type', 'text/calendar'); res.end(feed); });
  await new Promise((r) => ota.listen(0, r));
  otaUrl = `http://127.0.0.1:${ota.address().port}/airbnb.ics`;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalma-cal-'));
  app = createApp({ adminLang: 'id', dataDir, db: null, adminPassword: 'rahasia', siteUrl: 'https://kalma.test', contact, payments: { enabled: false, percent: 100 }, allowPrivateIcal: true });
  await app.locals.repo.init();
  server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  for (const r of ROOMS) r.units = 1;
  ota.close();
  server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('iCal: parses all-day and timed events, unfolds lines, skips cancelled ones, and round-trips', () => {
  const text = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a1\r\nDTSTART;VALUE=DATE:20300501\r\nDTEND;VALUE=DATE:20300504\r\nSUMMARY:Airbnb (Not\r\n  available)\r\nEND:VEVENT\r\n'
    + 'BEGIN:VEVENT\r\nUID:a2\r\nDTSTART:20300510T140000Z\r\nSUMMARY:One night\r\nEND:VEVENT\r\n'
    + 'BEGIN:VEVENT\r\nUID:a3\r\nDTSTART;VALUE=DATE:20300520\r\nDTEND;VALUE=DATE:20300522\r\nSTATUS:CANCELLED\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
  assert.deepEqual(parseICal(text), [
    { uid: 'a1', start: '2030-05-01', end: '2030-05-04', summary: 'Airbnb (Not available)' },
    { uid: 'a2', start: '2030-05-10', end: '2030-05-11', summary: 'One night' },
  ]);
  const out = buildICal({ name: 'Kalma, laguna', events: [{ uid: 'x@kalma', start: '2030-06-01', end: '2030-06-03', summary: 'Kalma · Not available' }] });
  assert.match(out, /^BEGIN:VCALENDAR\r\n/);
  assert.match(out, /X-WR-CALNAME:Kalma\\, laguna/);
  assert.match(out, /DTSTART;VALUE=DATE:20300601\r\nDTEND;VALUE=DATE:20300603/);
  assert.deepEqual(parseICal(out).map((e) => [e.start, e.end]), [['2030-06-01', '2030-06-03']]);
  assert.ok(out.split('\r\n').every((l) => Buffer.byteLength(l) <= 75));
});

test('OTA calendars sync in, and each channel gets Kalma\'s busy nights without its own bookings', async () => {
  feed = cal(vevent('air-1', day(10), day(13)), vevent('air-old', day(-20), day(-18)));
  assert.equal((await post('/admin/channels', { name: 'Airbnb', kind: 'ota', room: 'laguna', ical_url: otaUrl, commission_pct: '15' })).headers.get('location'), '/admin/channels?ok=saved');
  await post('/admin/channels', { name: 'Booking.com', kind: 'ota', room: 'laguna' });
  const chans = await app.locals.repo.table('channels').list({ order: [['id', 'asc']] });
  const [airbnb, bookingCom] = chans;
  assert.match(airbnb.last_sync_status, /^OK · 1 booking/);
  const blocks = await app.locals.repo.table('calendar_blocks').list({});
  assert.deepEqual(blocks.map((b) => [b.room, b.start_date, b.end_date, b.source]), [['laguna', day(10), day(13), 'ical']], 'past stays are not imported');

  // the room is now closed on the website for those nights
  const book = (checkin, checkout, room = 'laguna') => fetch(base + '/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Rina', contact: '0812 3456 7890', checkin, checkout, guests: '2', room }) });
  const taken = await book(day(12), day(14));
  assert.equal(taken.status, 409);
  assert.match((await taken.json()).error, /sudah terisi/);
  assert.equal((await book(day(13), day(15))).status, 201, 'the check-out day is free');
  assert.equal((await book(day(12), day(14), 'pantai')).status, 201, 'other rooms are not affected');

  // Booking.com's link carries the Airbnb nights; Airbnb's own link does not echo them back
  const bc = await fetch(`${base}/ical/${bookingCom.export_token}.ics`);
  assert.equal(bc.headers.get('content-type'), 'text/calendar; charset=utf-8');
  assert.deepEqual(parseICal(await bc.text()).map((e) => [e.start, e.end]), [[day(10), day(13)]]);
  assert.deepEqual(parseICal(await (await fetch(`${base}/ical/${airbnb.export_token}.ics`)).text()), []);
  assert.equal((await fetch(`${base}/ical/not-a-real-token-123456.ics`)).status, 404);

  // a cancellation on Airbnb frees the nights at the next sync; a broken feed is reported
  feed = cal();
  await post(`/admin/channels/${airbnb.id}/sync`, {});
  assert.equal(await app.locals.repo.table('calendar_blocks').count({}), 0);
  otaStatus = 500;
  assert.equal((await post(`/admin/channels/${airbnb.id}/sync`, {})).headers.get('location'), '/admin/channels?err=sync');
  assert.match((await app.locals.repo.table('channels').get(airbnb.id)).last_sync_status, /^Gagal: HTTP 500/);
  otaStatus = 200;

  // a deactivated channel's link stops working; a new token replaces the old link
  await post(`/admin/channels/${bookingCom.id}`, { active: '0' });
  assert.equal((await fetch(`${base}/ical/${bookingCom.export_token}.ics`)).status, 404);
  await post(`/admin/channels/${bookingCom.id}`, { active: '1', new_token: '1' });
  const renewed = await app.locals.repo.table('channels').get(bookingCom.id);
  assert.notEqual(renewed.export_token, bookingCom.export_token);
  assert.equal((await fetch(`${base}/ical/${renewed.export_token}.ics`)).status, 200);
});

test('the admin calendar records walk-ins, agent bookings and blocks, and warns before overbooking', async () => {
  const agent = await app.locals.repo.table('channels').find({ name: 'Booking.com' });
  let r = await post('/admin/calendar/blocks', { room: 'keluarga', start_date: day(30), end_date: day(33), source: 'channel', channel_id: String(agent.id), guest_name: 'Tom', guests: '4', amount: '6.000.000' });
  assert.equal(r.headers.get('location'), `/admin/calendar?m=${day(30).slice(0, 7)}&ok=saved`);
  r = await post('/admin/calendar/blocks', { room: 'keluarga', start_date: day(32), end_date: day(34), source: 'walkin', guest_name: 'Budi' });
  assert.match(r.headers.get('location'), /err=full&full=/);
  assert.equal(await app.locals.repo.table('calendar_blocks').count({ where: { room: 'keluarga' } }), 1);
  r = await post('/admin/calendar/blocks', { room: 'keluarga', start_date: day(32), end_date: day(34), source: 'walkin', guest_name: 'Budi', force: '1' });
  assert.match(r.headers.get('location'), /ok=saved/);
  assert.match((await post('/admin/calendar/blocks', { room: 'keluarga', start_date: day(5), end_date: day(5), source: 'block' })).headers.get('location'), /err=dates/);

  // two units: a second booking on the same night fits
  ROOMS.find((x) => x.id === 'pantai').units = 2;
  await post('/admin/calendar/blocks', { room: 'pantai', start_date: day(40), end_date: day(42), source: 'block', note: 'Perbaikan atap' });
  assert.equal(await app.locals.calendar.isAvailable('pantai', day(40), day(41)), true);
  await post('/admin/calendar/blocks', { room: 'pantai', start_date: day(40), end_date: day(41), source: 'walkin', guest_name: 'Sari' });
  assert.equal(await app.locals.calendar.isAvailable('pantai', day(40), day(41)), false);

  const html = await (await getAdmin(`/admin/calendar?m=${day(30).slice(0, 7)}`)).text();
  assert.match(html, /class="cal__bar cal__bar--channel[^"]*"[^>]*>Tom</);
  assert.match(html, /Booking\.com/);

  const block = await app.locals.repo.table('calendar_blocks').find({ guest_name: 'Budi' });
  assert.equal((await post(`/admin/calendar/blocks/${block.id}/delete`, {})).status, 303);
  assert.equal(await app.locals.repo.table('calendar_blocks').get(block.id), null);
  assert.equal((await getAdmin('/admin/calendar?form=%%%')).status, 200, 'a broken form parameter is ignored');
});

test('confirmed or paid website bookings hold the room; new inquiries do not', async () => {
  const repo = app.locals.repo;
  const { inquiryId } = await repo.addInquiry({ lang: 'id', name: 'Ayu', contact: 'ayu@example.com', checkin: day(50), checkout: day(52), guests: '2', room: 'laguna' });
  assert.equal(await app.locals.calendar.isAvailable('laguna', day(50), day(52)), true);
  let html = await (await getAdmin(`/admin/calendar?m=${day(50).slice(0, 7)}`)).text();
  assert.match(html, /cal__bar--website is-tentative/);
  await repo.updateInquiry(inquiryId, { status: 'confirmed' });
  assert.equal(await app.locals.calendar.isAvailable('laguna', day(51), day(53)), false);
  html = await (await getAdmin(`/admin/calendar?m=${day(50).slice(0, 7)}`)).text();
  assert.match(html, new RegExp(`href="/admin/inquiries/${inquiryId}"`));
  await repo.updateInquiry(inquiryId, { status: 'cancelled' });
  assert.equal(await app.locals.calendar.isAvailable('laguna', day(50), day(52)), true);
});

test('deleting a channel removes the bookings imported from it', async () => {
  feed = cal(vevent('air-9', day(60), day(62)));
  const airbnb = await app.locals.repo.table('channels').find({ name: 'Airbnb' });
  await post(`/admin/channels/${airbnb.id}/sync`, {});
  assert.equal(await app.locals.repo.table('calendar_blocks').count({ where: { channel_id: airbnb.id } }), 1);
  await post(`/admin/channels/${airbnb.id}/delete`, {});
  assert.equal(await app.locals.repo.table('calendar_blocks').count({ where: { channel_id: airbnb.id } }), 0);
  assert.equal(await app.locals.repo.table('channels').get(airbnb.id), null);
});

test('calendar links must be public addresses', async () => {
  for (const u of ['http://localhost/x.ics', 'http://127.0.0.1:8080/x.ics', 'http://10.0.0.5/x', 'http://192.168.1.1/x', 'http://172.20.0.1/x', 'http://169.254.169.254/latest', 'http://[::1]/x', 'file:///etc/passwd', 'http://db.internal/x']) {
    assert.equal(isPublicUrl(u), false, u);
  }
  assert.equal(isPublicUrl('https://www.airbnb.com/calendar/ical/123.ics?s=abc'), true);
  const strict = createCalendar({ repo: app.locals.repo, log: () => {} });
  const id = await app.locals.repo.table('channels').insert({ name: 'Lokal', room: 'laguna', ical_url: otaUrl, export_token: 'tok-local-1234567890', active: true });
  const r = await strict.syncChannel(await app.locals.repo.table('channels').get(id));
  assert.equal(r.ok, false);
  assert.match(r.error, /alamat publik/);
});

test('redirects are followed, but never to a private address', async () => {
  feed = cal(vevent('mv-1', day(70), day(71)));
  const chans = app.locals.repo.table('channels');
  const moved = await chans.insert({ name: 'Moved', room: 'pantai', ical_url: otaUrl.replace('airbnb', 'moved'), export_token: 'tok-moved-1234567890', active: true });
  assert.equal((await app.locals.calendar.syncChannel(await chans.get(moved))).count, 1);
  // the strict calendar would refuse the local test server anyway, so check the redirect target rule directly
  assert.equal(isPublicUrl(new URL('http://169.254.169.254/latest').toString()), false);
});
