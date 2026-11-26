import { expect, test } from '@playwright/test';

test('the settings dialog opens, applies immediately and persists (T1.15)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();

  // Ctrl+, opens the dialog; the focus is trapped inside.
  await page.keyboard.press('Control+,');
  await expect(page.locator('[data-testid=settings-dialog]')).toBeVisible();
  await expect(page.locator('[role=dialog][aria-modal=true]')).toBeVisible();

  // The theme applies immediately.
  await page.locator('[role=dialog] select').first().selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  // The thumbnail slider writes through.
  await page.locator('[role=dialog] input[type=range]').first().fill('96');
  // The handle size slider (T15.3) persists with the rest.
  await page.locator('[data-testid=handle-size-slider]').fill('20');

  // The focus trap: enough Tabs must keep the focus inside the dialog.
  for (let i = 0; i < 20; i++) await page.keyboard.press('Tab');
  const focusInside = await page.evaluate(() => {
    const dialog = document.querySelector('[role=dialog]');
    return dialog !== null && dialog.contains(document.activeElement);
  });
  expect(focusInside).toBe(true);

  // Escape closes the dialog.
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid=settings-dialog]')).toHaveCount(0);

  // The theme survives a reload.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 700)));
  await page.reload();
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.keyboard.press('Control+,');
  await expect(page.locator('[data-testid=handle-size-slider]')).toHaveValue('20');
  await page.keyboard.press('Escape');

  // File → Settings… opens the dialog too, and Reset restores the defaults.
  await page.getByRole('button', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: /Settings/ }).click();
  await expect(page.locator('[data-testid=settings-dialog]')).toBeVisible();
  await page.getByRole('button', { name: 'Reset to Defaults' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.keyboard.press('Escape');
});

test('colour overrides apply at once, persist and reset (T15.10)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();

  // Open Settings and switch to the Colors tab with the keyboard.
  await page.keyboard.press('Control+,');
  await expect(page.locator('[data-testid=settings-dialog]')).toBeVisible();
  await page.locator('#settings-tab-general').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-testid=settings-colors]')).toBeVisible();

  // Set vp-select to blue and close; the override is inline on the root.
  await page.locator('[data-testid=color-vp-select]').evaluate((el) => {
    const input = el as HTMLInputElement;
    input.value = '#0000ff';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.keyboard.press('Escape');
  const inline = await page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--vp-select'),
  );
  expect(inline).toBe('#0000ff');

  // It survives a reload.
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
  const inlineAfter = await page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--vp-select'),
  );
  expect(inlineAfter).toBe('#0000ff');

  // The dark override does not apply in the light theme.
  await page.keyboard.press('Control+,');
  await expect(page.locator('[data-testid=settings-dialog]')).toBeVisible();
  await page.locator('[data-testid=settings-dialog] select').first().selectOption('light');
  const inLight = await page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--vp-select'),
  );
  expect(inLight).toBe('');

  // Reset colours removes every override of both themes.
  await page.locator('#settings-tab-colors').click();
  await page.locator('[data-testid=reset-colors]').click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
  const cleared = await page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--vp-select'),
  );
  expect(cleared).toBe('');
});
