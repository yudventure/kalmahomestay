'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { loadConfig, ROOMS, GUEST_OPTIONS } = require('./config');
const { normalize, validate, buildMessage, createStore, replyLink } = require('./inquiry');

const ROOT = path.join(__dirname, '..');
const CONTENT = {
  id: require('../content/id.json'),
  en: require('../content/en.json'),
};
const EMPTY_VALUES = { name: '', contact: '', country: '', checkin: '', checkout: '', guests: '2', room: '', msg: '' };

function translator(lang) {
  const dict = CONTENT[lang];
  return (key) => (key in dict ? dict[key] : CONTENT.id[key] != null ? CONTENT.id[key] : key);
}

const rupiah = (n) => 'Rp ' + n.toLocaleString('id-ID');

/** JSON safe to embed inside <script> */
const embedJSON = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

function createApp(options = {}) {
  const config = { ...loadConfig(), ...options };
  const store = createStore(config.dataDir);
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

  const staticOpts = { maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0 };
  app.use('/css', express.static(path.join(ROOT, 'public/css'), staticOpts));
  app.use('/js', express.static(path.join(ROOT, 'public/js'), staticOpts));
  app.use('/img', express.static(path.join(ROOT, 'public/img'), staticOpts));
  // Only the brand files the site needs are public (not the guideline sources).
  app.use('/brand/assets', express.static(path.join(ROOT, 'brand/assets'), staticOpts));
  app.get('/brand/tokens.css', (req, res) => res.sendFile(path.join(ROOT, 'brand/tokens.css')));
  app.get('/favicon.ico', (req, res) => res.sendFile(path.join(ROOT, 'brand/assets/favicon.ico')));

  app.use(express.urlencoded({ extended: false, limit: '10kb' }));
  app.use(express.json({ limit: '10kb' }));

  function renderHome(res, lang, extra = {}) {
    const t = translator(lang);
    const base = lang === 'en' ? '/en' : '';
    res.render('index', {
      lang, t, rupiah,
      rooms: ROOMS,
      guestOptions: GUEST_OPTIONS,
      contact: config.contact,
      siteUrl: config.siteUrl,
      path: lang === 'en' ? '/en' : '/',
      home: lang === 'en' ? '/en' : '/',
      base,
      year: new Date().getFullYear(),
      values: EMPTY_VALUES,
      formError: '',
      clientConfig: embedJSON({ lang, base, whatsapp: config.contact.whatsapp, email: config.contact.email, ui: t('ui') }),
      ...extra,
    });
  }

  app.get('/', (req, res) => renderHome(res, 'id'));
  app.get('/en', (req, res) => renderHome(res, 'en'));
  app.get('/en/', (req, res) => res.redirect(301, '/en'));

  /* ---------- booking inquiries ---------- */
  const hits = new Map(); // simple per-IP rate limit: 10 inquiries / 10 min
  function rateLimited(ip) {
    const now = Date.now();
    const list = (hits.get(ip) || []).filter((ts) => now - ts < 10 * 60 * 1000);
    list.push(now);
    hits.set(ip, list);
    return list.length > 10;
  }

  function handleInquiry(lang, req) {
    const t = translator(lang);
    const values = normalize(req.body);
    if (req.body && req.body.website) return { status: 200, values, spam: true }; // honeypot
    if (rateLimited(req.ip)) return { status: 429, values, error: t('ui').errRate };
    const errKey = validate(values);
    if (errKey) return { status: 400, values, error: t('ui')[errKey] };
    const message = buildMessage(values, lang, t);
    store.add({ lang, ...values });
    return {
      status: 201, values, message,
      whatsappUrl: `https://wa.me/${config.contact.whatsapp}?text=${encodeURIComponent(message)}`,
      mailtoUrl: `mailto:${config.contact.email}?subject=${encodeURIComponent(t('ui').subject + ' — Kalma')}&body=${encodeURIComponent(message)}`,
    };
  }

  // JSON endpoint used by the page's JavaScript
  app.post(['/api/inquiry', '/en/api/inquiry'], (req, res) => {
    const lang = req.path.startsWith('/en') || (req.body && req.body.lang === 'en') ? 'en' : 'id';
    const r = handleInquiry(lang, req);
    if (r.spam) return res.status(200).json({ ok: true });
    if (r.error) return res.status(r.status).json({ ok: false, error: r.error });
    res.status(201).json({ ok: true, whatsappUrl: r.whatsappUrl, mailtoUrl: r.mailtoUrl });
  });

  // Plain form POST (works without JavaScript): redirect straight to WhatsApp
  app.post(['/inquiry', '/en/inquiry'], (req, res) => {
    const lang = req.path.startsWith('/en') ? 'en' : 'id';
    const r = handleInquiry(lang, req);
    if (r.spam) return res.redirect(303, lang === 'en' ? '/en' : '/');
    if (r.error) {
      res.status(r.status);
      return renderHome(res, lang, { values: r.values, formError: r.error });
    }
    res.redirect(303, r.whatsappUrl);
  });

  /* ---------- admin: list inquiries (HTTP Basic auth, user "admin") ---------- */
  function requireAdmin(req, res, next) {
    if (!config.adminPassword) return res.status(404).send('Not found');
    const [scheme, encoded] = (req.get('authorization') || '').split(' ');
    const [user, pass] = scheme === 'Basic' && encoded ? Buffer.from(encoded, 'base64').toString().split(/:(.*)/s) : [];
    const a = Buffer.from(String(pass || '')), b = Buffer.from(config.adminPassword);
    if (user === 'admin' && a.length === b.length && crypto.timingSafeEqual(a, b)) return next();
    res.set('WWW-Authenticate', 'Basic realm="Kalma admin", charset="UTF-8"').status(401).send('Login required');
  }

  app.get('/admin', requireAdmin, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.render('admin', { items: store.list(), rooms: ROOMS, t: translator('id'), replyLink });
  });
  app.get('/admin/inquiries.json', requireAdmin, (req, res) => {
    res.set('Cache-Control', 'no-store').json(store.list());
  });

  app.get('/robots.txt', (req, res) => res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nSitemap: ${config.siteUrl}/sitemap.xml\n`));
  app.get('/sitemap.xml', (req, res) => res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `<url><loc>${config.siteUrl}/</loc></url>\n<url><loc>${config.siteUrl}/en</loc></url>\n</urlset>\n`));
  app.get('/healthz', (req, res) => res.json({ ok: true }));

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
  app.locals.store = store;
  return app;
}

module.exports = { createApp };
