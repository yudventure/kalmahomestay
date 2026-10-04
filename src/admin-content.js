'use strict';

/**
 * Admin › Sosial media: the content planner for the public relations team.
 * A month calendar, a board by stage (idea → script → production → ready → posted), and one page per post
 * with the hook, script, caption, hashtags and uploaded material (photos, videos, documents via the upload button).
 */
const fs = require('fs');
const { addDays } = require('./ical');
const { todayISO } = require('./inquiry');

const STATUSES = [
  { id: 'ide', label: 'Ide' },
  { id: 'naskah', label: 'Naskah' },
  { id: 'produksi', label: 'Produksi' },
  { id: 'siap', label: 'Siap tayang' },
  { id: 'tayang', label: 'Sudah tayang' },
];
const STATUS_IDS = STATUSES.map((s) => s.id);
const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', short: 'IG' },
  { id: 'tiktok', label: 'TikTok', short: 'TT' },
  { id: 'facebook', label: 'Facebook', short: 'FB' },
  { id: 'youtube', label: 'YouTube', short: 'YT' },
  { id: 'google', label: 'Google Business', short: 'G' },
];
const FORMATS = { reels: 'Reels / video pendek', foto: 'Foto tunggal', carousel: 'Carousel', story: 'Story', video: 'Video panjang', live: 'Live' };
const PILLARS = {
  homestay: 'Kamar & homestay', bawahlaut: 'Bawah laut', trip: 'Trip & alam', makanan: 'Makanan', budaya: 'Budaya & kampung',
  tamu: 'Cerita tamu', tips: 'Tips perjalanan', promo: 'Promo & paket',
};
const SCRIPT_TEMPLATE = 'Hook (0 sampai 3 detik):\n\nAdegan 1:\n\nAdegan 2:\n\nAdegan 3:\n\nPenutup dan ajakan:\n';
const DAY_NAMES = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

const str = (v, max = 255) => String(v == null ? '' : v).replace(/\r\n/g, '\n').trim().slice(0, max);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(Date.parse(s));
const isMonth = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s || ''));

function mountContent(router, { repo, media, ah, idParam }) {
  const posts = repo.table('content_posts');
  const staffList = async () => [{ username: 'admin', name: 'Owner' }, ...(await repo.table('staff_users').list({ where: { active: true }, order: [['name', 'asc']] }))];
  const common = async () => ({ STATUSES, PLATFORMS, FORMATS, PILLARS, team: await staffList() });
  const filterOf = (q) => ({ platform: PLATFORMS.some((p) => p.id === q.platform) ? q.platform : '', who: str(q.who, 60) });
  const matches = (f) => (p) => (!f.platform || String(p.platforms || '').split(',').includes(f.platform)) && (!f.who || p.assignee === f.who);

  /* month calendar */
  router.get('/content', ah(async (req, res) => {
    const today = todayISO();
    const month = isMonth(req.query.m) ? req.query.m : today.slice(0, 7);
    const first = `${month}-01`;
    const next = addDays(first, 32).slice(0, 7) + '-01';
    const f = filterOf(req.query);
    const list = (await posts.list({ range: { col: 'publish_date', from: first, to: next }, order: [['publish_date', 'asc'], ['publish_time', 'asc'], ['id', 'asc']] })).filter(matches(f));
    const unplanned = (await posts.list({ where: { publish_date: null }, order: [['id', 'desc']], limit: 30 })).filter(matches(f));
    // weeks start on Monday
    const lead = (new Date(first + 'T00:00:00Z').getUTCDay() + 6) % 7;
    const days = [];
    for (let d = addDays(first, -lead); days.length < 42 && (d < next || days.length % 7); d = addDays(d, 1)) days.push(d);
    const byDay = {};
    for (const p of list) (byDay[p.publish_date] ||= []).push(p);
    const prev = addDays(first, -1).slice(0, 7);
    const counts = Object.fromEntries(STATUSES.map((s) => [s.id, list.filter((p) => p.status === s.id).length]));
    res.render('admin/content-calendar', {
      title: 'Kalender konten', ...(await common()), month, prev, nextMonth: next.slice(0, 7), days, byDay, today, unplanned, f, counts, DAY_NAMES,
      monthLabel: new Date(first + 'T00:00:00Z').toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    });
  }));

  /* board by stage */
  router.get('/content/board', ah(async (req, res) => {
    const f = filterOf(req.query);
    const all = (await posts.list({ order: [['publish_date', 'asc'], ['id', 'asc']], limit: 500 })).filter(matches(f));
    const since = addDays(todayISO(), -30);
    const columns = STATUSES.map((s) => ({ ...s, items: all.filter((p) => p.status === s.id && (s.id !== 'tayang' || !p.publish_date || p.publish_date >= since)) }));
    res.render('admin/content-board', { title: 'Papan konten', ...(await common()), columns, f, today: todayISO() });
  }));

  function read(b) {
    const platforms = [].concat(b.platforms || []).filter((p) => PLATFORMS.some((x) => x.id === p));
    const v = {
      title: str(b.title, 160), platforms: platforms.join(','), format: FORMATS[b.format] ? b.format : null, pillar: PILLARS[b.pillar] ? b.pillar : null,
      status: STATUS_IDS.includes(b.status) ? b.status : 'ide', publish_date: isDate(b.publish_date) ? b.publish_date : null,
      publish_time: /^\d{2}[.:]\d{2}$/.test(str(b.publish_time)) ? str(b.publish_time).replace('.', ':') : null,
      assignee: str(b.assignee, 60) || null, hook: str(b.hook, 1000), script: str(b.script, 10000), caption: str(b.caption, 4000),
      hashtags: str(b.hashtags, 1000), cta: str(b.cta, 190), link: /^https?:\/\/\S+$/i.test(str(b.link)) ? str(b.link, 300) : null, notes: str(b.notes, 4000),
    };
    return { v, error: v.title ? '' : 'Judul konten wajib diisi.' };
  }
  const SCRIPT_TEMPLATE_EN = 'Hook (0 to 3 seconds):\n\nScene 1:\n\nScene 2:\n\nScene 3:\n\nClosing and call to action:\n';
  const blank = (q, lang) => ({ status: 'ide', publish_date: isDate(q.date) ? q.date : null, platforms: 'instagram', format: 'reels', script: lang === 'en' ? SCRIPT_TEMPLATE_EN : SCRIPT_TEMPLATE });

  router.get('/content/new', ah(async (req, res) => {
    res.render('admin/content-post', { title: 'Konten baru', ...(await common()), p: blank(req.query, req.adminLang), isNew: true, error: '', files: [], KINDS: media.KINDS });
  }));
  router.post('/content', ah(async (req, res) => {
    const { v, error } = read(req.body);
    if (error) return res.status(400).render('admin/content-post', { title: 'Konten baru', ...(await common()), p: v, isNew: true, error, files: [], KINDS: media.KINDS });
    const id = await posts.insert({ ...v, created_by: req.staff.username });
    res.redirect(303, `/admin/content/${id}?ok=saved`);
  }));

  const filesOf = (id) => media.list({ where: { owner_type: 'content', owner_id: id }, order: [['id', 'asc']] });
  router.get('/content/:id', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    const p = await posts.get(id); if (!p) return next();
    res.render('admin/content-post', { title: p.title, ...(await common()), p, isNew: false, error: '', files: await filesOf(id), KINDS: media.KINDS });
  }));
  router.post('/content/:id', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    const p = await posts.get(id); if (!p) return next();
    const { v, error } = read(req.body);
    if (error) return res.status(400).render('admin/content-post', { title: p.title, ...(await common()), p: { ...p, ...v }, isNew: false, error, files: await filesOf(id), KINDS: media.KINDS });
    await posts.update(id, v);
    res.redirect(303, `/admin/content/${id}?ok=saved`);
  }));
  // quick move on the board
  router.post('/content/:id/status', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    if (!(await posts.get(id)) || !STATUS_IDS.includes(req.body.status)) return next();
    await posts.update(id, { status: req.body.status });
    res.redirect(303, '/admin/content/board?ok=saved');
  }));
  router.post('/content/:id/delete', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    if (!(await posts.get(id))) return next();
    for (const f of await filesOf(id)) await media.remove(f.id);
    await posts.remove(id);
    res.redirect(303, '/admin/content?ok=deleted');
  }));

  /* material: photos and documents, or videos, always through the upload button */
  for (const kind of ['document', 'video']) {
    router.post(`/content/:id/files/${kind}`, (req, res, next) => (idParam(req) ? media.receive(kind)(req, res, next) : next('route')), ah(async (req, res, next) => {
      const id = idParam(req);
      if (!(await posts.get(id))) { if (req.file) fs.rm(req.file.path, { force: true }, () => {}); return next(); }
      if (req.uploadError) return res.redirect(303, `/admin/content/${id}?err=upload-${req.uploadError}#materi`);
      await media.save(req.file, { kind, ownerType: 'content', ownerId: id, label: str(req.body.label, 120) || req.file.originalname, by: req.staff.username });
      res.redirect(303, `/admin/content/${id}?ok=uploaded#materi`);
    }));
  }
}

/** For the bell: posts due today that are not posted yet, and late ones. */
async function contentAlerts(repo, today = todayISO()) {
  const open = (await repo.table('content_posts').list({ range: { col: 'publish_date', from: addDays(today, -14), to: addDays(today, 1) } }))
    .filter((p) => p.status !== 'tayang');
  return { dueToday: open.filter((p) => p.publish_date === today).length, late: open.filter((p) => p.publish_date < today).length };
}

module.exports = { mountContent, contentAlerts, STATUSES, PLATFORMS };
