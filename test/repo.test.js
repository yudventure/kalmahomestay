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
        for (const tname of ['survey_responses', 'inquiries', 'customers', 'schema_migrations']) await repo._pool.query(`DROP TABLE IF EXISTS ${tname}`);
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

    test('data survives reopening the store', async () => {
      if (kind !== 'file') return;
      const again = createFileRepo(path.dirname(repo.file));
      await again.init();
      assert.equal((await again.listCustomers({})).total, 4);
    });
  });
}
