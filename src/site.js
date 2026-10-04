'use strict';

/**
 * Website settings edited in the admin (Website menu), stored in the database (app_settings key "site").
 * They override the defaults from hPanel environment variables and the content files:
 *   contact  – WhatsApp, email and social links
 *   rooms    – price per person per night, max guests, number of units
 *   partners – names in the running text
 *   content  – text overrides per language, keyed like content/id.json
 * Saved settings take effect immediately (the shared objects are updated in place).
 */
const { ROOMS } = require('./config');

const ROOM_DEFAULTS = ROOMS.map((r) => ({ id: r.id, price: r.price, maxGuests: r.maxGuests, units: r.units }));

function cleanUrl(v) {
  const s = String(v || '').trim();
  return /^https?:\/\/\S+$/i.test(s) ? s : '';
}

function createSite({ repo, config, content }) {
  const envContact = { ...config.contact };
  const baseContent = { id: { ...content.id }, en: { ...content.en } };
  let settings = { contact: {}, rooms: {}, partners: null, content: { id: {}, en: {} } };

  function apply() {
    // contact & social links
    const c = settings.contact || {};
    const merged = { ...envContact };
    if (c.whatsapp) { merged.whatsapp = String(c.whatsapp).replace(/\D/g, ''); merged.whatsappDisplay = c.whatsappDisplay || '+' + merged.whatsapp; }
    if (c.whatsappDisplay) merged.whatsappDisplay = c.whatsappDisplay;
    if (c.email) merged.email = c.email;
    if (c.instagram) {
      const handle = String(c.instagram).replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?#].*$/, '').replace(/^@/, '');
      if (handle) { merged.instagram = '@' + handle; merged.instagramUrl = 'https://instagram.com/' + handle; }
    }
    for (const k of ['facebookUrl', 'tiktokUrl', 'googleUrl']) if (c[k] !== undefined && c[k] !== null) merged[k] = cleanUrl(c[k]) || envContact[k] || '';
    Object.assign(config.contact, merged);

    // rooms (the ROOMS objects are shared by pricing, the booking form and the admin)
    for (const d of ROOM_DEFAULTS) {
      const room = ROOMS.find((r) => r.id === d.id);
      const o = (settings.rooms || {})[d.id] || {};
      room.price = Number(o.price) > 0 ? Math.round(Number(o.price)) : d.price;
      room.maxGuests = Number(o.maxGuests) > 0 ? Math.round(Number(o.maxGuests)) : d.maxGuests;
      room.units = Number(o.units) > 0 ? Math.round(Number(o.units)) : d.units;
    }

    // text overrides
    for (const lang of ['id', 'en']) {
      for (const k of Object.keys(content[lang])) delete content[lang][k];
      Object.assign(content[lang], baseContent[lang], (settings.content || {})[lang] || {});
    }
  }

  return {
    get settings() { return settings; },
    baseContent,
    envContact,
    roomDefaults: ROOM_DEFAULTS,
    /** Partner names from the admin, or null to use content/partners.json. */
    partners() { return Array.isArray(settings.partners) ? settings.partners : null; },
    async load() {
      const saved = await repo.getSetting('site').catch(() => null);
      if (saved) settings = { ...settings, ...saved, content: { id: {}, en: {}, ...(saved.content || {}) } };
      apply();
      return settings;
    },
    async save(part, value) {
      settings = { ...settings, [part]: value };
      await repo.setSetting('site', settings);
      apply();
    },
  };
}

module.exports = { createSite, cleanUrl };
