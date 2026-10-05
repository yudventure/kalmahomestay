'use strict';

/**
 * Developer mode (Admin › Website › Mode developer).
 *   - The whole public website can go into maintenance: guests get the branded maintenance page (503).
 *   - Each homepage section can be shown, hidden, or shown as a small "being refreshed" note.
 *   - The booking, service and feedback pages can each be put into maintenance.
 * Staff who are signed in to the admin carry a preview pass (cookie on the whole site), so they keep
 * seeing the real website with a ribbon that says what guests see.
 * Settings live in app_settings (key "devmode") and are cached in memory.
 */
const { createSessions, readCookie } = require('./staff');

const PREVIEW_COOKIE = 'kalma_preview';

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

const blank = () => ({ site: { on: false, until: '', msg_en: '', msg_id: '' }, sections: {}, pages: {} });

function createDevMode({ repo, secret }) {
  let state = blank();
  let loaded = false;
  const pass = createSessions('preview:' + secret);

  async function load() {
    const saved = await repo.getSetting('devmode').catch(() => null);
    state = { ...blank(), ...(saved || {}), site: { ...blank().site, ...((saved || {}).site || {}) } };
    loaded = true;
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
    return v;
  }

  async function save(body) {
    state = clean(body);
    loaded = true;
    await repo.setSetting('devmode', state);
    return state;
  }

  const isStaff = (req) => Boolean(pass.read(readCookie(req, PREVIEW_COOKIE)));

  return {
    SECTIONS, PAGES, load, save, isStaff,
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

module.exports = { createDevMode, SECTIONS, PAGES, PREVIEW_COOKIE };
