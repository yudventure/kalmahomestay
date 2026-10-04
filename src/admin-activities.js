'use strict';

/* Admin: diving, snorkeling and trips shown on the service pages (Website > Aktivitas & trip). */
const fs = require('fs');
const { CATEGORIES, LEVELS, servicePath } = require('./activities');

const CAT_LABEL = { diving: 'Diving & snorkeling', trip: 'Trip lainnya' };
const LEVEL_LABEL = { mudah: 'Mudah', sedang: 'Sedang', mahir: 'Mahir' };
const TEXTS = ['title', 'summary', 'body', 'includes', 'bring', 'notes'];

const str = (v, max = 255) => String(v == null ? '' : v).replace(/\r\n/g, '\n').trim().slice(0, max);
const int = (v, min, max) => { const n = parseInt(String(v || '').replace(/\D/g, ''), 10); return n >= min && n <= max ? n : null; };
const slugify = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/&/g, ' dan ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'aktivitas';

function mountActivities(router, { activities, media, ah, idParam }) {
  const back = (id, q = 'ok=saved') => `/admin/website/activities/${id}?${q}`;

  router.get('/website/activities', ah(async (req, res) => {
    const rows = await activities.list();
    const groups = CATEGORIES.map((c) => ({ id: c, label: CAT_LABEL[c], link: servicePath('id', c), items: rows.filter((r) => r.category === c) }));
    res.render('admin/activities', { title: 'Aktivitas & trip', groups, photoOf: media.activityUrl, LEVEL_LABEL });
  }));

  const blank = (category) => ({ category: CATEGORIES.includes(category) ? category : 'diving', active: true, price: null, min_people: 1, max_people: null, level: 'mudah', sort: 99 });
  router.get('/website/activities/new', (req, res) => {
    res.render('admin/activity', { title: 'Tambah aktivitas', a: blank(req.query.category), isNew: true, error: '', photo: '', CAT_LABEL, LEVEL_LABEL, KINDS: media.KINDS });
  });

  /** Read the form. Price: "per orang" with an amount, "minta harga" (empty) or "gratis" (0). */
  function read(body) {
    const v = {
      category: CATEGORIES.includes(body.category) ? body.category : 'diving',
      level: LEVELS.includes(body.level) ? body.level : null,
      duration: str(body.duration, 40), duration_en: str(body.duration_en, 40), start_time: str(body.start_time, 20),
      min_people: int(body.min_people, 1, 100) || 1, max_people: int(body.max_people, 1, 100),
      sort: int(body.sort, 0, 999) ?? 99, active: body.active === '1',
    };
    const kind = body.price_kind;
    v.price = kind === 'gratis' ? 0 : kind === 'per_orang' ? int(body.price, 1, 100000000) : null;
    for (const f of TEXTS) {
      const max = f === 'title' ? 160 : 4000;
      v[f + '_id'] = str(body[f + '_id'], max);
      v[f + '_en'] = str(body[f + '_en'], max);
    }
    if (v.max_people && v.max_people < v.min_people) v.max_people = v.min_people;
    let error = '';
    if (!v.title_id) error = 'Judul (Indonesia) wajib diisi.';
    else if (kind === 'per_orang' && !v.price) error = 'Isi harga per orang, atau pilih "Harga sesuai permintaan".';
    return { v, error };
  }

  async function uniqueSlug(title, ownId) {
    const base = slugify(title);
    for (let i = 1; i < 50; i++) {
      const slug = i === 1 ? base : `${base}-${i}`;
      const other = await activities.find({ slug });
      if (!other || other.id === ownId) return slug;
    }
    return `${base}-${Date.now().toString(36)}`;
  }

  router.post('/website/activities', ah(async (req, res) => {
    const { v, error } = read(req.body);
    if (error) return res.status(400).render('admin/activity', { title: 'Tambah aktivitas', a: v, isNew: true, error, photo: '', CAT_LABEL, LEVEL_LABEL, KINDS: media.KINDS });
    const id = await activities.insert({ ...v, slug: await uniqueSlug(v.title_id) });
    res.redirect(303, back(id, 'ok=saved#foto'));
  }));

  router.get('/website/activities/:id', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    const a = await activities.get(id); if (!a) return next();
    res.render('admin/activity', { title: a.title_id, a, isNew: false, error: '', photo: media.activityUrl(a.id), CAT_LABEL, LEVEL_LABEL, KINDS: media.KINDS,
      link: `${servicePath('id', a.category)}#${a.slug}` });
  }));

  router.post('/website/activities/:id', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    const a = await activities.get(id); if (!a) return next();
    const { v, error } = read(req.body);
    if (error) return res.status(400).render('admin/activity', { title: a.title_id, a: { ...a, ...v }, isNew: false, error, photo: media.activityUrl(a.id), CAT_LABEL, LEVEL_LABEL, KINDS: media.KINDS });
    await activities.update(id, v);
    res.redirect(303, back(id));
  }));

  router.post('/website/activities/:id/delete', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    if (!(await activities.get(id))) return next();
    const photo = media.activityRow(id);
    if (photo) await media.remove(photo.id);
    await activities.remove(id);
    res.redirect(303, '/admin/website/activities?ok=deleted');
  }));

  /* photo: one per activity, uploaded with the button */
  router.post('/website/activities/:id/photo', (req, res, next) => (idParam(req) ? media.receive('image')(req, res, next) : next('route')), ah(async (req, res, next) => {
    const id = idParam(req);
    if (!(await activities.get(id))) { if (req.file) fs.rm(req.file.path, { force: true }, () => {}); return next(); }
    if (req.uploadError) return res.redirect(303, back(id, `err=upload-${req.uploadError}#foto`));
    await media.save(req.file, { kind: 'image', ownerType: 'activity', ownerId: id, label: 'Foto aktivitas', by: req.staff.username });
    res.redirect(303, back(id, 'ok=uploaded#foto'));
  }));

  router.post('/website/activities/:id/photo/delete', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    const photo = media.activityRow(id);
    if (!photo) return next();
    await media.remove(photo.id);
    res.redirect(303, back(id, 'ok=deleted#foto'));
  }));
}

module.exports = { mountActivities };
