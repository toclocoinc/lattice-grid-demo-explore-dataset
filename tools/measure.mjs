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
      const before = await page.evaluate(() => window.__demo.grid.rows.matchCount());
      r.unfilteredProfile = await page.evaluate(async () => { const p = await window.__demo.grid.statistics.profileAsync('trip_distance'); return p && { rows: p.rows, median: p.median, max: p.max, unavailable: p.unavailable && p.unavailable.map((u) => u.figure || u.name || JSON.stringify(u)) }; });
      // click the 11:00 bar of the hour histogram, with a real mouse click
      const facets = await page.$$('.lat-facet');
      const names = await page.evaluate(() => [...document.querySelectorAll('.lat-facet')].map((f) => (f.getAttribute('aria-label') || '')));
      r.facetLabels = names;
      const hourFacet = facets[names.findIndex((n) => /hour/i.test(n))];
      const at = await page.evaluate(() => window.__demo.grid.facets.get('hour').bounds.buckets.findIndex((b) => b.value === '11'));
      const bar = (await hourFacet.$$('.lat-facet__bar'))[at];
      const box = await bar.boundingBox(); console.error('click at', JSON.stringify(box));
      const t0 = Date.now();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height - 1);
      await page.waitForFunction((b) => { const n = window.__demo.grid.rows.matchCount(); return n > 100 && n < b; }, { timeout: 60000 }, before);
      r.afterClick = await page.evaluate(() => ({ filter: JSON.stringify(window.__demo.grid.filters.get()), rows: window.__demo.grid.rows.matchCount(),
        hours: [...new Set(Array.from({ length: 20 }, (_, i) => window.__demo.grid.rows.get(i)).filter(Boolean).map((x) => x.data ? x.data.hour : x.hour))] }));
      r.afterClick.ms = Date.now() - t0;
      await sleep(1500);
      r.profileAfterFilter = await page.evaluate(async () => { const p = await window.__demo.grid.statistics.profileAsync('trip_distance'); return p && { rows: p.rows, median: p.median, computed: p.computed }; });
      r.panelText = await page.evaluate(() => document.querySelector('.lat-toolpanel, [class*=toolpanel]')?.textContent.slice(0, 160));
      await page.screenshot({ path: `${out}/filtered-light.png` });
      await page.click('#clear');
      await page.waitForFunction((b) => window.__demo.grid.rows.matchCount() === b, { timeout: 60000 }, before);
      r.afterClear = await page.evaluate(() => window.__demo.grid.rows.matchCount());
      // a second click, on a pickup-date bar: the other histograms recount under it
      const pk = (await facets[names.findIndex((n) => /pickup distribution/i.test(n))].$$('.lat-facet__bar'))[10];
      const pb = await pk.boundingBox();
      await page.mouse.click(pb.x + pb.width / 2, pb.y + pb.height - 1);
      await sleep(3000);
      r.afterDateClick = await page.evaluate(() => ({ filter: JSON.stringify(window.__demo.grid.filters.get()), rows: window.__demo.grid.rows.matchCount(),
        hourBars: [...document.querySelectorAll('.lat-facet')][2].querySelectorAll('.lat-facet__bar').length }));
      await page.click('#clear');
      await sleep(2000);
      await page.click('#pivot');
      await sleep(6000);
      r.pivot = await page.evaluate(() => ({ cols: window.__demo.grid.columns.visible().map((c) => c.id), rows: window.__demo.grid.rows.count(), pivotMode: window.__demo.grid.state ? 0 : 0,
        first: (() => { const row = window.__demo.grid.rows.get(0); return row && { group: row.groupValue, key: row.key }; })() }));
      await page.screenshot({ path: `${out}/pivot-light.png` });
    }
    await page.screenshot({ path: `${out}/${theme}.png` });
    r.consoleErrors = errors.length; r.errors = errors; r.warnings = warnings;
    await page.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify(result, null, 1));
