'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../src/app');
const { todayISO } = require('../src/inquiry');
const { addDays } = require('../src/ical');
const { can } = require('../src/staff');
const { totals, standing, PRINT } = require('../src/admin-invoices');

const AUTH = { Authorization: 'Basic ' + Buffer.from('admin:rahasia').toString('base64') };
let app, base, server, dataDir, repo;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalma-inv-'));
  app = createApp({ adminLang: 'id', dataDir, db: null, adminPassword: 'rahasia', siteUrl: 'https://kalma.test', payments: { enabled: false, percent: 100 } });
  repo = app.locals.repo;
  await repo.init();
  server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

const form = (p, body, headers = AUTH) => {
  const b = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) for (const x of [].concat(v)) b.append(k, x);
  return fetch(base + p, { method: 'POST', redirect: 'manual', headers: { ...headers, Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: b });
};
const get = (p, headers = AUTH) => fetch(base + p, { headers, redirect: 'manual' });
const idOf = (res) => Number((res.headers.get('location') || '').match(/invoices\/(\d+)/)[1]);

test('money: lines, discount, tax and the status people see', () => {
  const m = totals([{ desc: 'a', qty: 6, price: 850000 }, { desc: 'b', qty: 2, price: 750000 }], 100000, 10);
  assert.deepEqual([m.subtotal, m.discount, m.tax, m.total], [6600000, 100000, 650000, 7150000]);
  assert.equal(totals([{ qty: 1, price: 100 }], 500, 0).total, 0, 'discount never makes a negative total');
  const today = '2026-10-05';
  assert.equal(standing({ status: 'sent', total: 1000, due_date: '2026-10-10' }, 0, today).state, 'sent');
  assert.equal(standing({ status: 'sent', total: 1000, due_date: '2026-10-10' }, 400, today).state, 'partial');
  assert.equal(standing({ status: 'sent', total: 1000, due_date: '2026-10-01' }, 400, today).state, 'overdue');
  assert.equal(standing({ status: 'sent', total: 1000, due_date: '2026-10-01' }, 1000, today).state, 'paid');
  assert.equal(standing({ status: 'cancelled', total: 1000 }, 0, today).state, 'cancelled');
  assert.equal(standing({ status: 'sent', total: 1000 }, 1000, today).balance, 0);
});

test('front office and finance make invoices, PR and HR staff do not', () => {
  for (const r of ['owner', 'manager', 'reservation', 'finance']) assert.equal(can(r, 'invoices'), true, r);
  for (const r of ['pr', 'hrd']) assert.equal(can(r, 'invoices'), false, r);
});

test('an invoice made from a booking is filled in, numbered, paid in parts and printed in both languages', async () => {
  const d = (n) => addDays(todayISO(), n);
  const { inquiryId } = await repo.addInquiry({ lang: 'en', name: 'Sarah Miller', contact: 'sarah@example.com', checkin: d(7), checkout: d(10), guests: '2', room: 'laguna' });

  // the form starts from the booking
  const pre = await (await get(`/admin/invoices/new?inquiry=${inquiryId}`)).text();
  assert.match(pre, /value="Sarah Miller"/);
  assert.match(pre, /value="sarah@example.com"/);
  assert.match(pre, /Lagoon Bungalow, [^"]*\(3 nights × 2 guests\)/);
  assert.match(pre, /name="item_qty"[^>]*value="6"/);
  assert.match(pre, /name="item_price"[^>]*value="850000"/);

  // required fields
  const bad = await form('/admin/invoices', { customer_name: '', item_desc: 'x', item_qty: '1', item_price: '1' });
  assert.equal(bad.status, 400);
  assert.match(await bad.text(), /Isi nama tamu atau perusahaan/);

  const created = await form('/admin/invoices', {
    inquiry_id: String(inquiryId), customer_name: 'Sarah Miller', customer_email: 'sarah@example.com', issue_date: todayISO(), due_date: d(5), lang: 'en',
    item_desc: ['Lagoon Bungalow', 'Island hopping', ''], item_qty: ['6', '2', '1'], item_price: ['850000', 'Rp 750.000', ''], discount: '0', tax_pct: '10', send: '1',
  });
  assert.equal(created.status, 303);
  const id = idOf(created);
  const inv = await repo.table('invoices').get(id);
  assert.match(inv.number, /^INV-\d{6}-001$/);
  assert.equal(inv.status, 'sent');
  assert.equal(inv.total, 7260000);
  assert.equal(JSON.parse(inv.items).length, 2, 'empty lines are dropped');

  // a second invoice in the same month gets the next number
  const second = idOf(await form('/admin/invoices', { customer_name: 'Agent Co', issue_date: todayISO(), item_desc: 'Dive package', item_qty: '1', item_price: '1000000' }));
  assert.match((await repo.table('invoices').get(second)).number, /-002$/);

  // a payment lands in Finance and the invoice shows it
  assert.equal((await form(`/admin/invoices/${id}/payment`, { amount: '2.000.000', method: 'transfer', category: 'Booking website', date: todayISO() })).status, 303);
  const tx = await repo.table('transactions').list({ where: { ref_type: 'invoice', ref_id: id } });
  assert.equal(tx.length, 1);
  assert.equal(tx[0].amount, 2000000);
  assert.equal(tx[0].kind, 'income');
  assert.match(tx[0].description, /INV-/);
  const page = await (await get(`/admin/invoices/${id}`)).text();
  assert.match(page, /Dibayar sebagian/);
  assert.match(page, /Rp 5\.260\.000/);

  // a payment recorded on the booking itself counts too
  await repo.table('transactions').insert({ date: todayISO(), kind: 'income', category: 'Booking website', amount: 5260000, method: 'cash', ref_type: 'inquiry', ref_id: inquiryId });
  assert.match(await (await get(`/admin/invoices/${id}`)).text(), /Lunas/);

  // printable invoice in the guest's language, and in Indonesian on request
  const en = await (await get(`/admin/invoices/${id}/print`)).text();
  assert.match(en, /Bill to/);
  assert.match(en, new RegExp(PRINT.en.state.paid));
  assert.match(en, /Rp 7,260,000/);
  assert.match(en, /Indonesia</, 'the address is not run through the admin translator');
  const id_ = await (await get(`/admin/invoices/${id}/print?lang=id`)).text();
  assert.match(id_, /Ditagihkan kepada/);
  assert.match(id_, /Rp 7\.260\.000/);

  // the booking page links to its invoice
  assert.match(await (await get(`/admin/inquiries/${inquiryId}`)).text(), new RegExp(`href="/admin/invoices/${id}"`));

  // only an unpaid draft can be deleted
  assert.match((await form(`/admin/invoices/${id}/delete`, {})).headers.get('location'), /err=delete/);
  assert.equal((await form(`/admin/invoices/${second}/delete`, {})).headers.get('location'), '/admin/invoices?ok=deleted');
  assert.equal(await repo.table('invoices').get(second), null);
});

test('overdue invoices ring the bell and payment details show on every invoice', async () => {
  const id = idOf(await form('/admin/invoices', { customer_name: 'Late Guest', issue_date: addDays(todayISO(), -20), due_date: addDays(todayISO(), -3), item_desc: 'Stay', item_qty: '1', item_price: '500000', send: '1' }));
  const dash = await (await get('/admin')).text();
  assert.match(dash, /1 invoice lewat jatuh tempo/);
  assert.match(await (await get('/admin/invoices?status=overdue')).text(), /Late Guest/);
  await form('/admin/invoices/settings', { payment_info: 'Bank Mandiri 123 456 7890', footer: 'Terima kasih' });
  const doc = await (await get(`/admin/invoices/${id}/print`)).text();
  assert.match(doc, /Bank Mandiri 123 456 7890/);
  assert.match(doc, /Overdue/);
});

test('the invoice pages read fully in English for English admin users', async () => {
  const en = createApp({ adminLang: 'en', dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'kalma-inv-en-')), db: null, adminPassword: 'rahasia', payments: { enabled: false, percent: 100 } });
  await en.locals.repo.init();
  const s = await new Promise((r) => { const x = en.listen(0, () => r(x)); });
  const b = `http://127.0.0.1:${s.address().port}`;
  try {
    for (const p of ['/admin/invoices', '/admin/invoices/new']) {
      const html = await (await fetch(b + p, { headers: AUTH })).text();
      const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<template[\s\S]*?<\/template>/g, '').replace(/<[^>]+>/g, ' ');
      for (const w of ['Ditagihkan', 'Rincian tagihan', 'Catat pembayaran', 'Belum dibayar', 'Simpan', 'Tambah baris', 'Jatuh tempo', 'Cara pembayaran']) {
        assert.ok(!text.includes(w), `${p} still shows "${w}"`);
      }
    }
  } finally { s.close(); }
});
