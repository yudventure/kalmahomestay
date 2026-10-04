'use strict';

/* Admin Keuangan: income & expense ledger, booking payments, monthly profit & loss with occupancy. */
const { ROOMS } = require('./config');
const { todayISO } = require('./inquiry');
const { addDays } = require('./ical');

const CATEGORIES = {
  income: ['Booking website', 'Booking OTA', 'Booking agen', 'Walk-in', 'Tur & diving', 'Makanan & minuman', 'Transportasi', 'Lainnya'],
  expense: ['Gaji & tunjangan', 'Komisi OTA & agen', 'Bahan makanan', 'Listrik, air & BBM', 'Perawatan & perbaikan', 'Transportasi & boat',
    'Perlengkapan tamu', 'Pemasaran', 'Pajak & perizinan', 'Biaya bank & payment', 'Lainnya'],
};
const METHODS = ['cash', 'transfer', 'midtrans', 'qris', 'ota', 'kartu'];

const str = (v, max = 255) => String(v == null ? '' : v).trim().slice(0, max);
const money = (v) => Math.round(Number(String(v == null ? '' : v).replace(/\D/g, ''))) || 0;
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(Date.parse(s));
const isMonth = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s || ''));
const monthEnd = (m) => addDays(`${m}-01`, 32).slice(0, 7) + '-01';

/** Income from a website booking paid online (called by the Midtrans notification). Never books the same order twice. */
async function recordWebsitePayment(repo, inquiry, { amount, method = 'midtrans', date = todayISO() } = {}) {
  const tx = repo.table('transactions');
  if (await tx.find({ ref_type: 'inquiry', ref_id: inquiry.id })) return null;
  return tx.insert({ date, kind: 'income', category: 'Booking website', amount: Math.round(Number(amount) || 0), method,
    description: `Booking #${inquiry.id}${inquiry.order_id ? ' · ' + inquiry.order_id : ''}`, ref_type: 'inquiry', ref_id: inquiry.id, created_by: 'sistem' });
}

/** Nights sold per room in [from, to) for occupancy: website (confirmed/paid) + OTA/agent/walk-in (not closed nights). */
function soldNights(items, from, to) {
  let n = 0;
  for (const it of items) {
    if (!it.counts || it.type === 'block') continue;
    const s = it.start > from ? it.start : from;
    const e = it.end < to ? it.end : to;
    if (e > s) n += Math.round((Date.parse(e) - Date.parse(s)) / 864e5);
  }
  return n;
}

function mountFinance(router, { repo, calendar, ah, idParam, toCSV }) {
  const tx = repo.table('transactions');
  const blocks = repo.table('calendar_blocks');
  const channels = repo.table('channels');
  const payroll = repo.table('payroll');

  router.get('/finance', ah(async (req, res) => {
    const m = isMonth(req.query.m) ? req.query.m : todayISO().slice(0, 7);
    const kind = ['income', 'expense'].includes(req.query.kind) ? req.query.kind : '';
    const category = str(req.query.category, 40);
    const where = {};
    if (kind) where.kind = kind;
    if (category) where.category = category;
    const list = await tx.list({ where, range: { col: 'date', from: `${m}-01`, to: monthEnd(m) }, order: [['date', 'desc'], ['id', 'desc']] });
    const all = await tx.list({ range: { col: 'date', from: `${m}-01`, to: monthEnd(m) } });
    const sum = (k) => all.filter((t) => t.kind === k).reduce((s, t) => s + t.amount, 0);
    res.render('admin/finance', {
      title: 'Keuangan', m, list, kind, category, CATEGORIES, METHODS, income: sum('income'), expense: sum('expense'), today: todayISO(),
      prev: addDays(`${m}-01`, -1).slice(0, 7), next: addDays(`${m}-01`, 32).slice(0, 7),
    });
  }));

  const txValues = (b) => ({
    date: isDate(b.date) ? b.date : null, kind: b.kind === 'expense' ? 'expense' : 'income', category: str(b.category, 40),
    amount: money(b.amount), method: METHODS.includes(b.method) ? b.method : null, description: str(b.description, 2000),
  });

  router.post('/finance', ah(async (req, res) => {
    const v = txValues(req.body);
    if (!v.date || !v.amount || !CATEGORIES[v.kind].includes(v.category)) return res.redirect(303, '/admin/finance?err=tx');
    await tx.insert({ ...v, created_by: req.staff.username });
    res.redirect(303, `/admin/finance?m=${v.date.slice(0, 7)}&ok=saved`);
  }));

  router.post('/finance/:id/delete', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    const t = await tx.get(id); if (!t) return next();
    // a salary payment removed here puts the slip back to draft
    if (t.ref_type === 'payroll' && t.ref_id) await payroll.update(t.ref_id, { status: 'draft', paid_at: null, transaction_id: null });
    await tx.remove(id);
    res.redirect(303, `/admin/finance?m=${t.date.slice(0, 7)}&ok=deleted`);
  }));

  /** Payment for a website booking taken outside Midtrans (cash, transfer). */
  router.post('/finance/booking/:id', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    const item = await repo.getInquiry(id); if (!item) return next();
    const amount = money(req.body.amount);
    if (!amount) return res.redirect(303, `/admin/inquiries/${id}?err=amount`);
    await tx.insert({ date: isDate(req.body.date) ? req.body.date : todayISO(), kind: 'income', category: 'Booking website', amount,
      method: METHODS.includes(req.body.method) ? req.body.method : 'transfer', description: `Booking #${id} · ${item.name}`, ref_type: 'inquiry', ref_id: id, created_by: req.staff.username });
    res.redirect(303, `/admin/inquiries/${id}?ok=paid`);
  }));

  /** Revenue for an OTA/agent/walk-in booking from the calendar, with the channel's commission as an expense. */
  router.post('/finance/block/:id', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    const b = await blocks.get(id); if (!b || b.source === 'block') return next();
    const amount = money(req.body.amount) || b.amount;
    if (!amount) return res.redirect(303, `/admin/calendar?m=${b.start_date.slice(0, 7)}&err=amount`);
    if (await tx.find({ ref_type: 'block', ref_id: id })) return res.redirect(303, `/admin/calendar?m=${b.start_date.slice(0, 7)}&err=recorded`);
    const ch = b.channel_id ? await channels.get(b.channel_id) : null;
    const category = !ch ? 'Walk-in' : ch.kind === 'agent' ? 'Booking agen' : 'Booking OTA';
    const label = `${b.guest_name || 'Tamu'} · ${b.room} · ${b.start_date}${ch ? ' · ' + ch.name : ''}`;
    const date = isDate(req.body.date) ? req.body.date : todayISO();
    await tx.insert({ date, kind: 'income', category, amount, method: ch ? 'ota' : 'cash', description: label, ref_type: 'block', ref_id: id, created_by: req.staff.username });
    if (ch && ch.commission_pct) {
      await tx.insert({ date, kind: 'expense', category: 'Komisi OTA & agen', amount: Math.round((amount * ch.commission_pct) / 100), method: 'ota',
        description: `Komisi ${ch.commission_pct}% · ${label}`, ref_type: 'block', ref_id: id, created_by: req.staff.username });
    }
    if (!b.amount) await blocks.update(id, { amount });
    res.redirect(303, `/admin/finance?m=${date.slice(0, 7)}&ok=saved`);
  }));

  /* ---------- profit & loss per month, with occupancy ---------- */
  router.get('/finance/report', ah(async (req, res) => {
    const y = /^\d{4}$/.test(String(req.query.y)) ? String(req.query.y) : todayISO().slice(0, 4);
    const all = await tx.list({ range: { col: 'date', from: `${y}-01-01`, to: `${Number(y) + 1}-01-01` } });
    const items = await calendar.items(`${y}-01-01`, `${Number(y) + 1}-01-01`);
    const units = ROOMS.reduce((s, r) => s + (r.units || 1), 0);
    const months = [];
    for (let i = 1; i <= 12; i += 1) {
      const m = `${y}-${String(i).padStart(2, '0')}`;
      const rows = all.filter((t) => t.date.slice(0, 7) === m);
      const income = rows.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0);
      const expense = rows.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0);
      const days = Math.round((Date.parse(monthEnd(m)) - Date.parse(`${m}-01`)) / 864e5);
      const sold = soldNights(items, `${m}-01`, monthEnd(m));
      const roomIncome = rows.filter((t) => t.kind === 'income' && /^Booking|^Walk-in/.test(t.category)).reduce((s, t) => s + t.amount, 0);
      months.push({ m, income, expense, net: income - expense, sold, occupancy: Math.round((sold / (units * days)) * 100), adr: sold ? Math.round(roomIncome / sold) : 0 });
    }
    const byCat = (kind) => CATEGORIES[kind].map((c) => ({ c, total: all.filter((t) => t.kind === kind && t.category === c).reduce((s, t) => s + t.amount, 0) })).filter((x) => x.total);
    const totals = months.reduce((a, x) => ({ income: a.income + x.income, expense: a.expense + x.expense, sold: a.sold + x.sold }), { income: 0, expense: 0, sold: 0 });
    res.render('admin/finance-report', { title: 'Laporan laba rugi', y, months, totals, incomeCats: byCat('income'), expenseCats: byCat('expense'), units });
  }));

  router.get('/finance/export.csv', ah(async (req, res) => {
    const y = /^\d{4}$/.test(String(req.query.y)) ? String(req.query.y) : todayISO().slice(0, 4);
    const rows = await tx.list({ range: { col: 'date', from: `${y}-01-01`, to: `${Number(y) + 1}-01-01` }, order: [['date', 'asc'], ['id', 'asc']] });
    res.type('text/csv').attachment(`kalma-keuangan-${y}.csv`)
      .send(toCSV(rows.map((r) => ({ ...r, kind: r.kind === 'income' ? 'Pemasukan' : 'Pengeluaran' })), ['date', 'kind', 'category', 'amount', 'method', 'description', 'ref_type', 'ref_id', 'created_by']));
  }));
}

module.exports = { mountFinance, recordWebsitePayment, soldNights, CATEGORIES };
