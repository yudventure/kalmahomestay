'use strict';

/**
 * Uploads from the admin: website photos and videos, employee documents, transaction receipts.
 * Files are stored in UPLOAD_DIR (outside the app folder, so a redeploy does not delete them) and
 * listed in the `media` table. Website media are public at /media/<file>; documents and receipts
 * are only served to logged-in staff with the right role, at /admin/files/<id>.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const MB = 1024 * 1024;
const KINDS = {
  image: { exts: ['.jpg', '.jpeg', '.png', '.webp'], max: 10 * MB, label: 'JPG, PNG atau WebP, maksimal 10 MB' },
  video: { exts: ['.mp4', '.webm'], max: 80 * MB, label: 'MP4 atau WebM, maksimal 80 MB' },
  document: { exts: ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.docx', '.xlsx'], max: 15 * MB, label: 'PDF, foto, Word atau Excel, maksimal 15 MB' },
};
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

/** Photo and video places on the website. Labels come from the admin, not the content files. */
const SLOTS = [
  { group: 'Hero', note: 'Empat kotak di bagian paling atas. Video diputar otomatis tanpa suara, fotonya tampil sebelum video siap.', items: [
    { id: 'hero-1', label: 'Kotak 1', video: true }, { id: 'hero-2', label: 'Kotak 2', video: true },
    { id: 'hero-3', label: 'Kotak 3', video: true }, { id: 'hero-4', label: 'Kotak 4', video: true }] },
  { group: 'Layanan Kalma', note: 'Foto latar tiga kartu layanan.', items: [
    { id: 'svc-homestay', label: 'Homestay' }, { id: 'svc-diving', label: 'Diving & snorkeling' }, { id: 'svc-trips', label: 'Trip lainnya' }] },
  { group: 'Pengalaman', note: 'Enam lingkaran foto pengalaman.', items: [1, 2, 3, 4, 5, 6].map((i) => ({ id: `exp-${i}`, label: `Pengalaman ${i}`, contentKey: `e${i}.t` })) },
  { group: 'Keunggulan', note: 'Foto besar di samping daftar keunggulan.', items: [{ id: 'feature', label: 'Foto keunggulan' }] },
];
const SLOT_IDS = SLOTS.flatMap((g) => g.items.map((i) => i.id));

/** Recognise the real file type from its first bytes (a renamed .exe does not pass as .jpg). */
function sniff(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'webp';
  if (buf.slice(4, 8).toString() === 'ftyp') return 'mp4';
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'webm';
  if (buf.slice(0, 5).toString() === '%PDF-') return 'pdf';
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'zip';
  return null;
}
const SNIFF_OK = { '.jpg': 'jpg', '.jpeg': 'jpg', '.png': 'png', '.webp': 'webp', '.mp4': 'mp4', '.webm': 'webm', '.pdf': 'pdf', '.docx': 'zip', '.xlsx': 'zip' };

class UploadError extends Error {
  constructor(code) { super(code); this.code = code; }
}

function createMedia({ repo, dir }) {
  const table = repo.table('media');
  let slots = {}; // slot → { image: row, video: row }
  let logos = {}; // partner name (lowercase) → row
  const PUBLIC = ['website', 'partner'];

  const filePath = (row) => path.join(dir, path.basename(row.file));
  const urlOf = (row) => `/media/${row.file}`;

  async function reload() {
    const rows = await table.list({ where: { owner_type: PUBLIC }, order: [['id', 'asc']] });
    const next = {};
    const nextLogos = {};
    for (const r of rows) {
      if (r.owner_type === 'website' && r.slot) (next[r.slot] ||= {})[r.kind] = r;
      if (r.owner_type === 'partner' && r.label) nextLogos[r.label.toLowerCase()] = r;
    }
    slots = next;
    logos = nextLogos;
    return slots;
  }

  /** Express middleware: receive one file in field "file" for the given kind. */
  function receive(kind) {
    const spec = KINDS[kind];
    const upload = multer({
      storage: multer.diskStorage({
        destination: (req, file, cb) => fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir)),
        filename: (req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex') + path.extname(file.originalname).toLowerCase().replace('.jpeg', '.jpg')),
      }),
      limits: { fileSize: spec.max, files: 1, fields: 20 },
      fileFilter: (req, file, cb) => cb(spec.exts.includes(path.extname(file.originalname).toLowerCase()) ? null : new UploadError('type'), true),
    }).single('file');
    return (req, res, next) => upload(req, res, async (err) => {
      if (err) {
        if (req.file) fs.rm(req.file.path, { force: true }, () => {});
        req.uploadError = err.code === 'LIMIT_FILE_SIZE' ? 'size' : err instanceof UploadError ? err.code : 'failed';
        return next();
      }
      if (!req.file) { req.uploadError = 'empty'; return next(); }
      // check the content really is what the extension says
      try {
        const fd = await fs.promises.open(req.file.path, 'r');
        const head = Buffer.alloc(16);
        await fd.read(head, 0, 16, 0);
        await fd.close();
        if (sniff(head) !== SNIFF_OK[path.extname(req.file.filename)]) throw new UploadError('type');
      } catch (e) {
        fs.rm(req.file.path, { force: true }, () => {});
        req.file = null;
        req.uploadError = e.code === 'type' ? 'type' : 'failed';
      }
      next();
    });
  }

  /** Record an uploaded file. A website slot keeps one photo and one video: the old one is removed. */
  async function save(file, { kind, slot = null, ownerType, ownerId = null, label = '', by = '' }) {
    if (ownerType === 'partner') {
      // one logo per partner name
      for (const old of await table.list({ where: { owner_type: 'partner' } })) if ((old.label || '').toLowerCase() === String(label).toLowerCase()) await remove(old.id);
    }
    if (slot) {
      for (const old of await table.list({ where: { owner_type: 'website', slot, kind } })) await remove(old.id);
    }
    const ext = path.extname(file.filename);
    const id = await table.insert({
      kind, file: file.filename, original_name: String(file.originalname).slice(0, 200), mime: MIME[ext] || 'application/octet-stream', size: file.size,
      slot, owner_type: ownerType, owner_id: ownerId, label: String(label || '').slice(0, 120), public: PUBLIC.includes(ownerType), uploaded_by: by,
    });
    if (PUBLIC.includes(ownerType)) await reload();
    return id;
  }

  async function remove(id) {
    const row = await table.get(id);
    if (!row) return false;
    await table.remove(id);
    await fs.promises.rm(filePath(row), { force: true });
    if (PUBLIC.includes(row.owner_type)) await reload();
    return row;
  }

  return {
    KINDS, SLOTS, SLOT_IDS, dir, receive, save, remove, reload, filePath, urlOf,
    get slots() { return slots; },
    list: (q) => table.list(q),
    get: (id) => table.get(id),
    findPublic: (file) => table.find({ file, public: true }),
    /** Uploaded logo for a partner name, or ''. */
    logoUrl: (name) => (logos[String(name || '').toLowerCase()] ? urlOf(logos[String(name).toLowerCase()]) : ''),
    logoRow: (name) => logos[String(name || '').toLowerCase()] || null,
    photoUrl: (slot) => (slots[slot] && slots[slot].image ? urlOf(slots[slot].image) : ''),
    video: (slot) => {
      const v = slots[slot] && slots[slot].video;
      return v ? { [path.extname(v.file).slice(1)]: urlOf(v) } : null;
    },
  };
}

const UPLOAD_ERRORS = {
  type: 'Jenis file tidak didukung. Periksa format yang diizinkan.',
  size: 'File terlalu besar. Perkecil dulu lalu unggah lagi.',
  empty: 'Pilih file yang mau diunggah.',
  failed: 'File gagal diunggah. Coba lagi.',
};

module.exports = { createMedia, sniff, KINDS, SLOTS, SLOT_IDS, UPLOAD_ERRORS };
