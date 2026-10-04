'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../src/app');
const { addDays } = require('../src/ical');
const { todayISO } = require('../src/inquiry');

const contact = { whatsapp: '6281111111111', whatsappDisplay: '+62 811', email: 'host@kalma.test', instagram: '@kalma', instagramUrl: 'https://instagram.com/kalma' };
const today = todayISO();
const month = today.slice(0, 7);
let app, base, server, dataDir, repo;
const AUTH = { Authorization: 'Basic ' + Buffer.from('admin:rahasia').toString('base64') };
const send = (p, body, headers = AUTH) => fetch(base + p, { method: 'POST', redirect: 'manual', headers: { ...headers, Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
const page = async (p, headers = AUTH) => (await fetch(base + p, { headers, redirect: 'manual' }));

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalma-hr-'));
  app = createApp({ dataDir, db: null, adminPassword: 'rahasia', siteUrl: 'https://kalma.test', contact, payments: { enabled: false, percent: 100 } });
  repo = app.locals.repo;
  await repo.init();
  server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

async function staffCookie(username, role) {
  await send('/admin/users', { name: username, username, role, password: 'panjang123' });
  const r = await send('/admin/login', { username, password: 'panjang123' }, {});
  return { Cookie: r.headers.get('set-cookie').split(';')[0] };
}

test('HRD manages employees, attendance and leave, and prepares payroll; finance pays it', async () => {
  const hrd = await staffCookie('hana', 'hrd');
  assert.equal((await page('/admin/finance', hrd)).status, 403);
  assert.equal((await page('/admin/payroll', hrd)).status, 200);

  assert.equal((await send('/admin/hr/employees', { name: '' }, hrd)).headers.get('location'), '/admin/hr/employees?err=name');
  let r = await send('/admin/hr/employees', { name: 'Mama Yosina', position: 'Juru masak', department: 'Dapur', salary: '2.600.000', allowance: '400.000', join_date: '2024-01-15' }, hrd);
  const empId = Number(r.headers.get('location').match(/employees\/(\d+)/)[1]);
  await send('/admin/hr/employees', { name: 'Pak Daud', position: 'Motoris', department: 'Boat & transport', salary: '3.000.000' }, hrd);
  let html = await (await page('/admin/hr/employees', hrd)).text();
  assert.match(html, /Mama Yosina/);
  assert.match(html, /Rp 6\.000\.000/, 'monthly total of salaries and allowances');

  // attendance: two days of unexplained absence this month for Mama Yosina
  const daud = (await repo.table('employees').find({ name: 'Pak Daud' })).id;
  for (const d of [`${month}-01`, `${month}-02`]) {
    await send('/admin/hr/attendance', { date: d, [`status_${empId}`]: 'alpa', [`status_${daud}`]: 'hadir', [`in_${daud}`]: '07:30', [`out_${daud}`]: '25:00' }, hrd);
  }
  const att = await repo.table('attendance').find({ employee_id: daud, date: `${month}-01` });
  assert.deepEqual([att.status, att.check_in, att.check_out], ['hadir', '07:30', null], 'bad times are dropped');
  await send('/admin/hr/attendance', { date: `${month}-01`, [`status_${daud}`]: 'sakit' }, hrd);
  assert.equal((await repo.table('attendance').list({ where: { employee_id: daud } })).length, 2, 'a day is updated, not duplicated');
  html = await (await page(`/admin/hr/attendance?view=recap&m=${month}`, hrd)).text();
  assert.match(html, /Mama Yosina/);

  // leave: approved leave pre-fills the day's attendance
  const tomorrow = addDays(today, 1);
  assert.match((await send('/admin/hr/leave', { employee_id: String(daud), kind: 'cuti', start_date: tomorrow, end_date: today }, hrd)).headers.get('location'), /err=leave/);
  await send('/admin/hr/leave', { employee_id: String(daud), kind: 'cuti', start_date: tomorrow, end_date: addDays(tomorrow, 2), reason: 'Pulang kampung' }, hrd);
  const lv = await repo.table('leave_requests').find({ employee_id: daud });
  assert.equal(lv.status, 'pending');
  await send(`/admin/hr/leave/${lv.id}`, { status: 'approved' }, hrd);
  assert.equal((await repo.table('leave_requests').get(lv.id)).decided_by, 'hana');
  html = await (await page(`/admin/hr/attendance?date=${addDays(tomorrow, 2)}`, hrd)).text();
  assert.match(html, new RegExp(`name="status_${daud}"[^>]*>(?:(?!</select>).)*<option value="cuti" selected>`, 's'), 'last leave day is included');

  // payroll: drafts with automatic deduction for the two unexplained days
  await send('/admin/payroll/generate', { period: month }, hrd);
  const slips = await repo.table('payroll').list({ where: { period: month } });
  assert.equal(slips.length, 2);
  const mama = slips.find((s) => s.employee_id === empId);
  assert.equal(mama.deduction, Math.round((2600000 / 26) * 2));
  assert.equal(mama.net, 2600000 + 400000 - 200000);
  await send('/admin/payroll/generate', { period: month }, hrd);
  assert.equal(await repo.table('payroll').count({ where: { period: month } }), 2, 'generating twice does not duplicate');
  await send(`/admin/payroll/${mama.id}`, { base: '2600000', allowance: '400000', bonus: '250.000', deduction: '200000' }, hrd);
  assert.equal((await repo.table('payroll').get(mama.id)).net, 3050000);

  const fin = await staffCookie('fina', 'finance');
  assert.equal((await page('/admin/hr/employees', fin)).status, 403);
  await send(`/admin/payroll/${mama.id}/pay`, { method: 'transfer' }, fin);
  const paid = await repo.table('payroll').get(mama.id);
  assert.equal(paid.status, 'paid');
  const tx = await repo.table('transactions').get(paid.transaction_id);
  assert.deepEqual([tx.kind, tx.category, tx.amount, tx.created_by], ['expense', 'Gaji & tunjangan', 3050000, 'fina']);
  assert.match((await send(`/admin/payroll/${mama.id}`, { bonus: '1' }, hrd)).headers.get('location'), /err=paid/);
  assert.match(await (await page(`/admin/payroll/${mama.id}/slip`, hrd)).text(), /Rp 3\.050\.000/);

  // the employee cannot be deleted while a paid slip exists; deleting the expense in Keuangan reopens the slip
  assert.match((await send(`/admin/hr/employees/${empId}/delete`, {}, hrd)).headers.get('location'), /err=has-payroll/);
  await send(`/admin/finance/${tx.id}/delete`, {}, fin);
  assert.equal((await repo.table('payroll').get(mama.id)).status, 'draft');
  await send(`/admin/hr/employees/${empId}/delete`, {}, hrd);
  assert.equal(await repo.table('employees').get(empId), null);
  assert.equal(await repo.table('attendance').count({ where: { employee_id: empId } }), 0);
});

test('finance records transactions, booking payments and OTA revenue with commission, and reports profit and occupancy', async () => {
  const fin = await staffCookie('fani', 'finance');
  assert.equal((await page('/admin/inquiries', fin)).status, 403);
  assert.match((await send('/admin/finance', { date: today, kind: 'income', category: 'Gaji & tunjangan', amount: '100' }, fin)).headers.get('location'), /err=tx/);
  await send('/admin/finance', { date: today, kind: 'expense', category: 'Bahan makanan', amount: '750.000', method: 'cash', description: 'Pasar Waisai' }, fin);

  // a website booking paid by transfer
  const { inquiryId } = await repo.addInquiry({ lang: 'id', name: 'Rina', contact: 'rina@example.com', checkin: today, checkout: addDays(today, 2), guests: '2', room: 'laguna' });
  await repo.updateInquiry(inquiryId, { status: 'confirmed' });
  assert.equal((await send(`/admin/finance/booking/${inquiryId}`, { amount: '3.400.000', method: 'transfer' })).headers.get('location'), `/admin/inquiries/${inquiryId}?ok=paid`);
  assert.match(await (await page(`/admin/inquiries/${inquiryId}`)).text(), /Total diterima: <b>Rp 3\.400\.000<\/b>/);

  // an Agoda booking from the calendar: income plus 18% commission
  const ch = await repo.table('channels').insert({ name: 'Agoda', kind: 'ota', room: 'pantai', export_token: 'tok-agoda-1234567890', commission_pct: 18, active: true });
  const blk = await repo.table('calendar_blocks').insert({ room: 'pantai', start_date: today, end_date: addDays(today, 3), source: 'channel', channel_id: ch, guest_name: 'Tom' });
  assert.match((await send(`/admin/finance/block/${blk}`, {})).headers.get('location'), /err=amount/);
  await send(`/admin/finance/block/${blk}`, { amount: '4.500.000' });
  assert.match((await send(`/admin/finance/block/${blk}`, { amount: '4.500.000' })).headers.get('location'), /err=recorded/);
  const rows = await repo.table('transactions').list({ where: { ref_type: 'block', ref_id: blk } });
  assert.deepEqual(rows.map((r) => [r.kind, r.category, r.amount]).sort(), [['expense', 'Komisi OTA & agen', 810000], ['income', 'Booking OTA', 4500000]]);

  let html = await (await page(`/admin/finance?m=${month}`, fin)).text();
  assert.match(html, /Rp 7\.900\.000<\/b><span>Pemasukan/);
  assert.match(html, /Rp 1\.560\.000<\/b><span>Pengeluaran/);
  html = await (await page(`/admin/finance?m=${month}&kind=expense`, fin)).text();
  assert.doesNotMatch(html, /Booking OTA<\/td>/);

  // report: profit and nights sold this month (2 website + 3 Agoda, capped to this month)
  html = await (await page(`/admin/finance/report?y=${today.slice(0, 4)}`, fin)).text();
  assert.match(html, /Rp 6\.340\.000/);
  const csv = await (await page(`/admin/finance/export.csv?y=${today.slice(0, 4)}`, fin)).text();
  assert.match(csv, /Pengeluaran,Bahan makanan,750000,cash,Pasar Waisai/);

  // dashboard shows the money for finance, the rooms for the owner
  assert.match(await (await page('/admin', fin)).text(), /Pemasukan bulan ini/);
  const owner = await (await page('/admin')).text();
  assert.match(owner, /Kamar terisi malam ini/);
  assert.match(owner, /Check-in · Rina/);
});
