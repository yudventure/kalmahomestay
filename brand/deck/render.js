// Render kalma-deck-<lang>.html to ../Kalma-Brand-Guidelines-<LANG>.pdf
// Usage: node render.js   (needs Playwright + Chromium)
const path = require('path');
let pw; try { pw = require('playwright'); } catch { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
(async () => {
  const browser = await pw.chromium.launch();
  for (const lang of ['id', 'en', 'es']) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.goto('file://' + path.join(__dirname, `kalma-deck-${lang}.html`), { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const out = path.join(__dirname, '..', `Kalma-Brand-Guidelines-${lang.toUpperCase()}.pdf`);
    await page.pdf({ path: out, width: '1600px', height: '900px', printBackground: true, preferCSSPageSize: true });
    console.log('wrote', out);
    await page.close();
  }
  await browser.close();
})();
