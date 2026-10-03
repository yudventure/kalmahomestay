'use strict';

const crypto = require('crypto');
const express = require('express');
const { ROOMS } = require('./config');
const { STATUSES, STATUS_IDS } = require('./db/shared');
const { todayISO } = require('./inquiry');
const survey = require('./survey');

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const TZ = 'Asia/Jayapura'; // WIT, Raja Ampat local time

/* ---------- formatting helpers for the views ---------- */
function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('id-ID', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIT';
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(String(iso).slice(0, 10) + 'T00:00:00Z').toLocaleDateString('id-ID', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
}
function nights(a, b) {
  return Math.round((Date.parse(String(b).slice(0, 10)) - Date.parse(String(a).slice(0, 10))) / 864e5);
}
function phoneDisplay(p) { return p ? '+' + p : ''; }
function reply(c) {
  const hello = `Halo ${c.name || ''}, terima kasih sudah menghubungi Kalma Raja Ampat!`;
  if (c.phone) return { href: `https://wa.me/${c.phone}?text=${encodeURIComponent(hello)}`, label: 'Balas via WhatsApp' };
  if (c.email) return { href: `mailto:${c.email}?subject=${encodeURIComponent('Kalma Raja Ampat')}&body=${encodeURIComponent(hello)}`, label: 'Balas via email' };
  return null;
}

/* ---------- CSV (Excel friendly, guarded against formula injection) ---------- */
function csvCell(v) {
  if (v == null) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCSV(rows, columns) {
  const lines = [columns.join(',')].concat(rows.map((r) => columns.map((c) => csvCell(r[c])).join(',')));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

function createAdminRouter({ repo, config, t }) {
  const router = express.Router();
  let siteHost = '';
  try { siteHost = new URL(config.siteUrl).host; } catch { /* no SITE_URL */ }
  const roomName = (id) => { const r = ROOMS.find((x) => x.id === id); return r ? t(r.nameKey) : '—'; };

  /* HTTP Basic auth, user "admin". Disabled (404) when ADMIN_PASSWORD is empty. */
  router.use((req, res, next) => {
    if (!config.adminPassword) return res.status(404).send('Not found');
    const [scheme, encoded] = (req.get('authorization') || '').split(' ');
    const [user, pass] = scheme === 'Basic' && encoded ? Buffer.from(encoded, 'base64').toString().split(/:(.*)/s) : [];
    const a = crypto.createHash('sha256').update(String(pass || '')).digest();
    const b = crypto.createHash('sha256').update(config.adminPassword).digest();
    if (user === 'admin' && crypto.timingSafeEqual(a, b)) {
      res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
      return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Kalma admin", charset="UTF-8"').status(401).send('Login required');
  });

  /* Browsers resend Basic credentials automatically, so state-changing requests must come from this site (CSRF guard). */
  router.use((req, res, next) => {
    if (req.method !== 'POST') return next();
    const src = req.get('origin') || req.get('referer');
    let ok = false;
    try {
      const host = new URL(src).host;
      ok = host === req.get('host') || host === siteHost || host === req.get('x-forwarded-host');
    } catch { ok = false; }
    if (!ok) return res.status(403).send('Forbidden');
    next();
  });

  router.use((req, res, next) => {
    Object.assign(res.locals, {
      STATUSES, fmtDateTime, fmtDate, nights, phoneDisplay, reply, roomName,
      statusLabel: (id) => (STATUSES.find((s) => s.id === id) || {}).label || id,
      storage: repo.kind, flash: req.query.ok || '', flashErr: req.query.err || '',
      current: req.path, qs: (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v)).toString(),
    });
    next();
  });

  const stamp = () => todayISO();
  const idParam = (req) => {
    const id = Number(req.params.id);
    return Number.isInteger(id) && id > 0 ? id : null;
  };

  /* ---------- dashboard ---------- */
  router.get('/', ah(async (req, res) => {
    const [stats, recent] = await Promise.all([repo.stats(todayISO()), repo.listInquiries({ status: 'new' })]);
    res.render('admin/dashboard', { title: 'Ringkasan', stats, recent: recent.items.slice(0, 8), newTotal: recent.total });
  }));

  /* ---------- inquiries ---------- */
  router.get('/inquiries', ah(async (req, res) => {
    const status = STATUS_IDS.includes(req.query.status) ? req.query.status : '';
    const q = String(req.query.q || '').slice(0, 100);
    const result = await repo.listInquiries({ status, q, page: req.query.page });
    res.render('admin/inquiries', { title: 'Permintaan', result, status, q });
  }));

  router.get('/inquiries/:id', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    const item = await repo.getInquiry(id);
    if (!item) return next();
    res.render('admin/inquiry', { title: `Permintaan #${item.id}`, item });
  }));

  router.post('/inquiries/:id', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    const status = STATUS_IDS.includes(req.body.status) ? req.body.status : undefined;
    const adminNote = req.body.admin_note !== undefined ? String(req.body.admin_note).slice(0, 2000).trim() : undefined;
    const ok = await repo.updateInquiry(id, { status, adminNote });
    if (!ok) return next();
    res.redirect(303, `/admin/inquiries/${id}?ok=saved`);
  }));

  router.post('/inquiries/:id/delete', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    const item = await repo.getInquiry(id);
    if (!item) return next();
    await repo.deleteInquiry(id);
    res.redirect(303, `/admin/customers/${item.customer_id}?ok=inquiry-deleted`);
  }));

  /* ---------- customers ---------- */
  router.get('/customers', ah(async (req, res) => {
    const q = String(req.query.q || '').slice(0, 100);
    const result = await repo.listCustomers({ q, page: req.query.page });
    res.render('admin/customers', { title: 'Customer', result, q });
  }));

  router.get('/customers/:id', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    const customer = await repo.getCustomer(id);
    if (!customer) return next();
    res.render('admin/customer', { title: customer.name, customer, form: null, error: '' });
  }));

  router.post('/customers/:id', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    const f = {
      name: String(req.body.name || '').trim().slice(0, 120),
      phone: String(req.body.phone || '').trim().slice(0, 32),
      email: String(req.body.email || '').trim().slice(0, 190),
      other_contact: String(req.body.other_contact || '').trim().slice(0, 100),
      country: String(req.body.country || '').trim().slice(0, 80),
      notes: String(req.body.notes || '').trim().slice(0, 5000),
    };
    let error = '';
    if (!f.name) error = 'Nama wajib diisi.';
    else {
      try {
        const ok = await repo.updateCustomer(id, f);
        if (!ok) return next();
        return res.redirect(303, `/admin/customers/${id}?ok=saved`);
      } catch (e) {
        if (e.code === 'DUPLICATE') error = e.field === 'email' ? 'Email ini sudah dipakai customer lain.' : 'Nomor HP ini sudah dipakai customer lain.';
        else if (e.code === 'INVALID') error = e.field === 'email' ? 'Format email tidak valid.' : 'Format nomor HP tidak valid.';
        else throw e;
      }
    }
    const customer = await repo.getCustomer(id);
    if (!customer) return next();
    res.status(400).render('admin/customer', { title: customer.name, customer, form: f, error });
  }));

  router.post('/customers/:id/delete', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    const ok = await repo.deleteCustomer(id);
    if (!ok) return next();
    res.redirect(303, '/admin/customers?ok=customer-deleted');
  }));

  /* ---------- survey ---------- */
  router.get('/survey', ah(async (req, res) => {
    const all = await repo.allSurveyResponses();
    const list = await repo.listSurveyResponses({ page: req.query.page });
    res.render('admin/survey', { title: 'Survei', total: all.length, summary: survey.summarize(all), sections: survey.SECTIONS, list });
  }));

  router.get('/survey/:id', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    const r = (await repo.allSurveyResponses()).find((x) => x.id === id);
    if (!r) return next();
    res.render('admin/survey-response', { title: `Jawaban survei #${id}`, r, sections: survey.SECTIONS });
  }));

  router.post('/survey/:id/delete', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    if (!(await repo.deleteSurveyResponse(id))) return next();
    res.redirect(303, '/admin/survey?ok=survey-deleted');
  }));

  router.get('/export/survey.csv', ah(async (req, res) => {
    const rows = (await repo.allSurveyResponses()).reverse().map(survey.toRow);
    res.type('text/csv').attachment(`kalma-survey-${stamp()}.csv`).send(toCSV(rows, survey.CSV_COLUMNS));
  }));

  /* ---------- exports ---------- */
  router.get('/export/customers.csv', ah(async (req, res) => {
    const rows = await repo.exportCustomers();
    res.type('text/csv').attachment(`kalma-customers-${stamp()}.csv`)
      .send(toCSV(rows, ['id', 'name', 'phone', 'email', 'other_contact', 'country', 'lang', 'notes', 'created_at', 'inquiry_count', 'last_inquiry_at']));
  }));
  router.get('/export/inquiries.csv', ah(async (req, res) => {
    const rows = (await repo.exportInquiries()).map((r) => ({ ...r, room: r.room ? roomName(r.room) : '' }));
    res.type('text/csv').attachment(`kalma-inquiries-${stamp()}.csv`)
      .send(toCSV(rows, ['id', 'created_at', 'status', 'name', 'phone', 'email', 'other_contact', 'country', 'checkin', 'checkout', 'guests', 'room', 'message', 'admin_note', 'lang', 'customer_id']));
  }));

  router.use((req, res) => res.status(404).render('admin/notfound', { title: 'Tidak ditemukan' }));
  return router;
}

module.exports = { createAdminRouter, toCSV };
