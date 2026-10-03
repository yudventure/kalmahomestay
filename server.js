'use strict';

// Load .env if present (Node >= 20.12)
try { process.loadEnvFile(); } catch { /* no .env file */ }

const { createApp } = require('./src/app');

const app = createApp();
const { port, siteUrl, adminPassword } = app.locals.config;

app.listen(port, () => {
  console.log(`Kalma Raja Ampat running at http://localhost:${port} (SITE_URL=${siteUrl})`);
  if (!adminPassword) console.log('Admin page disabled: set ADMIN_PASSWORD in .env to enable /admin');
});
