'use strict';

/**
 * JSON-file storage with the same API as the MySQL repo.
 * Meant for local development without MySQL; production should use MySQL.
 */
const fs = require('fs');
const path = require('path');
const { STATUS_IDS, parseContact, normalizePhone, normalizeEmail, DuplicateError, paging } = require('./shared');

function createFileRepo(dataDir) {
  const file = path.join(dataDir, 'kalma-db.json');
  let db = { seq: { customer: 0, inquiry: 0, survey: 0 }, customers: [], inquiries: [], survey: [] };

  function load() {
    if (fs.existsSync(file)) db = JSON.parse(fs.readFileSync(file, 'utf8'));
    db.survey = db.survey || [];
    db.seq.survey = db.seq.survey || 0;
  }
  function save() {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
    fs.renameSync(tmp, file);
  }
  const iso = () => new Date().toISOString();
  const out = (r) => r && { ...r, created_at: new Date(r.created_at), updated_at: new Date(r.updated_at) };
  const cust = (id) => db.customers.find((c) => c.id === id);
  const joined = (i) => {
    const c = cust(i.customer_id) || {};
    return out({ ...i, name: c.name, phone: c.phone, email: c.email, other_contact: c.other_contact, country: c.country });
  };
  const matches = (q, ...fields) => !q || fields.some((f) => f && String(f).toLowerCase().includes(String(q).toLowerCase()));
  const page = (rows, p) => {
    const { perPage, offset, page: pg } = paging(p);
    return { items: rows.slice(offset, offset + perPage), total: rows.length, page: pg, perPage };
  };
  const newestFirst = (a, b) => (b.created_at > a.created_at ? 1 : b.created_at < a.created_at ? -1 : b.id - a.id);

  return {
    kind: 'file',
    file,
    async init() { load(); },
    async close() {},
    async ping() { return true; },

    async addInquiry(v) {
      const contact = parseContact(v.contact);
      const t = iso();
      let c = (contact.phone && db.customers.find((x) => x.phone === contact.phone))
        || (contact.email && db.customers.find((x) => x.email === contact.email));
      if (c) {
        Object.assign(c, { name: v.name, country: v.country || c.country, lang: v.lang, updated_at: t });
      } else {
        c = { id: ++db.seq.customer, name: v.name, phone: contact.phone, email: contact.email, other_contact: contact.other,
          country: v.country || null, lang: v.lang, notes: null, created_at: t, updated_at: t };
        db.customers.push(c);
      }
      const i = { id: ++db.seq.inquiry, customer_id: c.id, checkin: v.checkin, checkout: v.checkout, guests: v.guests,
        room: v.room || null, message: v.msg || null, lang: v.lang, status: 'new', admin_note: null, created_at: t, updated_at: t };
      db.inquiries.push(i);
      save();
      return { customerId: c.id, inquiryId: i.id };
    },

    async listInquiries({ status, q, page: p } = {}) {
      const rows = db.inquiries
        .filter((i) => !STATUS_IDS.includes(status) || i.status === status)
        .map((i) => ({ i, c: cust(i.customer_id) || {} }))
        .filter(({ i, c }) => matches(q, c.name, c.phone, c.email, i.message))
        .map(({ i }) => i).sort(newestFirst).map(joined);
      return page(rows, p);
    },

    async getInquiry(id) {
      const i = db.inquiries.find((x) => x.id === Number(id));
      return i ? joined(i) : null;
    },

    async updateInquiry(id, { status, adminNote }) {
      const i = db.inquiries.find((x) => x.id === Number(id));
      if (!i) return false;
      if (status !== undefined) { if (!STATUS_IDS.includes(status)) throw new Error('invalid status'); i.status = status; }
      if (adminNote !== undefined) i.admin_note = adminNote || null;
      i.updated_at = iso();
      save();
      return true;
    },

    async deleteInquiry(id) {
      const n = db.inquiries.length;
      db.inquiries = db.inquiries.filter((x) => x.id !== Number(id));
      save();
      return db.inquiries.length < n;
    },

    async listCustomers({ q, page: p } = {}) {
      const rows = db.customers.filter((c) => matches(q, c.name, c.phone, c.email, c.country)).map((c) => {
        const inq = db.inquiries.filter((i) => i.customer_id === c.id);
        const last = inq.map((i) => i.created_at).sort().pop() || null;
        return { ...out(c), inquiry_count: inq.length, last_inquiry_at: last ? new Date(last) : null, _sort: last || c.created_at };
      }).sort((a, b) => (b._sort > a._sort ? 1 : b._sort < a._sort ? -1 : b.id - a.id));
      return page(rows, p);
    },

    async getCustomer(id) {
      const c = cust(Number(id));
      if (!c) return null;
      return { ...out(c), inquiries: db.inquiries.filter((i) => i.customer_id === c.id).sort(newestFirst).map(out) };
    },

    async updateCustomer(id, f) {
      const c = cust(Number(id));
      if (!c) return false;
      const phone = f.phone ? normalizePhone(f.phone) : null;
      const email = f.email ? normalizeEmail(f.email) : null;
      if (f.phone && !phone) throw Object.assign(new Error('invalid phone'), { code: 'INVALID', field: 'phone' });
      if (f.email && !email) throw Object.assign(new Error('invalid email'), { code: 'INVALID', field: 'email' });
      if (phone && db.customers.some((x) => x.id !== c.id && x.phone === phone)) throw new DuplicateError('phone');
      if (email && db.customers.some((x) => x.id !== c.id && x.email === email)) throw new DuplicateError('email');
      Object.assign(c, { name: f.name, phone, email, other_contact: f.other_contact || null, country: f.country || null, notes: f.notes || null, updated_at: iso() });
      save();
      return true;
    },

    async deleteCustomer(id) {
      const n = db.customers.length;
      db.customers = db.customers.filter((c) => c.id !== Number(id));
      db.inquiries = db.inquiries.filter((i) => i.customer_id !== Number(id));
      save();
      return db.customers.length < n;
    },

    async stats(today) {
      const counts = Object.fromEntries(STATUS_IDS.map((s) => [s, 0]));
      db.inquiries.forEach((i) => { counts[i.status] += 1; });
      const upcoming = db.inquiries.filter((i) => i.status === 'confirmed' && i.checkin >= today)
        .sort((a, b) => (a.checkin < b.checkin ? -1 : 1)).slice(0, 10).map(joined);
      return { counts, customers: db.customers.length, upcoming };
    },

    async exportCustomers() {
      return db.customers.map((c) => {
        const inq = db.inquiries.filter((i) => i.customer_id === c.id);
        return { id: c.id, name: c.name, phone: c.phone, email: c.email, other_contact: c.other_contact, country: c.country,
          lang: c.lang, notes: c.notes, created_at: new Date(c.created_at), inquiry_count: inq.length,
          last_inquiry_at: inq.length ? new Date(inq.map((i) => i.created_at).sort().pop()) : null };
      });
    },

    async exportInquiries() {
      return db.inquiries.slice().sort((a, b) => a.id - b.id).map((i) => {
        const c = cust(i.customer_id) || {};
        return { id: i.id, created_at: new Date(i.created_at), status: i.status, name: c.name, phone: c.phone, email: c.email,
          other_contact: c.other_contact, country: c.country, checkin: i.checkin, checkout: i.checkout, guests: i.guests,
          room: i.room, message: i.message, admin_note: i.admin_note, lang: i.lang, customer_id: i.customer_id };
      });
    },

    /* ---------- survey ---------- */
    async addSurveyResponse({ lang, answers, contact }) {
      const r = { id: ++db.seq.survey, lang, answers, contact: contact || null, created_at: iso() };
      db.survey.push(r);
      save();
      return r.id;
    },

    async listSurveyResponses({ page: p } = {}) {
      const rows = db.survey.slice().sort(newestFirst).map((r) => ({ ...r, created_at: new Date(r.created_at) }));
      return page(rows, p);
    },

    async allSurveyResponses() {
      return db.survey.slice().sort(newestFirst).map((r) => ({ ...r, created_at: new Date(r.created_at) }));
    },

    async deleteSurveyResponse(id) {
      const n = db.survey.length;
      db.survey = db.survey.filter((r) => r.id !== Number(id));
      save();
      return db.survey.length < n;
    },
  };
}

module.exports = { createFileRepo };
