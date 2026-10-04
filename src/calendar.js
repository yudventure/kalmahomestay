'use strict';

/**
 * Booking calendar: which nights each room is taken, from
 *   - website bookings (inquiries that are confirmed/completed or paid online),
 *   - OTA/agent calendars imported by iCal (Airbnb, Booking.com, Agoda, Tiket.com, …),
 *   - bookings and blocks entered in the admin (walk-in, agent, maintenance).
 * It answers "is this room free?" for the website and gives each channel a calendar link to import,
 * so a night sold anywhere closes everywhere.
 */
const crypto = require('crypto');
const { ROOMS } = require('./config');
const { parseICal, buildICal, addDays } = require('./ical');
const { todayISO } = require('./inquiry');

const SYNC_EVERY = 30 * 60 * 1000;
const MAX_ICAL_BYTES = 2 * 1024 * 1024;

const nightsOf = (start, end) => {
  const out = [];
  for (let d = start; d < end && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
};
/** OTA links point to the public internet; refuse local/private addresses (the server must not fetch its own network). */
function isPublicUrl(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (!/^https?:$/.test(u.protocol)) return false;
  const h = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return false;
  if (/^(127|10|0)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (h === '::1' || h === '::' || /^f[cd]/.test(h) || /^fe80:/.test(h) || /^::ffff:/.test(h)) return false;
  return true;
}

const holds = (i) => i.status === 'confirmed' || i.status === 'completed' || i.payment_status === 'paid';

function createCalendar({ repo, fetchImpl = fetch, log = console.log, today = () => todayISO(), allowPrivate = false }) {
  const blocks = repo.table('calendar_blocks');
  const channels = repo.table('channels');

  /** Everything on the calendar between from (incl.) and to (excl.), optionally for one room. */
  async function items(from, to, room) {
    const [inq, blk, chans] = await Promise.all([
      repo.inquiriesBetween(from, to),
      blocks.list({ where: room ? { room } : {}, overlap: { start: 'start_date', end: 'end_date', from, to }, order: [['start_date', 'asc']] }),
      channels.list({}),
    ]);
    const chanName = (id) => (chans.find((c) => c.id === id) || {}).name || 'Channel';
    const out = [];
    for (const i of inq) {
      if (!i.room || (room && i.room !== room) || i.status === 'cancelled') continue;
      out.push({ type: 'website', id: i.id, room: i.room, start: i.checkin, end: i.checkout, label: i.name || 'Tamu', guests: i.guests,
        counts: holds(i), tentative: !holds(i), href: `/admin/inquiries/${i.id}`, paid: i.payment_status === 'paid' });
    }
    for (const b of blk) {
      const label = b.source === 'block' ? (b.note || 'Ditutup') : b.guest_name || (b.channel_id ? chanName(b.channel_id) : 'Tamu');
      out.push({ type: b.source, id: b.id, room: b.room, start: b.start_date, end: b.end_date, label, guests: b.guests,
        counts: true, channelId: b.channel_id, channel: b.channel_id ? chanName(b.channel_id) : '', amount: b.amount, note: b.note });
    }
    return out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  }

  /** Nights in [from, to) on which the room has no unit left. ignore = { blockId, channelId } */
  async function fullNights(room, from, to, ignore = {}) {
    const r = ROOMS.find((x) => x.id === room);
    if (!r) return [];
    const list = (await items(from, to, room)).filter((it) => it.counts
      && !(ignore.blockId && it.type !== 'website' && it.id === ignore.blockId)
      && !(ignore.channelId && it.channelId === ignore.channelId));
    const full = [];
    for (const night of nightsOf(from, to)) {
      const used = list.filter((it) => it.start <= night && it.end > night).length;
      if (used >= (r.units || 1)) full.push(night);
    }
    return full;
  }

  async function isAvailable(room, checkin, checkout, ignore) {
    return (await fullNights(room, checkin, checkout, ignore)).length === 0;
  }

  /** Import one channel's iCal link into calendar_blocks. */
  async function syncChannel(ch) {
    const now = new Date();
    try {
      if (!ch.ical_url) throw new Error('belum ada link iCal');
      // follow up to 3 redirects, checking every hop is a public address
      let url = ch.ical_url;
      let res;
      for (let hop = 0; ; hop += 1) {
        if (!allowPrivate && !isPublicUrl(url)) throw new Error('link harus alamat publik');
        res = await fetchImpl(url, { headers: { Accept: 'text/calendar, */*' }, redirect: 'manual', signal: AbortSignal.timeout(20000) });
        const loc = res.status >= 300 && res.status < 400 && res.headers.get('location');
        if (!loc) break;
        if (hop >= 3) throw new Error('terlalu banyak pengalihan');
        url = new URL(loc, url).toString();
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (text.length > MAX_ICAL_BYTES) throw new Error('file kalender terlalu besar');
      if (!/BEGIN:VCALENDAR/.test(text)) throw new Error('bukan file iCal');
      const from = today();
      const events = parseICal(text).filter((e) => e.end > from);
      const existing = await blocks.list({ where: { channel_id: ch.id, source: 'ical' } });
      const seen = new Set();
      for (const e of events) {
        seen.add(e.uid);
        const old = existing.find((b) => b.external_uid === e.uid);
        const values = { room: ch.room, start_date: e.start, end_date: e.end, guest_name: e.summary || ch.name };
        if (old) await blocks.update(old.id, values);
        else await blocks.insert({ ...values, source: 'ical', channel_id: ch.id, external_uid: e.uid });
      }
      // bookings cancelled on the channel disappear from its feed
      for (const b of existing) if (!seen.has(b.external_uid) && b.end_date > from) await blocks.remove(b.id);
      const status = `OK · ${events.length} booking`;
      await channels.update(ch.id, { last_sync_at: now, last_sync_status: status });
      return { ok: true, count: events.length };
    } catch (e) {
      const msg = String(e.name === 'TimeoutError' ? 'waktu habis' : e.message).slice(0, 200);
      await channels.update(ch.id, { last_sync_at: now, last_sync_status: 'Gagal: ' + msg });
      log(`Calendar sync failed for ${ch.name}: ${msg}`);
      return { ok: false, error: msg };
    }
  }

  async function syncAll() {
    const list = (await channels.list({ where: { active: true } })).filter((c) => c.ical_url);
    const results = [];
    for (const ch of list) results.push(await syncChannel(ch));
    return results;
  }

  /** Kalma's calendar for one channel: nights this room is full, not counting the channel's own bookings. */
  async function exportFor(ch) {
    const from = addDays(today(), -30);
    const to = addDays(today(), 730);
    const full = await fullNights(ch.room, from, to, { channelId: ch.id });
    const events = [];
    for (const night of full) {
      const last = events[events.length - 1];
      if (last && last.end === night) last.end = addDays(night, 1);
      else events.push({ start: night, end: addDays(night, 1) });
    }
    return buildICal({
      name: `Kalma Raja Ampat · ${ch.room}`,
      events: events.map((e) => ({ ...e, uid: `kalma-${ch.room}-${e.start}@halokalma.com`, summary: 'Kalma · Not available' })),
    });
  }

  function start() {
    const run = () => syncAll().catch((e) => log('Calendar sync error: ' + e.message));
    setTimeout(run, 5000).unref();
    const timer = setInterval(run, SYNC_EVERY);
    timer.unref();
    return timer;
  }

  return { items, fullNights, isAvailable, syncChannel, syncAll, exportFor, start, newToken: () => crypto.randomBytes(18).toString('base64url') };
}

module.exports = { createCalendar, nightsOf, holds, isPublicUrl };
