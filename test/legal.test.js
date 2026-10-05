'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../src/app');
const { TEXT } = require('../src/legal');

let server, base;
async function start() {
  if (base) return base;
  const app = createApp({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'legal-')), db: null, payments: { enabled: false, percent: 100 } });
  await app.locals.repo.init();
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  return base;
}
after(() => server && server.close());

test('privacy policy and terms open in both languages and link to each other', async () => {
  const b = await start();
  for (const [url, title, other] of [
    ['/en/privacy', 'Privacy policy', '/en/terms'], ['/en/terms', 'Terms and conditions', '/en/privacy'],
    ['/privasi', 'Kebijakan privasi', '/ketentuan'], ['/ketentuan', 'Syarat dan ketentuan', '/privasi'],
  ]) {
    const r = await fetch(b + url);
    assert.equal(r.status, 200, url);
    const html = await r.text();
    assert.match(html, new RegExp(`<h1>${title}</h1>`));
    assert.match(html, new RegExp(`href="${other}"`));
  }
  assert.equal((await fetch(b + '/privacy', { redirect: 'manual' })).headers.get('location'), '/en/privacy');
  const map = await (await fetch(b + '/sitemap.xml')).text();
  assert.match(map, /\/en\/privacy<\/loc>/);
  assert.match(map, /\/ketentuan<\/loc>/);
});

test('the footer links to the legal pages and has an operator sign-in button', async () => {
  const b = await start();
  const en = await (await fetch(b + '/')).text();
  assert.match(en, /href="\/en\/privacy"/);
  assert.match(en, /href="\/en\/terms"/);
  assert.match(en, /class="foot__operator" href="\/admin\/login"[^>]*>.*Operator sign-in/s);
  const id = await (await fetch(b + '/id')).text();
  assert.match(id, /href="\/privasi"/);
  assert.match(id, /Masuk operator/);
});

test('legal texts follow the house style: no dashes, semicolons or mid-sentence colons', () => {
  const all = JSON.stringify(TEXT);
  assert.doesNotMatch(all, /[—–;]/);
  for (const lang of ['en', 'id']) for (const kind of ['privacy', 'terms']) {
    for (const [, items] of TEXT[lang][kind].sections) for (const p of items) assert.doesNotMatch(p, /\w: \w/, p);
  }
});
