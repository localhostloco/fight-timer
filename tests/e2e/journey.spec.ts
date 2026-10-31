// The single end-to-end journey: pick a preset, edit it to a short session,
// run it through prep, work and rest, and reach the summary. Extended, never
// duplicated, as later phases land.
import { expect, test } from '@playwright/test';

test.use({ locale: 'en-US' });

test('coach builds a short session, runs it and sees the summary', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Test bell' }).click();
  await expect(page.getByRole('button', { name: 'Test bell' })).toBeHidden();

  await page.getByRole('button', { name: 'New session' }).click();
  await page.getByPlaceholder('Sparring Tuesday').fill('Smoke');
  const stepper = (label: string) => page.locator('.stepper', { hasText: label });
  // 2 rounds, 5 s work, 5 s rest, 0 s prep => 5 + 5 + 5 = 15 s
  await stepper('Rounds').getByRole('button', { name: 'Decrease' }).click();
  await stepper('Round time').getByRole('button', { name: 'Decrease' }).click();
  await expect(stepper('Round time').locator('input')).toHaveValue('2:45');
  await stepper('Round time').locator('input').fill('0:05');
  await stepper('Round time').locator('input').press('Enter');
  await stepper('Rest time').locator('input').fill('5');
  await stepper('Rest time').locator('input').press('Tab');
  for (let i = 0; i < 2; i++) await stepper('Get-ready').getByRole('button', { name: 'Decrease' }).click();
  await expect(stepper('Round time').locator('input')).toHaveValue('0:05');
  await expect(stepper('Rest time').locator('input')).toHaveValue('0:05');
  await expect(stepper('Get-ready').locator('input')).toHaveValue('0');
  await expect(page.locator('.total strong')).toHaveText('0 min');

  await page.getByLabel('Round start', { exact: true }).selectOption('gong');
  await page.getByLabel('End of session', { exact: true }).selectOption('horn');

  await page.getByRole('button', { name: 'Save as preset' }).click();
  await expect(page.getByRole('button', { name: 'Preset saved' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Round start', { exact: true })).toHaveValue('gong');
  await expect(page.getByLabel('End of session', { exact: true })).toHaveValue('horn');

  await page.getByRole('button', { name: 'Start' }).click();
  const run = page.locator('main.run');
  await expect(run).toHaveClass(/phase-work/);
  await expect(page.locator('.run-label')).toHaveText('Round 1 of 2');
  await expect(page.locator('.clock')).toHaveText(/00:0[1-5]/);

  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(run).toHaveClass(/paused/);
  const frozen = await page.locator('.clock').textContent();
  await page.waitForTimeout(1200);
  expect(await page.locator('.clock').textContent()).toBe(frozen);
  await page.getByRole('button', { name: 'Resume' }).click();

  await expect(run).toHaveClass(/phase-rest/, { timeout: 8000 });
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.locator('.run-label')).toHaveText('Round 2 of 2');

  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.stats')).toContainText('2');
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page.locator('.card', { hasText: 'Smoke' })).toBeVisible();
  await expect(page.locator('.history li', { hasText: 'Smoke' })).toContainText('2 rounds');
});

test('coach builds a three-block class, shares it by link, and the link opens it unchanged on another device', async ({ page, browser }) => {
  await page.goto('./#/edit');
  await page.getByPlaceholder('Sparring Tuesday').fill('Pad class');
  await page.getByRole('button', { name: 'Advanced' }).click();
  await page.getByRole('button', { name: 'Add block' }).click();
  await page.getByRole('button', { name: 'Add block' }).click();
  const block = (n: number) => page.locator('.block', { hasText: `Block ${n}` });
  await block(1).getByPlaceholder('Technique').fill('Technique');
  await block(2).getByPlaceholder('Technique').fill('Sparring');
  await block(2).getByPlaceholder('Body shots only').fill('Southpaw');
  await block(2).locator('.stepper', { hasText: 'Round time' }).locator('input').fill('2:00');
  await block(2).locator('.stepper', { hasText: 'Round time' }).locator('input').press('Tab');
  await block(3).getByPlaceholder('Technique').fill('Burnout');
  await block(3).locator('.stepper', { hasText: 'Rounds' }).getByRole('button', { name: 'Decrease' }).click();
  await block(3).locator('.stepper', { hasText: 'Round time' }).locator('input').fill('0:30');
  await block(3).locator('.stepper', { hasText: 'Round time' }).locator('input').press('Tab');
  await block(3).locator('.stepper', { hasText: 'Rest time' }).locator('input').fill('0:15');
  await block(3).locator('.stepper', { hasText: 'Rest time' }).locator('input').press('Tab');
  await page.locator('.stepper', { hasText: 'Warm-up' }).locator('input').fill('1:00');
  await page.locator('.stepper', { hasText: 'Warm-up' }).locator('input').press('Tab');
  // 60 + 10 + 3×(180+60) + 3×(120+60) + 2×30 + 15 = 1405 s => 23 min
  await expect(page.locator('.total')).toContainText('(23:25)');

  await page.getByRole('button', { name: 'Share link' }).click();
  await expect(page.locator('.qr svg')).toBeVisible();
  const url = await page.locator('.share-url').inputValue();
  expect(url).toMatch(/#\/s\/[A-Za-z0-9_-]+$/);

  // A second, fresh browser context stands in for the gym tablet.
  const other = await browser.newContext({ locale: 'en-US' });
  const tablet = await other.newPage();
  await tablet.goto(url);
  await expect(tablet.getByRole('heading', { name: 'Shared session' })).toBeVisible();
  await expect(tablet.getByPlaceholder('Sparring Tuesday')).toHaveValue('Pad class');
  await expect(tablet.locator('.total')).toContainText('(23:25)');
  await expect(tablet.locator('.block', { hasText: 'Block 2' }).getByPlaceholder('Body shots only')).toHaveValue('Southpaw');
  await tablet.getByRole('button', { name: 'Start' }).click();
  await expect(tablet.locator('main.run')).toHaveClass(/phase-warmup/);
  await tablet.getByRole('button', { name: 'Skip' }).click(); // prep
  await tablet.getByRole('button', { name: 'Skip' }).click(); // round 1
  await expect(tablet.locator('.run-label')).toHaveText('Round 1 of 8');
  await expect(tablet.locator('.run-sub')).toHaveText('Technique');
  for (let i = 0; i < 6; i++) await tablet.getByRole('button', { name: 'Skip' }).click();
  await expect(tablet.locator('.run-label')).toHaveText('Round 4 of 8');
  await expect(tablet.locator('.run-note')).toHaveText('Southpaw');
  await other.close();
});

test('TV mode hides the controls after 3 s and any input brings them back', async ({ page }) => {
  await page.goto('./');
  await page.locator('.card', { hasText: 'MMA' }).first().locator('.card-main').click();
  await page.getByRole('button', { name: 'TV mode' }).click();
  await expect(page.locator('main.run')).toHaveClass(/\btv\b/);
  await expect(page.locator('main.run')).toHaveClass(/\bidle\b/, { timeout: 5000 });
  await expect(page.locator('.controls')).toHaveCSS('opacity', '0');
  await expect(page.locator('.clock')).toBeVisible();
  await page.mouse.move(200, 200);
  await expect(page.locator('main.run')).not.toHaveClass(/\bidle\b/);
  await expect(page.locator('.controls')).toHaveCSS('opacity', '1');
});

test('presets export to one JSON file and import on another browser', async ({ page, browser }) => {
  await page.goto('./#/edit');
  await page.getByPlaceholder('Sparring Tuesday').fill('Exported one');
  await page.getByRole('button', { name: 'Save as preset' }).click();
  await page.goto('./#/settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export presets' }).click()]);
  const path = await download.path();
  expect(path).toBeTruthy();

  const other = await browser.newContext({ locale: 'en-US' });
  const p2 = await other.newPage();
  await p2.goto('./#/settings');
  await p2.getByLabel('Import presets').setInputFiles(path!);
  await expect(p2.getByRole('status')).toHaveText('1 presets imported');
  await p2.goto('./');
  await expect(p2.locator('.card', { hasText: 'Exported one' })).toBeVisible();
  await other.close();
});

test('language switch needs no reload', async ({ page }) => {
  await page.goto('./#/settings');
  await page.getByRole('button', { name: 'Português (Brasil)' }).click();
  await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await page.getByRole('button', { name: 'Español' }).click();
  await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible();
  await page.getByRole('button', { name: 'Volver' }).click();
  await expect(page.getByRole('button', { name: 'Nueva sesión' })).toBeVisible();
});

test('stop is never one tap away while running', async ({ page }) => {
  await page.goto('./');
  await page.locator('.card', { hasText: 'Tabata' }).locator('.card-main').click();
  await expect(page.locator('main.run')).toBeVisible();
  const stop = page.getByRole('button', { name: 'Hold to stop' });
  await stop.click(); // a plain tap must not stop
  await expect(page.getByRole('dialog')).toBeHidden();
  await stop.hover();
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Keep going' }).click();
  await expect(page.locator('main.run')).toBeVisible();
});
