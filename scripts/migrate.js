'use strict';

// Apply database migrations: `npm run migrate`
try { process.loadEnvFile(); } catch { /* no .env file */ }

const { loadConfig } = require('../src/config');
const { createMysqlRepo } = require('../src/db/mysql');

(async () => {
  const { db } = loadConfig();
  if (!db) {
    console.error('No database configured. Set DATABASE_URL or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME in .env');
    process.exit(1);
  }
  const repo = createMysqlRepo(db);
  try {
    await repo.init(); // connects (TCP, falling back to the local socket) and applies migrations
    console.log(`Database is up to date (${repo.connection}).`);
  } finally {
    await repo.close();
  }
})().catch((e) => { console.error(e.code || '', e.message); process.exit(1); });
