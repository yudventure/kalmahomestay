'use strict';

/**
 * Admin › Invoice: invoices for guests and agents.
 *   /admin/invoices              list, totals, payment details shown on every invoice
 *   /admin/invoices/new          new invoice (?inquiry=<id> fills it from a booking)
 *   /admin/invoices/:id          edit, mark as sent, record a payment, cancel
 *   /admin/invoices/:id/print    the invoice itself in English or Indonesian, printable and savable as PDF
 * Payments are income rows in `transactions` (ref_type 'invoice'), so they also appear in Keuangan.
 * Payments already recorded on the linked booking (online through Midtrans or by hand) count too.
 */
const { ROOMS } = require('./config');
const { todayISO } = require('./inquiry');
const { addDays } = require('./ical');
const { CATEGORIES, METHODS } = require('./admin-finance');

const STATUSES = ['draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled'];
const MAX_ITEMS = 30;

const str = (v, max = 255) => String(v == null ? '' : v).replace(/\r\n/g, '\n').trim().slice(0, max);
const money = (v) => Math.max(0, Math.round(Number(String(v == null ? '' : v).replace(/[^\d]/g, ''))) || 0);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(Date.parse(s));
const nightsOf = (a, b) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 864e5));

/** Work out the money: line amounts, subtotal, discount, tax and total. */
function totals(items, discount = 0, taxPct = 0) {
  const lines = items.map((it) => ({ ...it, amount: Math.round(it.qty * it.price) }));
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const disc = Math.min(Math.max(0, Math.round(discount)), subtotal);
  const tax = Math.round(((subtotal - disc) * Math.max(0, taxPct)) / 100);
  return { lines, subtotal, discount: disc, tax, total: subtotal - disc + tax };
}

const parseItems = (json) => { try { const a = JSON.parse(json || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };

/** Paid, balance and the status people see (draft, sent, partial, paid, overdue, cancelled). */
function standing(inv, paid, today = todayISO()) {
  const balance = Math.max(0, inv.total - paid);
  let state = inv.status;
  if (inv.status !== 'cancelled' && inv.status !== 'draft') {
    if (inv.total > 0 && paid >= inv.total) state = 'paid';
    else if (inv.due_date && inv.due_date < today) state = 'overdue';
    else if (paid > 0) state = 'partial';
  }
  if (inv.status === 'draft' && inv.total > 0 && paid >= inv.total) state = 'paid';
  return { paid, balance, state };
}

/** Next number for the month, e.g. INV-202610-001. */
async function nextNumber(table, date) {
  const prefix = `INV-${date.slice(0, 4)}${date.slice(5, 7)}-`;
  const same = (await table.list({ range: { col: 'issue_date', from: `${date.slice(0, 7)}-01`, to: addDays(`${date.slice(0, 7)}-01`, 32).slice(0, 7) + '-01' } }))
    .map((i) => Number(String(i.number || '').startsWith(prefix) ? i.number.slice(prefix.length) : 0));
  let n = Math.max(0, ...same) + 1;
  while (await table.find({ number: prefix + String(n).padStart(3, '0') })) n++;
  return prefix + String(n).padStart(3, '0');
}

function mountInvoices(router, { repo, config, ah, idParam, translator }) {
  const invoices = repo.table('invoices');
  const tx = repo.table('transactions');

  async function paidFor(inv) {
    const own = await tx.list({ where: { ref_type: 'invoice', ref_id: inv.id, kind: 'income' } });
    const booking = inv.inquiry_id ? await tx.list({ where: { ref_type: 'inquiry', ref_id: inv.inquiry_id, kind: 'income' } }) : [];
    let online = 0;
    if (inv.inquiry_id && !booking.length) {
      // a booking paid online before the ledger existed still counts
      const q = await repo.getInquiry(inv.inquiry_id).catch(() => null);
      if (q && q.payment_status === 'paid') online = Number(q.amount) || 0;
    }
    const payments = [...own, ...booking].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
    return { payments, paid: payments.reduce((s, p) => s + p.amount, 0) + online, online };
  }

  const settings = async () => ({ payment_info: '', footer: '', ...((await repo.getSetting('invoice_settings').catch(() => null)) || {}) });

  /* ---------- list ---------- */
  router.get('/invoices', ah(async (req, res) => {
    const today = todayISO();
    const filter = STATUSES.includes(req.query.status) ? req.query.status : '';
    const q = str(req.query.q, 80).toLowerCase();
    const all = await invoices.list({ order: [['issue_date', 'desc'], ['id', 'desc']], limit: 1000 });
    const rows = [];
    for (const inv of all) rows.push({ ...inv, ...standing(inv, (await paidFor(inv)).paid, today) });
    const open = rows.filter((r) => ['sent', 'partial', 'overdue'].includes(r.state));
    const month = today.slice(0, 7);
    const sums = {
      outstanding: open.reduce((s, r) => s + r.balance, 0),
      overdue: rows.filter((r) => r.state === 'overdue').length,
      billed: rows.filter((r) => r.state !== 'cancelled' && r.state !== 'draft' && String(r.issue_date).slice(0, 7) === month).reduce((s, r) => s + r.total, 0),
      drafts: rows.filter((r) => r.state === 'draft').length,
    };
    const list = rows.filter((r) => (!filter || r.state === filter)
      && (!q || [r.number, r.customer_name, r.customer_email].some((v) => String(v || '').toLowerCase().includes(q))));
    res.render('admin/invoices', { title: 'Invoice', list, sums, filter, q, STATUSES, settings: await settings(), today });
  }));

  router.post('/invoices/settings', ah(async (req, res) => {
    await repo.setSetting('invoice_settings', { payment_info: str(req.body.payment_info, 1500), footer: str(req.body.footer, 500) });
    res.redirect(303, '/admin/invoices?ok=saved');
  }));

  /* ---------- new invoice, from scratch or from a booking ---------- */
  async function fromInquiry(id, lang) {
    const q = await repo.getInquiry(id).catch(() => null);
    if (!q) return null;
    const n = q.checkin && q.checkout ? nightsOf(q.checkin, q.checkout) : 0;
    const guests = Number(q.guests) || 1;
    const tr = translator(lang);
    const items = [];
    const fmt = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString(lang === 'en' ? 'en-GB' : 'id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    if (q.item) {
      const total = Number(q.total) || 0;
      items.push({ desc: `${q.item} · ${fmt(q.checkin)}`, qty: guests, price: guests ? Math.round(total / guests) : total });
    } else {
      const room = ROOMS.find((r) => r.id === q.room);
      const name = room ? tr(room.nameKey) : (lang === 'en' ? 'Room' : 'Kamar');
      const qty = Math.max(1, n * guests);
      const price = q.total ? Math.round(Number(q.total) / qty) : room ? room.price : 0;
      const per = lang === 'en' ? `${n} nights × ${guests} guests` : `${n} malam × ${guests} tamu`;
      items.push({ desc: `${name}, ${fmt(q.checkin)} to ${fmt(q.checkout)} (${per})`.replace(' to ', lang === 'en' ? ' to ' : ' sampai '), qty, price });
    }
    return {
      inquiry_id: q.id, customer_name: q.name || '', customer_email: q.email || '', customer_phone: q.phone ? '+' + String(q.phone).replace(/^\+/, '') : '',
      customer_address: q.country || '', lang, items: JSON.stringify(items),
    };
  }

  router.get('/invoices/new', ah(async (req, res) => {
    const today = todayISO();
    const lang = req.query.lang === 'id' ? 'id' : 'en';
    let inv = { issue_date: today, due_date: addDays(today, 7), lang, status: 'draft', tax_pct: 0, discount: 0, items: JSON.stringify([{ desc: '', qty: 1, price: 0 }]) };
    const qid = Number(req.query.inquiry);
    if (qid) {
      const q = await repo.getInquiry(qid).catch(() => null);
      const qLang = req.query.lang ? lang : q && q.lang === 'id' ? 'id' : 'en';
      const pre = q && (await fromInquiry(qid, qLang));
      if (pre) inv = { ...inv, ...pre };
    }
    res.render('admin/invoice', { title: 'Invoice baru', inv, items: parseItems(inv.items), isNew: true, error: '', payments: [], money: null, METHODS, CATEGORIES });
  }));

  function read(b) {
    const descs = [].concat(b.item_desc || []);
    const qtys = [].concat(b.item_qty || []);
    const prices = [].concat(b.item_price || []);
    const items = [];
    for (let i = 0; i < descs.length && items.length < MAX_ITEMS; i++) {
      const desc = str(descs[i], 300);
      const qty = Math.max(0, Number(String(qtys[i] || '').replace(',', '.')) || 0);
      const price = money(prices[i]);
      if (desc || price) items.push({ desc, qty: qty || 1, price });
    }
    const m = totals(items, money(b.discount), Math.min(100, Math.max(0, parseInt(b.tax_pct, 10) || 0)));
    const v = {
      customer_name: str(b.customer_name, 120), customer_email: str(b.customer_email, 160), customer_phone: str(b.customer_phone, 40),
      customer_address: str(b.customer_address, 600), issue_date: isDate(b.issue_date) ? b.issue_date : todayISO(),
      due_date: isDate(b.due_date) ? b.due_date : null, lang: b.lang === 'id' ? 'id' : 'en', notes: str(b.notes, 2000),
      inquiry_id: Number(b.inquiry_id) || null, items: JSON.stringify(items), subtotal: m.subtotal, discount: m.discount,
      tax_pct: Math.min(100, Math.max(0, parseInt(b.tax_pct, 10) || 0)), tax: m.tax, total: m.total,
    };
    let error = '';
    if (!v.customer_name) error = 'Isi nama tamu atau perusahaan.';
    else if (!items.length || !items.some((i) => i.desc)) error = 'Tambahkan minimal satu baris tagihan.';
    else if (v.due_date && v.due_date < v.issue_date) error = 'Jatuh tempo tidak boleh sebelum tanggal invoice.';
    return { v, items, error };
  }

  router.post('/invoices', ah(async (req, res) => {
    const { v, items, error } = read(req.body);
    if (error) return res.status(400).render('admin/invoice', { title: 'Invoice baru', inv: { ...v, status: 'draft' }, items, isNew: true, error, payments: [], money: null, METHODS, CATEGORIES });
    const number = await nextNumber(invoices, v.issue_date);
    const id = await invoices.insert({ ...v, number, status: req.body.send === '1' ? 'sent' : 'draft', created_by: req.staff.username });
    res.redirect(303, `/admin/invoices/${id}?ok=saved`);
  }));

  /* ---------- one invoice ---------- */
  async function load(req) {
    const id = idParam(req);
    return id ? invoices.get(id) : null;
  }

  router.get('/invoices/:id', ah(async (req, res, next) => {
    const inv = await load(req); if (!inv) return next();
    const p = await paidFor(inv);
    res.render('admin/invoice', {
      title: inv.number, inv, items: parseItems(inv.items), isNew: false, error: '', payments: p.payments, online: p.online,
      money: standing(inv, p.paid), METHODS, CATEGORIES, today: todayISO(),
    });
  }));

  router.post('/invoices/:id', ah(async (req, res, next) => {
    const inv = await load(req); if (!inv) return next();
    const { v, items, error } = read(req.body);
    if (error) {
      const p = await paidFor(inv);
      return res.status(400).render('admin/invoice', { title: inv.number, inv: { ...inv, ...v }, items, isNew: false, error, payments: p.payments, online: p.online, money: standing(inv, p.paid), METHODS, CATEGORIES, today: todayISO() });
    }
    await invoices.update(inv.id, v);
    res.redirect(303, `/admin/invoices/${inv.id}?ok=saved`);
  }));

  router.post('/invoices/:id/status', ah(async (req, res, next) => {
    const inv = await load(req); if (!inv) return next();
    const status = ['draft', 'sent', 'cancelled'].includes(req.body.status) ? req.body.status : null;
    if (status) await invoices.update(inv.id, { status });
    res.redirect(303, `/admin/invoices/${inv.id}?ok=saved`);
  }));

  router.post('/invoices/:id/payment', ah(async (req, res, next) => {
    const inv = await load(req); if (!inv) return next();
    const amount = money(req.body.amount);
    if (!amount || inv.status === 'cancelled') return res.redirect(303, `/admin/invoices/${inv.id}?err=payment`);
    const category = CATEGORIES.income.includes(req.body.category) ? req.body.category : 'Lainnya';
    await tx.insert({
      date: isDate(req.body.date) ? req.body.date : todayISO(), kind: 'income', category, amount,
      method: METHODS.includes(req.body.method) ? req.body.method : 'transfer',
      description: `Invoice ${inv.number} · ${inv.customer_name}`, ref_type: 'invoice', ref_id: inv.id, created_by: req.staff.username,
    });
    if (inv.status === 'draft') await invoices.update(inv.id, { status: 'sent' });
    res.redirect(303, `/admin/invoices/${inv.id}?ok=saved#bayar`);
  }));

  router.post('/invoices/:id/delete', ah(async (req, res, next) => {
    const inv = await load(req); if (!inv) return next();
    if (inv.status !== 'draft' || (await tx.count({ where: { ref_type: 'invoice', ref_id: inv.id } }))) {
      return res.redirect(303, `/admin/invoices/${inv.id}?err=delete`);
    }
    await invoices.remove(inv.id);
    res.redirect(303, '/admin/invoices?ok=deleted');
  }));

  /* ---------- the invoice document ---------- */
  router.get('/invoices/:id/print', ah(async (req, res, next) => {
    const inv = await load(req); if (!inv) return next();
    const lang = ['en', 'id'].includes(req.query.lang) ? req.query.lang : inv.lang === 'id' ? 'id' : 'en';
    const p = await paidFor(inv);
    const m = totals(parseItems(inv.items), inv.discount, inv.tax_pct);
    // rendered outside views/admin so the admin translator never touches the guest's invoice
    res.render('invoice-print', {
      inv, m, lang, s: standing(inv, p.paid), settings: await settings(), contact: config.contact, siteUrl: config.siteUrl,
      W: PRINT[lang], money: (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString(lang === 'en' ? 'en-US' : 'id-ID'),
      date: (d) => (d ? new Date(String(d).slice(0, 10) + 'T00:00:00Z').toLocaleDateString(lang === 'en' ? 'en-GB' : 'id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '-'),
    });
  }));
}

/* Words on the printed invoice, in the guest's language. */
const PRINT = {
  en: {
    invoice: 'Invoice', number: 'Invoice number', issued: 'Issue date', due: 'Due date', billTo: 'Bill to', from: 'From',
    desc: 'Description', qty: 'Qty', price: 'Unit price', amount: 'Amount', subtotal: 'Subtotal', discount: 'Discount', tax: 'Tax',
    total: 'Total', paid: 'Paid', balance: 'Balance due', payTitle: 'How to pay', notes: 'Notes', thanks: 'Thank you for staying with Kalma.',
    state: { draft: 'Draft', sent: 'Unpaid', partial: 'Partly paid', paid: 'Paid', overdue: 'Overdue', cancelled: 'Cancelled' },
    print: 'Print or save as PDF', other: 'Bahasa Indonesia',
  },
  id: {
    invoice: 'Invoice', number: 'Nomor invoice', issued: 'Tanggal', due: 'Jatuh tempo', billTo: 'Ditagihkan kepada', from: 'Dari',
    desc: 'Keterangan', qty: 'Jml', price: 'Harga satuan', amount: 'Jumlah', subtotal: 'Subtotal', discount: 'Diskon', tax: 'Pajak',
    total: 'Total', paid: 'Sudah dibayar', balance: 'Sisa tagihan', payTitle: 'Cara pembayaran', notes: 'Catatan', thanks: 'Terima kasih telah menginap di Kalma.',
    state: { draft: 'Draf', sent: 'Belum dibayar', partial: 'Dibayar sebagian', paid: 'Lunas', overdue: 'Lewat jatuh tempo', cancelled: 'Dibatalkan' },
    print: 'Cetak atau simpan PDF', other: 'English',
  },
};

/** For the bell: invoices past their due date with money still owed. */
async function invoiceAlerts(repo, today = todayISO()) {
  const open = await repo.table('invoices').list({ where: { status: 'sent' }, range: { col: 'due_date', from: '2000-01-01', to: today } });
  let overdue = 0;
  for (const inv of open) {
    const paid = (await repo.table('transactions').list({ where: { ref_type: 'invoice', ref_id: inv.id, kind: 'income' } })).reduce((s, p) => s + p.amount, 0)
      + (inv.inquiry_id ? (await repo.table('transactions').list({ where: { ref_type: 'inquiry', ref_id: inv.inquiry_id, kind: 'income' } })).reduce((s, p) => s + p.amount, 0) : 0);
    if (paid < inv.total) overdue++;
  }
  return { overdue };
}

module.exports = { mountInvoices, invoiceAlerts, totals, standing, nextNumber, PRINT, STATUSES };
