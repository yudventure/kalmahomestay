'use strict';

const { ROOMS, GUEST_OPTIONS } = require('./config');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function clean(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

function todayISO(now = new Date()) {
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** Normalize raw form input into the fields we keep. */
function normalize(body = {}) {
  return {
    name: clean(body.name, 80),
    contact: clean(body.contact, 100),
    country: clean(body.country, 80),
    checkin: clean(body.checkin, 10),
    checkout: clean(body.checkout, 10),
    guests: GUEST_OPTIONS.includes(clean(body.guests, 3)) ? clean(body.guests, 3) : '2',
    room: ROOMS.some((r) => r.id === clean(body.room, 20)) ? clean(body.room, 20) : '',
    msg: clean(body.msg, 1000),
  };
}

/** Returns an error key from content ui.* or '' when valid. */
function validate(v, now = new Date()) {
  if (!v.name) return 'errName';
  if (!DATE_RE.test(v.checkin) || !DATE_RE.test(v.checkout) || isNaN(Date.parse(v.checkin)) || isNaN(Date.parse(v.checkout))) return 'errDates';
  if (v.checkin < todayISO(now)) return 'errPast';
  if (v.checkout <= v.checkin) return 'errOrder';
  return '';
}

function formatDate(iso, lang) {
  return new Date(iso + 'T00:00:00').toLocaleDateString(lang === 'en' ? 'en-GB' : 'id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The text that opens prefilled in WhatsApp / email. */
function buildMessage(v, lang, t) {
  const ui = t('ui');
  const room = ROOMS.find((r) => r.id === v.room);
  return [
    ui.hello, '',
    `${ui.name}: ${v.name}`,
    v.contact ? `${ui.contact}: ${v.contact}` : null,
    v.country ? `${ui.from}: ${v.country}` : null,
    `${ui.dates}: ${formatDate(v.checkin, lang)} – ${formatDate(v.checkout, lang)}`,
    `${ui.guests}: ${v.guests}`,
    `${ui.room}: ${room ? t(room.nameKey) : ui.any}`,
    v.msg ? `${ui.note}: ${v.msg}` : null,
  ].filter((l) => l !== null).join('\n');
}

/** Link to reply to a guest: WhatsApp for phone numbers, mailto for emails. */
function replyLink(contact, name) {
  const c = String(contact || '').trim();
  const hello = `Halo ${name || ''}, terima kasih sudah menghubungi Kalma Raja Ampat!`;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return `mailto:${c}?subject=${encodeURIComponent('Kalma Raja Ampat')}&body=${encodeURIComponent(hello)}`;
  let digits = c.replace(/\D/g, '');
  if (digits.length >= 8) {
    if (digits.startsWith('0')) digits = '62' + digits.slice(1);
    return `https://wa.me/${digits}?text=${encodeURIComponent(hello)}`;
  }
  return '';
}

module.exports = { replyLink, normalize, validate, buildMessage, todayISO };
