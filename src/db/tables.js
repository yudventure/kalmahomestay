'use strict';

/**
 * Simple tables for the admin CMS (staff, calendar, channels, HR, finance).
 * One schema drives both stores: MySQL (migrations/006_cms.sql) and the JSON file used in development.
 * Column types: int, str, text, date ('YYYY-MM-DD'), datetime, bool, money (whole rupiah).
 *
 * table(name) gives: list(query), get(id), find(where), insert(values), update(id, values), remove(id), count(query).
 * query = { where: { col: value | [values] }, overlap: { start, end, from, to }, range: { col, from, to },
 *           search: { cols: [..], q }, order: [[col, 'asc'|'desc'], ...], limit, offset }
 */
const TABLES = {
  staff_users: {
    columns: { name: 'str', username: 'str', password_hash: 'str', role: 'str', active: 'bool', last_login_at: 'datetime' },
  },
  channels: {
    columns: { name: 'str', kind: 'str', room: 'str', ical_url: 'text', export_token: 'str', commission_pct: 'int',
      contact: 'str', active: 'bool', last_sync_at: 'datetime', last_sync_status: 'str' },
  },
  calendar_blocks: {
    columns: { room: 'str', start_date: 'date', end_date: 'date', source: 'str', channel_id: 'int', external_uid: 'str',
      guest_name: 'str', guests: 'int', amount: 'money', note: 'text', created_by: 'str' },
  },
  employees: {
    columns: { name: 'str', position: 'str', department: 'str', phone: 'str', email: 'str', join_date: 'date',
      salary: 'money', allowance: 'money', status: 'str', notes: 'text' },
  },
  attendance: {
    columns: { employee_id: 'int', date: 'date', status: 'str', check_in: 'str', check_out: 'str', note: 'str' },
  },
  leave_requests: {
    columns: { employee_id: 'int', kind: 'str', start_date: 'date', end_date: 'date', reason: 'text', status: 'str', decided_by: 'str' },
  },
  payroll: {
    columns: { period: 'str', employee_id: 'int', base: 'money', allowance: 'money', bonus: 'money', deduction: 'money',
      net: 'money', status: 'str', paid_at: 'datetime', transaction_id: 'int', note: 'str' },
  },
  media: {
    columns: { kind: 'str', file: 'str', original_name: 'str', mime: 'str', size: 'int', slot: 'str', owner_type: 'str', owner_id: 'int',
      label: 'str', public: 'bool', uploaded_by: 'str' },
  },
  feedback: {
    columns: { kind: 'str', topic: 'str', rating: 'int', message: 'text', name: 'str', contact: 'str', stay_date: 'date',
      lang: 'str', status: 'str', admin_note: 'text', handled_by: 'str' },
  },
  activities: {
    columns: { category: 'str', slug: 'str', sort: 'int', active: 'bool', price: 'money', min_people: 'int', max_people: 'int',
      level: 'str', duration: 'str', duration_en: 'str', start_time: 'str', title_id: 'str', title_en: 'str',
      summary_id: 'text', summary_en: 'text', body_id: 'text', body_en: 'text', includes_id: 'text', includes_en: 'text',
      bring_id: 'text', bring_en: 'text', notes_id: 'text', notes_en: 'text' },
  },
  transactions: {
    columns: { date: 'date', kind: 'str', category: 'str', amount: 'money', method: 'str', description: 'text',
      ref_type: 'str', ref_id: 'int', created_by: 'str' },
  },
};

const SQL_IDENT = /^[a-z_]+$/;

function coerce(type, v) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return type === 'bool' ? false : null;
  switch (type) {
    case 'int': case 'money': { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : null; }
    case 'bool': return v === true || v === 1 || v === '1' || v === 'true' || v === 'on';
    case 'date': return /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null;
    case 'datetime': { const d = v instanceof Date ? v : new Date(v); return isNaN(d) ? null : d; }
    default: return String(v);
  }
}

/** Keep only the table's columns, coerced to their types. */
function clean(name, values) {
  const cols = TABLES[name].columns;
  const out = {};
  for (const [k, type] of Object.entries(cols)) {
    const v = coerce(type, values[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function columnsOf(name) {
  if (!TABLES[name]) throw new Error(`unknown table ${name}`);
  return TABLES[name].columns;
}

/* ---------------- MySQL ---------------- */
function createMysqlTable(getPool, name) {
  const cols = columnsOf(name);
  const known = (c) => c === 'id' || c === 'created_at' || c === 'updated_at' || c in cols;
  const check = (c) => { if (!known(c) || !SQL_IDENT.test(c)) throw new Error(`bad column ${c}`); return c; };
  const fromRow = (r) => {
    if (!r) return null;
    const o = { ...r };
    for (const [k, type] of Object.entries(cols)) if (type === 'bool') o[k] = Boolean(o[k]);
    return o;
  };

  function whereSql(q = {}) {
    const parts = [];
    const args = [];
    for (const [c, v] of Object.entries(q.where || {})) {
      check(c);
      if (Array.isArray(v)) {
        if (!v.length) { parts.push('1 = 0'); continue; }
        parts.push(`${c} IN (?)`); args.push(v);
      } else if (v === null) parts.push(`${c} IS NULL`);
      else { parts.push(`${c} = ?`); args.push(v); }
    }
    if (q.overlap) {
      parts.push(`${check(q.overlap.start)} < ? AND ${check(q.overlap.end)} > ?`);
      args.push(q.overlap.to, q.overlap.from);
    }
    if (q.range) {
      if (q.range.from != null) { parts.push(`${check(q.range.col)} >= ?`); args.push(q.range.from); }
      if (q.range.to != null) { parts.push(`${check(q.range.col)} < ?`); args.push(q.range.to); }
    }
    if (q.search && q.search.q) {
      const like = '%' + String(q.search.q).replace(/[\\%_]/g, (m) => '\\' + m) + '%';
      parts.push('(' + q.search.cols.map((c) => `${check(c)} LIKE ?`).join(' OR ') + ')');
      q.search.cols.forEach(() => args.push(like));
    }
    return { sql: parts.length ? ' WHERE ' + parts.join(' AND ') : '', args };
  }

  return {
    async list(q = {}) {
      const w = whereSql(q);
      const order = (q.order || [['id', 'desc']]).map(([c, d]) => `${check(c)} ${d === 'asc' ? 'ASC' : 'DESC'}`).join(', ');
      let sql = `SELECT * FROM ${name}${w.sql} ORDER BY ${order}`;
      const args = [...w.args];
      if (q.limit) { sql += ' LIMIT ? OFFSET ?'; args.push(q.limit, q.offset || 0); }
      const [rows] = await getPool().query(sql, args);
      return rows.map(fromRow);
    },
    async count(q = {}) {
      const w = whereSql(q);
      const [[r]] = await getPool().query(`SELECT COUNT(*) AS n FROM ${name}${w.sql}`, w.args);
      return Number(r.n);
    },
    async get(id) {
      const [[r]] = await getPool().query(`SELECT * FROM ${name} WHERE id = ?`, [id]);
      return fromRow(r);
    },
    async find(where) { return (await this.list({ where, limit: 1 }))[0] || null; },
    async insert(values) {
      const v = clean(name, values);
      const keys = Object.keys(v);
      const now = new Date();
      const [res] = await getPool().query(
        `INSERT INTO ${name} (${[...keys, 'created_at', 'updated_at'].join(', ')}) VALUES (${keys.map(() => '?').concat('?', '?').join(', ')})`,
        [...keys.map((k) => v[k]), now, now]);
      return res.insertId;
    },
    async update(id, values) {
      const v = clean(name, values);
      const keys = Object.keys(v);
      if (!keys.length) return Boolean(await this.get(id));
      const [res] = await getPool().query(`UPDATE ${name} SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
        [...keys.map((k) => v[k]), new Date(), id]);
      return res.affectedRows > 0;
    },
    async remove(id) {
      const [res] = await getPool().query(`DELETE FROM ${name} WHERE id = ?`, [id]);
      return res.affectedRows > 0;
    },
  };
}

/* ---------------- JSON file ---------------- */
function createFileTable(state, save, name) {
  const cols = columnsOf(name);
  const rows = () => (state.tables[name] ||= []);
  const out = (r) => {
    if (!r) return null;
    const o = { ...r };
    for (const [k, type] of Object.entries(cols)) if (type === 'datetime' && o[k]) o[k] = new Date(o[k]);
    o.created_at = new Date(o.created_at); o.updated_at = new Date(o.updated_at);
    return o;
  };
  const store = (v) => {
    const o = { ...v };
    for (const k of Object.keys(o)) if (o[k] instanceof Date) o[k] = o[k].toISOString();
    return o;
  };
  function matches(r, q = {}) {
    for (const [c, v] of Object.entries(q.where || {})) {
      if (Array.isArray(v) ? !v.map(String).includes(String(r[c])) : v === null ? r[c] != null : String(r[c]) !== String(v)) return false;
    }
    if (q.overlap && !(r[q.overlap.start] < q.overlap.to && r[q.overlap.end] > q.overlap.from)) return false;
    if (q.range) {
      const val = r[q.range.col];
      if (q.range.from != null && !(val >= toCmp(q.range.from))) return false;
      if (q.range.to != null && !(val < toCmp(q.range.to))) return false;
    }
    if (q.search && q.search.q) {
      const needle = String(q.search.q).toLowerCase();
      if (!q.search.cols.some((c) => r[c] != null && String(r[c]).toLowerCase().includes(needle))) return false;
    }
    return true;
  }
  const toCmp = (v) => (v instanceof Date ? v.toISOString() : v);
  return {
    async list(q = {}) {
      const order = q.order || [['id', 'desc']];
      let list = rows().filter((r) => matches(r, q)).sort((a, b) => {
        for (const [c, d] of order) {
          const x = a[c] == null ? '' : a[c]; const y = b[c] == null ? '' : b[c];
          if (x < y) return d === 'asc' ? -1 : 1;
          if (x > y) return d === 'asc' ? 1 : -1;
        }
        return 0;
      });
      if (q.limit) list = list.slice(q.offset || 0, (q.offset || 0) + q.limit);
      return list.map(out);
    },
    async count(q = {}) { return rows().filter((r) => matches(r, q)).length; },
    async get(id) { return out(rows().find((r) => r.id === Number(id))); },
    async find(where) { return (await this.list({ where, limit: 1 }))[0] || null; },
    async insert(values) {
      state.seq[name] = (state.seq[name] || 0) + 1;
      const now = new Date().toISOString();
      const blank = Object.fromEntries(Object.keys(cols).map((k) => [k, cols[k] === 'bool' ? false : null]));
      rows().push({ id: state.seq[name], ...blank, ...store(clean(name, values)), created_at: now, updated_at: now });
      save();
      return state.seq[name];
    },
    async update(id, values) {
      const r = rows().find((x) => x.id === Number(id));
      if (!r) return false;
      Object.assign(r, store(clean(name, values)), { updated_at: new Date().toISOString() });
      save();
      return true;
    },
    async remove(id) {
      const n = rows().length;
      state.tables[name] = rows().filter((x) => x.id !== Number(id));
      save();
      return state.tables[name].length < n;
    },
  };
}

module.exports = { TABLES, clean, createMysqlTable, createFileTable };
