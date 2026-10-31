// Lighthouse audit against the Pages-like server. Fails (exit 1) when any
// category scores below the threshold. Run after `npm run build`.
// Lighthouse 12+ removed the PWA category; installability is covered by the
// manifest/service-worker checks in tests/e2e/pages.spec.ts.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';

const base = process.env.BASE_PATH ?? '/fight-timer/';
const threshold = Number(process.env.LH_THRESHOLD ?? 90);
const chromePath = process.env.CHROME_PATH ?? process.env.LH_CHROME;

const server = spawn(process.execPath, ['scripts/serve-pages.mjs'], { stdio: 'ignore', env: { ...process.env, PORT: '4175' } });
await new Promise((r) => setTimeout(r, 800));
const chrome = await launch({ chromePath, chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'] });
try {
  const results = {};
  for (const route of ['', '#/edit', '#/settings']) {
    const url = `http://localhost:4175${base}${route}`;
    const run = await lighthouse(url, {
      port: chrome.port, output: 'json', logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      formFactor: 'mobile', screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 2, disabled: false },
    });
    const cats = run.lhr.categories;
    results[route || '/'] = Object.fromEntries(Object.entries(cats).map(([k, c]) => [k, Math.round((c.score ?? 0) * 100)]));
    const failed = Object.values(run.lhr.audits).filter((a) => a.score !== null && a.score < 1 && a.scoreDisplayMode !== 'informative' && a.scoreDisplayMode !== 'notApplicable');
    results[route || '/'].failing = failed.map((a) => `${a.id} (${Math.round((a.score ?? 0) * 100)})`);
    mkdirSync('test-results/lighthouse', { recursive: true });
    writeFileSync(`test-results/lighthouse/${(route || 'home').replace(/[#/]/g, '') || 'home'}.json`, run.report);
  }
  console.table(Object.fromEntries(Object.entries(results).map(([r, v]) => [r, { performance: v.performance, accessibility: v.accessibility, 'best-practices': v['best-practices'], seo: v.seo }])));
  for (const [r, v] of Object.entries(results)) if (v.failing.length) console.log(`${r}: failing audits -> ${v.failing.join(', ')}`);
  const bad = Object.entries(results).flatMap(([r, v]) => ['accessibility', 'best-practices', 'performance'].filter((k) => v[k] < threshold).map((k) => `${r} ${k}=${v[k]}`));
  if (bad.length) { console.error(`Below ${threshold}: ${bad.join('; ')}`); process.exitCode = 1; }
  else console.log(`All categories at or above ${threshold}.`);
} finally {
  await chrome.kill();
  server.kill();
}
