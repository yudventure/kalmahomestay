'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../src/app');
const { ROOMS } = require('../src/config');
const { todayISO } = require('../src/inquiry');

const contact = { whatsapp: '6281111111111', whatsappDisplay: '+62 811', email: 'host@kalma.test', instagram: '@kalma', instagramUrl: 'https://instagram.com/kalma' };
let base, server, dataDir, app;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalma-cms-'));
  app = createApp({ adminLang: 'id', dataDir, db: null, adminPassword: 'rahasia', siteUrl: 'https://kalma.test', contact, payments: { enabled: false, percent: 100 } });
  await app.locals.repo.init();
  await app.locals.site.load();
  server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  // leave shared rooms/content as they were for other tests in this process
  await app.locals.site.save('rooms', {});
  await app.locals.site.save('content', { id: {}, en: {} });
  server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function login(username, password) {
  const r = await fetch(base + '/admin/login', {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: base },
    body: new URLSearchParams({ username, password, next: '/admin' }),
  });
  if (r.status !== 303) return null;
  return r.headers.get('set-cookie').split(';')[0];
}
const get = (cookie, p) => fetch(base + p, { headers: { Cookie: cookie }, redirect: 'manual' });
const post = (cookie, p, body) => fetch(base + p, {
  method: 'POST', redirect: 'manual',
  headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded', Origin: base },
  body: new URLSearchParams(body),
});

test('the owner logs in with ADMIN_PASSWORD and gets every menu', async () => {
  const page = await (await fetch(base + '/admin/login')).text();
  assert.match(page, /Masuk ke admin/);
  assert.equal(await login('admin', 'salah'), null);
  const owner = await login('admin', 'rahasia');
  assert.match(owner, /^kalma_admin=/);
  const html = await (await get(owner, '/admin')).text();
  for (const label of ['Permintaan &amp; booking', 'Teks website', 'Kamar &amp; harga', 'Pengguna &amp; peran']) assert.match(html, new RegExp(label));

  // only same-site paths are accepted after login
  const r = await fetch(base + '/admin/login', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: base },
    body: new URLSearchParams({ username: 'admin', password: 'rahasia', next: 'https://evil.example/' }) });
  assert.equal(r.headers.get('location'), '/admin');

  // logging out clears the cookie
  const out = await post(owner, '/admin/logout', {});
  assert.match(out.headers.get('set-cookie'), /kalma_admin=;/);
});

test('staff accounts see only the menus of their role; deactivating or a new password ends their session', async () => {
  const owner = await login('admin', 'rahasia');
  assert.equal((await post(owner, '/admin/users', { name: 'Sari', username: 'sari', role: 'hrd', password: 'short' })).status, 400);
  assert.equal((await post(owner, '/admin/users', { name: 'Sari', username: 'admin', role: 'hrd', password: 'panjang123' })).status, 400);
  assert.equal((await post(owner, '/admin/users', { name: 'Sari', username: 'sari', role: 'hrd', password: 'panjang123' })).status, 303);
  assert.equal((await post(owner, '/admin/users', { name: 'Sari 2', username: 'sari', role: 'hrd', password: 'panjang123' })).status, 400, 'username taken');

  let sari = await login('sari', 'panjang123');
  assert.ok(sari);
  let html = await (await get(sari, '/admin')).text();
  assert.doesNotMatch(html, /Permintaan &amp; booking|Teks website|Pengguna &amp; peran/);
  for (const p of ['/admin/inquiries', '/admin/customers', '/admin/website/contact', '/admin/users', '/admin/instagram', '/admin/export/customers.csv']) {
    assert.equal((await get(sari, p)).status, 403, p);
  }
  assert.equal((await post(sari, '/admin/users', { name: 'X', username: 'xx1', role: 'owner', password: 'panjang123' })).status, 403);

  // a role change applies on the next page
  const { id } = (await app.locals.repo.table('staff_users').find({ username: 'sari' }));
  await post(owner, `/admin/users/${id}`, { role: 'reservation', active: '1' });
  assert.equal((await get(sari, '/admin/inquiries')).status, 200);

  // deactivated → back to the login page
  await post(owner, `/admin/users/${id}`, { role: 'reservation', active: '0' });
  assert.equal((await get(sari, '/admin')).headers.get('location'), '/admin/login?next=%2Fadmin');
  assert.equal(await login('sari', 'panjang123'), null);

  // a password reset by the owner ends old sessions
  await post(owner, `/admin/users/${id}`, { active: '1' });
  sari = await login('sari', 'panjang123');
  await post(owner, `/admin/users/${id}`, { password: 'baru-sekali-1' });
  assert.equal((await get(sari, '/admin')).status, 303);
  sari = await login('sari', 'baru-sekali-1');
  assert.ok(sari);

  // staff change their own password
  assert.equal((await post(sari, '/admin/account', { current_password: 'salah', new_password: 'lagi-baru-12', confirm_password: 'lagi-baru-12' })).status, 400);
  assert.equal((await post(sari, '/admin/account', { current_password: 'baru-sekali-1', new_password: 'lagi-baru-12', confirm_password: 'lagi-baru-12' })).status, 303);
  assert.ok(await login('sari', 'lagi-baru-12'));
});

test('website settings change contacts, prices, partners and texts on the live site', async () => {
  const owner = await login('admin', 'rahasia');

  await post(owner, '/admin/website/contact', { whatsapp: '62 812 9999 0000', email: 'halo@kalma.id', instagram: 'https://www.instagram.com/kalma.baru/', facebookUrl: 'https://facebook.com/kalma', tiktokUrl: 'javascript:alert(1)' });
  let html = await (await fetch(base + '/id')).text();
  assert.match(html, /wa\.me\/6281299990000/);
  assert.match(html, /href="https:\/\/instagram\.com\/kalma\.baru"/);
  assert.match(html, /<a class="soc soc--facebook" href="https:\/\/facebook\.com\/kalma"/);
  assert.match(html, /<span class="soc soc--tiktok"/);
  assert.equal((await post(owner, '/admin/website/contact', { whatsapp: '123' })).headers.get('location'), '/admin/website/contact?err=whatsapp');

  await post(owner, '/admin/website/rooms', { laguna_price: '900.000', laguna_maxGuests: '3', laguna_units: '2', pantai_price: '', keluarga_price: 'abc' });
  const laguna = ROOMS.find((r) => r.id === 'laguna');
  assert.deepEqual([laguna.price, laguna.maxGuests, laguna.units], [900000, 3, 2]);
  assert.equal(ROOMS.find((r) => r.id === 'pantai').price, 750000, 'empty keeps the default');
  const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return todayISO(x); };
  const quote = await (await fetch(base + '/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Rina', contact: '0812 3456 7890', checkin: d(10), checkout: d(12), guests: '3', room: 'laguna' }) })).json();
  assert.equal(quote.total, 900000 * 3 * 2, 'new price and capacity are used for bookings');

  await post(owner, '/admin/website/partners', { partners: 'Raja Ampat Dive\n\nWaigeo Trips\n' });
  html = await (await fetch(base + '/id')).text();
  assert.match(html, /Raja Ampat Dive/);
  assert.match(html, /Waigeo Trips/);

  const page = await (await get(owner, '/admin/website/content?s=hero')).text();
  assert.match(page, /name="id__hero\.title"/);
  await post(owner, '/admin/website/content', { section: 'hero', 'id__hero.title': 'Selamat datang di <em>Kalma</em>', 'en__hero.title': '' });
  assert.match(await (await fetch(base + '/id')).text(), /Selamat datang di <em>Kalma<\/em>/);
  assert.doesNotMatch(await (await fetch(base + '/')).text(), /Selamat datang/, 'empty English keeps the default');

  // settings survive a restart
  const again = createApp({ adminLang: 'id', dataDir, db: null, adminPassword: 'rahasia', contact, payments: { enabled: false, percent: 100 } });
  await again.locals.repo.init();
  await again.locals.site.load();
  assert.equal(again.locals.site.settings.contact.email, 'halo@kalma.id');
  assert.deepEqual(again.locals.site.partners(), ['Raja Ampat Dive', 'Waigeo Trips']);

  await post(owner, '/admin/website/content', { section: 'hero', 'id__hero.title': '' });
  assert.doesNotMatch(await (await fetch(base + '/id')).text(), /Selamat datang di/);
});

test('repeated wrong passwords are slowed down', async () => {
  for (let i = 0; i < 10; i += 1) await login('admin', 'salah');
  const r = await fetch(base + '/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: base },
    body: new URLSearchParams({ username: 'admin', password: 'rahasia' }) });
  assert.equal(r.status, 401);
  assert.match(await r.text(), /Terlalu banyak percobaan/);
});
