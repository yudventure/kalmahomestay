'use strict';

// Same behavior tests for both storage backends.
// MySQL runs only when TEST_DATABASE_URL is set (e.g. mysql://user:pass@127.0.0.1:3306/kalma_test) — it DROPS tables there.
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createFileRepo } = require('../src/db/file');
const { createMysqlRepo } = require('../src/db/mysql');
const { parseContact, normalizePhone } = require('../src/db/shared');
const { loadConfig } = require('../src/config');

test('parseContact / normalizePhone', () => {
  assert.deepEqual(parseContact('0812-3456 7890'), { phone: '6281234567890', email: null, other: null });
  assert.deepEqual(parseContact('+62 812 3456 7890'), { phone: '6281234567890', email: null, other: null });
  assert.deepEqual(parseContact('812 3456 7890'), { phone: '6281234567890', email: null, other: null });
  assert.deepEqual(parseContact('+44 7700 900123'), { phone: '447700900123', email: null, other: null });
  assert.deepEqual(parseContact('Rina@Mail.COM'), { phone: null, email: 'rina@mail.com', other: null });
  assert.deepEqual(parseContact('@rina.travels'), { phone: null, email: null, other: '@rina.travels' });
  assert.deepEqual(parseContact(''), { phone: null, email: null, other: null });
  assert.equal(normalizePhone('12345'), null);
});

test('DB settings: trimmed values, optional socket', () => {
  const c = loadConfig({ DB_HOST: ' localhost ', DB_USER: 'u1_kalma ', DB_PASSWORD: 'p', DB_NAME: ' u1_kalma' }).db;
  assert.deepEqual(c, { host: 'localhost', port: 3306, socket: '', user: 'u1_kalma', password: 'p', name: 'u1_kalma' });
  const s = loadConfig({ DB_SOCKET: '/var/lib/mysql/mysql.sock', DB_USER: 'u', DB_NAME: 'n' }).db;
  assert.equal(s.socket, '/var/lib/mysql/mysql.sock');
  assert.equal(loadConfig({ DB_USER: 'u', DB_NAME: 'n' }).db, null);
  // DB_HOST=3306 (port typed into the host field) → localhost:3306
  const swapped = loadConfig({ DB_HOST: '3306', DB_PORT: '3306', DB_USER: 'u', DB_NAME: 'n' }).db;
  assert.equal(swapped.host, 'localhost');
  assert.equal(swapped.port, 3306);
  assert.equal(loadConfig({ DB_HOST: ' 3307 ', DB_USER: 'u', DB_NAME: 'n' }).db.port, 3307);
});

// Falls back from TCP to the local MySQL socket (like on shared hosting). Needs TEST_DATABASE_SOCKET + TEST_DB_USER/PASSWORD/NAME.
test('mysql: falls back to the local socket when TCP to localhost fails', { skip: !process.env.TEST_DATABASE_SOCKET }, async () => {
  const repo = createMysqlRepo(
    { host: 'localhost', port: 1, user: process.env.TEST_DB_USER, password: process.env.TEST_DB_PASSWORD, name: process.env.TEST_DB_NAME },
    { autoMigrate: false, socketCandidates: ['/nonexistent.sock', process.env.TEST_DATABASE_SOCKET] });
  const log = console.log; console.log = () => {};
  try { await repo.init(); } finally { console.log = log; }
  assert.equal(repo.connection, `socket ${process.env.TEST_DATABASE_SOCKET}`);
  assert.equal(await repo.ping(), true);
  await repo.close();
});

// Like shared hosting: user exists only @'localhost' and the server skips name resolution, so TCP via 127.0.0.1 is denied.
test('mysql: retries on the socket when TCP login is denied', { skip: !process.env.TEST_SOCKET_ONLY_USER }, async () => {
  const [user, password] = process.env.TEST_SOCKET_ONLY_USER.split(':');
  const repo = createMysqlRepo({ host: '127.0.0.1', port: Number(process.env.TEST_DB_PORT || 3306), user, password, name: process.env.TEST_DB_NAME },
    { autoMigrate: false, socketCandidates: [process.env.TEST_DATABASE_SOCKET] });
  const log = console.log; console.log = () => {};
  try { await repo.init(); } finally { console.log = log; }
  assert.equal(repo.connection, `socket ${process.env.TEST_DATABASE_SOCKET}`);
  await repo.close();
});

test('mysql: a remote host does not fall back to a socket', { skip: !process.env.TEST_DATABASE_SOCKET }, async () => {
  const repo = createMysqlRepo({ host: '10.255.255.1', port: 3306, user: 'x', password: 'x', name: 'x' },
    { autoMigrate: false, socketCandidates: [process.env.TEST_DATABASE_SOCKET] });
  repo._pool.pool.config.connectionConfig.connectTimeout = 1000;
  await assert.rejects(repo.init());
  await repo.close();
});

const backends = [['file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalma-repo-'));
  const repo = createFileRepo(dir);
  return { repo, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}]];
if (process.env.TEST_DATABASE_URL) {
  backends.push(['mysql', () => ({ repo: createMysqlRepo({ url: process.env.TEST_DATABASE_URL }), cleanup: () => {} })]);
}

const base = (o = {}) => ({ lang: 'id', name: 'Rina', contact: '0812 3456 7890', country: 'Jakarta', checkin: '2030-01-10', checkout: '2030-01-13', guests: '2', room: 'laguna', msg: 'Vegetarian', ...o });

for (const [kind, make] of backends) {
  describe(`${kind} repository`, () => {
    let repo, cleanup;
    before(async () => {
      ({ repo, cleanup } = make());
      if (kind === 'mysql') {
        await repo._pool.query('SET FOREIGN_KEY_CHECKS = 0');
        // start from an empty database so every migration runs again, including ALTERs on later tables
        const [tables] = await repo._pool.query('SHOW TABLES');
        for (const row of tables) await repo._pool.query(`DROP TABLE IF EXISTS \`${Object.values(row)[0]}\``);
        await repo._pool.query('SET FOREIGN_KEY_CHECKS = 1');
      }
      await repo.init();
    });
    after(async () => { await repo.close(); cleanup(); });

    let rina, budi;

    test('addInquiry creates a customer and an inquiry', async () => {
      const r = await repo.addInquiry(base());
      rina = r.customerId;
      const c = await repo.getCustomer(rina);
      assert.equal(c.name, 'Rina');
      assert.equal(c.phone, '6281234567890');
      assert.equal(c.country, 'Jakarta');
      assert.equal(c.inquiries.length, 1);
      assert.equal(c.inquiries[0].status, 'new');
      assert.equal(c.inquiries[0].checkin, '2030-01-10');
      assert.ok(c.created_at instanceof Date);
    });

    test('same phone (different format) reuses the customer and updates the name', async () => {
      const r = await repo.addInquiry(base({ name: 'Rina Putri', contact: '+62 812-3456-7890', country: '', checkin: '2030-03-01', checkout: '2030-03-04' }));
      assert.equal(r.customerId, rina);
      const c = await repo.getCustomer(rina);
      assert.equal(c.name, 'Rina Putri');
      assert.equal(c.country, 'Jakarta', 'keeps country when the new form left it empty');
      assert.equal(c.inquiries.length, 2);
      assert.equal(c.inquiries[0].checkin, '2030-03-01', 'newest first');
    });

    test('email is matched case-insensitively; no contact always creates a new customer', async () => {
      const a = await repo.addInquiry(base({ name: 'Budi', contact: 'Budi@Example.com', lang: 'en' }));
      const b = await repo.addInquiry(base({ name: 'Budi', contact: 'budi@example.com', lang: 'en' }));
      assert.equal(a.customerId, b.customerId);
      budi = a.customerId;
      const x = await repo.addInquiry(base({ name: 'Anon', contact: '' }));
      const y = await repo.addInquiry(base({ name: 'Anon', contact: '' }));
      assert.notEqual(x.customerId, y.customerId);
      const ig = await repo.addInquiry(base({ name: 'Insta', contact: '@insta.user' }));
      assert.equal((await repo.getCustomer(ig.customerId)).other_contact, '@insta.user');
    });

    test('listInquiries filters by status and search, with paging info', async () => {
      const all = await repo.listInquiries({});
      assert.equal(all.total, 7);
      assert.equal(all.page, 1);
      const first = all.items.find((i) => i.customer_id === rina);
      assert.ok(first.name);
      await repo.updateInquiry(first.id, { status: 'confirmed', adminNote: 'DP masuk' });
      const confirmed = await repo.listInquiries({ status: 'confirmed' });
      assert.equal(confirmed.total, 1);
      assert.equal(confirmed.items[0].admin_note, 'DP masuk');
      assert.equal((await repo.listInquiries({ q: 'budi@' })).total, 2);
      assert.equal((await repo.listInquiries({ q: '100%_' })).total, 0, 'LIKE wildcards are escaped');
      await assert.rejects(repo.updateInquiry(first.id, { status: 'bogus' }));
    });

    test('listCustomers counts inquiries and searches', async () => {
      const r = await repo.listCustomers({});
      assert.equal(r.total, 5);
      const row = r.items.find((c) => c.id === rina);
      assert.equal(row.inquiry_count, 2);
      assert.equal((await repo.listCustomers({ q: 'putri' })).total, 1);
    });

    test('stats counts statuses and lists upcoming confirmed arrivals', async () => {
      const s = await repo.stats('2029-12-31');
      assert.equal(s.counts.confirmed, 1);
      assert.equal(s.counts.new, 6);
      assert.equal(s.customers, 5);
      assert.equal(s.upcoming.length, 1);
      assert.equal((await repo.stats('2031-01-01')).upcoming.length, 0);
    });

    test('updateCustomer validates and rejects duplicates', async () => {
      await repo.updateCustomer(rina, { name: 'Rina P.', phone: '0812 3456 7890', email: 'RINA@mail.com', country: 'Bandung', notes: 'Alergi udang' });
      const c = await repo.getCustomer(rina);
      assert.equal(c.email, 'rina@mail.com');
      assert.equal(c.notes, 'Alergi udang');
      await assert.rejects(repo.updateCustomer(budi, { name: 'Budi', phone: '+6281234567890' }), { code: 'DUPLICATE', field: 'phone' });
      await assert.rejects(repo.updateCustomer(budi, { name: 'Budi', email: 'rina@mail.com' }), { code: 'DUPLICATE', field: 'email' });
      await assert.rejects(repo.updateCustomer(budi, { name: 'Budi', email: 'not-an-email' }), { code: 'INVALID' });
      assert.equal(await repo.updateCustomer(999999, { name: 'X' }), false);
    });

    test('exports include every row', async () => {
      assert.equal((await repo.exportCustomers()).length, 5);
      const inq = await repo.exportInquiries();
      assert.equal(inq.length, 7);
      assert.ok(inq.every((r) => r.name));
    });

    test('deleteCustomer removes the customer and all their inquiries', async () => {
      assert.equal(await repo.deleteCustomer(rina), true);
      assert.equal(await repo.getCustomer(rina), null);
      assert.equal((await repo.listInquiries({})).total, 5);
      assert.equal(await repo.deleteCustomer(rina), false);
    });

    test('survey responses are stored, listed newest first and deleted', async () => {
      const a = await repo.addSurveyResponse({ lang: 'en', answers: { q1: 'planning', q4: ['diving'], q8: 'Ferry “timing” 🌊' }, contact: 'x@y.com' });
      const b = await repo.addSurveyResponse({ lang: 'id', answers: { q1: 'curious', q8: 'Sinyal' }, contact: '' });
      const all = await repo.allSurveyResponses();
      assert.equal(all.length, 2);
      assert.equal(all[0].id, b);
      assert.deepEqual(all[1].answers, { q1: 'planning', q4: ['diving'], q8: 'Ferry “timing” 🌊' }, 'unicode/emoji round-trips');
      assert.equal(all[1].contact, 'x@y.com');
      assert.equal(all[0].contact, null);
      assert.ok(all[0].created_at instanceof Date);
      const page = await repo.listSurveyResponses({});
      assert.equal(page.total, 2);
      assert.equal(await repo.deleteSurveyResponse(a), true);
      assert.equal((await repo.allSurveyResponses()).length, 1);
    });

    test('online orders carry a payment that can be marked paid', async () => {
      const { inquiryId, customerId } = await repo.addInquiry(base({ contact: 'pay@example.com', orderId: 'KALMA-T1', amount: 1530000, total: 5100000 }));
      let i = await repo.getInquiryByOrder('KALMA-T1');
      assert.equal(i.id, inquiryId);
      assert.equal(Number(i.amount), 1530000);
      assert.equal(Number(i.total), 5100000);
      assert.equal(i.payment_status, 'pending');
      assert.equal(await repo.setPayment('KALMA-T1', { status: 'paid', type: 'bank_transfer', paidAt: new Date('2030-01-01T02:00:00Z') }), true);
      i = await repo.getInquiryByOrder('KALMA-T1');
      assert.equal(i.payment_status, 'paid');
      assert.equal(i.payment_type, 'bank_transfer');
      assert.equal(i.status, 'confirmed');
      assert.equal(new Date(i.paid_at).toISOString(), '2030-01-01T02:00:00.000Z');
      assert.equal(await repo.setPayment('KALMA-NOPE', { status: 'paid' }), false);
      assert.equal(await repo.getInquiryByOrder('KALMA-NOPE'), null);
      await repo.deleteCustomer(customerId);
    });

    test('settings and Instagram comments: upsert keeps hidden, deleted comments drop out', async () => {
      assert.equal(await repo.getSetting('ig_sync'), null);
      await repo.setSetting('ig_sync', { ok: true, count: 2 });
      await repo.setSetting('ig_sync', { ok: false, count: 0 });
      assert.deepEqual(await repo.getSetting('ig_sync'), { ok: false, count: 0 });

      const c = (id, mediaId, likes, text = 'Tempatnya tenang dan ramah sekali 😍') => ({ id, mediaId, permalink: 'https://www.instagram.com/p/X/', kind: 'reel', username: 'u' + id, text, likes, timestamp: '2026-09-01T10:00:00+0000' });
      await repo.saveIgComments([c('1', 'm1', 1), c('2', 'm1', 5), c('3', 'm2', 0)], ['m1', 'm2']);
      assert.deepEqual((await repo.listIgComments()).map((r) => r.id), ['2', '1', '3']);
      assert.equal(await repo.setIgCommentHidden('2', true), true);
      assert.equal(await repo.setIgCommentHidden('999', true), false);
      await repo.saveIgComments([c('1', 'm1', 9, 'Edited on Instagram, still lovely'), c('2', 'm1', 5)], ['m1', 'm2']);
      const all = await repo.listIgComments();
      assert.deepEqual(all.map((r) => [r.id, r.hidden]), [['1', false], ['2', true]]);
      assert.equal(all[0].text, 'Edited on Instagram, still lovely');
      assert.equal(new Date(all[0].commented_at).toISOString(), '2026-09-01T10:00:00.000Z');
      assert.deepEqual((await repo.listIgComments({ visibleOnly: true })).map((r) => r.id), ['1']);
      assert.equal(all[0].media_kind, 'reel');
      assert.equal(await repo.deleteIgComment('2'), true);
      assert.equal(await repo.deleteIgComment('2'), false);
      await repo.saveIgComments([], ['m1']);
      assert.equal((await repo.listIgComments()).length, 0);
    });

    test('CMS tables: insert, filter, overlap, update and remove', async () => {
      const blocks = repo.table('calendar_blocks');
      const a = await blocks.insert({ room: 'laguna', start_date: '2030-05-01', end_date: '2030-05-04', source: 'channel', channel_id: 7, external_uid: 'abc', amount: '1500000', bogus: 'x' });
      await blocks.insert({ room: 'laguna', start_date: '2030-05-04', end_date: '2030-05-06', source: 'block' });
      await blocks.insert({ room: 'pantai', start_date: '2030-05-02', end_date: '2030-05-03', source: 'walkin' });
      const got = await blocks.get(a);
      assert.equal(got.start_date, '2030-05-01');
      assert.equal(got.amount, 1500000);
      assert.equal(got.channel_id, 7);
      assert.ok(got.created_at instanceof Date);
      const overlap = (from, to, where) => blocks.list({ where, overlap: { start: 'start_date', end: 'end_date', from, to }, order: [['start_date', 'asc']] });
      assert.deepEqual((await overlap('2030-05-03', '2030-05-05', { room: 'laguna' })).map((b) => b.start_date), ['2030-05-01', '2030-05-04']);
      assert.equal((await overlap('2030-05-04', '2030-05-05', { room: 'laguna' })).length, 1, 'check-out day is free');
      assert.equal((await overlap('2030-05-01', '2030-05-10', { room: ['pantai'] })).length, 1);
      assert.equal(await blocks.count({ where: { room: 'laguna' } }), 2);
      assert.equal((await blocks.find({ channel_id: 7, external_uid: 'abc' })).id, a);
      assert.equal(await blocks.update(a, { guest_name: 'Tom', end_date: '2030-05-03' }), true);
      assert.equal((await blocks.get(a)).guest_name, 'Tom');
      assert.equal((await blocks.list({ search: { cols: ['guest_name'], q: 'to' } })).length, 1);
      assert.equal((await blocks.list({ range: { col: 'start_date', from: '2030-05-02', to: '2030-05-04' } })).length, 1);
      assert.equal(await blocks.remove(a), true);
      assert.equal(await blocks.get(a), null);

      const users = repo.table('staff_users');
      const u = await users.insert({ name: 'Sari', username: 'sari', password_hash: 'x', role: 'hrd', active: true });
      assert.equal((await users.get(u)).active, true);
      await users.update(u, { active: false });
      assert.equal((await users.get(u)).active, false);
      for (const b of await blocks.list()) await blocks.remove(b.id);
      await users.remove(u);
    });

    test('data survives reopening the store', async () => {
      if (kind !== 'file') return;
      const again = createFileRepo(path.dirname(repo.file));
      await again.init();
      assert.equal((await again.listCustomers({})).total, 4);
    });
  });
}
