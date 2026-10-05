'use strict';

/**
 * Public pages for booking and services:
 *   /pesan, /en/book                      booking page (room stay or one activity), pays through Midtrans Snap
 *   /pesan/selesai, /en/book/done         booking result (paid, waiting for payment, or received)
 *   /layanan/<slug>, /en/services/<slug>  service detail pages (homestay, diving & snorkeling, trips)
 *   POST /api/checkout                    prices the order on the server, saves it, asks Midtrans for a Snap token
 *   GET  /api/availability                nights each room is full, for the date picker
 * Without Midtrans keys a booking is saved as a request and the staff send the payment details.
 */
const { ROOMS, GUEST_OPTIONS } = require('./config');
const { normalize, validate, todayISO } = require('./inquiry');
const { normalizePhone, normalizeEmail } = require('./db/shared');
const { addDays } = require('./ical');
const payments = require('./payments');
const { SERVICES, servicePath, bookPath, homePath } = require('./activities');

const ROOM_KEYS = { laguna: 'r1', pantai: 'r2', keluarga: 'r3' };
const ROOM_PH = { laguna: 'ph-lagoon', pantai: 'ph-beach', keluarga: 'ph-family' };
// until a room photo is uploaded (Admin > Foto & video > Kamar) each room borrows a different site photo
const ROOM_FALLBACK = { laguna: 'hero-1', pantai: 'hero-2', keluarga: 'hero-3' };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function mountBooking(app, ctx) {
  const { repo, config, pay, calendar, media, activities, translator, rupiah, rateLimited, ah, photo, embedJSON } = ctx;
  const payState = ctx.payState || {};
  const langOf = (req) => (req.path.startsWith('/en') || (req.body && req.body.lang === 'en') ? 'en' : 'id');
  const donePath = (lang, orderId) => `${bookPath(lang)}/${lang === 'en' ? 'done' : 'selesai'}?order=${encodeURIComponent(orderId)}`;

  /** What every public page needs for the shared header and footer. */
  function page(lang, extra = {}) {
    const t = translator(lang);
    const home = homePath(lang);
    return {
      lang, t, rupiah, home, base: lang === 'en' ? '/en' : '', contact: config.contact, siteUrl: config.siteUrl,
      year: new Date().getFullYear(), servicePath: (id) => servicePath(lang, id), bookPath: bookPath(lang),
      feedbackPath: lang === 'en' ? '/en/feedback' : '/masukan', anchor: (h) => (lang === 'en' ? '/' : '/id') + h,
      pay, ...extra,
    };
  }

  const roomView = (lang, photoOf) => (r) => {
    const t = translator(lang);
    const k = ROOM_KEYS[r.id] || 'r1';
    return {
      id: r.id, name: t(r.nameKey), price: r.price, maxGuests: r.maxGuests, badge: t(k + '.badge'), desc: t(k + '.desc'),
      facts: [t(k + '.m1'), t(k + '.m2'), t(k + '.m3')], ph: ROOM_PH[r.id] || 'ph-house', style: photoOf('room-' + r.id) || photoOf(ROOM_FALLBACK[r.id]) || '',
    };
  };

  /* ---------------------------------------------------------------- service pages */
  async function renderService(req, res, next) {
    const lang = langOf(req);
    const svc = SERVICES.find((s) => s.slug[lang] === req.params.slug);
    if (!svc) return next();
    const t = translator(lang);
    const photoOf = photo();
    const list = svc.category ? await activities.published(svc.category, lang) : [];
    res.render('service', page(lang, {
      svc, list, rooms: ROOMS.map(roomView(lang, photoOf)), photoOf,
      path: servicePath(lang, svc.id), alt: { id: servicePath('id', svc.id), en: servicePath('en', svc.id) },
      title: `${t(svc.key + '.t')} · Kalma Raja Ampat`,
    }));
  }
  app.get('/layanan/:slug', ah(renderService));
  app.get('/en/services/:slug', ah(renderService));

  /* ---------------------------------------------------------------- availability for the date picker */
  let availCache = { at: 0, data: null };
  app.get(['/api/availability', '/en/api/availability'], ah(async (req, res) => {
    if (!availCache.data || Date.now() - availCache.at > 60 * 1000) {
      const from = todayISO();
      const to = addDays(from, 400);
      const rooms = {};
      for (const r of ROOMS) {
        try { rooms[r.id] = await calendar.fullNights(r.id, from, to); } catch { rooms[r.id] = []; }
      }
      availCache = { at: Date.now(), data: { from, to, rooms } };
    }
    res.set('Cache-Control', 'no-store').json(availCache.data);
  }));
  app.locals.clearAvailability = () => { availCache = { at: 0, data: null }; };

  /* ---------------------------------------------------------------- booking page */
  async function renderBook(req, res, extra = {}) {
    const lang = langOf(req);
    const t = translator(lang);
    const q = { ...req.query, ...(extra.values || {}) };
    const photoOf = photo();
    let activity = null;
    if (q.trip) {
      activity = await activities.bySlug(q.trip, lang);
      if (activity && activity.free) activity = null; // free activities need no booking
    }
    const rooms = ROOMS.map(roomView(lang, photoOf));
    const room = rooms.find((r) => r.id === q.room) || rooms[0];
    const pick = (v, re) => (re.test(String(v || '')) ? String(v) : '');
    const values = {
      room: room.id, checkin: pick(q.checkin, DATE_RE), checkout: pick(q.checkout, DATE_RE), date: pick(q.date, DATE_RE),
      guests: String(Math.min(room.maxGuests, Math.max(1, parseInt(q.guests, 10) || 2))),
      people: String(activity ? Math.min(activity.maxPeople, Math.max(activity.minPeople, parseInt(q.people, 10) || activity.minPeople)) : 2),
      name: String(q.name || ''), email: String(q.email || ''), phone: String(q.phone || ''), country: String(q.country || ''), msg: String(q.msg || ''),
    };
    const ui = t('bk');
    res.status(extra.status || 200).render('book', page(lang, {
      title: `${t('bk').title} · Kalma Raja Ampat`, path: bookPath(lang), rooms, room, activity, values, error: extra.error || '',
      backTo: activity ? servicePath(lang, activity.category) : servicePath(lang, 'homestay'),
      clientConfig: embedJSON({
        lang, base: lang === 'en' ? '/en' : '', ui, today: todayISO(),
        rooms: rooms.map((r) => ({ id: r.id, name: r.name, price: r.price, maxGuests: r.maxGuests })),
        activity: activity && { slug: activity.slug, title: activity.title, price: activity.price, minPeople: activity.minPeople, maxPeople: activity.maxPeople },
        payments: pay.enabled ? { enabled: true, clientKey: pay.clientKey, snapJs: pay.snapJs, percent: pay.percent } : { enabled: false, percent: 100 },
      }),
    }));
  }
  app.get(['/pesan', '/en/book'], ah((req, res) => renderBook(req, res)));
  app.get('/book', (req, res) => res.redirect(301, '/en/book'));

  /* ---------------------------------------------------------------- checkout */
  async function checkout(lang, body, ip) {
    const t = translator(lang);
    const ui = t('ui');
    const b = body || {};
    if (b.website) return { status: 200, spam: true }; // honeypot
    if (rateLimited(ip, 'checkout')) return { status: 429, error: ui.errRate };

    // contact: the booking page sends name, email and phone; older forms send one "contact" field
    const name = String(b.name || '').trim().slice(0, 80);
    const separate = b.email !== undefined || b.phone !== undefined;
    const email = normalizeEmail(b.email);
    const phone = normalizePhone(b.phone);
    if (!name) return { status: 400, error: ui.errName };
    if (separate && !email) return { status: 400, error: t('bk').errEmail };
    if (separate && !phone) return { status: 400, error: t('bk').errPhone };
    if (separate && !b.agree) return { status: 400, error: t('bk').errAgree };
    const contactText = separate ? `${b.phone} · ${email}` : String(b.contact || '').trim().slice(0, 100);
    if (!contactText) return { status: 400, error: ui.errContact };
    const country = String(b.country || '').trim().slice(0, 80);
    const msg = String(b.msg || '').trim().slice(0, 1000);

    let order;
    if (b.trip) {
      const a = await activities.bySlug(b.trip, lang);
      if (!a || a.free) return { status: 400, error: t('bk').errTrip };
      const date = String(b.date || '');
      if (!DATE_RE.test(date) || isNaN(Date.parse(date))) return { status: 400, error: t('bk').errDate };
      if (date < todayISO()) return { status: 400, error: ui.errPast };
      const people = parseInt(b.people, 10);
      if (!(people >= a.minPeople && people <= a.maxPeople)) return { status: 400, error: t('bk').errPeople.replace('{min}', a.minPeople).replace('{max}', a.maxPeople) };
      const idTitle = (await activities.bySlug(b.trip, 'id')).title; // the admin reads Indonesian
      const total = a.price ? a.price * people : 0;
      order = {
        canPay: a.bookable, total, amount: Math.round((total * (pay.enabled ? pay.percent : 100)) / 100), units: 1,
        itemName: a.title, saved: { checkin: date, checkout: addDays(date, 1), guests: String(people), room: '', item: idTitle },
      };
    } else {
      const values = normalize({ ...b, contact: contactText });
      const errKey = validate(values);
      if (errKey) return { status: 400, error: ui[errKey] };
      if (!values.room) values.room = ROOMS[0].id;
      const q = payments.quote(values, pay.enabled ? pay.percent : 100);
      if (q.error) return { status: 400, error: String(ui[q.error] || ui.errServer).replace('{n}', q.max) };
      // nights already sold on the website, an OTA, an agent or blocked in the admin cannot be booked again
      try {
        if (!(await calendar.isAvailable(values.room, values.checkin, values.checkout))) return { status: 409, error: ui.errUnavailable };
      } catch (e) {
        console.error('Availability check failed, accepting the booking:', e.message);
      }
      order = {
        canPay: true, total: q.total, amount: q.amount, nights: q.nights, itemName: `${t(q.room.nameKey)} · ${q.nights} ${ui.nights}`,
        saved: { checkin: values.checkin, checkout: values.checkout, guests: values.guests, room: values.room, item: '' },
      };
    }

    const online = pay.enabled && order.canPay;
    const orderId = payments.newOrderId();
    const record = {
      lang, name, contact: contactText, email: separate ? email : undefined, phone: separate ? phone : undefined, country, msg,
      ...order.saved, orderId, amount: online ? order.amount : null, total: order.total || null, paymentStatus: online ? 'pending' : null,
    };
    try {
      await repo.addInquiry(record);
    } catch (e) {
      console.error('Could not save booking:', e.message);
      return { status: 500, error: ui.errServer };
    }
    const result = { status: 201, mode: 'request', orderId, total: order.total, amount: order.amount, nights: order.nights, doneUrl: donePath(lang, orderId) };
    if (!online) return result;
    try {
      const snap = await payments.createSnapTransaction(pay, {
        orderId, amount: order.amount, itemName: order.itemName, name, email: separate ? email : /@/.test(contactText) ? contactText : '',
        phone: separate ? phone : normalizePhone(contactText), finishUrl: config.siteUrl + donePath(lang, orderId),
      });
      Object.assign(payState, { lastOkAt: new Date(), lastError: '' });
      return { ...result, mode: 'pay', token: snap.token, redirectUrl: snap.redirectUrl };
    } catch (e) {
      // Never send the guest on as if the booking were done: they stay on the booking page with a clear message,
      // the order is kept (marked failed) so the staff can follow up, and the admin shows what Midtrans answered.
      console.error('Midtrans error, payment page not opened:', e.message);
      Object.assign(payState, { lastError: String(e.message).slice(0, 300), lastErrorAt: new Date() });
      await repo.setPayment(orderId, { status: 'failed' }).catch(() => {});
      return { status: 502, error: t('bk').errPayOpen };
    }
  }

  app.post(['/api/checkout', '/en/api/checkout'], ah(async (req, res) => {
    const r = await checkout(langOf(req), req.body, req.ip);
    if (r.spam) return res.status(200).json({ ok: true });
    if (r.error) return res.status(r.status).json({ ok: false, error: r.error });
    const { status, ...out } = r;
    res.status(status).json({ ok: true, ...out });
  }));

  // the booking page also works without JavaScript: a plain form POST
  app.post(['/pesan', '/en/book'], ah(async (req, res) => {
    const lang = langOf(req);
    const r = await checkout(lang, req.body, req.ip);
    if (r.spam) return res.redirect(303, homePath(lang));
    if (r.error) return renderBook(req, res, { status: r.status, error: r.error, values: req.body });
    res.redirect(303, r.mode === 'pay' && r.redirectUrl ? r.redirectUrl : r.doneUrl);
  }));

  /* ---------------------------------------------------------------- result page */
  app.get(['/pesan/selesai', '/en/book/done'], ah(async (req, res, next) => {
    const lang = langOf(req);
    const orderId = String(req.query.order || req.query.order_id || '').slice(0, 64);
    if (!/^KALMA-[A-Z0-9-]+$/.test(orderId)) return next();
    const item = await repo.getInquiryByOrder(orderId);
    if (!item) return next();
    const t = translator(lang);
    const room = ROOMS.find((r) => r.id === item.room);
    const state = item.payment_status === 'paid' ? 'paid' : item.payment_status === 'pending' ? 'pending' : item.payment_status === 'failed' || item.payment_status === 'expired' ? 'failed' : 'request';
    res.render('book-done', page(lang, {
      title: `${t('bk')['doneTitle_' + state]} · Kalma Raja Ampat`, path: bookPath(lang), state, orderId, item,
      what: room ? t(room.nameKey) : item.item || '-',
      firstName: String(item.name || '').split(' ')[0],
      nights: Math.round((Date.parse(item.checkout) - Date.parse(item.checkin)) / 864e5),
      isStay: Boolean(room),
    }));
  }));

  /* old links: /?book=<room> opened the booking dialog on the homepage */
  return {
    page,
    redirectOldBook: (req, res, next) => {
      if (!req.query.book) return next();
      const lang = req.path.startsWith('/id') ? 'id' : 'en';
      const room = ROOMS.some((r) => r.id === req.query.book) ? `?room=${req.query.book}` : '';
      res.redirect(302, bookPath(lang) + room);
    },
  };
}

module.exports = { mountBooking, GUEST_OPTIONS };
