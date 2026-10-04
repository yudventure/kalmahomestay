'use strict';

const path = require('path');
const express = require('express');
const { loadConfig, ROOMS, GUEST_OPTIONS } = require('./config');
const { normalize, validate, buildMessage } = require('./inquiry');
const { createRepo } = require('./db');
const { createAdminRouter } = require('./admin');
const { createInstagramSync } = require('./instagram');
const survey = require('./survey');
const payments = require('./payments');
const { parseContact } = require('./db/shared');
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

const EMPTY_VALUES = { name: '', contact: '', country: '', checkin: '', checkout: '', guests: '2', room: '', msg: '' };

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
  const instagram = options.instagramSync || createInstagramSync({ repo, token: (config.instagram || {}).token, api: options.instagramApi });
  app.locals.instagram = instagram;

  function renderHome(res, lang, extra = {}) {
    const t = translator(lang);
    const base = lang === 'en' ? '/en' : '';
    const values = extra.values || EMPTY_VALUES;
    res.render('index', {
      pay,
      checkoutOpen: Boolean(extra.formError || extra.bookRoom),
      lang, t, rupiah,
      photo: photoFinder(),
      video: videoFinder(),
      partners: loadPartners(),
      igReviews: instagram.comments,
      rooms: ROOMS,
      guestOptions: GUEST_OPTIONS,
      contact: config.contact,
      siteUrl: config.siteUrl,
      googleVerification: config.googleVerification,
      path: lang === 'en' ? '/en' : '/',
      home: lang === 'en' ? '/en' : '/',
      base,
      year: new Date().getFullYear(),
      values: EMPTY_VALUES,
      formError: '',
      clientConfig: embedJSON({
        lang, base, whatsapp: config.contact.whatsapp, email: config.contact.email, ui: t('ui'),
        rooms: ROOMS.map((r) => ({ id: r.id, name: t(r.nameKey), price: r.price, maxGuests: r.maxGuests })),
        payments: pay.enabled ? { enabled: true, clientKey: pay.clientKey, snapJs: pay.snapJs, percent: pay.percent } : { enabled: false, percent: 100 },
      }),
      ...extra,
      values: extra.bookRoom ? { ...values, room: extra.bookRoom } : values,
    });
  }

  // ?book=<room> opens the booking dialog for that room (also works without JavaScript)
  const bookParam = (req) => (ROOMS.some((r) => r.id === req.query.book) ? { bookRoom: req.query.book } : {});
  app.get('/', (req, res) => renderHome(res, 'id', bookParam(req)));
  app.get('/en', (req, res) => renderHome(res, 'en', bookParam(req)));

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

  async function handleInquiry(lang, req) {
    const t = translator(lang);
    const values = normalize(req.body);
    if (req.body && req.body.website) return { status: 200, values, spam: true }; // honeypot
    if (rateLimited(req.ip)) return { status: 429, values, error: t('ui').errRate };
    const errKey = validate(values);
    if (errKey) return { status: 400, values, error: t('ui')[errKey] };
    const message = buildMessage(values, lang, t);
    try {
      await repo.addInquiry({ lang, ...values });
    } catch (e) {
      // Never block a guest because the database is down: they still get the WhatsApp link.
      console.error('Could not save inquiry:', e.message);
    }
    return {
      status: 201, values, message,
      whatsappUrl: `https://wa.me/${config.contact.whatsapp}?text=${encodeURIComponent(message)}`,
      mailtoUrl: `mailto:${config.contact.email}?subject=${encodeURIComponent(t('ui').subject + ' — Kalma')}&body=${encodeURIComponent(message)}`,
    };
  }

  // JSON endpoint used by the page's JavaScript
  app.post(['/api/inquiry', '/en/api/inquiry'], ah(async (req, res) => {
    const lang = req.path.startsWith('/en') || (req.body && req.body.lang === 'en') ? 'en' : 'id';
    const r = await handleInquiry(lang, req);
    if (r.spam) return res.status(200).json({ ok: true });
    if (r.error) return res.status(r.status).json({ ok: false, error: r.error });
    res.status(201).json({ ok: true, whatsappUrl: r.whatsappUrl, mailtoUrl: r.mailtoUrl });
  }));

  // Plain form POST (works without JavaScript): redirect straight to WhatsApp
  app.post(['/inquiry', '/en/inquiry'], ah(async (req, res) => {
    const lang = req.path.startsWith('/en') ? 'en' : 'id';
    const r = await handleInquiry(lang, req);
    if (r.spam) return res.redirect(303, lang === 'en' ? '/en' : '/');
    if (r.error) {
      res.status(r.status);
      return renderHome(res, lang, { values: r.values, formError: r.error });
    }
    res.redirect(303, r.whatsappUrl);
  }));

  /* ---------- online booking & payment (Midtrans Snap) ---------- */
  function rupiahOrder(n) { return 'Rp ' + Number(n).toLocaleString('id-ID'); }

  app.post(['/api/checkout', '/en/api/checkout'], ah(async (req, res) => {
    const lang = req.path.startsWith('/en') || (req.body && req.body.lang === 'en') ? 'en' : 'id';
    const t = translator(lang);
    const ui = t('ui');
    if (req.body && req.body.website) return res.status(200).json({ ok: true }); // honeypot
    if (rateLimited(req.ip, 'checkout')) return res.status(429).json({ ok: false, error: ui.errRate });
    const values = normalize(req.body);
    const errKey = validate(values) || (!values.contact ? 'errContact' : '');
    if (errKey) return res.status(400).json({ ok: false, error: ui[errKey] });
    const q = payments.quote(values, pay.enabled ? pay.percent : 100);
    if (q.error) return res.status(400).json({ ok: false, error: String(ui[q.error] || ui.errServer).replace('{n}', q.max) });

    const message = buildMessage(values, lang, t) + `\n${ui.total}: ${rupiahOrder(q.total)} (${q.nights} ${ui.nights})`;
    const whatsappUrl = `https://wa.me/${config.contact.whatsapp}?text=${encodeURIComponent(message)}`;
    const viaWhatsapp = async () => {
      try { await repo.addInquiry({ lang, ...values }); } catch (e) { console.error('Could not save inquiry:', e.message); }
      return res.status(201).json({ ok: true, mode: 'whatsapp', whatsappUrl, total: q.total, nights: q.nights });
    };
    if (!pay.enabled) return viaWhatsapp();

    const orderId = payments.newOrderId();
    try {
      await repo.addInquiry({ lang, ...values, orderId, amount: q.amount, total: q.total });
    } catch (e) {
      // Without a saved order we could not match the payment, so take the booking over WhatsApp instead.
      console.error('Could not save order, falling back to WhatsApp:', e.message);
      return res.status(201).json({ ok: true, mode: 'whatsapp', whatsappUrl, total: q.total, nights: q.nights });
    }
    const contact = parseContact(values.contact);
    try {
      const snap = await payments.createSnapTransaction(pay, {
        orderId,
        amount: q.amount,
        itemName: `${t(q.room.nameKey)} · ${q.nights} ${ui.nights}`,
        name: values.name,
        email: contact.email,
        phone: contact.phone,
        finishUrl: `${config.siteUrl}${lang === 'en' ? '/en' : '/'}`,
      });
      res.status(201).json({ ok: true, mode: 'pay', token: snap.token, redirectUrl: snap.redirectUrl, orderId, amount: q.amount, total: q.total, nights: q.nights, whatsappUrl });
    } catch (e) {
      console.error('Midtrans error, falling back to WhatsApp:', e.message);
      await repo.setPayment(orderId, { status: 'failed' }).catch(() => {});
      res.status(201).json({ ok: true, mode: 'whatsapp', whatsappUrl, total: q.total, nights: q.nights });
    }
  }));

  // Midtrans "Payment Notification URL": https://<domain>/api/payments/midtrans
  app.post('/api/payments/midtrans', ah(async (req, res) => {
    if (!pay.enabled) return res.status(404).json({ ok: false });
    const n = req.body || {};
    if (!payments.verifyNotification(pay, n)) return res.status(403).json({ ok: false, error: 'bad signature' });
    const item = await repo.getInquiryByOrder(String(n.order_id));
    if (!item) return res.status(200).json({ ok: true, ignored: 'unknown order' }); // e.g. Midtrans dashboard test
    if (Math.round(Number(n.gross_amount)) !== Number(item.amount)) return res.status(400).json({ ok: false, error: 'amount mismatch' });
    const status = payments.paymentStatus(n);
    if (status) {
      await repo.setPayment(item.order_id, {
        status,
        type: n.payment_type ? String(n.payment_type).slice(0, 40) : null,
        paidAt: status === 'paid' ? payments.midtransTime(n.settlement_time || n.transaction_time) || new Date() : null,
      });
    }
    res.json({ ok: true });
  }));

  /* ---------- traveler survey ---------- */
  function renderSurvey(res, lang, extra = {}) {
    const t = translator(lang);
    res.render('survey', {
      lang, t, sections: survey.SECTIONS, base: lang === 'en' ? '/en' : '',
      home: lang === 'en' ? '/en' : '/', siteUrl: config.siteUrl,
      path: (lang === 'en' ? '/en' : '') + '/survey',
      answers: {}, contact: '', missing: [], error: '', thanks: false, ...extra,
    });
  }
  app.get(['/survey', '/en/survey'], (req, res) => {
    const lang = req.path.startsWith('/en') ? 'en' : 'id';
    renderSurvey(res, lang, { thanks: req.query.thanks === '1' });
  });
  app.post(['/survey', '/en/survey'], ah(async (req, res) => {
    const lang = req.path.startsWith('/en') ? 'en' : 'id';
    const target = (lang === 'en' ? '/en' : '') + '/survey?thanks=1';
    if (req.body && req.body.website) return res.redirect(303, target); // honeypot
    const { answers, contact, missing } = survey.parseSurvey(req.body);
    if (rateLimited(req.ip, 'survey')) {
      res.status(429);
      return renderSurvey(res, lang, { answers, contact, error: translator(lang)('survey.errRate') });
    }
    if (missing.length) {
      res.status(400);
      return renderSurvey(res, lang, { answers, contact, missing, error: translator(lang)('survey.err') });
    }
    try {
      await repo.addSurveyResponse({ lang, answers, contact });
    } catch (e) {
      console.error('Could not save survey response:', e.message);
    }
    res.redirect(303, target);
  }));

  /* ---------- admin ---------- */
  app.use('/admin', createAdminRouter({ repo, config, instagram, t: translator('id') }));

  app.get('/robots.txt', (req, res) => res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nSitemap: ${config.siteUrl}/sitemap.xml\n`));
  // Sitemap for Google Search Console: both language versions linked with hreflang, lastmod = last content change.
  const lastmod = new Date(Math.max(...['content/id.json', 'content/en.json', 'views/index.ejs', 'src/config.js']
    .map((f) => { try { return fs.statSync(path.join(ROOT, f)).mtimeMs; } catch { return 0; } }))).toISOString().slice(0, 10);
  app.get('/sitemap.xml', (req, res) => {
    const u = config.siteUrl;
    const alt = `<xhtml:link rel="alternate" hreflang="id" href="${u}/"/><xhtml:link rel="alternate" hreflang="en" href="${u}/en"/><xhtml:link rel="alternate" hreflang="x-default" href="${u}/"/>`;
    res.type('application/xml').send(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
      `  <url><loc>${u}/</loc><lastmod>${lastmod}</lastmod>${alt}</url>\n` +
      `  <url><loc>${u}/en</loc><lastmod>${lastmod}</lastmod>${alt}</url>\n` +
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

  app.use((req, res) => {
    const lang = req.path.startsWith('/en') ? 'en' : 'id';
    res.status(404).render('404', { lang, t: translator(lang), home: lang === 'en' ? '/en' : '/' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large' || err.type === 'entity.parse.failed') return res.status(400).json({ ok: false, error: 'Bad request' });
    console.error(err);
    res.status(500).send('Server error');
  });

  app.locals.config = config;
  app.locals.repo = repo;
  app.locals.dbStatus = dbStatus;
  return app;
}

module.exports = { createApp, ah, photoFinder, videoFinder };
