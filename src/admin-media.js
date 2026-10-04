'use strict';

/* Admin uploads: website photos & videos, employee documents, transaction receipts, and private downloads. */
const fs = require('fs');
const { can } = require('./staff');
const { UPLOAD_ERRORS } = require('./media');

function mountMedia(router, { repo, media, ah, idParam, t }) {
  const fail = (res, back, code) => res.redirect(303, `${back}${back.includes('?') ? '&' : '?'}err=upload-${code}`);
  const builtIn = (photo, video) => ({ photo, video });

  /* ---------- website photos and videos ---------- */
  router.get('/website/media', ah(async (req, res) => {
    const files = req.app.locals.builtInMedia ? req.app.locals.builtInMedia() : builtIn(() => '', () => null);
    const groups = media.SLOTS.map((g) => ({
      ...g,
      items: g.items.map((s) => {
        const up = media.slots[s.id] || {};
        return {
          ...s, hasVideo: Boolean(s.video), label: s.contentKey ? `${s.label} · ${String(t(s.contentKey)).replace(/<[^>]+>/g, '')}` : s.label,
          image: up.image ? media.urlOf(up.image) : '', imageBuiltIn: up.image ? '' : files.photo(s.id),
          video: up.video ? media.urlOf(up.video) : '', videoBuiltIn: up.video ? '' : (files.video(s.id) || {}).mp4 || '',
          imageRow: up.image, videoRow: up.video,
        };
      }),
    }));
    res.render('admin/website-media', { title: 'Foto & video', groups, KINDS: media.KINDS, UPLOAD_ERRORS });
  }));

  router.post('/website/media/:slot/:kind', (req, res, next) => {
    // next('route') skips this route's upload handler, so unknown places end in a 404
    if (!media.SLOT_IDS.includes(req.params.slot) || !['image', 'video'].includes(req.params.kind)) return next('route');
    const slot = media.SLOTS.flatMap((g) => g.items).find((s) => s.id === req.params.slot);
    if (req.params.kind === 'video' && !slot.video) return next('route');
    media.receive(req.params.kind)(req, res, next);
  }, ah(async (req, res) => {
    const back = `/admin/website/media#${req.params.slot}`;
    if (req.uploadError) return res.redirect(303, `/admin/website/media?err=upload-${req.uploadError}#${req.params.slot}`);
    await media.save(req.file, { kind: req.params.kind, slot: req.params.slot, ownerType: 'website', by: req.staff.username });
    res.redirect(303, back.replace('#', '?ok=uploaded#'));
  }));

  router.post('/website/media/:slot/:kind/delete', ah(async (req, res, next) => {
    const row = (media.slots[req.params.slot] || {})[req.params.kind];
    if (!row) return next();
    await media.remove(row.id);
    res.redirect(303, `/admin/website/media?ok=deleted#${req.params.slot}`);
  }));

  /* ---------- partner logos (name sent with the file) ---------- */
  router.post('/website/partners/logo', media.receive('image'), ah(async (req, res) => {
    const name = String(req.body.name || '').trim().slice(0, 60);
    const list = req.app.locals.site.partners() || req.app.locals.loadPartners();
    if (!name || !list.some((p) => p.toLowerCase() === name.toLowerCase())) {
      if (req.file) fs.rm(req.file.path, { force: true }, () => {});
      return res.redirect(303, '/admin/website/partners?err=partner');
    }
    if (req.uploadError) return res.redirect(303, `/admin/website/partners?err=upload-${req.uploadError}`);
    await media.save(req.file, { kind: 'image', ownerType: 'partner', label: name, by: req.staff.username });
    res.redirect(303, '/admin/website/partners?ok=uploaded');
  }));

  router.post('/website/partners/logo/delete', ah(async (req, res, next) => {
    const row = media.logoRow(req.body.name);
    if (!row) return next();
    await media.remove(row.id);
    res.redirect(303, '/admin/website/partners?ok=deleted');
  }));

  /* ---------- employee documents (contract, ID card, certificates) ---------- */
  router.post('/hr/employees/:id/files', (req, res, next) => (idParam(req) ? media.receive('document')(req, res, next) : next('route')), ah(async (req, res, next) => {
    const id = idParam(req);
    if (!(await repo.table('employees').get(id))) { if (req.file) fs.rm(req.file.path, { force: true }, () => {}); return next(); }
    if (req.uploadError) return fail(res, `/admin/hr/employees/${id}`, req.uploadError);
    await media.save(req.file, { kind: 'document', ownerType: 'employee', ownerId: id, label: req.body.label, by: req.staff.username });
    res.redirect(303, `/admin/hr/employees/${id}?ok=uploaded#dokumen`);
  }));

  /* ---------- receipts on transactions ---------- */
  router.post('/finance/:id/receipt', (req, res, next) => (idParam(req) ? media.receive('document')(req, res, next) : next('route')), ah(async (req, res, next) => {
    const id = idParam(req);
    const tx = await repo.table('transactions').get(id);
    if (!tx) { if (req.file) fs.rm(req.file.path, { force: true }, () => {}); return next(); }
    if (req.uploadError) return fail(res, `/admin/finance?m=${tx.date.slice(0, 7)}`, req.uploadError);
    await media.save(req.file, { kind: 'document', ownerType: 'transaction', ownerId: id, label: 'Bukti', by: req.staff.username });
    res.redirect(303, `/admin/finance?m=${tx.date.slice(0, 7)}&ok=uploaded`);
  }));

  /* ---------- private files: only for roles that own them ---------- */
  const AREA = { employee: 'hr', transaction: 'finance', website: 'website' };
  router.get('/files/:id', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    const row = await media.get(id);
    if (!row) return next();
    if (!can(req.staff.role, AREA[row.owner_type] || 'users')) return res.status(403).render('admin/forbidden', { title: 'Tidak ada akses' });
    const inline = /^(image|video)\/|pdf$/.test(row.mime);
    res.set('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${String(row.original_name || row.file).replace(/["\r\n]/g, '')}"`);
    res.sendFile(media.filePath(row), { headers: { 'Content-Type': row.mime, 'X-Content-Type-Options': 'nosniff' } }, (err) => { if (err && !res.headersSent) next(); });
  }));

  router.post('/files/:id/delete', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    const row = await media.get(id);
    if (!row || row.owner_type === 'website') return next();
    if (!can(req.staff.role, AREA[row.owner_type])) return res.status(403).render('admin/forbidden', { title: 'Tidak ada akses' });
    await media.remove(id);
    const back = row.owner_type === 'employee' ? `/admin/hr/employees/${row.owner_id}?ok=deleted#dokumen` : '/admin/finance?ok=deleted';
    res.redirect(303, back);
  }));
}

module.exports = { mountMedia };
