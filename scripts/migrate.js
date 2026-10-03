'use strict';

// Apply database migrations: `npm run migrate`
try { process.loadEnvFile(); } catch { /* no .env file */ }

const mysql = require('mysql2/promise');
const { loadConfig } = require('../src/config');
const { migrate } = require('../src/db/mysql');

(async () => {
  const { db } = loadConfig();
  if (!db) {
    console.error('No database configured. Set DATABASE_URL or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME in .env');
    process.exit(1);
  }
  const pool = mysql.createPool(db.url ? { uri: db.url } : { host: db.host, port: db.port, user: db.user, password: db.password, database: db.name });
  try {
    await migrate(pool);
    console.log('Database is up to date.');
  } finally {
    await pool.end();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
