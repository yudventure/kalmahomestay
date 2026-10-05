'use strict';

/* Admin › Website › Mode developer: maintenance for the whole site, a page, or a homepage section. */
const { SECTIONS, PAGES } = require('./devmode');

const PREVIEW = ['401', '403', '404', '500', '503', 'page'];

function mountDevMode(router, { devmode, ah }) {
  router.get('/website/devmode', ah(async (req, res) => {
    await devmode.load().catch(() => {});
    res.render('admin/website-devmode', { title: 'Mode developer', d: devmode.state, SECTIONS, PAGES, PREVIEW });
  }));

  router.post('/website/devmode', ah(async (req, res) => {
    await devmode.save(req.body || {});
    res.redirect(303, '/admin/website/devmode?ok=saved');
  }));

  // how a guest sees each error page, in English or Indonesian
  router.get('/website/devmode/preview/:code', (req, res, next) => {
    if (!PREVIEW.includes(req.params.code)) return next();
    const lang = req.query.lang === 'id' ? 'id' : 'en';
    const s = devmode.state.site;
    const extra = req.params.code === '503' ? { message: lang === 'en' ? s.msg_en : s.msg_id, until: s.until ? s.until.replace('T', ' ') + ' WIT' : '' } : {};
    req.app.locals.renderError(res, req.params.code, lang, extra);
  });
}

module.exports = { mountDevMode };
