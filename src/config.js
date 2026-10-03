'use strict';

/**
 * Site settings. Contact details come from environment variables (.env) so they
 * can change without touching code; the values below are placeholders.
 */
function loadConfig(env = process.env) {
  const whatsapp = String(env.WHATSAPP_NUMBER || '6281234567890').replace(/\D/g, '');
  const instagram = env.INSTAGRAM_HANDLE || 'kalma.rajaampat';
  const port = Number(env.PORT) || 3000;
  return {
    port,
    siteUrl: String(env.SITE_URL || `http://localhost:${port}`).replace(/\/+$/, ''),
    dataDir: env.DATA_DIR || require('path').join(__dirname, '..', 'data'),
    adminPassword: env.ADMIN_PASSWORD || '',
    googleVerification: env.GOOGLE_SITE_VERIFICATION || '',
    db: loadDb(env),
    dbAutoMigrate: env.DB_AUTO_MIGRATE !== 'false',
    contact: {
      whatsapp,
      whatsappDisplay: env.WHATSAPP_DISPLAY || '+' + whatsapp,
      email: env.CONTACT_EMAIL || 'hello@kalma-rajaampat.com',
      instagram: '@' + instagram.replace(/^@/, ''),
      instagramUrl: 'https://instagram.com/' + instagram.replace(/^@/, ''),
    },
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
  { id: 'laguna', nameKey: 'r1.name', price: 850000 },
  { id: 'pantai', nameKey: 'r2.name', price: 750000 },
  { id: 'keluarga', nameKey: 'r3.name', price: 700000 },
];

const GUEST_OPTIONS = ['1', '2', '3', '4', '5', '6+'];

module.exports = { loadConfig, ROOMS, GUEST_OPTIONS };
