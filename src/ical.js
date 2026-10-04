'use strict';

/**
 * Minimal iCalendar (RFC 5545) reading and writing for OTA calendar sync.
 * Airbnb, Booking.com, Agoda, Vrbo, Tiket.com and most channel managers share availability as an
 * .ics link with all-day VEVENTs: DTSTART = first night, DTEND = check-out day.
 */

/** "20300501" or "20300501T140000Z" → "2030-05-01" */
function icalDate(v) {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(String(v || '').trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const unescape = (s) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');

/** Parse VEVENTs → [{ uid, start, end, summary }] (cancelled events are skipped). */
function parseICal(text) {
  const lines = String(text || '').replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const events = [];
  let ev = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { ev = {}; continue; }
    if (line === 'END:VEVENT') {
      if (ev && ev.start && ev.status !== 'CANCELLED') {
        const end = ev.end && ev.end > ev.start ? ev.end : addDays(ev.start, 1);
        events.push({ uid: ev.uid || `${ev.start}-${end}-${ev.summary || ''}`, start: ev.start, end, summary: ev.summary || '' });
      }
      ev = null;
      continue;
    }
    if (!ev) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const name = line.slice(0, i).split(';')[0].toUpperCase();
    const value = line.slice(i + 1);
    if (name === 'DTSTART') ev.start = icalDate(value);
    else if (name === 'DTEND') ev.end = icalDate(value);
    else if (name === 'UID') ev.uid = value.trim().slice(0, 250);
    else if (name === 'SUMMARY') ev.summary = unescape(value).trim().slice(0, 120);
    else if (name === 'STATUS') ev.status = value.trim().toUpperCase();
  }
  return events;
}

const escapeText = (s) => String(s).replace(/([\\;,])/g, '\\$1').replace(/\r?\n/g, '\\n');
const compact = (iso) => iso.replace(/-/g, '');

/** Fold lines longer than 75 octets, as the spec asks. */
function fold(line) {
  const out = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut)) > 75) cut -= 1;
    out.push(rest.slice(0, cut));
    rest = ' ' + rest.slice(cut);
  }
  out.push(rest);
  return out.join('\r\n');
}

/** Build a calendar of busy nights: events = [{ uid, start, end, summary }]. */
function buildICal({ name, events, now = new Date() }) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kalma Raja Ampat//Booking calendar//ID', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
  ];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${escapeText(e.uid)}`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(e.start)}`, `DTEND;VALUE=DATE:${compact(e.end)}`,
      `SUMMARY:${escapeText(e.summary || 'Not available')}`, 'TRANSP:OPAQUE', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

module.exports = { parseICal, buildICal, icalDate, addDays };
