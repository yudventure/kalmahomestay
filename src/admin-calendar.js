'use strict';

/* Admin: booking calendar (all rooms × days of a month) and OTA/agent channels with iCal sync. */
const { ROOMS } = require('./config');
const { addDays } = require('./ical');
const { todayISO } = require('./inquiry');

const CHANNEL_PRESETS = ['Airbnb', 'Booking.com', 'Agoda', 'Traveloka', 'Tiket.com', 'Expedia', 'Trip.com', 'Vrbo', 'Google Hotel', 'Agen perjalanan'];
const SOURCES = [
  { id: 'channel', label: 'Booking dari OTA / agen' },
  { id: 'walkin', label: 'Walk-in / langsung' },
  { id: 'block', label: 'Tutup kamar (perbaikan, pemakaian pribadi)' },
];
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(Date.parse(s));
const str = (v, max = 255) => String(v == null ? '' : v).trim().slice(0, max);
const httpUrl = (v) => (/^https?:\/\/\S+$/i.test(str(v, 2000)) ? str(v, 2000) : '');

const parseForm = (v) => {
  try { const o = JSON.parse(Buffer.from(String(v || ''), 'base64url').toString()); return o && typeof o === 'object' ? o : {}; } catch { return {}; }
};

/** Lay out the month: per room, items in lanes so overlapping stays sit on separate rows. */
function monthGrid(items, first, days) {
  const end = addDays(first, days.length);
  return ROOMS.map((room) => {
    const lanes = [];
    for (const it of items.filter((x) => x.room === room.id)) {
      const s = it.start < first ? first : it.start;
      const e = it.end > end ? end : it.end;
      if (s >= e) continue;
      const seg = { it, s, e, from: days.indexOf(s), span: days.indexOf(addDays(e, -1)) - days.indexOf(s) + 1, cutLeft: it.start < first, cutRight: it.end > end };
      let lane = lanes.find((l) => l.every((x) => x.e <= s || x.s >= e));
      if (!lane) { lane = []; lanes.push(lane); }
      lane.push(seg);
    }
    while (lanes.length < (room.units || 1)) lanes.push([]);
    return { room, lanes: lanes.map((l) => l.sort((a, b) => a.from - b.from)) };
  });
}

function mountCalendar(router, { repo, calendar, config, ah, idParam, t }) {
  const blocks = repo.table('calendar_blocks');
  const channels = repo.table('channels');
  const roomLabel = (id) => { const r = ROOMS.find((x) => x.id === id); return r ? t(r.nameKey) : id; };

  router.get('/calendar', ah(async (req, res) => {
    const m = /^\d{4}-\d{2}$/.test(String(req.query.m)) ? String(req.query.m) : todayISO().slice(0, 7);
    const first = `${m}-01`;
    const next = addDays(first, 32).slice(0, 7);
    const prev = addDays(first, -1).slice(0, 7);
    const days = [];
    for (let d = first; d.slice(0, 7) === m; d = addDays(d, 1)) days.push(d);
    const items = await calendar.items(first, addDays(days[days.length - 1], 1));
    const chans = await channels.list({ order: [['name', 'asc']] });
    res.render('admin/calendar', {
      title: 'Kalender', m, prev, next, days, grid: monthGrid(items, first, days), items, chans, SOURCES, ROOMS, roomLabel,
      today: todayISO(), form: parseForm(req.query.form),
      full: String(req.query.full || '').split(',').filter(isDate),
    });
  }));

  router.post('/calendar/blocks', ah(async (req, res) => {
    const b = req.body;
    const f = {
      room: str(b.room, 20), start_date: str(b.start_date, 10), end_date: str(b.end_date, 10), source: str(b.source, 20),
      channel_id: Number(b.channel_id) || null, guest_name: str(b.guest_name, 120), guests: Number(b.guests) || null,
      amount: Number(String(b.amount || '').replace(/\D/g, '')) || null, note: str(b.note, 1000),
    };
    const back = (err, extra = '') => res.redirect(303, `/admin/calendar?m=${(f.start_date || todayISO()).slice(0, 7)}&err=${err}${extra}&form=${Buffer.from(JSON.stringify(f)).toString('base64url')}`);
    if (!ROOMS.some((r) => r.id === f.room)) return back('room');
    if (!isDate(f.start_date) || !isDate(f.end_date) || f.end_date <= f.start_date) return back('dates');
    if (!SOURCES.some((s) => s.id === f.source)) return back('source');
    if (f.source === 'channel' && !(await channels.get(f.channel_id))) return back('channel');
    if (f.source !== 'channel') f.channel_id = null;
    const full = await calendar.fullNights(f.room, f.start_date, f.end_date);
    if (full.length && b.force !== '1') return back('full', `&full=${full.join(',')}`);
    await blocks.insert({ ...f, created_by: req.staff.username });
    res.redirect(303, `/admin/calendar?m=${f.start_date.slice(0, 7)}&ok=saved`);
  }));

  router.post('/calendar/blocks/:id/delete', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    const blk = await blocks.get(id);
    if (!blk || blk.source === 'ical') return next(); // imported stays in sync with the channel
    await blocks.remove(id);
    res.redirect(303, `/admin/calendar?m=${blk.start_date.slice(0, 7)}&ok=deleted`);
  }));

  /* ---------- channels ---------- */
  const exportUrl = (req, ch) => `${config.siteUrl && !/localhost/.test(config.siteUrl) ? config.siteUrl : `${req.protocol}://${req.get('host')}`}/ical/${ch.export_token}.ics`;

  router.get('/channels', ah(async (req, res) => {
    const list = await channels.list({ order: [['active', 'desc'], ['name', 'asc'], ['room', 'asc']] });
    res.render('admin/channels', { title: 'Channel OTA & agen', list, ROOMS, roomLabel, PRESETS: CHANNEL_PRESETS, exportUrl: (ch) => exportUrl(req, ch) });
  }));

  const channelValues = (b) => ({
    name: str(b.name, 80), kind: b.kind === 'agent' ? 'agent' : 'ota', room: str(b.room, 20), ical_url: httpUrl(b.ical_url),
    commission_pct: Math.min(100, Math.max(0, Math.round(Number(b.commission_pct) || 0))) || null, contact: str(b.contact, 160),
  });

  router.post('/channels', ah(async (req, res) => {
    const v = channelValues(req.body);
    if (!v.name || !ROOMS.some((r) => r.id === v.room)) return res.redirect(303, '/admin/channels?err=channel');
    if (str(req.body.ical_url) && !v.ical_url) return res.redirect(303, '/admin/channels?err=url');
    const id = await channels.insert({ ...v, active: true, export_token: calendar.newToken() });
    if (v.ical_url) await calendar.syncChannel(await channels.get(id));
    res.redirect(303, '/admin/channels?ok=saved');
  }));

  router.post('/channels/sync', ah(async (req, res) => {
    await calendar.syncAll();
    res.redirect(303, '/admin/channels?ok=synced');
  }));

  router.post('/channels/:id', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    const ch = await channels.get(id); if (!ch) return next();
    const v = channelValues({ ...ch, ...req.body });
    if (str(req.body.ical_url) && !v.ical_url) return res.redirect(303, '/admin/channels?err=url');
    await channels.update(id, { ...v, active: req.body.active === undefined ? ch.active : req.body.active === '1' });
    if (req.body.new_token === '1') await channels.update(id, { export_token: calendar.newToken() });
    res.redirect(303, '/admin/channels?ok=saved');
  }));

  router.post('/channels/:id/sync', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    const ch = await channels.get(id); if (!ch) return next();
    const r = await calendar.syncChannel(ch);
    res.redirect(303, r.ok ? '/admin/channels?ok=synced' : '/admin/channels?err=sync');
  }));

  router.post('/channels/:id/delete', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    if (!(await channels.get(id))) return next();
    for (const b of await blocks.list({ where: { channel_id: id, source: 'ical' } })) await blocks.remove(b.id);
    await channels.remove(id);
    res.redirect(303, '/admin/channels?ok=deleted');
  }));
}

module.exports = { mountCalendar, monthGrid, SOURCES };
