'use strict';

// Load .env if present (Node >= 20.12)
try { process.loadEnvFile(); } catch { /* no .env file */ }

const { createApp } = require('./src/app');

const app = createApp();
const { port, siteUrl, adminPassword } = app.locals.config;
const repo = app.locals.repo;

(async () => {
  await repo.init(); // runs database migrations when using MySQL
  const server = app.listen(port, () => {
    console.log(`Kalma Raja Ampat running at http://localhost:${port} (SITE_URL=${siteUrl})`);
    console.log(repo.kind === 'mysql' ? 'Storage: MySQL database' : `Storage: JSON file (${repo.file}) — set database settings for production`);
    if (!adminPassword) console.log('Admin page disabled: set ADMIN_PASSWORD to enable /admin');
  });

  const shutdown = () => {
    server.close(() => repo.close().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
})().catch((e) => {
  console.error('Failed to start:', e.message);
  process.exit(1);
});
