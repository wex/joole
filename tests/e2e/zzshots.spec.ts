import { expect, test } from '@playwright/test';

test('retake manual screenshots (T15 gate)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
  await page.waitForTimeout(800);

  // Overview with the collapsed bottom panel (the new default layout).
  await page.screenshot({ path: 'manual/images/overview-dark.png' });

  // Texture browser: thumbnails follow the slider.
  await page.keyboard.press('Control+,');
  await expect(page.locator('[data-testid=settings-dialog]')).toBeVisible();
  await page.screenshot({ path: '/tmp/settings-general.png' });
  await page.locator('#settings-tab-colors').click();
  await expect(page.locator('[data-testid=settings-colors]')).toBeVisible();
  await page.locator('[data-testid=settings-dialog]').screenshot({ path: '/tmp/settings-colors.png' });
  await page.keyboard.press('Escape');

  // Light theme overview.
  await page.keyboard.press('Control+,');
  await expect(page.locator('[data-testid=settings-dialog]')).toBeVisible();
  await page.locator('[data-testid=settings-dialog] select').first().selectOption('light');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'manual/images/overview-light.png' });
});
