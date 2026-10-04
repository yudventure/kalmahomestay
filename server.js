'use strict';

// Load .env if present (Node >= 20.12)
try { process.loadEnvFile(); } catch { /* no .env file */ }

const { createApp } = require('./src/app');

const app = createApp();
const { port, siteUrl, adminPassword } = app.locals.config;
const repo = app.locals.repo;
const status = app.locals.dbStatus;

/** Explain common database errors in plain words (no secrets). */
function hint(e) {
  const code = e && e.code;
  if (code === 'ER_ACCESS_DENIED_ERROR') {
    return 'Akses ditolak: cek DB_USER (nama lengkap, mis. u123456789_kalma) dan DB_PASSWORD. '
      + 'Jika sudah benar, user mungkin hanya diizinkan lewat socket: isi DB_SOCKET (lokasi socket MySQL dari support Hostinger)';
  }
  if (code === 'ER_BAD_DB_ERROR') return 'DB_NAME tidak ditemukan';
  if (code === 'ER_DBACCESS_DENIED_ERROR') return 'DB_NAME salah, atau DB_USER belum diberi akses ke database ini';
  if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH', 'EINVAL', 'EAFNOSUPPORT', 'EADDRNOTAVAIL', 'ENETUNREACH'].includes(code)) {
    const where = e.address ? ` ${e.address}${e.port ? ':' + e.port : ''}` : '';
    return `Database tidak bisa dihubungi (${code}${where}). Coba DB_HOST=127.0.0.1, atau isi DB_SOCKET (mis. /var/lib/mysql/mysql.sock)`;
  }
  return code ? `database error (${code})` : 'database error';
}

// Prepare storage (database migrations) without blocking the website:
// if the database is unreachable the site still serves pages and retries in the background.
async function initStorage(attempt = 1) {
  try {
    await repo.init();
    status.ready = true;
    status.error = '';
    app.locals.site.load().catch((e) => console.error('Website settings not loaded:', e.message)); // admin-edited settings
    app.locals.instagram.start().catch(() => {}); // guest comments from Instagram, refreshed daily
    console.log(repo.kind === 'mysql' ? `Storage: MySQL database ready (${repo.connection})` : `Storage: JSON file (${repo.file}) — set DB_* settings for production`);
  } catch (e) {
    status.ready = false;
    status.error = hint(e);
    const wait = Math.min(300, 15 * attempt);
    console.error(`Storage not ready (${status.error}); retrying in ${wait}s`);
    setTimeout(() => initStorage(attempt + 1), wait * 1000).unref();
  }
}

const server = app.listen(port, () => {
  console.log(`Kalma Raja Ampat running on port ${port} (SITE_URL=${siteUrl})`);
  if (!adminPassword) console.log('Admin page disabled: set ADMIN_PASSWORD to enable /admin');
  initStorage();
});

const shutdown = () => {
  server.close(() => repo.close().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
