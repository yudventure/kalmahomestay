'use strict';

/** Inquiry statuses, in pipeline order. Labels are shown in the admin. */
const STATUSES = [
  { id: 'new', label: 'Baru' },
  { id: 'contacted', label: 'Sudah dihubungi' },
  { id: 'confirmed', label: 'Terkonfirmasi' },
  { id: 'completed', label: 'Selesai menginap' },
  { id: 'cancelled', label: 'Batal' },
];
const STATUS_IDS = STATUSES.map((s) => s.id);

/** Split the free-text contact field into phone / email / other. */
function parseContact(raw) {
  const c = String(raw || '').trim();
  if (!c) return { phone: null, email: null, other: null };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return { phone: null, email: c.toLowerCase(), other: null };
  const phone = normalizePhone(c);
  if (phone) return { phone, email: null, other: null };
  return { phone: null, email: null, other: c.slice(0, 100) };
}

/** Booking page sends phone and email separately; the older forms send one "contact" field. */
function contactOf(v) {
  const phone = normalizePhone(v.phone);
  const email = normalizeEmail(v.email);
  if (phone || email) return { phone: phone || null, email: email || null, other: null };
  return parseContact(v.contact);
}

/** An online order waits for payment; a booking request without payment (no Midtrans yet) has no payment state. */
function paymentStatusOf(v) {
  if (v.paymentStatus !== undefined) return v.paymentStatus;
  return v.orderId ? 'pending' : null;
}

/** "0812-3456 7890" / "+62 812..." / "812..." → "6281234567890". Returns null if it doesn't look like a phone number. */
function normalizePhone(raw) {
  const s = String(raw || '').trim();
  if (!s || /[a-z]/i.test(s.replace(/^\+/, ''))) return null;
  let d = s.replace(/\D/g, '');
  if (d.length < 8 || d.length > 15) return null;
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8') && d.length <= 13) d = '62' + d;
  return d;
}

function normalizeEmail(raw) {
  const s = String(raw || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}

class DuplicateError extends Error {
  constructor(field) { super(`duplicate ${field}`); this.code = 'DUPLICATE'; this.field = field; }
}

const PER_PAGE = 25;
function paging(page, perPage = PER_PAGE) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  return { page: p, perPage, offset: (p - 1) * perPage };
}

module.exports = { STATUSES, STATUS_IDS, parseContact, contactOf, paymentStatusOf, normalizePhone, normalizeEmail, DuplicateError, paging, PER_PAGE };
