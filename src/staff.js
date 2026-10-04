'use strict';

/**
 * Staff logins for the admin CMS.
 * - The owner logs in as "admin" with ADMIN_PASSWORD (from hPanel); other staff get their own
 *   username and password under Sistem → Pengguna, each with a role that decides which menus they see.
 * - Sessions are a signed cookie; changing a password or deactivating a user ends their sessions.
 */
const crypto = require('crypto');

const ROLES = [
  { id: 'owner', label: 'Owner', desc: 'Semua menu, termasuk pengguna' },
  { id: 'manager', label: 'Manager', desc: 'Reservasi, website, sosial media, SDM dan keuangan' },
  { id: 'reservation', label: 'Reservasi / Front office', desc: 'Permintaan, kalender, customer, channel OTA' },
  { id: 'hrd', label: 'HRD', desc: 'Karyawan, absensi, cuti, penggajian' },
  { id: 'finance', label: 'Finance', desc: 'Transaksi, laporan, penggajian' },
  { id: 'pr', label: 'Public Relations', desc: 'Website, sosial media, kalender dan naskah konten' },
];
const ROLE_IDS = ROLES.map((r) => r.id);

/** Menu areas per role. */
const AREAS = {
  owner: ['reservations', 'website', 'content', 'hr', 'payroll', 'finance', 'users'],
  manager: ['reservations', 'website', 'content', 'hr', 'payroll', 'finance'],
  reservation: ['reservations'],
  hrd: ['hr', 'payroll'],
  finance: ['finance', 'payroll'],
  pr: ['website', 'content'],
};
const can = (role, area) => (AREAS[role] || []).includes(area);

const SESSION_HOURS = 12;
const COOKIE = 'kalma_admin';

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(pw), salt, 32);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

function verifyPassword(pw, stored) {
  const [scheme, salt, key] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  const want = Buffer.from(key, 'base64');
  const got = crypto.scryptSync(String(pw), Buffer.from(salt, 'base64'), want.length);
  return crypto.timingSafeEqual(got, want);
}

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const b64u = (buf) => Buffer.from(buf).toString('base64url');

/** A short fingerprint of the current password: a password change invalidates old sessions. */
const passwordVersion = (hashOrSecret) => sha('pv:' + hashOrSecret).toString('base64url').slice(0, 12);

function createSessions(secret) {
  const key = sha('kalma-session:' + secret);
  const sign = (data) => crypto.createHmac('sha256', key).update(data).digest('base64url');
  return {
    issue(user, now = Date.now()) {
      const data = b64u(JSON.stringify({ u: user.id, pv: user.pv, exp: now + SESSION_HOURS * 3600 * 1000 }));
      return `${data}.${sign(data)}`;
    },
    read(token, now = Date.now()) {
      const [data, mac] = String(token || '').split('.');
      if (!data || !mac) return null;
      const want = Buffer.from(sign(data));
      const got = Buffer.from(mac);
      if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
      try {
        const s = JSON.parse(Buffer.from(data, 'base64url').toString());
        return s.exp > now ? s : null;
      } catch { return null; }
    },
  };
}

function readCookie(req, name) {
  for (const part of String(req.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}

module.exports = { ROLES, ROLE_IDS, AREAS, can, hashPassword, verifyPassword, passwordVersion, createSessions, readCookie, COOKIE, SESSION_HOURS };
