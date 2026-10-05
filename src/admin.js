'use strict';

const crypto = require('crypto');
const path = require('path');
const express = require('express');
const { ROOMS } = require('./config');
const { STATUSES, STATUS_IDS } = require('./db/shared');
const { todayISO } = require('./inquiry');
const survey = require('./survey');
const { mountUsers, mountWebsite } = require('./admin-cms');
const { mountCalendar } = require('./admin-calendar');
const { mountHr } = require('./admin-hr');
const { mountFinance, soldNights } = require('./admin-finance');
const { mountMedia } = require('./admin-media');
const { mountFeedback } = require('./admin-feedback');
const { mountActivities } = require('./admin-activities');
const { mountContent, contentAlerts } = require('./admin-content');
const { mountInvoices, invoiceAlerts } = require('./admin-invoices');
const { mountDevMode } = require('./admin-devmode');
const { UPLOAD_ERRORS } = require('./media');
const { addDays } = require('./ical');
const { LANG_COOKIE, exact, phrases, buildEnglishViews, translateValue } = require('./admin-i18n');
const { ROLES, can, verifyPassword, passwordVersion, createSessions, readCookie, COOKIE, SESSION_HOURS } = require('./staff');

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const TZ = 'Asia/Jayapura'; // WIT, Raja Ampat local time

/* ---------- formatting helpers for the views ---------- */
function fmtDateTime(d) {
  if (!d) return '-';
  return new Date(d).toLocaleString('id-ID', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIT';
}
function fmtDate(iso) {
  if (!iso) return '-';
  return new Date(String(iso).slice(0, 10) + 'T00:00:00Z').toLocaleDateString('id-ID', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
}
const fmtDateTimeEn = (d) => (d ? new Date(d).toLocaleString('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIT' : '-');
const fmtDateEn = (iso) => (iso ? new Date(String(iso).slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }) : '-');
function nights(a, b) {
  return Math.round((Date.parse(String(b).slice(0, 10)) - Date.parse(String(a).slice(0, 10))) / 864e5);
}
function fmtRupiah(n) { return 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID'); }
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

function createAdminRouter({ repo, config, instagram, site, calendar, media, activities, payState = {}, t, translator = () => t, devmode = null }) {
  const router = express.Router();
  let siteHost = '';
  try { siteHost = new URL(config.siteUrl).host; } catch { /* no SITE_URL */ }
  const roomName = (id) => { const r = ROOMS.find((x) => x.id === id); return r ? t(r.nameKey) : '-'; };

  const idParam = (req) => {
    const id = Number(req.params.id);
    return Number.isInteger(id) && id > 0 ? id : null;
  };
  const sessions = createSessions(config.sessionSecret || 'pw:' + config.adminPassword);
  const ownerPv = () => passwordVersion('env:' + config.adminPassword);
  const OWNER = () => ({ id: 'admin', name: 'Owner', username: 'admin', role: 'owner', pv: ownerPv() });
  const users = repo.table('staff_users');
  const sameSecret = (a, b) => crypto.timingSafeEqual(crypto.createHash('sha256').update(String(a)).digest(), crypto.createHash('sha256').update(String(b)).digest());

  /* The admin is off (404) until ADMIN_PASSWORD is set in hPanel. */
  router.use((req, res, next) => {
    if (!config.adminPassword) return res.status(404).send('Not found');
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    next();
  });

  /* ---------- admin language: English by default, Indonesian on request (account menu, login page) ---------- */
  let enRoot = null;
  const LABEL_KEYS = ['title', 'greeting', 'alerts', 'STATUSES', 'UPLOAD_ERRORS', 'ROLES', 'KINDS', 'TOPICS', 'LEVEL_LABEL', 'CAT_LABEL', 'FORMATS',
    'PILLARS', 'PLATFORMS', 'ATTENDANCE', 'LEAVE_KINDS', 'PRESETS', 'groups', 'DAY_NAMES', 'columns', 'STATUS_LIST', 'SOURCES'];
  const FN_KEYS = ['groupLabel', 'statusLabel', 'roleLabel', 'roomLabel', 'roomName'];
  const tr = (s) => { const out = exact(s); return out === undefined ? s : out; };
  const english = (o) => {
    for (const k of LABEL_KEYS) if (o[k] !== undefined) o[k] = translateValue(o[k]);
    for (const k of FN_KEYS) if (typeof o[k] === 'function' && !o[k].en) { const f = o[k]; o[k] = (...a) => tr(f(...a)); o[k].en = true; }
    if (typeof o.reply === 'function' && !o.reply.en) { const f = o.reply; o.reply = (c) => { const r = f(c); return r && { ...r, label: tr(r.label) }; }; o.reply.en = true; }
    if (o.fmtDate) { o.fmtDate = fmtDateEn; o.fmtDateTime = fmtDateTimeEn; o.L = tr; }
    if (typeof o.error === 'string') o.error = phrases(o.error);
    if (typeof o.todayStatus === 'string') o.todayStatus = o.todayStatus.split(/(?<=\.)\s+/).map(phrases).join(' ');
    return o;
  };
  router.use((req, res, next) => {
    const chosen = readCookie(req, LANG_COOKIE);
    const lang = chosen === 'id' || chosen === 'en' ? chosen : (config.adminLang || 'en');
    req.adminLang = lang;
    res.locals.adminLang = lang;
    if (lang === 'en' && enRoot !== false) {
      const render = res.render.bind(res);
      res.render = (view, opts, cb) => {
        if (typeof opts === 'function') { cb = opts; opts = {}; }
        if (typeof view === 'string' && view.startsWith('admin/')) {
          if (enRoot === null) {
            try { enRoot = buildEnglishViews(req.app.get('views')); } catch (e) { enRoot = false; console.error('English admin not available:', e.message); }
          }
          if (!enRoot) return render(view, opts, cb);
          view = path.join(enRoot, view);
          english(res.locals);
          opts = english({ ...(opts || {}) });
        }
        return render(view, opts, cb);
      };
    }
    next();
  });
  router.post('/lang', (req, res) => {
    const lang = req.body.lang === 'id' ? 'id' : 'en';
    res.cookie(LANG_COOKIE, lang, { path: '/admin', httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 365 * 24 * 3600 * 1000 });
    res.redirect(303, safeNext(req.body.next));
  });

  /* State-changing requests must come from this site (CSRF guard; the session cookie is sent automatically). */
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

  /* ---------- login ---------- */
  const attempts = new Map();
  const tooMany = (ip) => {
    const now = Date.now();
    const list = (attempts.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
    attempts.set(ip, list);
    return list.length >= 10;
  };
  const safeNext = (n) => (/^\/admin(\/[\w\-/.?=&%]*)?$/.test(String(n || '')) && !String(n).startsWith('/admin/login') ? n : '/admin');

  router.get('/login', (req, res) => res.render('admin/login', { title: 'Masuk', error: '', username: '', next: safeNext(req.query.next), query: req.query }));

  router.post('/login', ah(async (req, res) => {
    const username = String(req.body.username || '').trim().toLowerCase().slice(0, 60);
    const password = String(req.body.password || '');
    const next = safeNext(req.body.next);
    const fail = (error) => res.status(401).render('admin/login', { title: 'Masuk', error, username, next });
    if (tooMany(req.ip)) return fail('Terlalu banyak percobaan. Coba lagi 15 menit lagi.');
    let user = null;
    if (username === 'admin') {
      if (sameSecret(password, config.adminPassword)) user = OWNER();
    } else {
      const u = await users.find({ username });
      if (u && u.active && verifyPassword(password, u.password_hash)) {
        user = { id: u.id, pv: passwordVersion(u.password_hash) };
        await users.update(u.id, { last_login_at: new Date() });
      }
    }
    if (!user) { attempts.get(req.ip).push(Date.now()); return fail('Username atau password salah.'); }
    res.cookie(COOKIE, sessions.issue(user), { path: '/admin', httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: SESSION_HOURS * 3600 * 1000 });
    res.redirect(303, next);
  }));

  router.post('/logout', (req, res) => {
    res.clearCookie(COOKIE, { path: '/admin' });
    if (devmode) devmode.revoke(res);
    res.redirect(303, '/admin/login');
  });

  /* ---------- who is this? (session cookie, or Basic auth for the owner) ---------- */
  router.use(ah(async (req, res, next) => {
    let staff = null;
    const [scheme, encoded] = (req.get('authorization') || '').split(' ');
    if (scheme === 'Basic' && encoded) {
      const [user, pass] = Buffer.from(encoded, 'base64').toString().split(/:(.*)/s);
      if (user === 'admin' && sameSecret(pass || '', config.adminPassword)) staff = OWNER();
    }
    if (!staff) {
      const s = sessions.read(readCookie(req, COOKIE));
      if (s && s.u === 'admin' && s.pv === ownerPv()) staff = OWNER();
      else if (s && Number.isInteger(s.u)) {
        const u = await users.get(s.u);
        if (u && u.active && s.pv === passwordVersion(u.password_hash)) staff = { id: u.id, name: u.name, username: u.username, role: u.role };
      }
    }
    if (!staff) {
      if (req.method === 'GET') return res.redirect(303, '/admin/login?next=' + encodeURIComponent(req.originalUrl));
      return res.status(401).send('Login required');
    }
    req.staff = staff;
    // signed-in staff may look at the public site while it is in maintenance
    if (devmode && req.method === 'GET' && !devmode.isStaff(req)) devmode.grant(res, req.secure);
    next();
  }));

  router.use((req, res, next) => {
    Object.assign(res.locals, {
      L: (s) => s, STATUSES, fmtDateTime, fmtDate, nights, phoneDisplay, reply, roomName, rupiah: fmtRupiah,
      statusLabel: (id) => (STATUSES.find((s) => s.id === id) || {}).label || id,
      storage: repo.kind, flash: req.query.ok || '', flashErr: req.query.err || '',
      current: req.path, qs: (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v)).toString(),
      UPLOAD_ERRORS, me: req.staff, can: (area) => can(req.staff.role, area), roleLabel: (id) => (ROLES.find((r) => r.id === id) || {}).label || id,
    });
    next();
  });

  /* ---------- bell notifications and "Status hari ini" in the sidebar ---------- */
  router.use(ah(async (req, res, next) => {
    res.locals.alerts = [];
    res.locals.todayStatus = 'Tidak ada yang perlu ditindaklanjuti hari ini.';
    if (req.method !== 'GET') return next();
    const role = req.staff.role;
    const today = todayISO();
    const alerts = [];
    const status = [];
    try {
      if (can(role, 'reservations')) {
        const [fresh, items, chans] = await Promise.all([
          repo.listInquiries({ status: 'new' }), calendar.items(addDays(today, -1), addDays(today, 1)), repo.table('channels').list({ where: { active: true } }),
        ]);
        if (fresh.total) alerts.push({ label: `${fresh.total} permintaan baru`, sub: 'Tamu menunggu balasan', href: '/admin/inquiries?status=new' });
        const fb = await repo.table('feedback').count({ where: { status: 'baru' } });
        if (fb) alerts.push({ label: `${fb} masukan tamu baru`, sub: 'Dari tombol We hear you', href: '/admin/feedback?status=baru' });
        const held = items.filter((it) => it.counts && it.type !== 'block');
        const arr = held.filter((it) => it.start === today).length;
        const dep = held.filter((it) => it.end === today).length;
        if (arr || dep) alerts.push({ label: `${arr} check-in, ${dep} check-out hari ini`, sub: 'Lihat di kalender', href: '/admin/calendar' });
        status.push(arr || dep ? `${arr} check-in dan ${dep} check-out hari ini.` : 'Tidak ada check-in atau check-out hari ini.');
        for (const c of chans.filter((x) => /^Gagal/.test(x.last_sync_status || ''))) alerts.push({ label: `Sinkron ${c.name} gagal`, sub: c.last_sync_status, href: '/admin/channels' });
      }
      if (can(role, 'reservations') || can(role, 'finance')) {
        const pay = config.payments || {};
        for (const p of pay.problems || []) alerts.push({ label: 'Pengaturan Midtrans perlu diperbaiki', sub: p, href: '/admin/inquiries' });
        if (pay.enabled && payState.lastError && (!payState.lastOkAt || payState.lastOkAt < payState.lastErrorAt)) {
          alerts.push({ label: 'Halaman pembayaran gagal dibuka', sub: /\b401\b/.test(payState.lastError)
            ? 'Midtrans menolak Server Key. Periksa MIDTRANS_SERVER_KEY di hPanel dan pastikan akun Midtrans production sudah aktif.'
            : 'Midtrans: ' + payState.lastError, href: '/admin/inquiries' });
        }
      }
      if (can(role, 'content')) {
        const c = await contentAlerts(repo, today);
        if (c.dueToday) alerts.push({ label: `${c.dueToday} konten tayang hari ini`, sub: 'Cek naskah dan materinya', href: '/admin/content' });
        if (c.late) alerts.push({ label: `${c.late} konten lewat jadwal`, sub: 'Belum ditandai sudah tayang', href: '/admin/content/board' });
        if (c.dueToday) status.push(`${c.dueToday} konten dijadwalkan tayang hari ini.`);
      }
      if (devmode && can(role, 'website')) {
        const d = devmode.state;
        if (d.site.on) alerts.push({ label: 'Website sedang mode maintenance', sub: 'Tamu melihat halaman maintenance', href: '/admin/website/devmode' });
        else if (Object.keys(d.sections).length || Object.keys(d.pages).length) alerts.push({ label: 'Sebagian website disembunyikan', sub: 'Atur di Mode developer', href: '/admin/website/devmode' });
      }
      if (can(role, 'invoices')) {
        const inv = await invoiceAlerts(repo, today);
        if (inv.overdue) alerts.push({ label: `${inv.overdue} invoice lewat jatuh tempo`, sub: 'Masih ada sisa tagihan', href: '/admin/invoices?status=overdue' });
      }
      if (can(role, 'hr')) {
        const [pending, staffCount, att] = await Promise.all([
          repo.table('leave_requests').count({ where: { status: 'pending' } }),
          repo.table('employees').count({ where: { status: 'active' } }),
          repo.table('attendance').count({ where: { date: today } }),
        ]);
        if (pending) alerts.push({ label: `${pending} pengajuan cuti`, sub: 'Menunggu persetujuan', href: '/admin/hr/leave?status=pending' });
        if (staffCount && !att) {
          alerts.push({ label: 'Absensi hari ini belum diisi', sub: `${staffCount} karyawan aktif`, href: '/admin/hr/attendance' });
          status.push('Absensi hari ini belum diisi.');
        }
      }
    } catch (e) {
      console.error('Admin notifications failed:', e.message);
    }
    res.locals.alerts = alerts;
    if (status.length) res.locals.todayStatus = status.join(' ');
    next();
  }));

  /* ---------- who may open what ---------- */
  const need = (area) => (req, res, next) => (can(req.staff.role, area) ? next()
    : res.status(403).render('admin/forbidden', { title: 'Tidak ada akses' }));
  router.use(['/inquiries', '/customers', '/calendar', '/channels', '/feedback', '/export/customers.csv', '/export/inquiries.csv'], need('reservations'));
  router.use(['/website', '/instagram', '/survey', '/export/survey.csv'], need('website'));
  router.use('/content', need('content'));
  router.use('/hr', need('hr'));
  router.use('/payroll', need('payroll'));
  router.use('/finance', need('finance'));
  router.use('/invoices', need('invoices'));
  router.use('/users', need('users'));

  mountUsers(router, { repo, ah, idParam });
  mountWebsite(router, { site, ah, t });
  mountCalendar(router, { repo, calendar, config, ah, idParam, t });
  mountHr(router, { repo, ah, idParam });
  mountFinance(router, { repo, calendar, ah, idParam, toCSV });
  mountMedia(router, { repo, media, ah, idParam, t });
  mountFeedback(router, { repo, ah, idParam });
  if (activities) mountActivities(router, { activities, media, ah, idParam });
  mountContent(router, { repo, media, ah, idParam });
  mountInvoices(router, { repo, config, ah, idParam, translator });
  if (devmode) mountDevMode(router, { devmode, ah });

  const stamp = () => todayISO();

  /* ---------- dashboard ---------- */
  router.get('/', ah(async (req, res) => {
    const role = req.staff.role;
    const today = todayISO();
    const month = today.slice(0, 7);
    const monthStart = `${month}-01`;
    const nextMonth = addDays(monthStart, 32).slice(0, 7) + '-01';
    const hour = Number(new Date().toLocaleString('en-GB', { timeZone: 'Asia/Jayapura', hour: '2-digit', hour12: false }));
    const greeting = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 18 ? 'Selamat sore' : 'Selamat malam';
    const view = { title: 'Ringkasan', today, greeting, firstName: String(req.staff.name || '').split(/\s+/)[0] };
    if (can(role, 'reservations')) {
      const [stats, recent, items] = await Promise.all([repo.stats(today), repo.listInquiries({ status: 'new' }), calendar.items(monthStart < today ? monthStart : today, nextMonth)]);
      const held = items.filter((it) => it.counts && it.type !== 'block');
      const units = ROOMS.reduce((s, r) => s + (r.units || 1), 0);
      const days = Math.round((Date.parse(nextMonth) - Date.parse(monthStart)) / 864e5);
      Object.assign(view, {
        stats, recent: recent.items.slice(0, 8), newTotal: recent.total,
        arrivals: held.filter((it) => it.start === today), departures: held.filter((it) => it.end === today),
        inHouse: held.filter((it) => it.start <= today && it.end > today),
        occupancy: Math.round((soldNights(items, monthStart, nextMonth) / (units * days)) * 100),
      });
    }
    if (can(role, 'finance')) {
      const tx = await repo.table('transactions').list({ range: { col: 'date', from: monthStart, to: nextMonth } });
      view.income = tx.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0);
      view.expense = tx.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0);
    }
    if (can(role, 'hr')) {
      const [staff, att, pending] = await Promise.all([
        repo.table('employees').count({ where: { status: 'active' } }),
        repo.table('attendance').list({ where: { date: today } }),
        repo.table('leave_requests').count({ where: { status: 'pending' } }),
      ]);
      Object.assign(view, { staffCount: staff, presentToday: att.filter((a) => a.status === 'hadir').length, attendanceFilled: att.length, pendingLeave: pending });
    }
    if (can(role, 'content')) {
      const week = await repo.table('content_posts').list({ range: { col: 'publish_date', from: today, to: addDays(today, 7) }, order: [['publish_date', 'asc'], ['publish_time', 'asc']] });
      Object.assign(view, { contentWeek: week, contentIdeas: await repo.table('content_posts').count({ where: { status: 'ide' } }) });
    }
    res.render('admin/dashboard', view);
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
    const payments = can(req.staff.role, 'finance') ? await repo.table('transactions').list({ where: { ref_type: 'inquiry', ref_id: id, kind: 'income' }, order: [['date', 'asc']] }) : [];
    const invoices = can(req.staff.role, 'invoices') ? await repo.table('invoices').list({ where: { inquiry_id: id }, order: [['id', 'asc']] }) : [];
    res.render('admin/inquiry', { title: `Permintaan #${item.id}`, item, payments, invoices });
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

  /* ---------- Instagram comments ---------- */
  router.get('/instagram', ah(async (req, res) => {
    const [items, sync] = await Promise.all([repo.listIgComments(), instagram.status()]);
    res.render('admin/instagram', { title: 'Komentar Instagram', items, sync, enabled: instagram.enabled });
  }));

  router.post('/instagram/sync', ah(async (req, res) => {
    const s = await instagram.syncNow();
    res.redirect(303, s.ok ? '/admin/instagram?ok=ig-synced' : '/admin/instagram?err=ig-sync');
  }));

  // Comments copied from Instagram by hand (until the account's API token is available).
  router.post('/instagram/add', ah(async (req, res) => {
    const username = String(req.body.username || '').trim().replace(/^@/, '');
    const text = String(req.body.text || '').replace(/\s+/g, ' ').trim();
    const link = String(req.body.link || '').trim();
    if (!/^[\w.]{1,30}$/.test(username) || text.length < 4 || text.length > 600
      || (link && !/^https:\/\/(www\.)?instagram\.com\/\S+$/i.test(link))) {
      return res.redirect(303, '/admin/instagram?err=ig-invalid');
    }
    await repo.saveIgComments([{
      id: 'manual-' + crypto.randomBytes(6).toString('hex'), mediaId: 'manual', permalink: link || null,
      kind: req.body.kind === 'reel' ? 'reel' : 'post', username, text, likes: 0, timestamp: new Date().toISOString(),
    }], []);
    await instagram.reload();
    res.redirect(303, '/admin/instagram?ok=ig-added');
  }));

  const igId = (req) => (/^[\w-]{1,40}$/.test(String(req.params.id)) ? String(req.params.id) : null);

  router.post('/instagram/:id/visibility', ah(async (req, res, next) => {
    const id = igId(req);
    if (!id || !(await repo.setIgCommentHidden(id, req.body.hidden === '1'))) return next();
    await instagram.reload();
    res.redirect(303, '/admin/instagram?ok=saved');
  }));

  router.post('/instagram/:id/delete', ah(async (req, res, next) => {
    const id = igId(req);
    if (!id || !id.startsWith('manual-') || !(await repo.deleteIgComment(id))) return next();
    await instagram.reload();
    res.redirect(303, '/admin/instagram?ok=ig-deleted');
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
      .send(toCSV(rows, ['id', 'created_at', 'status', 'name', 'phone', 'email', 'other_contact', 'country', 'checkin', 'checkout', 'guests', 'room', 'item', 'message', 'admin_note', 'lang', 'customer_id', 'order_id', 'total', 'amount', 'payment_status', 'payment_type', 'paid_at']));
  }));

  router.use((req, res) => res.status(404).render('admin/notfound', { title: 'Tidak ditemukan' }));
  return router;
}

module.exports = { createAdminRouter, toCSV };
