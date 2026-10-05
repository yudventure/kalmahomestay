'use strict';

/**
 * Developer mode (Admin › Website › Mode developer).
 *   - The whole public website can go into maintenance: guests get the branded maintenance page (503).
 *   - Each homepage section can be shown, hidden, or shown as a small "being refreshed" note.
 *   - The booking, service and feedback pages can each be put into maintenance.
 * Staff who are signed in to the admin carry a preview pass (cookie on the whole site), so they keep
 * seeing the real website with a ribbon that says what guests see. Adding ?as=guest to any address
 * shows staff exactly what guests see.
 * Settings live in app_settings (key "devmode") and are cached in memory.
 */
const crypto = require('crypto');
const { createSessions, readCookie } = require('./staff');

const PREVIEW_COOKIE = 'kalma_preview';
/** A shared preview link lets someone without an admin account see the real website for this many days. */
const SHARE_DAYS = 7;

const SECTIONS = [
  { id: 'hero', label: 'Hero dan pencarian tanggal' },
  { id: 'facts', label: 'Fakta singkat' },
  { id: 'partners', label: 'Partner' },
  { id: 'experiences', label: 'Pengalaman' },
  { id: 'services', label: 'Layanan Kalma' },
  { id: 'why', label: 'Keunggulan' },
  { id: 'reviews', label: 'Cerita tamu' },
  { id: 'location', label: 'Cara ke Kalma' },
  { id: 'faq', label: 'FAQ' },
];
const PAGES = [
  { id: 'book', label: 'Halaman pemesanan dan pembayaran', match: /^\/(pesan|en\/book)(\/|$)|^\/(en\/)?api\/(checkout|availability)/ },
  { id: 'services', label: 'Halaman detail layanan', match: /^\/(layanan|en\/services)(\/|$)/ },
  { id: 'feedback', label: 'Halaman We hear you', match: /^\/(masukan|en\/feedback)(\/|$)/ },
];
const SECTION_STATES = ['show', 'hide', 'maint'];

/** Paths that keep working during maintenance: the admin, payment notifications, health check, files. */
const ALWAYS_OPEN = /^\/(admin|api\/payments\/|healthz|robots\.txt|sitemap\.xml|media\/|favicon|brand\/|css\/|js\/|fonts\/|img\/|video\/)/;

const blank = () => ({ site: { on: false, until: '', msg_en: '', msg_id: '' }, sections: {}, pages: {}, share_v: 1 });

function createDevMode({ repo, secret, ttl = 10000 }) {
  let state = blank();
  let loaded = false;
  let loadedAt = 0;
  const pass = createSessions('preview:' + secret);
  const shareKey = crypto.createHash('sha256').update('kalma-share:' + secret).digest();
  const shareSign = (data) => crypto.createHmac('sha256', shareKey).update(data).digest('base64url');

  async function load() {
    const saved = await repo.getSetting('devmode').catch(() => null);
    state = { ...blank(), ...(saved || {}), site: { ...blank().site, ...((saved || {}).site || {}) } };
    loaded = true;
    loadedAt = Date.now();
    return state;
  }

  /** Hostinger can run several app processes. Each one re-reads the setting every few seconds,
   *  so a change saved in the admin reaches every visitor, not only the process that saved it. */
  async function fresh() {
    if (!loaded || Date.now() - loadedAt >= ttl) await load().catch(() => {});
    return state;
  }

  function clean(b) {
    const v = blank();
    v.site.on = b.site_on === '1';
    v.site.until = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(b.site_until || '')) ? b.site_until : '';
    v.site.msg_en = String(b.msg_en || '').trim().slice(0, 400);
    v.site.msg_id = String(b.msg_id || '').trim().slice(0, 400);
    for (const s of SECTIONS) { const x = b['sec_' + s.id]; if (SECTION_STATES.includes(x) && x !== 'show') v.sections[s.id] = x; }
    for (const p of PAGES) if (b['page_' + p.id] === 'maint') v.pages[p.id] = 'maint';
    v.share_v = state.share_v || 1;
    return v;
  }

  async function save(body) {
    state = clean(body);
    loaded = true;
    loadedAt = Date.now();
    await repo.setSetting('devmode', state);
    return state;
  }

  const isStaff = (req) => Boolean(pass.read(readCookie(req, PREVIEW_COOKIE)));

  /** Token for the shareable preview link. Making a new link (resetShare) cancels every older one. */
  function shareToken(now = Date.now()) {
    const data = Buffer.from(JSON.stringify({ v: state.share_v || 1, exp: now + SHARE_DAYS * 86400000 })).toString('base64url');
    return `${data}.${shareSign(data)}`;
  }
  function readShare(token, now = Date.now()) {
    const [data, mac] = String(token || '').split('.');
    if (!data || !mac) return false;
    const want = Buffer.from(shareSign(data));
    const got = Buffer.from(mac);
    if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return false;
    try {
      const t = JSON.parse(Buffer.from(data, 'base64url').toString());
      return t.exp > now && t.v === (state.share_v || 1);
    } catch { return false; }
  }
  async function resetShare() {
    await load().catch(() => {});
    state = { ...state, share_v: (state.share_v || 1) + 1 };
    await repo.setSetting('devmode', state);
    loadedAt = Date.now();
    return state;
  }

  return {
    SECTIONS, PAGES, SHARE_DAYS, load, fresh, save, isStaff, shareToken, readShare, resetShare,
    get state() { return state; },
    get loaded() { return loaded; },
    section: (id) => state.sections[id] || 'show',
    pageDown: (path) => PAGES.find((p) => state.pages[p.id] === 'maint' && p.match.test(path)) || null,
    /** Give signed-in staff a pass for the public site (set from the admin). */
    grant(res, secure) {
      res.cookie(PREVIEW_COOKIE, pass.issue({ id: 'staff', pv: 0 }), { path: '/', httpOnly: true, sameSite: 'lax', secure, maxAge: 12 * 3600 * 1000 });
    },
    revoke(res) { res.clearCookie(PREVIEW_COOKIE, { path: '/' }); },
    ALWAYS_OPEN,
  };
}

module.exports = { createDevMode, SECTIONS, PAGES, PREVIEW_COOKIE, SHARE_DAYS };
