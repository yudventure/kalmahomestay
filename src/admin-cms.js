'use strict';

/* Admin CMS pages: staff users (Sistem) and website settings (Website). */
const { ROLES, ROLE_IDS, hashPassword, verifyPassword } = require('./staff');
const { ROOMS } = require('./config');
const { cleanUrl } = require('./site');

const str = (v, max = 255) => String(v == null ? '' : v).trim().slice(0, max);

function mountUsers(router, { repo, ah, idParam }) {
  const users = repo.table('staff_users');
  const USERNAME = /^[a-z0-9._-]{3,30}$/;

  router.get('/users', ah(async (req, res) => {
    const list = await users.list({ order: [['active', 'desc'], ['name', 'asc']] });
    res.render('admin/users', { title: 'Pengguna', list, ROLES, form: {}, error: '' });
  }));

  router.post('/users', ah(async (req, res) => {
    const f = { name: str(req.body.name, 120), username: str(req.body.username, 30).toLowerCase(), role: req.body.role, password: String(req.body.password || '') };
    let error = '';
    if (!f.name) error = 'Nama wajib diisi.';
    else if (!USERNAME.test(f.username) || f.username === 'admin') error = 'Username 3–30 huruf kecil/angka (boleh . _ -), selain "admin".';
    else if (!ROLE_IDS.includes(f.role)) error = 'Pilih peran.';
    else if (f.password.length < 8) error = 'Password minimal 8 karakter.';
    else if (await users.find({ username: f.username })) error = 'Username sudah dipakai.';
    if (error) {
      const list = await users.list({ order: [['active', 'desc'], ['name', 'asc']] });
      return res.status(400).render('admin/users', { title: 'Pengguna', list, ROLES, form: f, error });
    }
    await users.insert({ name: f.name, username: f.username, role: f.role, active: true, password_hash: hashPassword(f.password) });
    res.redirect(303, '/admin/users?ok=saved');
  }));

  router.post('/users/:id', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    const u = await users.get(id); if (!u) return next();
    const values = {};
    if (req.body.name !== undefined) values.name = str(req.body.name, 120) || u.name;
    if (ROLE_IDS.includes(req.body.role)) values.role = req.body.role;
    if (req.body.active !== undefined) values.active = req.body.active === '1';
    const pw = String(req.body.password || '');
    if (pw) {
      if (pw.length < 8) return res.redirect(303, '/admin/users?err=password');
      values.password_hash = hashPassword(pw);
    }
    await users.update(id, values);
    res.redirect(303, '/admin/users?ok=saved');
  }));

  router.post('/users/:id/delete', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    if (!(await users.remove(id))) return next();
    res.redirect(303, '/admin/users?ok=deleted');
  }));

  /* every staff member can change their own password */
  router.get('/account', (req, res) => res.render('admin/account', { title: 'Akun saya', error: '' }));
  router.post('/account', ah(async (req, res) => {
    if (req.staff.id === 'admin') return res.redirect(303, '/admin/account');
    const u = await users.get(req.staff.id);
    const next = String(req.body.new_password || '');
    let error = '';
    if (!verifyPassword(String(req.body.current_password || ''), u.password_hash)) error = 'Password lama salah.';
    else if (next.length < 8) error = 'Password baru minimal 8 karakter.';
    else if (next !== String(req.body.confirm_password || '')) error = 'Konfirmasi password tidak sama.';
    if (error) return res.status(400).render('admin/account', { title: 'Akun saya', error });
    await users.update(u.id, { password_hash: hashPassword(next) });
    res.redirect(303, '/admin/login?ok=password');
  }));
}

function mountWebsite(router, { site, ah, t }) {
  router.get('/website', (req, res) => res.redirect(303, '/admin/website/contact'));

  /* contact & social links */
  router.get('/website/contact', (req, res) => {
    res.render('admin/website-contact', { title: 'Kontak & sosial media', s: site.settings.contact || {}, env: site.envContact });
  });
  router.post('/website/contact', ah(async (req, res) => {
    const b = req.body;
    const v = {
      whatsapp: str(b.whatsapp, 20).replace(/\D/g, ''),
      whatsappDisplay: str(b.whatsappDisplay, 40),
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(b.email)) ? str(b.email, 190) : '',
      instagram: str(b.instagram, 120),
      facebookUrl: cleanUrl(b.facebookUrl),
      tiktokUrl: cleanUrl(b.tiktokUrl),
      googleUrl: cleanUrl(b.googleUrl),
    };
    if (v.whatsapp && (v.whatsapp.length < 8 || v.whatsapp.length > 15)) return res.redirect(303, '/admin/website/contact?err=whatsapp');
    await site.save('contact', v);
    res.redirect(303, '/admin/website/contact?ok=saved');
  }));

  /* rooms: price, capacity, units */
  router.get('/website/rooms', (req, res) => {
    res.render('admin/website-rooms', { title: 'Kamar & harga', rooms: ROOMS, defaults: site.roomDefaults, roomLabel: (r) => t(r.nameKey) });
  });
  router.post('/website/rooms', ah(async (req, res) => {
    const out = {};
    for (const r of ROOMS) {
      const n = (k, max) => { const x = Math.round(Number(String(req.body[`${r.id}_${k}`] || '').replace(/\D/g, ''))); return x > 0 && x <= max ? x : null; };
      out[r.id] = { price: n('price', 100000000), maxGuests: n('maxGuests', 20), units: n('units', 50) };
    }
    await site.save('rooms', out);
    res.redirect(303, '/admin/website/rooms?ok=saved');
  }));

  /* partners running text */
  router.get('/website/partners', (req, res) => {
    res.render('admin/website-partners', { title: 'Partner', partners: site.partners(), fallback: req.app.locals.loadPartners() });
  });
  router.post('/website/partners', ah(async (req, res) => {
    const list = String(req.body.partners || '').split(/\r?\n/).map((s) => s.trim().slice(0, 60)).filter(Boolean).slice(0, 40);
    await site.save('partners', req.body.reset === '1' ? null : list);
    res.redirect(303, '/admin/website/partners?ok=saved');
  }));

  /* every text on the website, per section, in both languages */
  const GROUPS = [
    { id: 'hero', label: 'Hero & keunggulan', prefixes: ['hero', 'facts', 'feat', 'fs'] },
    { id: 'layanan', label: 'Layanan & kamar', prefixes: ['svc', 's', 'rooms', 'r'] },
    { id: 'tentang', label: 'Tentang Kalma', prefixes: ['story', 'v'] },
    { id: 'pengalaman', label: 'Pengalaman', prefixes: ['exp', 'e'] },
    { id: 'sehari', label: 'Sehari di Kalma', prefixes: ['day', 't'] },
    { id: 'makanan', label: 'Makanan', prefixes: ['food', 'f'] },
    { id: 'galeri', label: 'Galeri', prefixes: ['gal'] },
    { id: 'ulasan', label: 'Kata tamu', prefixes: ['rev'] },
    { id: 'lokasi', label: 'Cara ke sini', prefixes: ['loc', 'l'] },
    { id: 'faq', label: 'FAQ', prefixes: ['faq', 'q'] },
    { id: 'pesan', label: 'Pemesanan & pembayaran', prefixes: ['book', 'form', 'co'] },
    { id: 'menu', label: 'Menu, footer & tombol', prefixes: ['umum', 'nav', 'car', 'foot'] },
    { id: 'seo', label: 'SEO & halaman 404', prefixes: ['meta', 'nf'] },
    { id: 'survei', label: 'Survei', prefixes: ['survey'] },
  ];
  const sections = () => {
    const keys = Object.keys(site.baseContent.id).filter((k) => typeof site.baseContent.id[k] === 'string');
    const map = new Map(GROUPS.map((g) => [g.id, []]));
    map.set('lainnya', []);
    for (const k of keys) {
      const prefix = (k.includes('.') ? k.split('.')[0] : 'umum').replace(/\d+$/, '');
      const g = GROUPS.find((x) => x.prefixes.includes(prefix));
      map.get(g ? g.id : 'lainnya').push(k);
    }
    for (const [id, list] of map) if (!list.length) map.delete(id);
    return map;
  };
  const groupLabel = (id) => (GROUPS.find((g) => g.id === id) || { label: 'Lainnya' }).label;
  router.get('/website/content', (req, res) => {
    const map = sections();
    const names = [...map.keys()];
    const sec = map.has(req.query.s) ? req.query.s : names[0];
    res.render('admin/website-content', {
      title: 'Teks website', names, sec, groupLabel, keys: map.get(sec), base: site.baseContent, over: site.settings.content || { id: {}, en: {} },
    });
  });
  router.post('/website/content', ah(async (req, res, next) => {
    const map = sections();
    const sec = String(req.body.section || '');
    if (!map.has(sec)) return next();
    const over = { id: { ...(site.settings.content || {}).id }, en: { ...(site.settings.content || {}).en } };
    for (const k of map.get(sec)) {
      for (const lang of ['id', 'en']) {
        const field = req.body[`${lang}__${k}`];
        if (field === undefined) continue;
        const v = String(field).replace(/\r\n/g, '\n').trim().slice(0, 4000);
        const base = site.baseContent[lang][k] != null ? site.baseContent[lang][k] : site.baseContent.id[k];
        if (!v || v === base) delete over[lang][k]; else over[lang][k] = v;
      }
    }
    await site.save('content', over);
    res.redirect(303, `/admin/website/content?s=${encodeURIComponent(sec)}&ok=saved`);
  }));
}

module.exports = { mountUsers, mountWebsite };
