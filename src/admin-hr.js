'use strict';

/* Admin SDM (HR): employees, daily attendance, leave requests, and monthly payroll. */
const { todayISO } = require('./inquiry');
const { addDays } = require('./ical');

const DEPARTMENTS = ['Manajemen', 'Front office', 'Housekeeping', 'Dapur', 'Boat & transport', 'Dive & tur', 'Perawatan', 'Keamanan', 'Lainnya'];
const ATTENDANCE = [
  { id: 'hadir', label: 'Hadir' }, { id: 'izin', label: 'Izin' }, { id: 'sakit', label: 'Sakit' },
  { id: 'cuti', label: 'Cuti' }, { id: 'alpa', label: 'Tanpa keterangan' }, { id: 'libur', label: 'Libur' },
];
const LEAVE_KINDS = [{ id: 'cuti', label: 'Cuti' }, { id: 'sakit', label: 'Sakit' }, { id: 'izin', label: 'Izin' }];
const WORKDAYS = 26; // daily rate = monthly salary / 26, used to suggest deductions for unexplained absence

const str = (v, max = 255) => String(v == null ? '' : v).trim().slice(0, max);
const money = (v) => { const n = Math.round(Number(String(v == null ? '' : v).replace(/\D/g, ''))); return Number.isFinite(n) ? n : 0; };
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(Date.parse(s));
const isMonth = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s || ''));
const time = (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(str(v)) ? str(v) : null);
const monthEnd = (m) => addDays(`${m}-01`, 32).slice(0, 7) + '-01';

function mountHr(router, { repo, ah, idParam }) {
  const employees = repo.table('employees');
  const attendance = repo.table('attendance');
  const leave = repo.table('leave_requests');
  const payroll = repo.table('payroll');
  const transactions = repo.table('transactions');

  const employeeValues = (b) => ({
    name: str(b.name, 120), position: str(b.position, 80), department: str(b.department, 40), phone: str(b.phone, 32),
    email: str(b.email, 190), join_date: isDate(b.join_date) ? b.join_date : null, salary: money(b.salary), allowance: money(b.allowance),
    status: b.status === 'inactive' ? 'inactive' : 'active', notes: str(b.notes, 4000),
  });

  /* ---------- employees ---------- */
  router.get('/hr', (req, res) => res.redirect(303, '/admin/hr/employees'));

  router.get('/hr/employees', ah(async (req, res) => {
    const status = req.query.status === 'inactive' ? 'inactive' : req.query.status === 'all' ? '' : 'active';
    const q = str(req.query.q, 100);
    const list = await employees.list({ where: status ? { status } : {}, search: { cols: ['name', 'position', 'department', 'phone'], q }, order: [['department', 'asc'], ['name', 'asc']] });
    const payrollTotal = list.filter((e) => e.status === 'active').reduce((s, e) => s + (e.salary || 0) + (e.allowance || 0), 0);
    res.render('admin/hr-employees', { title: 'Karyawan', list, status, q, DEPARTMENTS, payrollTotal });
  }));

  router.post('/hr/employees', ah(async (req, res) => {
    const v = employeeValues(req.body);
    if (!v.name) return res.redirect(303, '/admin/hr/employees?err=name');
    const id = await employees.insert(v);
    res.redirect(303, `/admin/hr/employees/${id}?ok=saved`);
  }));

  router.get('/hr/employees/:id', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    const e = await employees.get(id); if (!e) return next();
    const m = todayISO().slice(0, 7);
    const [att, leaves, slips, docs] = await Promise.all([
      attendance.list({ where: { employee_id: id }, range: { col: 'date', from: `${m}-01`, to: monthEnd(m) } }),
      leave.list({ where: { employee_id: id }, order: [['start_date', 'desc']], limit: 20 }),
      payroll.list({ where: { employee_id: id }, order: [['period', 'desc']], limit: 12 }),
      repo.table('media').list({ where: { owner_type: 'employee', owner_id: id }, order: [['id', 'desc']] }),
    ]);
    const recap = Object.fromEntries(ATTENDANCE.map((a) => [a.id, att.filter((x) => x.status === a.id).length]));
    res.render('admin/hr-employee', { title: e.name, e, DEPARTMENTS, ATTENDANCE, recap, leaves, slips, docs, month: m, LEAVE_KINDS });
  }));

  router.post('/hr/employees/:id', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    const v = employeeValues(req.body);
    if (!v.name) return res.redirect(303, `/admin/hr/employees/${id}?err=name`);
    if (!(await employees.update(id, v))) return next();
    res.redirect(303, `/admin/hr/employees/${id}?ok=saved`);
  }));

  router.post('/hr/employees/:id/delete', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    if (await payroll.count({ where: { employee_id: id, status: 'paid' } })) return res.redirect(303, `/admin/hr/employees/${id}?err=has-payroll`);
    for (const t of [attendance, leave, payroll]) for (const r of await t.list({ where: { employee_id: id } })) await t.remove(r.id);
    if (req.app.locals.media) for (const d of await repo.table('media').list({ where: { owner_type: 'employee', owner_id: id } })) await req.app.locals.media.remove(d.id);
    if (!(await employees.remove(id))) return next();
    res.redirect(303, '/admin/hr/employees?ok=deleted');
  }));

  /* ---------- attendance ---------- */
  router.get('/hr/attendance', ah(async (req, res) => {
    const date = isDate(req.query.date) ? req.query.date : todayISO();
    const m = isMonth(req.query.m) ? req.query.m : date.slice(0, 7);
    const view = req.query.view === 'recap' ? 'recap' : 'day';
    const staff = await employees.list({ where: { status: 'active' }, order: [['department', 'asc'], ['name', 'asc']] });
    if (view === 'recap') {
      const rows = await attendance.list({ range: { col: 'date', from: `${m}-01`, to: monthEnd(m) } });
      const recap = staff.map((e) => ({ e, counts: Object.fromEntries(ATTENDANCE.map((a) => [a.id, rows.filter((r) => r.employee_id === e.id && r.status === a.id).length])) }));
      return res.render('admin/hr-attendance-recap', { title: 'Rekap absensi', m, recap, ATTENDANCE, prev: addDays(`${m}-01`, -1).slice(0, 7), next: addDays(`${m}-01`, 32).slice(0, 7) });
    }
    const [rows, onLeave] = await Promise.all([
      attendance.list({ where: { date } }),
      // leave end dates are the last day off (inclusive), so look one day back
      leave.list({ where: { status: 'approved' }, overlap: { start: 'start_date', end: 'end_date', from: addDays(date, -1), to: addDays(date, 1) } }),
    ]);
    // approved leave (end date inclusive) suggests the status for that day
    const leaveOf = (eid) => onLeave.find((l) => l.employee_id === eid && l.start_date <= date && l.end_date >= date);
    const sheet = staff.map((e) => {
      const r = rows.find((x) => x.employee_id === e.id);
      const l = leaveOf(e.id);
      return { e, r, suggested: r ? r.status : l ? l.kind : 'hadir', leave: l };
    });
    res.render('admin/hr-attendance', { title: 'Absensi', date, sheet, ATTENDANCE, prev: addDays(date, -1), next: addDays(date, 1), today: todayISO() });
  }));

  router.post('/hr/attendance', ah(async (req, res) => {
    const date = isDate(req.body.date) ? req.body.date : null;
    if (!date) return res.redirect(303, '/admin/hr/attendance?err=date');
    const staff = await employees.list({ where: { status: 'active' } });
    for (const e of staff) {
      const status = str(req.body[`status_${e.id}`], 10);
      if (!ATTENDANCE.some((a) => a.id === status)) continue;
      const v = { employee_id: e.id, date, status, check_in: time(req.body[`in_${e.id}`]), check_out: time(req.body[`out_${e.id}`]), note: str(req.body[`note_${e.id}`], 255) };
      const old = await attendance.find({ employee_id: e.id, date });
      if (old) await attendance.update(old.id, v); else await attendance.insert(v);
    }
    res.redirect(303, `/admin/hr/attendance?date=${date}&ok=saved`);
  }));

  /* ---------- leave ---------- */
  router.get('/hr/leave', ah(async (req, res) => {
    const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : '';
    const [list, staff] = await Promise.all([
      leave.list({ where: status ? { status } : {}, order: [['start_date', 'desc']], limit: 200 }),
      employees.list({ order: [['name', 'asc']] }),
    ]);
    const nameOf = (id) => (staff.find((e) => e.id === id) || {}).name || '-';
    res.render('admin/hr-leave', { title: 'Cuti & izin', list, staff: staff.filter((e) => e.status === 'active'), nameOf, status, LEAVE_KINDS });
  }));

  router.post('/hr/leave', ah(async (req, res) => {
    const b = req.body;
    const v = { employee_id: Number(b.employee_id), kind: str(b.kind, 10), start_date: str(b.start_date, 10), end_date: str(b.end_date, 10), reason: str(b.reason, 2000), status: 'pending' };
    if (!(await employees.get(v.employee_id)) || !LEAVE_KINDS.some((k) => k.id === v.kind) || !isDate(v.start_date) || !isDate(v.end_date) || v.end_date < v.start_date) {
      return res.redirect(303, '/admin/hr/leave?err=leave');
    }
    await leave.insert(v);
    res.redirect(303, '/admin/hr/leave?ok=saved');
  }));

  router.post('/hr/leave/:id', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    const status = ['approved', 'rejected', 'pending'].includes(req.body.status) ? req.body.status : null;
    if (!status || !(await leave.update(id, { status, decided_by: req.staff.username }))) return next();
    res.redirect(303, '/admin/hr/leave?ok=saved');
  }));

  router.post('/hr/leave/:id/delete', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    if (!(await leave.remove(id))) return next();
    res.redirect(303, '/admin/hr/leave?ok=deleted');
  }));

  /* ---------- payroll (HRD prepares, finance pays; both roles have the "payroll" area) ---------- */
  router.get('/payroll', ah(async (req, res) => {
    const period = isMonth(req.query.period) ? req.query.period : todayISO().slice(0, 7);
    const [rows, staff] = await Promise.all([payroll.list({ where: { period }, order: [['id', 'asc']] }), employees.list({ order: [['name', 'asc']] })]);
    const nameOf = (id) => staff.find((e) => e.id === id) || { name: '-' };
    const total = rows.reduce((s, r) => s + r.net, 0);
    const missing = staff.filter((e) => e.status === 'active' && !rows.some((r) => r.employee_id === e.id)).length;
    res.render('admin/payroll', { title: 'Penggajian', period, rows, nameOf, total, missing,
      prev: addDays(`${period}-01`, -1).slice(0, 7), next: addDays(`${period}-01`, 32).slice(0, 7) });
  }));

  /** Draft slips for every active employee without one: salary + allowance, minus unexplained absence. */
  router.post('/payroll/generate', ah(async (req, res) => {
    const period = isMonth(req.body.period) ? req.body.period : null;
    if (!period) return res.redirect(303, '/admin/payroll?err=period');
    const [staff, existing, att] = await Promise.all([
      employees.list({ where: { status: 'active' } }),
      payroll.list({ where: { period } }),
      attendance.list({ where: { status: 'alpa' }, range: { col: 'date', from: `${period}-01`, to: monthEnd(period) } }),
    ]);
    for (const e of staff) {
      if (existing.some((r) => r.employee_id === e.id)) continue;
      const base = e.salary || 0;
      const allowance = e.allowance || 0;
      const absent = att.filter((a) => a.employee_id === e.id).length;
      const deduction = Math.round((base / WORKDAYS) * absent);
      await payroll.insert({ period, employee_id: e.id, base, allowance, bonus: 0, deduction, net: base + allowance - deduction, status: 'draft',
        note: absent ? `Potongan ${absent} hari tanpa keterangan` : '' });
    }
    res.redirect(303, `/admin/payroll?period=${period}&ok=saved`);
  }));

  router.post('/payroll/:id', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    const r = await payroll.get(id); if (!r) return next();
    if (r.status === 'paid') return res.redirect(303, `/admin/payroll?period=${r.period}&err=paid`);
    const v = { base: money(req.body.base), allowance: money(req.body.allowance), bonus: money(req.body.bonus), deduction: money(req.body.deduction), note: str(req.body.note, 255) };
    v.net = v.base + v.allowance + v.bonus - v.deduction;
    await payroll.update(id, v);
    res.redirect(303, `/admin/payroll?period=${r.period}&ok=saved`);
  }));

  /** Paying a slip books the salary as an expense in Keuangan. */
  router.post('/payroll/:id/pay', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    const r = await payroll.get(id); if (!r) return next();
    if (r.status !== 'paid') {
      const e = await employees.get(r.employee_id);
      const txId = await transactions.insert({ date: todayISO(), kind: 'expense', category: 'Gaji & tunjangan', amount: Math.max(0, r.net),
        method: str(req.body.method, 20) || 'transfer', description: `Gaji ${r.period} · ${e ? e.name : '#' + r.employee_id}`, ref_type: 'payroll', ref_id: r.id, created_by: req.staff.username });
      await payroll.update(id, { status: 'paid', paid_at: new Date(), transaction_id: txId });
    }
    res.redirect(303, `/admin/payroll?period=${r.period}&ok=saved`);
  }));

  router.post('/payroll/:id/unpay', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    const r = await payroll.get(id); if (!r) return next();
    if (r.transaction_id) await transactions.remove(r.transaction_id);
    await payroll.update(id, { status: 'draft', paid_at: null, transaction_id: null });
    res.redirect(303, `/admin/payroll?period=${r.period}&ok=saved`);
  }));

  router.post('/payroll/:id/delete', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    const r = await payroll.get(id); if (!r) return next();
    if (r.status === 'paid') return res.redirect(303, `/admin/payroll?period=${r.period}&err=paid`);
    await payroll.remove(id);
    res.redirect(303, `/admin/payroll?period=${r.period}&ok=deleted`);
  }));

  router.get('/payroll/:id/slip', ah(async (req, res, next) => {
    const id = idParam(req); if (!id) return next();
    const r = await payroll.get(id); if (!r) return next();
    res.render('admin/payslip', { title: `Slip gaji ${r.period}`, r, e: (await employees.get(r.employee_id)) || { name: '-' } });
  }));
}

module.exports = { mountHr, ATTENDANCE, DEPARTMENTS, WORKDAYS };
