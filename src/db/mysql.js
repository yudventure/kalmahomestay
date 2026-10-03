'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { STATUS_IDS, parseContact, normalizePhone, normalizeEmail, DuplicateError, paging } = require('./shared');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'migrations');

const like = (q) => '%' + String(q).replace(/[\\%_]/g, (m) => '\\' + m) + '%';
const now = () => new Date();

function poolOptions(db) {
  const base = {
    waitForConnections: true,
    connectionLimit: 5,
    charset: 'utf8mb4',
    timezone: 'Z',            // store and read DATETIME as UTC
    dateStrings: ['DATE'],    // check-in/out stay 'YYYY-MM-DD'
    multipleStatements: false,
  };
  if (db.url) return { uri: db.url, ...base };
  return { host: db.host, port: db.port, user: db.user, password: db.password, database: db.name, ...base };
}

/** Run migrations/*.sql that haven't been applied yet, in filename order. */
async function migrate(pool, log = console.log) {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(100) NOT NULL PRIMARY KEY,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  const conn = await pool.getConnection();
  try {
    const [[lock]] = await conn.query("SELECT GET_LOCK('kalma_migrate', 30) AS ok");
    if (!lock.ok) throw new Error('Could not acquire migration lock');
    const [rows] = await conn.query('SELECT version FROM schema_migrations');
    const done = new Set(rows.map((r) => r.version));
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
        .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
      const statements = sql.split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean);
      for (const st of statements) await conn.query(st);
      await conn.query('INSERT INTO schema_migrations (version) VALUES (?)', [file]);
      log(`Applied migration ${file}`);
    }
  } finally {
    await conn.query("SELECT RELEASE_LOCK('kalma_migrate')").catch(() => {});
    conn.release();
  }
}

function parseSurveyRow(r) {
  let answers = {};
  try { answers = typeof r.answers === 'string' ? JSON.parse(r.answers) : r.answers || {}; } catch { answers = {}; }
  return { ...r, answers };
}

function createMysqlRepo(db, { autoMigrate = true } = {}) {
  const pool = mysql.createPool(poolOptions(db));

  function dupError(e) {
    if (e && e.code === 'ER_DUP_ENTRY') return new DuplicateError(/email/.test(e.message) ? 'email' : 'phone');
    return e;
  }

  const repo = {
    kind: 'mysql',

    async init() { if (autoMigrate) await migrate(pool); },
    async close() { await pool.end(); },
    async ping() { await pool.query('SELECT 1'); return true; },

    /** Save an inquiry from the website; finds or creates the customer by phone/email. */
    async addInquiry(v) {
      const contact = parseContact(v.contact);
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        let customerId;
        const t = now();
        if (contact.phone || contact.email) {
          const [res] = await conn.query(
            `INSERT INTO customers (name, phone, email, country, lang, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), name = VALUES(name),
               country = COALESCE(VALUES(country), country), lang = VALUES(lang), updated_at = VALUES(updated_at)`,
            [v.name, contact.phone, contact.email, v.country || null, v.lang, t, t]);
          customerId = res.insertId;
        } else {
          const [res] = await conn.query(
            'INSERT INTO customers (name, other_contact, country, lang, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            [v.name, contact.other, v.country || null, v.lang, t, t]);
          customerId = res.insertId;
        }
        const [ins] = await conn.query(
          `INSERT INTO inquiries (customer_id, checkin, checkout, guests, room, message, lang, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [customerId, v.checkin, v.checkout, v.guests, v.room || null, v.msg || null, v.lang, t, t]);
        await conn.commit();
        return { customerId, inquiryId: ins.insertId };
      } catch (e) {
        await conn.rollback().catch(() => {});
        throw e;
      } finally {
        conn.release();
      }
    },

    async listInquiries({ status, q, page } = {}) {
      const { perPage, offset, page: p } = paging(page);
      const where = []; const args = [];
      if (STATUS_IDS.includes(status)) { where.push('i.status = ?'); args.push(status); }
      if (q) { where.push('(c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR i.message LIKE ?)'); args.push(like(q), like(q), like(q), like(q)); }
      const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM inquiries i JOIN customers c ON c.id = i.customer_id ${w}`, args);
      const [items] = await pool.query(
        `SELECT i.*, c.name, c.phone, c.email, c.other_contact, c.country
         FROM inquiries i JOIN customers c ON c.id = i.customer_id ${w}
         ORDER BY i.created_at DESC, i.id DESC LIMIT ? OFFSET ?`, [...args, perPage, offset]);
      return { items, total: Number(total), page: p, perPage };
    },

    async getInquiry(id) {
      const [[row]] = await pool.query(
        `SELECT i.*, c.name, c.phone, c.email, c.other_contact, c.country
         FROM inquiries i JOIN customers c ON c.id = i.customer_id WHERE i.id = ?`, [id]);
      return row || null;
    },

    async updateInquiry(id, { status, adminNote }) {
      const sets = []; const args = [];
      if (status !== undefined) { if (!STATUS_IDS.includes(status)) throw new Error('invalid status'); sets.push('status = ?'); args.push(status); }
      if (adminNote !== undefined) { sets.push('admin_note = ?'); args.push(adminNote || null); }
      if (!sets.length) return false;
      sets.push('updated_at = ?'); args.push(now());
      const [res] = await pool.query(`UPDATE inquiries SET ${sets.join(', ')} WHERE id = ?`, [...args, id]);
      return res.affectedRows > 0;
    },

    async deleteInquiry(id) {
      const [res] = await pool.query('DELETE FROM inquiries WHERE id = ?', [id]);
      return res.affectedRows > 0;
    },

    async listCustomers({ q, page } = {}) {
      const { perPage, offset, page: p } = paging(page);
      const args = [];
      let w = '';
      if (q) { w = 'WHERE c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.country LIKE ?'; args.push(like(q), like(q), like(q), like(q)); }
      const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM customers c ${w}`, args);
      const [items] = await pool.query(
        `SELECT c.*, COUNT(i.id) AS inquiry_count, MAX(i.created_at) AS last_inquiry_at
         FROM customers c LEFT JOIN inquiries i ON i.customer_id = c.id ${w}
         GROUP BY c.id ORDER BY COALESCE(MAX(i.created_at), c.created_at) DESC, c.id DESC LIMIT ? OFFSET ?`, [...args, perPage, offset]);
      items.forEach((r) => { r.inquiry_count = Number(r.inquiry_count); });
      return { items, total: Number(total), page: p, perPage };
    },

    async getCustomer(id) {
      const [[customer]] = await pool.query('SELECT * FROM customers WHERE id = ?', [id]);
      if (!customer) return null;
      const [inquiries] = await pool.query('SELECT * FROM inquiries WHERE customer_id = ? ORDER BY created_at DESC, id DESC', [id]);
      return { ...customer, inquiries };
    },

    async updateCustomer(id, f) {
      const phone = f.phone ? normalizePhone(f.phone) : null;
      const email = f.email ? normalizeEmail(f.email) : null;
      if (f.phone && !phone) throw Object.assign(new Error('invalid phone'), { code: 'INVALID', field: 'phone' });
      if (f.email && !email) throw Object.assign(new Error('invalid email'), { code: 'INVALID', field: 'email' });
      try {
        const [res] = await pool.query(
          `UPDATE customers SET name = ?, phone = ?, email = ?, other_contact = ?, country = ?, notes = ?, updated_at = ? WHERE id = ?`,
          [f.name, phone, email, f.other_contact || null, f.country || null, f.notes || null, now(), id]);
        return res.affectedRows > 0;
      } catch (e) { throw dupError(e); }
    },

    async deleteCustomer(id) {
      const [res] = await pool.query('DELETE FROM customers WHERE id = ?', [id]); // inquiries cascade
      return res.affectedRows > 0;
    },

    async stats(today) {
      const [byStatus] = await pool.query('SELECT status, COUNT(*) AS n FROM inquiries GROUP BY status');
      const [[{ customers }]] = await pool.query('SELECT COUNT(*) AS customers FROM customers');
      const [upcoming] = await pool.query(
        `SELECT i.*, c.name, c.phone, c.email, c.other_contact FROM inquiries i JOIN customers c ON c.id = i.customer_id
         WHERE i.status = 'confirmed' AND i.checkin >= ? ORDER BY i.checkin ASC LIMIT 10`, [today]);
      const counts = Object.fromEntries(STATUS_IDS.map((s) => [s, 0]));
      byStatus.forEach((r) => { counts[r.status] = Number(r.n); });
      return { counts, customers: Number(customers), upcoming };
    },

    async exportCustomers() {
      const [rows] = await pool.query(
        `SELECT c.id, c.name, c.phone, c.email, c.other_contact, c.country, c.lang, c.notes, c.created_at,
                COUNT(i.id) AS inquiry_count, MAX(i.created_at) AS last_inquiry_at
         FROM customers c LEFT JOIN inquiries i ON i.customer_id = c.id GROUP BY c.id ORDER BY c.id`);
      return rows;
    },

    async exportInquiries() {
      const [rows] = await pool.query(
        `SELECT i.id, i.created_at, i.status, c.name, c.phone, c.email, c.other_contact, c.country,
                i.checkin, i.checkout, i.guests, i.room, i.message, i.admin_note, i.lang, i.customer_id
         FROM inquiries i JOIN customers c ON c.id = i.customer_id ORDER BY i.id`);
      return rows;
    },

    /* ---------- survey ---------- */
    async addSurveyResponse({ lang, answers, contact }) {
      const [res] = await pool.query('INSERT INTO survey_responses (lang, answers, contact, created_at) VALUES (?, ?, ?, ?)',
        [lang, JSON.stringify(answers), contact || null, now()]);
      return res.insertId;
    },

    async listSurveyResponses({ page } = {}) {
      const { perPage, offset, page: p } = paging(page);
      const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM survey_responses');
      const [rows] = await pool.query('SELECT * FROM survey_responses ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?', [perPage, offset]);
      return { items: rows.map(parseSurveyRow), total: Number(total), page: p, perPage };
    },

    async allSurveyResponses() {
      const [rows] = await pool.query('SELECT * FROM survey_responses ORDER BY created_at DESC, id DESC');
      return rows.map(parseSurveyRow);
    },

    async deleteSurveyResponse(id) {
      const [res] = await pool.query('DELETE FROM survey_responses WHERE id = ?', [id]);
      return res.affectedRows > 0;
    },
  };
  repo._pool = pool;
  return repo;
}

module.exports = { createMysqlRepo, migrate };
