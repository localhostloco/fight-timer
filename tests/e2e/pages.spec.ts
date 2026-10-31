// Proves the build can be served by GitHub Pages: a project site lives under
// /<repo>/ with no rewrite rules, so every asset, the manifest, the service
// worker and the routes must work from that prefix alone.
import { expect, test } from '@playwright/test';

const base = process.env.BASE_PATH ?? '/fight-timer/';

test('root under the repo base path renders the app', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Fight Timer' })).toBeVisible();
  await expect(page.locator('.card').first()).toBeVisible();
});

test('/<repo> without trailing slash redirects like Pages does', async ({ page }) => {
  const res = await page.goto(base.slice(0, -1));
  expect(res?.url()).toContain(base);
  await expect(page.getByRole('heading', { name: 'Fight Timer' })).toBeVisible();
});

test('every asset the page references resolves under the base path', async ({ page }) => {
  const failed: string[] = [];
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  await page.goto('./');
  await page.waitForLoadState('networkidle');
  const urls = await page.evaluate(() => [
    ...Array.from(document.querySelectorAll('script[src]')).map((e) => (e as HTMLScriptElement).src),
    ...Array.from(document.querySelectorAll('link[href]')).map((e) => (e as HTMLLinkElement).href),
  ]);
  expect(urls.length).toBeGreaterThan(2);
  for (const u of urls) expect(new URL(u).pathname.startsWith(base), u).toBe(true);
  expect(failed).toEqual([]);
});

test('manifest scope, start_url and icons live under the base path', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel=manifest]').getAttribute('href');
  expect(href).toBeTruthy();
  const res = await request.get(new URL(href!, page.url()).toString());
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m.start_url).toBe(base);
  expect(m.scope).toBe(base);
  expect(m.display).toBe('standalone');
  for (const icon of m.icons) {
    const r = await request.get(new URL(icon.src, new URL(href!, page.url())).toString());
    expect(r.ok(), icon.src).toBe(true);
    expect(r.headers()['content-type']).toContain('image/png');
  }
});

test('service worker registers under the base scope and the app works offline', async ({ page, context }) => {
  await page.goto('./');
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(new URL(scope).pathname).toBe(base);
  // Wait until the precache is complete (the SW controls the page after activation).
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Fight Timer' })).toBeVisible();
  await expect(page.locator('.card').first()).toBeVisible();
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { name: /Settings|Ajustes/ })).toBeVisible();
  await context.setOffline(false);
});

test('hash routes survive a direct load (no SPA fallback needed)', async ({ page }) => {
  await page.goto('./#/edit');
  await expect(page.getByRole('heading', { name: /^(Session|Sessão|Sesión)$/ })).toBeVisible();
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { name: /Settings|Ajustes/ })).toBeVisible();
});
