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

  await page.getByRole('button', { name: 'Save as preset' }).click();
  await expect(page.getByRole('button', { name: 'Preset saved' })).toBeVisible();

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
  await expect(page.getByText('Smoke')).toBeVisible();
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
  await stop.dispatchEvent('pointerdown');
  await page.waitForTimeout(1200);
  await stop.dispatchEvent('pointerup');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Keep going' }).click();
  await expect(page.locator('main.run')).toBeVisible();
});
