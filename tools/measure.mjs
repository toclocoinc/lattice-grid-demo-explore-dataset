// Real-Chrome evidence for the demo: load time, histogram-bar click -> filter,
// the profile panel following the filter, the pivot, console errors, light and
// dark screenshots. Needs `npm install --no-save puppeteer-core`, a Chrome, and
// the demo served (`python3 -m http.server 8622`).
//   CHROME=/usr/bin/google-chrome node tools/measure.mjs [outdir]
import puppeteer from 'puppeteer-core';

const out = process.argv[2] || '.';
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const result = {};
try {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 900 });
    const errors = []; const warnings = []; page.on('error', (e) => console.error('PAGE CRASH', e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warn' && !m.text().includes('document.write')) warnings.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:8622/index.html${theme === 'dark' ? '?theme=dark' : ''}`);
    await page.waitForFunction('window.__demo', { timeout: 120000 });
    await sleep(3000);
    const r = result[theme] = await page.evaluate(() => ({ ...window.__demo.timings, rows: window.__demo.rows, status: document.getElementById('status').textContent }));
    if (theme === 'light') {
      await page.waitForFunction("[...document.querySelectorAll('.lat-facet')].every((f) => f.querySelector('.lat-facet__bar'))", { timeout: 60000 });
      const bars = await page.evaluate(() => [...document.querySelectorAll('.lat-facet')].map((f) => f.querySelectorAll('.lat-facet__bar').length));
      r.barsPerFacet = bars;
      const before = await page.evaluate(() => window.__demo.grid.rows.count());
      // click the 9th bar of the hour histogram (hour 8), with a real mouse click
      const facets = await page.$$('.lat-facet');
      const names = await page.evaluate(() => [...document.querySelectorAll('.lat-facet')].map((f) => (f.getAttribute('aria-label') || '')));
      r.facetLabels = names;
      const hourFacet = facets[names.findIndex((n) => /hour/i.test(n))];
      const bar = (await hourFacet.$$('.lat-facet__bar'))[8];
      const box = await bar.boundingBox(); console.error('click at', JSON.stringify(box));
      const t0 = Date.now();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height - 1);
      await page.waitForFunction((b) => window.__demo.grid.rows.count() !== b, { timeout: 60000 }, before);
      r.afterClick = await page.evaluate(() => ({ filter: JSON.stringify(window.__demo.grid.filters.get()), rows: window.__demo.grid.rows.count(),
        hours: [...new Set(Array.from({ length: 20 }, (_, i) => window.__demo.grid.rows.get(i)).filter(Boolean).map((x) => x.data ? x.data.hour : x.hour))] }));
      r.afterClick.ms = Date.now() - t0;
      await sleep(1500);
      r.profileAfterFilter = await page.evaluate(() => { const p = window.__demo.grid.statistics.profile('trip_distance'); return p && { rows: p.rows, median: p.median }; });
      await page.screenshot({ path: `${out}/filtered-light.png` });
      await page.click('#clear');
      await sleep(1500);
      r.afterClear = await page.evaluate(() => window.__demo.grid.rows.count());
      await page.click('#pivot');
      await sleep(6000);
      r.pivot = await page.evaluate(() => ({ cols: window.__demo.grid.columns.visible().map((c) => c.id), rows: window.__demo.grid.rows.count(),
        first: (() => { const row = window.__demo.grid.rows.get(0); return row && { group: row.groupValue, key: row.key }; })() }));
      await page.screenshot({ path: `${out}/pivot-light.png` });
      await page.click('#pivot'); await sleep(1500);
    }
    await page.screenshot({ path: `${out}/${theme}.png` });
    r.consoleErrors = errors.length; r.errors = errors; r.warnings = warnings;
    await page.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify(result, null, 1));
