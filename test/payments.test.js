'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');
const { quote, paymentStatus, midtransTime } = require('../src/payments');
const { todayISO } = require('../src/inquiry');

const SERVER_KEY = 'SB-Mid-server-test';
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return todayISO(d); };
const contact = { whatsapp: '6281111111111', whatsappDisplay: '+62 811', email: 'host@kalma.test', instagram: '@kalma', instagramUrl: 'https://instagram.com/kalma' };
const booking = (over = {}) => ({ name: 'Rina', contact: '0812 3456 7890', checkin: addDays(10), checkout: addDays(13), guests: '2', room: 'laguna', ...over });

let midtrans, midtransUrl, lastSnap, snapFails = false;
const apps = [];

async function start(payments) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalma-pay-'));
  const app = createApp({ adminLang: 'id', dataDir, db: null, siteUrl: 'https://kalma.test', contact, payments });
  await app.locals.repo.init();
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  apps.push({ server, dataDir });
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { base, post, repo: app.locals.repo };
}

before(async () => {
  midtrans = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      lastSnap = { auth: req.headers.authorization, body: JSON.parse(body || '{}') };
      res.setHeader('Content-Type', 'application/json');
      if (snapFails) { res.statusCode = 401; return res.end(JSON.stringify({ error_messages: ['Access denied'] })); }
      res.statusCode = 201;
      res.end(JSON.stringify({ token: 'snap-token-123', redirect_url: 'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-token-123' }));
    });
  });
  await new Promise((r) => midtrans.listen(0, r));
  midtransUrl = `http://127.0.0.1:${midtrans.address().port}/snap/v1/transactions`;
});

after(() => {
  midtrans.close();
  for (const a of apps) { a.server.close(); fs.rmSync(a.dataDir, { recursive: true, force: true }); }
});

const payCfg = (over = {}) => ({
  enabled: true, provider: 'midtrans', serverKey: SERVER_KEY, clientKey: 'SB-Mid-client-test', production: false,
  percent: 100, snapUrl: midtransUrl, snapJs: 'https://app.sandbox.midtrans.com/snap/snap.js', ...over,
});

function notification(orderId, amount, status = 'settlement', extra = {}) {
  const n = { order_id: orderId, status_code: status === 'settlement' ? '200' : '201', gross_amount: amount.toFixed(2), transaction_status: status, payment_type: 'qris', settlement_time: '2026-10-04 09:30:00', ...extra };
  n.signature_key = crypto.createHash('sha512').update(n.order_id + n.status_code + n.gross_amount + SERVER_KEY).digest('hex');
  return n;
}

test('stays are priced per person per night and respect room capacity', () => {
  const q = quote(booking());
  assert.equal(q.nights, 3);
  assert.equal(q.total, 850000 * 2 * 3);
  assert.equal(q.amount, q.total);
  assert.equal(quote(booking(), 30).amount, Math.round(q.total * 0.3));
  assert.deepEqual(quote(booking({ guests: '3' })), { error: 'errCapacity', max: 2 });
  assert.equal(quote(booking({ guests: '6+' })).error, 'errGuests');
  assert.equal(quote(booking({ room: '' })).error, 'errRoom');
  assert.equal(quote(booking({ room: 'keluarga', guests: '5' })).total, 700000 * 5 * 3);
});

test('Midtrans statuses and times are mapped', () => {
  assert.equal(paymentStatus({ transaction_status: 'settlement' }), 'paid');
  assert.equal(paymentStatus({ transaction_status: 'capture', fraud_status: 'accept' }), 'paid');
  assert.equal(paymentStatus({ transaction_status: 'capture', fraud_status: 'challenge' }), 'pending');
  assert.equal(paymentStatus({ transaction_status: 'expire' }), 'expired');
  assert.equal(paymentStatus({ transaction_status: 'deny' }), 'failed');
  assert.equal(midtransTime('2026-10-04 09:30:00').toISOString(), '2026-10-04T02:30:00.000Z');
});

test('payments stay off until both Midtrans keys are set; Instagram accepts a profile URL', () => {
  assert.equal(loadConfig({}).payments.enabled, false);
  assert.equal(loadConfig({ MIDTRANS_SERVER_KEY: 'a' }).payments.enabled, false);
  const c = loadConfig({ MIDTRANS_SERVER_KEY: 'a', MIDTRANS_CLIENT_KEY: 'b', PAYMENT_DEPOSIT_PERCENT: '30' }).payments;
  assert.equal(c.enabled, true);
  assert.equal(c.percent, 30);
  assert.match(c.snapUrl, /sandbox/);
  assert.match(loadConfig({ MIDTRANS_SERVER_KEY: 'a', MIDTRANS_CLIENT_KEY: 'b', MIDTRANS_IS_PRODUCTION: 'true' }).payments.snapUrl, /^https:\/\/app\.midtrans\.com/);
  const ig = loadConfig({ INSTAGRAM_HANDLE: 'https://www.instagram.com/kalmahomestay/' }).contact;
  assert.equal(ig.instagram, '@kalmahomestay');
  assert.equal(ig.instagramUrl, 'https://instagram.com/kalmahomestay');
});

test('without payment keys a booking is saved as a request with the price', async () => {
  const { post, repo } = await start({ enabled: false, percent: 100 });
  const r = await post('/api/checkout', booking());
  assert.equal(r.status, 201);
  const body = await r.json();
  assert.equal(body.mode, 'request');
  assert.equal(body.total, 5100000);
  assert.equal(body.token, undefined);
  const saved = (await repo.listInquiries({})).items[0];
  assert.match(saved.order_id, /^KALMA-/);
  assert.equal(saved.payment_status, null, 'nothing to pay online yet');
  assert.equal(saved.total, 5100000);
  const bad = await post('/api/checkout', booking({ contact: '' }));
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /WhatsApp atau email/);
  const full = await post('/en/api/checkout', booking({ guests: '3' }));
  assert.equal((await full.json()).error, 'This room sleeps up to 2 people. Choose another room or fewer guests.');
});

test('with Midtrans keys the server prices the stay, saves the order and returns a Snap token', async () => {
  const { base, post, repo } = await start(payCfg());
  const r = await post('/api/checkout', booking({ contact: 'rina@example.com', amount: 1 }));
  assert.equal(r.status, 201);
  const body = await r.json();
  assert.equal(body.mode, 'pay');
  assert.equal(body.token, 'snap-token-123');
  assert.equal(body.amount, 5100000, 'price comes from the server, not the browser');
  assert.equal(lastSnap.auth, 'Basic ' + Buffer.from(SERVER_KEY + ':').toString('base64'));
  assert.equal(lastSnap.body.transaction_details.gross_amount, 5100000);
  assert.equal(lastSnap.body.transaction_details.order_id, body.orderId);
  assert.equal(lastSnap.body.customer_details.email, 'rina@example.com');
  const saved = await repo.getInquiryByOrder(body.orderId);
  assert.equal(saved.amount, 5100000);
  assert.equal(saved.payment_status, 'pending');
  assert.equal(saved.status, 'new');

  // the booking page hands the client key and Snap script to the browser, never the server key
  const html = await (await fetch(base + '/pesan')).text();
  assert.match(html, /SB-Mid-client-test/);
  assert.doesNotMatch(html, new RegExp(SERVER_KEY));
  assert.match(html, /Bayar sekarang/);
});

test('Midtrans notifications are verified before a booking is marked paid', async () => {
  const { post, repo } = await start(payCfg());
  const { orderId } = await (await post('/api/checkout', booking())).json();

  const forged = { ...notification(orderId, 5100000), signature_key: 'f'.repeat(128) };
  assert.equal((await post('/api/payments/midtrans', forged)).status, 403);
  assert.equal((await repo.getInquiryByOrder(orderId)).payment_status, 'pending');

  assert.equal((await post('/api/payments/midtrans', notification(orderId, 1000))).status, 400, 'amount must match the order');
  assert.equal((await post('/api/payments/midtrans', notification('KALMA-UNKNOWN', 1000))).status, 200);

  assert.equal((await post('/api/payments/midtrans', notification(orderId, 5100000))).status, 200);
  const paid = await repo.getInquiryByOrder(orderId);
  assert.equal(paid.payment_status, 'paid');
  assert.equal(paid.payment_type, 'qris');
  assert.equal(paid.status, 'confirmed');
  assert.equal(new Date(paid.paid_at).toISOString(), '2026-10-04T02:30:00.000Z');

  // the payment is booked as income in Keuangan once, even if Midtrans repeats the notification
  await post('/api/payments/midtrans', notification(orderId, 5100000));
  const income = await repo.table('transactions').list({ where: { ref_type: 'inquiry', ref_id: paid.id } });
  assert.deepEqual(income.map((t) => [t.kind, t.category, t.amount, t.method]), [['income', 'Booking website', 5100000, 'midtrans']]);
});

test('a deposit percentage charges only part of the stay', async () => {
  const { post } = await start(payCfg({ percent: 30 }));
  const body = await (await post('/api/checkout', booking())).json();
  assert.equal(body.total, 5100000);
  assert.equal(body.amount, 1530000);
  assert.equal(lastSnap.body.transaction_details.gross_amount, 1530000);
});

test('if Midtrans is unreachable the booking is kept as a request', async () => {
  const { post, repo } = await start(payCfg());
  snapFails = true;
  try {
    const body = await (await post('/api/checkout', booking())).json();
    assert.equal(body.mode, 'request');
    assert.match(body.doneUrl, /^\/pesan\/selesai\?order=KALMA-/);
    const saved = (await repo.listInquiries({})).items[0];
    assert.equal(saved.payment_status, 'failed');
  } finally {
    snapFails = false;
  }
});

test('old /?book=<room> links open the booking page with that room', async () => {
  const { base } = await start({ enabled: false, percent: 100 });
  const r = await fetch(base + '/?book=pantai', { redirect: 'manual' });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/en/book?room=pantai');
  assert.equal((await fetch(base + '/id?book=x', { redirect: 'manual' })).headers.get('location'), '/pesan');
  const page = await (await fetch(base + '/pesan?room=pantai')).text();
  assert.match(page, /<input type="radio" name="room" value="pantai" checked>/);
  const plain = await (await fetch(base + '/id')).text();
  assert.doesNotMatch(plain, /<dialog class="checkout"/, 'the booking dialog is gone');
  assert.doesNotMatch(plain, /class="wa-float"/, 'no floating WhatsApp button');
});

test('social links only accept http(s) URLs and render as bubbles beside guest stories', async () => {
  const c = loadConfig({ FACEBOOK_URL: 'https://facebook.com/kalma', TIKTOK_URL: 'javascript:alert(1)' }).contact;
  assert.equal(c.facebookUrl, 'https://facebook.com/kalma');
  assert.equal(c.tiktokUrl, '');
  assert.equal(c.googleUrl, '');
  const { base } = await start({ enabled: false, percent: 100 });
  const html = await (await fetch(base + '/id')).text();
  assert.match(html, /<a class="soc soc--instagram" href="https:\/\/instagram\.com\/kalma"/);
  for (const k of ['google', 'facebook', 'tiktok']) assert.match(html, new RegExp(`<span class="soc soc--${k}" aria-hidden="true">`));
});
