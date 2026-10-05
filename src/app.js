'use strict';

const path = require('path');
const express = require('express');
const { loadConfig, ROOMS, GUEST_OPTIONS } = require('./config');
const { createRepo } = require('./db');
const { createAdminRouter } = require('./admin');
const { createInstagramSync } = require('./instagram');
const { createSite } = require('./site');
const { createCalendar } = require('./calendar');
const { createMedia } = require('./media');
const { createActivities, servicePath, bookPath, homePath } = require('./activities');
const { mountLegal, PATHS: LEGAL_PATHS } = require('./legal');
const { createDevMode } = require('./devmode');
const { TEXT: ERR_TEXT, SECTION_NOTE } = require('./errors');
const { mountBooking } = require('./booking');
const { recordWebsitePayment } = require('./admin-finance');
const payments = require('./payments');
const { normalizeEmail, normalizePhone } = require('./db/shared');
const fs = require('fs');
const compression = require('compression');

const ROOT = path.join(__dirname, '..');
const CONTENT = {
  id: require('../content/id.json'),
  en: require('../content/en.json'),
};
/** Partner names for the running text under the facts strip (content/partners.json). */
function loadPartners() {
  try {
    const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/partners.json'), 'utf8')).partners;
    return Array.isArray(list) ? list.map((p) => String(p).trim()).filter(Boolean).slice(0, 40) : [];
  } catch { return []; }
}

function translator(lang) {
  const dict = CONTENT[lang];
  return (key) => (key in dict ? dict[key] : CONTENT.id[key] != null ? CONTENT.id[key] : key);
}

/**
 * Real photos: drop e.g. public/img/hero-1.jpg and every `photo('hero-1')` slot uses it;
 * slots without a file keep their gradient placeholder. Read per request so new files show up without a restart.
 */
function photoFinder(dir = path.join(ROOT, 'public/img')) {
  const found = {};
  let files = [];
  try { files = fs.readdirSync(dir); } catch { /* no photos yet */ }
  for (const f of files.sort()) {
    const m = /^([a-z0-9-]+)\.(jpe?g|png|webp|avif)$/i.exec(f);
    if (m && !found[m[1]]) found[m[1]] = '/img/' + f;
  }
  const photo = (name) => (found[name] ? `--img:url(${found[name]})` : '');
  photo.url = (name) => found[name] || '';
  return photo;
}

/**
 * Short videos: drop public/video/hero-1.mp4 (and optionally hero-1.webm) and the matching tile plays it.
 * Returns { mp4, webm } URLs, or null when the slot has no video.
 */
function videoFinder(dir = path.join(ROOT, 'public/video')) {
  const found = {};
  let files = [];
  try { files = fs.readdirSync(dir); } catch { /* no videos yet */ }
  for (const f of files) {
    const m = /^([a-z0-9-]+)\.(mp4|webm)$/i.exec(f);
    if (m) (found[m[1]] ||= {})[m[2].toLowerCase()] = '/video/' + f;
  }
  return (name) => found[name] || null;
}

/** Photos uploaded in the admin win over files in public/img. */
function withUploads(files, media) {
  const photo = (name) => { const u = media.photoUrl(name); return u ? `--img:url(${u})` : files(name); };
  photo.url = (name) => media.photoUrl(name) || files.url(name);
  return photo;
}

/** Changes on every start (= every deploy) so browsers fetch fresh CSS/JS despite long caching. */
const ASSET_VERSION = Date.now().toString(36);

const rupiah = (n) => 'Rp ' + n.toLocaleString('id-ID');

/** JSON safe to embed inside <script> */
const embedJSON = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

/** Wrap async route handlers so errors reach Express' error handler. */
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Build the Express app. Call `await app.locals.repo.init()` before listening
 * (server.js does this) so database migrations run first.
 */
function createApp(options = {}) {
  const config = { ...loadConfig(), ...options };
  const repo = options.repo || createRepo(config);
  const app = express();

  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', path.join(ROOT, 'views'));
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'SAMEORIGIN',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    next();
  });

  app.use(compression()); // gzip HTML/CSS/JS/SVG (videos and images are already compressed and skipped)
  app.locals.v = ASSET_VERSION;
  // CSS/JS URLs carry ?v=<deploy>, so browsers may keep them for a year; media and fonts for 30 days.
  const versioned = { maxAge: '365d', immutable: true };
  const staticOpts = { maxAge: '30d' };
  app.use('/css', express.static(path.join(ROOT, 'public/css'), versioned));
  app.use('/js', express.static(path.join(ROOT, 'public/js'), versioned));
  app.use('/fonts', express.static(path.join(ROOT, 'public/fonts'), { maxAge: '365d', immutable: true }));
  app.use('/img', express.static(path.join(ROOT, 'public/img'), staticOpts));
  app.use('/video', express.static(path.join(ROOT, 'public/video'), staticOpts));
  // Only the brand files the site needs are public (not the guideline sources).
  app.use('/brand/assets', express.static(path.join(ROOT, 'brand/assets'), staticOpts));
  app.get('/brand/tokens.css', (req, res) => res.sendFile(path.join(ROOT, 'brand/tokens.css')));
  // Site ownership files (e.g. Google Search Console googleXXXX.html) served from the site root.
  app.use(express.static(path.join(ROOT, 'public/verify'), { index: false }));
  app.get('/favicon.ico', (req, res) => res.sendFile(path.join(ROOT, 'brand/assets/favicon.ico')));

  app.use(express.urlencoded({ extended: false, limit: '20kb' }));
  app.use(express.json({ limit: '10kb' }));

  const pay = config.payments || { enabled: false, percent: 100 };
  config.contact = { ...config.contact }; // website settings update this copy in place
  const site = createSite({ repo, config, content: CONTENT });
  app.locals.site = site;
  app.locals.loadPartners = loadPartners;
  const calendar = createCalendar({ repo, fetchImpl: options.calendarFetch, allowPrivate: options.allowPrivateIcal });
  app.locals.calendar = calendar;
  const media = createMedia({ repo, dir: options.uploadDir || config.uploadDir || path.join(config.dataDir, 'uploads') });
  app.locals.media = media;
  app.locals.builtInMedia = () => ({ photo: photoFinder().url, video: videoFinder() });
  const activities = createActivities({ repo, media });
  app.locals.activities = activities;

  // Website photos and videos uploaded in the admin (documents are never served here).
  app.get('/media/:file', ah(async (req, res, next) => {
    if (!/^[a-f0-9]{24}\.(jpg|png|webp|mp4|webm)$/.test(req.params.file)) return next();
    const row = await media.findPublic(req.params.file);
    if (!row) return next();
    res.sendFile(media.filePath(row), { maxAge: '30d', headers: { 'Content-Type': row.mime } }, (err) => { if (err && !res.headersSent) next(); });
  }));
  /* ---------- developer mode: maintenance for the whole site, a page or a homepage section ---------- */
  const devmode = createDevMode({ repo, secret: config.sessionSecret || 'pw:' + config.adminPassword });
  app.locals.devmode = devmode;
  const langOfPath = (p) => (/^\/(id|pesan|layanan|masukan|privasi|ketentuan)(\/|$)/.test(p) ? 'id' : 'en');
  const untilText = (lang) => {
    const u = devmode.state.site.until;
    if (!u) return '';
    const d = new Date(u + ':00+09:00');
    return isNaN(d) ? '' : d.toLocaleString(lang === 'en' ? 'en-GB' : 'id-ID', { timeZone: 'Asia/Jayapura', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) + ' WIT';
  };
  /** The branded page for 401, 403, 404, 500, 503 (whole site in maintenance) and 'page' (one page in maintenance). */
  function renderError(res, code, lang, extra = {}) {
    const status = code === 'page' ? 503 : Number(code);
    if (status === 503) res.set({ 'Retry-After': '3600', 'Cache-Control': 'no-store' });
    res.status(status).render('error', {
      code, lang, E: ERR_TEXT[lang], home: homePath(lang), contact: config.contact, until: '', message: '', ...extra,
    });
  }
  app.locals.renderError = renderError;
  app.use(ah(async (req, res, next) => {
    if (devmode.ALWAYS_OPEN.test(req.path)) return next();
    const st = await devmode.fresh();
    const busy = st.site.on || Object.keys(st.sections).length || Object.keys(st.pages).length;
    // pages must follow the switch right away, so they are never kept in a cache while it is in use
    if (busy) res.set('Cache-Control', 'no-store');
    if (devmode.isStaff(req) && req.query.as !== 'guest') {
      res.locals.devStaff = true;
      if (busy) {
        res.locals.devBar = st.site.on ? 'Staff preview. Guests see the maintenance page.' : 'Staff preview. Some sections or pages are hidden or under maintenance for guests.';
        res.locals.devGuestUrl = req.path + '?as=guest';
      }
      return next();
    }
    const lang = langOfPath(req.path);
    if (st.site.on) {
      if (/\/api\//.test(req.path)) return res.status(503).json({ ok: false, error: ERR_TEXT[lang][503].title });
      return renderError(res, 503, lang, { until: untilText(lang), message: lang === 'en' ? st.site.msg_en : st.site.msg_id });
    }
    if (devmode.pageDown(req.path)) {
      if (/\/api\//.test(req.path)) return res.status(503).json({ ok: false, error: ERR_TEXT[lang].page.title });
      return renderError(res, 'page', lang);
    }
    next();
  }));
  // what a homepage section shows: the section, nothing, or a short note (staff always see the section, marked)
  const STATE_LABEL = { hide: 'Hidden from guests', maint: 'Under maintenance for guests' };
  const sectionHelpers = (res, lang) => {
    const staff = Boolean(res.locals.devStaff);
    return {
      vis: (id) => staff || devmode.section(id) === 'show',
      devAttr: (id) => (staff && devmode.section(id) !== 'show' ? ` data-dev="${STATE_LABEL[devmode.section(id)]}"` : ''),
      secNote: (id) => (!staff && devmode.section(id) === 'maint'
        ? `<section class="sec-maint" aria-label="${SECTION_NOTE[lang]}"><div class="wrap"><div class="sec-maint__in"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 34c0-11 7-19 16-19s16 8 16 19c0 3-2 4-5 4H13c-3 0-5-1-5-4z" fill="#EDE0B5" stroke="#224866" stroke-width="2.5"/><path d="M24 24a6 6 0 1 1-6 6c0-2 2-4 4-4a3 3 0 0 1 3 3" fill="none" stroke="#224866" stroke-width="2.2" stroke-linecap="round"/><path d="M6 40c6-2 12-2 18 0s12 2 18 0" fill="none" stroke="#4B8AA5" stroke-width="2.5" stroke-linecap="round"/></svg><p>${SECTION_NOTE[lang]}</p></div></div></section>`
        : ''),
    };
  };

  const instagram = options.instagramSync || createInstagramSync({ repo, token: (config.instagram || {}).token, api: options.instagramApi });
  app.locals.instagram = instagram;

  function renderHome(res, lang, extra = {}) {
    const t = translator(lang);
    const base = lang === 'en' ? '/en' : '';
    res.render('index', {
      ...sectionHelpers(res, lang),
      pay,
      lang, t, rupiah,
      photo: withUploads(photoFinder(), media),
      video: ((files) => (name) => media.video(name) || files(name))(videoFinder()),
      partners: (site.partners() || loadPartners()).map((name) => ({ name, logo: media.logoUrl(name) })),
      igReviews: instagram.comments,
      rooms: ROOMS,
      guestOptions: GUEST_OPTIONS,
      contact: config.contact,
      siteUrl: config.siteUrl,
      googleVerification: config.googleVerification,
      path: homePath(lang),
      home: homePath(lang),
      base,
      year: new Date().getFullYear(),
      servicePath: (id) => servicePath(lang, id),
      bookPath: bookPath(lang),
      feedbackPath: lang === 'en' ? '/en/feedback' : '/masukan',
      anchor: (h) => h,
      clientConfig: embedJSON({ lang, base, today: new Date().toISOString().slice(0, 10), bookPath: bookPath(lang), ui: t('bk') }),
      ...extra,
    });
  }

  /* ---------- booking inquiries ---------- */
  const hits = new Map(); // simple per-IP rate limit: 10 inquiries / 10 min
  function rateLimited(ip, scope = 'inquiry') {
    const key = scope + ':' + ip;
    const now = Date.now();
    const list = (hits.get(key) || []).filter((ts) => now - ts < 10 * 60 * 1000);
    list.push(now);
    hits.set(key, list);
    if (hits.size > 5000) hits.clear();
    return list.length > 10;
  }

  /* ---------- booking page, service pages and online payment (Midtrans Snap) ---------- */
  const payState = { lastError: '', lastErrorAt: null, lastOkAt: null };
  app.locals.payState = payState;
  const booking = mountBooking(app, {
    payState, repo, config, pay, calendar, media, activities, translator, rupiah, rateLimited, ah, embedJSON,
    photo: () => withUploads(photoFinder(), media),
  });
  mountLegal(app, { page: booking.page });
  // old links like /?book=laguna opened a booking dialog; they now go to the booking page
  // English is the default language; Indonesian lives under /id
  app.get('/', booking.redirectOldBook, (req, res) => renderHome(res, 'en'));
  app.get('/id', booking.redirectOldBook, (req, res) => renderHome(res, 'id'));
  app.get('/en', booking.redirectOldBook, (req, res) => res.redirect(301, '/'));

  // Midtrans "Payment Notification URL": https://<domain>/api/payments/midtrans
  app.post('/api/payments/midtrans', ah(async (req, res) => {
    if (!pay.enabled) return res.status(404).json({ ok: false });
    const n = req.body || {};
    if (!payments.verifyNotification(pay, n)) return res.status(403).json({ ok: false, error: 'bad signature' });
    const item = await repo.getInquiryByOrder(String(n.order_id));
    if (!item) return res.status(200).json({ ok: true, ignored: 'unknown order' }); // e.g. Midtrans dashboard test
    if (Math.round(Number(n.gross_amount)) !== Number(item.amount)) return res.status(400).json({ ok: false, error: 'amount mismatch' });
    const status = payments.paymentStatus(n);
    if (status === 'paid') {
      // book the online payment as income in Keuangan (once per order)
      await recordWebsitePayment(repo, item, { amount: item.amount, method: 'midtrans' }).catch((e) => console.error('Could not record payment:', e.message));
    }
    if (status) {
      await repo.setPayment(item.order_id, {
        status,
        type: n.payment_type ? String(n.payment_type).slice(0, 40) : null,
        paidAt: status === 'paid' ? payments.midtransTime(n.settlement_time || n.transaction_time) || new Date() : null,
      });
      app.locals.clearAvailability();
    }
    res.json({ ok: true });
  }));

  /* ---------- the traveler survey was taken off the website; old links go home ---------- */
  app.get(['/survey', '/en/survey'], (req, res) => res.redirect(301, req.path.startsWith('/en') ? '/' : '/id'));

  /* ---------- "We hear you": suggestions, complaints, compliments ---------- */
  const FB_KINDS = ['saran', 'keluhan', 'pujian', 'pertanyaan'];
  const FB_TOPICS = ['kamar', 'makanan', 'layanan', 'trip', 'kebersihan', 'pemesanan', 'website', 'lainnya'];
  const fbPath = (lang) => (lang === 'en' ? '/en/feedback' : '/masukan');
  function renderFeedback(res, lang, extra = {}) {
    res.render('feedback', {
      lang, t: translator(lang), base: lang === 'en' ? '/en' : '', home: homePath(lang), siteUrl: config.siteUrl, contact: config.contact,
      action: fbPath(lang), KINDS: FB_KINDS, TOPICS: FB_TOPICS, values: { kind: '', topic: '', rating: '', message: '', name: '', email: '', phone: '', stay_date: '' },
      error: '', thanks: false, ...extra,
    });
  }
  app.get(['/masukan', '/en/feedback'], (req, res) => renderFeedback(res, req.path.startsWith('/en') ? 'en' : 'id', { thanks: req.query.thanks === '1' }));
  app.get('/feedback', (req, res) => res.redirect(301, '/en/feedback'));
  app.post(['/masukan', '/en/feedback'], ah(async (req, res) => {
    const lang = req.path.startsWith('/en') ? 'en' : 'id';
    const t = translator(lang);
    const b = req.body || {};
    const done = fbPath(lang) + '?thanks=1';
    if (b.website) return res.redirect(303, done); // honeypot
    const v = {
      kind: FB_KINDS.includes(b.kind) ? b.kind : '', topic: FB_TOPICS.includes(b.topic) ? b.topic : 'lainnya',
      rating: /^[1-5]$/.test(String(b.rating || '')) ? Number(b.rating) : '', message: String(b.message || '').trim().slice(0, 4000),
      name: String(b.name || '').trim().slice(0, 120), email: String(b.email || '').trim().slice(0, 120), phone: String(b.phone || '').trim().slice(0, 20),
      stay_date: /^\d{4}-\d{2}-\d{2}$/.test(String(b.stay_date || '')) ? b.stay_date : '',
    };
    let error = '';
    if (!v.kind) error = t('fb.errKind');
    else if (v.message.length < 10) error = t('fb.errMessage');
    else if (!normalizeEmail(v.email)) error = t('fb.errEmail');
    else if (!normalizePhone(v.phone)) error = t('fb.errPhone');
    else if (rateLimited(req.ip, 'feedback')) error = t('fb.errRate');
    if (error) { res.status(400); return renderFeedback(res, lang, { values: v, error }); }
    try {
      const email = normalizeEmail(v.email), phone = normalizePhone(v.phone);
      await repo.table('feedback').insert({ ...v, email, phone, contact: email, rating: v.rating || null, stay_date: v.stay_date || null, lang, status: 'baru' });
    } catch (e) {
      console.error('Could not save feedback:', e.message);
    }
    res.redirect(303, done);
  }));

  /* ---------- admin ---------- */
  app.use('/admin', createAdminRouter({ repo, config, instagram, site, calendar, media, activities, payState, t: translator('id'), translator, devmode }));

  // Kalma's availability for one OTA/agent channel, imported by that channel (Admin → Channel OTA & agen).
  app.get('/ical/:file', ah(async (req, res, next) => {
    const m = /^([\w-]{16,60})\.ics$/.exec(req.params.file);
    if (!m) return next();
    const ch = await repo.table('channels').find({ export_token: m[1] });
    if (!ch || !ch.active) return next();
    res.set({ 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex' });
    res.send(await calendar.exportFor(ch));
  }));

  app.get('/robots.txt', (req, res) => res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nSitemap: ${config.siteUrl}/sitemap.xml\n`));
  // Sitemap for Google Search Console: both language versions linked with hreflang, lastmod = last content change.
  const lastmod = new Date(Math.max(...['content/id.json', 'content/en.json', 'views/index.ejs', 'src/config.js']
    .map((f) => { try { return fs.statSync(path.join(ROOT, f)).mtimeMs; } catch { return 0; } }))).toISOString().slice(0, 10);
  app.get('/sitemap.xml', (req, res) => {
    const u = config.siteUrl;
    const alt = `<xhtml:link rel="alternate" hreflang="id" href="${u}/id"/><xhtml:link rel="alternate" hreflang="en" href="${u}/"/><xhtml:link rel="alternate" hreflang="x-default" href="${u}/"/>`;
    res.type('application/xml').send(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
      `  <url><loc>${u}/</loc><lastmod>${lastmod}</lastmod>${alt}</url>\n` +
      `  <url><loc>${u}/id</loc><lastmod>${lastmod}</lastmod>${alt}</url>\n` +
      ['homestay', 'diving', 'trip'].map((id) => {
        const pid = u + servicePath('id', id), pen = u + servicePath('en', id);
        const a = `<xhtml:link rel="alternate" hreflang="id" href="${pid}"/><xhtml:link rel="alternate" hreflang="en" href="${pen}"/>`;
        return `  <url><loc>${pid}</loc><lastmod>${lastmod}</lastmod>${a}</url>\n  <url><loc>${pen}</loc><lastmod>${lastmod}</lastmod>${a}</url>\n`;
      }).join('') +
      Object.values(LEGAL_PATHS).map((p) => {
        const a = `<xhtml:link rel="alternate" hreflang="id" href="${u + p.id}"/><xhtml:link rel="alternate" hreflang="en" href="${u + p.en}"/>`;
        return `  <url><loc>${u + p.id}</loc><lastmod>${lastmod}</lastmod>${a}</url>\n  <url><loc>${u + p.en}</loc><lastmod>${lastmod}</lastmod>${a}</url>\n`;
      }).join('') +
      '</urlset>\n');
  });
  // set by server.js while it prepares the database; error is a plain-language hint, never a secret
  const dbStatus = { ready: true, error: '' };
  app.get('/healthz', ah(async (req, res) => {
    let db = 'ok';
    try { await repo.ping(); } catch { db = 'error'; }
    if (!dbStatus.ready) db = 'error';
    const body = { ok: db === 'ok', storage: repo.kind, db };
    if (db === 'error' && dbStatus.error) body.hint = dbStatus.error;
    res.status(db === 'ok' ? 200 : 503).json(body);
  }));

  app.use((req, res) => renderError(res, 404, langOfPath(req.path)));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large' || err.type === 'entity.parse.failed') return res.status(400).json({ ok: false, error: 'Bad request' });
    console.error(err);
    if (res.headersSent) return;
    try { renderError(res, 500, langOfPath(req.path)); } catch { res.status(500).send('Server error'); }
  });

  app.locals.config = config;
  app.locals.repo = repo;
  app.locals.dbStatus = dbStatus;
  return app;
}

module.exports = { createApp, ah, photoFinder, videoFinder };
