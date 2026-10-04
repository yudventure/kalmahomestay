'use strict';

/* Admin: guest feedback from the "We hear you" form (suggestions, complaints, compliments, questions). */
const KINDS = { saran: 'Saran', keluhan: 'Keluhan', pujian: 'Pujian', pertanyaan: 'Pertanyaan' };
const TOPICS = { kamar: 'Kamar dan fasilitas', makanan: 'Makanan', layanan: 'Pelayanan', trip: 'Trip, diving, snorkeling', kebersihan: 'Kebersihan',
  pemesanan: 'Pemesanan dan pembayaran', website: 'Website', lainnya: 'Lainnya' };
const STATUSES = { baru: 'Baru', diproses: 'Sedang ditangani', selesai: 'Selesai' };

function mountFeedback(router, { repo, ah, idParam }) {
  const table = repo.table('feedback');

  router.get('/feedback', ah(async (req, res) => {
    const status = STATUSES[req.query.status] ? req.query.status : '';
    const kind = KINDS[req.query.kind] ? req.query.kind : '';
    const where = {};
    if (status) where.status = status;
    if (kind) where.kind = kind;
    const [list, counts] = await Promise.all([
      table.list({ where, order: [['created_at', 'desc'], ['id', 'desc']], limit: 200 }),
      Promise.all(Object.keys(STATUSES).map((s) => table.count({ where: { status: s } }))),
    ]);
    const all = await table.list({ where: { kind: 'keluhan' }, limit: 500 });
    const rated = (await table.list({ limit: 500 })).filter((f) => f.rating);
    res.render('admin/feedback', {
      title: 'Masukan tamu', list, status, kind, KINDS, TOPICS, STATUSES,
      counts: Object.fromEntries(Object.keys(STATUSES).map((s, i) => [s, counts[i]])),
      openComplaints: all.filter((f) => f.status !== 'selesai').length,
      avgRating: rated.length ? (rated.reduce((s, f) => s + f.rating, 0) / rated.length).toFixed(1) : '-',
    });
  }));

  router.post('/feedback/:id', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    const values = { handled_by: req.staff.username };
    if (STATUSES[req.body.status]) values.status = req.body.status;
    if (req.body.admin_note !== undefined) values.admin_note = String(req.body.admin_note).trim().slice(0, 2000);
    if (!(await table.update(id, values))) return next();
    res.redirect(303, `/admin/feedback?ok=saved#f${id}`);
  }));

  router.post('/feedback/:id/delete', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    if (!(await table.remove(id))) return next();
    res.redirect(303, '/admin/feedback?ok=deleted');
  }));
}

module.exports = { mountFeedback, KINDS, TOPICS, STATUSES };
