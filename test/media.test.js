'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../src/app');
const { sniff } = require('../src/media');

const contact = { whatsapp: '6281111111111', whatsappDisplay: '+62 811', email: 'host@kalma.test', instagram: '@kalma', instagramUrl: 'https://instagram.com/kalma' };
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]), Buffer.alloc(200, 1)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(200, 2)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(200, 3)]);
const AUTH = { Authorization: 'Basic ' + Buffer.from('admin:rahasia').toString('base64') };
let app, base, server, dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalma-media-'));
  app = createApp({ adminLang: 'id', dataDir, db: null, adminPassword: 'rahasia', siteUrl: 'https://kalma.test', contact, payments: { enabled: false, percent: 100 } });
  await app.locals.repo.init();
  server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

function upload(p, buf, filename, fields = {}, headers = AUTH) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append('file', new Blob([buf]), filename);
  return fetch(base + p, { method: 'POST', body: form, redirect: 'manual', headers: { ...headers, Origin: base } });
}
const post = (p, headers = AUTH) => fetch(base + p, { method: 'POST', redirect: 'manual', headers: { ...headers, Origin: base } });
const home = async () => (await fetch(base + '/id')).text();

test('file types are recognised by their content, not their name', () => {
  assert.equal(sniff(JPG), 'jpg');
  assert.equal(sniff(MP4), 'mp4');
  assert.equal(sniff(PDF), 'pdf');
  assert.equal(sniff(Buffer.from('MZ this is not a picture at all')), null);
});

test('website photos and videos are uploaded with a button and show on the site right away', async () => {
  const page = await (await fetch(base + '/admin/website/media', { headers: AUTH })).text();
  assert.match(page, /action="\/admin\/website\/media\/hero-1\/image"[^>]*enctype="multipart\/form-data"/);
  assert.match(page, /action="\/admin\/website\/media\/hero-1\/video"/);
  assert.doesNotMatch(page, /action="\/admin\/website\/media\/svc-homestay\/video"/, 'only hero tiles take a video');

  let r = await upload('/admin/website/media/hero-1/image', JPG, 'pantai.JPG');
  assert.equal(r.headers.get('location'), '/admin/website/media?ok=uploaded#hero-1');
  const first = app.locals.media.slots['hero-1'].image;
  assert.match(first.file, /^[a-f0-9]{24}\.jpg$/);
  assert.ok(fs.existsSync(path.join(dataDir, 'uploads', first.file)), 'stored outside public/');
  assert.match(await home(), new RegExp(`--img:url\\(/media/${first.file}\\)`));
  const img = await fetch(`${base}/media/${first.file}`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');

  // a new upload replaces the old one, file and all
  await upload('/admin/website/media/hero-1/image', JPG, 'baru.jpg');
  const second = app.locals.media.slots['hero-1'].image;
  assert.notEqual(second.file, first.file);
  assert.equal((await fetch(`${base}/media/${first.file}`)).status, 404);
  assert.ok(!fs.existsSync(path.join(dataDir, 'uploads', first.file)));

  r = await upload('/admin/website/media/hero-1/video', MP4, 'ombak.mp4');
  assert.match(r.headers.get('location'), /ok=uploaded/);
  const vid = app.locals.media.slots['hero-1'].video;
  assert.match(await home(), new RegExp(`<source src="/media/${vid.file}" type="video/mp4">`));

  // wrong content, wrong extension, wrong place, too big
  assert.match((await upload('/admin/website/media/hero-2/image', Buffer.from('MZ not really a photo, just pretending'), 'foto.jpg')).headers.get('location'), /err=upload-type/);
  assert.match((await upload('/admin/website/media/hero-2/image', JPG, 'foto.exe')).headers.get('location'), /err=upload-type/);
  assert.equal((await upload('/admin/website/media/svc-homestay/video', MP4, 'x.mp4')).status, 404);
  assert.equal((await upload('/admin/website/media/nope/image', JPG, 'x.jpg')).status, 404);
  assert.match((await upload('/admin/website/media/hero-2/image', Buffer.concat([JPG, Buffer.alloc(11 * 1024 * 1024)]), 'besar.jpg')).headers.get('location'), /err=upload-size/);
  assert.equal(app.locals.media.slots['hero-2'], undefined);
  assert.equal(fs.readdirSync(path.join(dataDir, 'uploads')).length, 2, 'rejected files are not left behind');
  const errPage = await (await fetch(`${base}/admin/website/media?err=upload-type`, { headers: AUTH })).text();
  assert.match(errPage, /Jenis file tidak didukung/);

  // removing the upload goes back to the built-in photo
  await post('/admin/website/media/hero-1/image/delete');
  await post('/admin/website/media/hero-1/video/delete');
  assert.doesNotMatch(await home(), /\/media\//);
  assert.deepEqual(fs.readdirSync(path.join(dataDir, 'uploads')), []);
});

test('employee documents and receipts are private to the roles that own them', async () => {
  for (const [username, role] of [['hani', 'hrd'], ['fani', 'finance']]) {
    const form = new URLSearchParams({ name: username, username, role, password: 'panjang123' });
    await fetch(base + '/admin/users', { method: 'POST', headers: { ...AUTH, Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
  }
  const login = async (u) => {
    const r = await fetch(base + '/admin/login', { method: 'POST', redirect: 'manual', headers: { Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ username: u, password: 'panjang123' }) });
    return { Cookie: r.headers.get('set-cookie').split(';')[0] };
  };
  const hrd = await login('hani');
  const fin = await login('fani');

  const emp = await app.locals.repo.table('employees').insert({ name: 'Pak Daud', status: 'active' });
  let r = await upload(`/admin/hr/employees/${emp}/files`, PDF, 'kontrak.pdf', { label: 'Kontrak 2026' }, hrd);
  assert.equal(r.headers.get('location'), `/admin/hr/employees/${emp}?ok=uploaded#dokumen`);
  const doc = await app.locals.repo.table('media').find({ owner_type: 'employee', owner_id: emp });
  assert.equal(doc.public, false);
  const page = await (await fetch(`${base}/admin/hr/employees/${emp}`, { headers: hrd })).text();
  assert.match(page, new RegExp(`href="/admin/files/${doc.id}"[^>]*>Kontrak 2026<`));
  assert.equal((await fetch(`${base}/media/${doc.file}`)).status, 404, 'never public');
  const dl = await fetch(`${base}/admin/files/${doc.id}`, { headers: hrd });
  assert.equal(dl.status, 200);
  assert.match(dl.headers.get('content-disposition'), /^inline; filename="kontrak\.pdf"/);
  assert.equal((await fetch(`${base}/admin/files/${doc.id}`, { headers: fin })).status, 403);
  assert.equal((await fetch(`${base}/admin/files/${doc.id}`, { redirect: 'manual' })).status, 303, 'anonymous goes to login');
  assert.equal((await upload(`/admin/hr/employees/${emp}/files`, PDF, 'x.pdf', { label: 'x' }, fin)).status, 403);

  // receipts on transactions
  const tx = await app.locals.repo.table('transactions').insert({ date: '2026-10-04', kind: 'expense', category: 'Bahan makanan', amount: 500000 });
  r = await upload(`/admin/finance/${tx}/receipt`, JPG, 'nota.jpg', {}, fin);
  assert.equal(r.headers.get('location'), '/admin/finance?m=2026-10&ok=uploaded');
  const fpage = await (await fetch(`${base}/admin/finance?m=2026-10`, { headers: fin })).text();
  assert.match(fpage, /class="chip chip--ok" href="\/admin\/files\/\d+"[^>]*>Bukti</);
  const receipt = await app.locals.repo.table('media').find({ owner_type: 'transaction', owner_id: tx });
  assert.equal((await fetch(`${base}/admin/files/${receipt.id}`, { headers: hrd })).status, 403);

  // deleting the transaction or the employee removes their files
  await post(`/admin/finance/${tx}/delete`, fin);
  assert.equal(await app.locals.repo.table('media').get(receipt.id), null);
  await post(`/admin/hr/employees/${emp}/delete`, hrd);
  assert.equal(await app.locals.repo.table('media').get(doc.id), null);
  assert.deepEqual(fs.readdirSync(path.join(dataDir, 'uploads')), []);
});

test('partner logos are uploaded per partner and shown in the running strip', async () => {
  const r = await upload('/admin/website/partners/logo', JPG, 'logo.jpg', { name: 'Partner 2' });
  assert.equal(r.headers.get('location'), '/admin/website/partners?ok=uploaded');
  const url = app.locals.media.logoUrl('partner 2');
  assert.match(url, /^\/media\/[a-f0-9]{24}\.jpg$/);
  assert.equal((await fetch(base + url)).status, 200, 'logos are public');
  assert.match(await home(), new RegExp(`<img class="partners__logo" src="${url}"`));
  const page = await (await fetch(base + '/admin/website/partners', { headers: AUTH })).text();
  assert.match(page, new RegExp(`<img src="${url}" alt="Logo Partner 2"`));

  // a second logo replaces the first; unknown names are refused
  await upload('/admin/website/partners/logo', JPG, 'logo2.jpg', { name: 'Partner 2' });
  assert.notEqual(app.locals.media.logoUrl('Partner 2'), url);
  assert.equal((await fetch(base + url)).status, 404);
  assert.match((await upload('/admin/website/partners/logo', JPG, 'x.jpg', { name: 'Bukan partner' })).headers.get('location'), /err=partner/);

  const del = await fetch(base + '/admin/website/partners/logo/delete', { method: 'POST', redirect: 'manual', headers: { ...AUTH, Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'name=Partner+2' });
  assert.equal(del.status, 303);
  assert.equal(app.locals.media.logoUrl('Partner 2'), '');
  assert.deepEqual(fs.readdirSync(path.join(dataDir, 'uploads')), []);
});

test('default experience photos are downloaded once into empty slots and can be replaced', async () => {
  const { createApp: make } = require('../src/app');
  const app = make({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'seed-')), db: null, uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'seedup-')), payments: { enabled: false, percent: 100 } });
  await app.locals.repo.init();
  const media = app.locals.media;
  await media.reload();
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
  let calls = 0;
  const fetchImpl = async (url) => {
    calls++;
    if (url.includes('bad')) return { ok: false, status: 404 };
    return { ok: true, status: 200, arrayBuffer: async () => jpg };
  };
  const list = [{ slot: 'exp-2', url: 'https://cdn.test/a.png' }, { slot: 'exp-3', url: 'https://cdn.test/bad.png' }];
  assert.equal(await media.seedDefaults(list, { fetchImpl }), 1);
  assert.match(media.photoUrl('exp-2'), /^\/media\/[0-9a-f]{24}\.jpg$/);
  assert.equal(media.photoUrl('exp-3'), '', 'a failed download leaves the placeholder');
  // second start: exp-2 is not fetched again, exp-3 is retried
  calls = 0;
  assert.equal(await media.seedDefaults(list, { fetchImpl }), 0);
  assert.equal(calls, 1);
  // staff delete the photo: it does not come back
  const row = (await media.list({ where: { slot: 'exp-2' } }))[0];
  await media.remove(row.id);
  assert.equal(await media.seedDefaults(list, { fetchImpl }), 0);
  assert.equal(media.photoUrl('exp-2'), '');
  // a page that is not a photo is refused
  const html = async () => ({ ok: true, status: 200, arrayBuffer: async () => Buffer.from('<html>nope</html>') });
  assert.equal(await media.seedDefaults([{ slot: 'exp-4', url: 'https://cdn.test/x' }], { fetchImpl: html }), 0);
});
