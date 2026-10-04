'use strict';

/**
 * Site settings. Contact details come from environment variables (.env) so they
 * can change without touching code; the values below are placeholders.
 */
function loadConfig(env = process.env) {
  const whatsapp = String(env.WHATSAPP_NUMBER || '6281234567890').replace(/\D/g, '');
  // Accept "kalma", "@kalma" or a full profile URL such as https://www.instagram.com/kalma/
  const instagram = String(env.INSTAGRAM_HANDLE || 'kalma.rajaampat').trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?#].*$/, '').replace(/^@/, '') || 'kalma.rajaampat';
  const port = Number(env.PORT) || 3000;
  return {
    port,
    siteUrl: String(env.SITE_URL || `http://localhost:${port}`).replace(/\/+$/, ''),
    dataDir: env.DATA_DIR || require('path').join(__dirname, '..', 'data'),
    adminPassword: env.ADMIN_PASSWORD || '',
    googleVerification: env.GOOGLE_SITE_VERIFICATION || '',
    sessionSecret: env.SESSION_SECRET || '', // optional; admin sessions are otherwise signed with ADMIN_PASSWORD
    db: loadDb(env),
    dbAutoMigrate: env.DB_AUTO_MIGRATE !== 'false',
    payments: loadPayments(env),
    // Long-lived token for Kalma's Instagram business/creator account; guest comments sync daily when set.
    instagram: { token: String(env.INSTAGRAM_ACCESS_TOKEN || '').trim() },
    contact: {
      whatsapp,
      whatsappDisplay: env.WHATSAPP_DISPLAY || '+' + whatsapp,
      email: env.CONTACT_EMAIL || 'hello@kalma-rajaampat.com',
      instagram: '@' + instagram.replace(/^@/, ''),
      instagramUrl: 'https://instagram.com/' + instagram.replace(/^@/, ''),
      facebookUrl: webUrl(env.FACEBOOK_URL),
      tiktokUrl: webUrl(env.TIKTOK_URL),
      googleUrl: webUrl(env.GOOGLE_BUSINESS_URL),
    },
  };
}

/** Keep only http(s) links, so a typo in hPanel can never become a javascript: link. */
function webUrl(v) {
  const s = String(v || '').trim();
  return /^https?:\/\/\S+$/i.test(s) ? s : '';
}

/**
 * Online payment through Midtrans Snap (cards, bank virtual accounts, QRIS, e-wallets).
 * Disabled (bookings fall back to WhatsApp) until both keys are set.
 */
function loadPayments(env) {
  const serverKey = String(env.MIDTRANS_SERVER_KEY || '').trim();
  const clientKey = String(env.MIDTRANS_CLIENT_KEY || '').trim();
  const production = env.MIDTRANS_IS_PRODUCTION === 'true';
  const percent = Math.min(100, Math.max(1, Math.round(Number(env.PAYMENT_DEPOSIT_PERCENT) || 100)));
  return {
    enabled: Boolean(serverKey && clientKey),
    provider: 'midtrans',
    serverKey,
    clientKey,
    production,
    percent,              // share of the total paid online (100 = full payment, e.g. 30 = deposit)
    snapUrl: production ? 'https://app.midtrans.com/snap/v1/transactions' : 'https://app.sandbox.midtrans.com/snap/v1/transactions',
    snapJs: production ? 'https://app.midtrans.com/snap/snap.js' : 'https://app.sandbox.midtrans.com/snap/snap.js',
  };
}

/** MySQL settings from DATABASE_URL (mysql://user:pass@host:3306/name) or DB_HOST(/DB_SOCKET)/DB_USER/DB_PASSWORD/DB_NAME. */
function loadDb(env) {
  if (env.DATABASE_URL) return { url: env.DATABASE_URL };
  if ((env.DB_HOST || env.DB_SOCKET) && env.DB_USER && env.DB_NAME) {
    let host = String(env.DB_HOST || 'localhost').trim();
    let port = Number(env.DB_PORT) || 3306;
    // A host that is only digits (e.g. "3306") is a port typed into the wrong field; Node would
    // read it as the IPv4 address 0.0.12.234. Treat it as the port and connect to localhost.
    if (/^\d+$/.test(host)) {
      if (!env.DB_PORT) port = Number(host);
      host = 'localhost';
    }
    return {
      host,
      port,
      socket: env.DB_SOCKET ? String(env.DB_SOCKET).trim() : '',
      user: String(env.DB_USER).trim(),
      password: env.DB_PASSWORD || '',
      name: String(env.DB_NAME).trim(),
    };
  }
  return null;
}

/** Rooms: prices are per person per night in IDR. Names/descriptions live in content/<lang>.json. */
const ROOMS = [
  { id: 'laguna', nameKey: 'r1.name', price: 850000, maxGuests: 2, units: 1 },
  { id: 'pantai', nameKey: 'r2.name', price: 750000, maxGuests: 3, units: 1 },
  { id: 'keluarga', nameKey: 'r3.name', price: 700000, maxGuests: 5, units: 1 },
];

const GUEST_OPTIONS = ['1', '2', '3', '4', '5', '6+'];

module.exports = { loadConfig, ROOMS, GUEST_OPTIONS };
