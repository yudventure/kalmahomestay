'use strict';

/**
 * Kalma services and their activities.
 * Homestay, Diving & snorkeling and Other trips each have a detail page. The diving and trip pages list
 * activities from the `activities` table (managed in the admin), which can be booked and paid online
 * once the owner sets a price per person.
 */
const DEFAULTS = require('./activity-defaults');

const SERVICES = [
  { id: 'homestay', slug: { id: 'homestay', en: 'homestay' }, key: 's1', photo: ['svc-homestay', 'hero-2'], ph: 'ph-house' },
  { id: 'diving', slug: { id: 'diving-snorkeling', en: 'diving-snorkeling' }, key: 's2', category: 'diving', photo: ['svc-diving', 'hero-4'], ph: 'ph-reef' },
  { id: 'trip', slug: { id: 'trip', en: 'trips' }, key: 's3', category: 'trip', photo: ['svc-trips', 'hero-1'], ph: 'ph-karst' },
];
const CATEGORIES = ['diving', 'trip'];
const LEVELS = ['mudah', 'sedang', 'mahir'];

const servicePath = (lang, id) => {
  const s = SERVICES.find((x) => x.id === id);
  return lang === 'en' ? `/en/services/${s.slug.en}` : `/layanan/${s.slug.id}`;
};
const bookPath = (lang) => (lang === 'en' ? '/en/book' : '/pesan');
/** English is the default language: the English homepage is "/", the Indonesian one "/id". */
const homePath = (lang) => (lang === 'en' ? '/' : '/id');
const lines = (s) => String(s || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const paragraphs = (s) => String(s || '').split(/\r?\n\s*\r?\n/).map((p) => p.trim()).filter(Boolean);

function createActivities({ repo, media }) {
  const table = repo.table('activities');

  /** Write the first list once, so a fresh site already has detailed pages. */
  async function seed() {
    if (await repo.getSetting('activities_seeded').catch(() => null)) return false;
    if ((await table.count({})) === 0) for (const a of DEFAULTS) await table.insert({ ...a, active: true });
    await repo.setSetting('activities_seeded', { at: new Date().toISOString() });
    return true;
  }

  /** One activity in the visitor's language (English falls back to Indonesian when a field is empty). */
  function localize(row, lang) {
    const pick = (f) => (lang === 'en' && row[f + '_en'] ? row[f + '_en'] : row[f + '_id']) || '';
    const price = row.price == null ? null : Number(row.price);
    return {
      id: row.id, slug: row.slug, category: row.category, level: row.level || '',
      title: pick('title'), summary: pick('summary'), body: paragraphs(pick('body')),
      includes: lines(pick('includes')), bring: lines(pick('bring')), notes: pick('notes'),
      duration: (lang === 'en' && row.duration_en) || row.duration || '', startTime: row.start_time || '',
      price, free: price === 0, bookable: price > 0,
      minPeople: row.min_people || 1, maxPeople: row.max_people || 20,
      photo: media ? media.activityUrl(row.id) : '',
    };
  }

  const order = [['sort', 'asc'], ['id', 'asc']];
  return {
    seed, localize,
    list: (category) => table.list({ where: category ? { category } : {}, order: [['category', 'asc'], ...order] }),
    published: async (category, lang) => (await table.list({ where: { category, active: true }, order })).map((r) => localize(r, lang)),
    bySlug: async (slug, lang) => {
      const row = await table.find({ slug: String(slug || '').slice(0, 80), active: true });
      return row ? localize(row, lang) : null;
    },
    get: (id) => table.get(id),
    find: (where) => table.find(where),
    insert: (v) => table.insert(v),
    update: (id, v) => table.update(id, v),
    remove: (id) => table.remove(id),
  };
}

module.exports = { createActivities, SERVICES, CATEGORIES, LEVELS, servicePath, bookPath, homePath, DEFAULTS };
