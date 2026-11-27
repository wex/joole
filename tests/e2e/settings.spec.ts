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

test('bounded panel and viewport arrangements apply and persist (T2.7)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();

  await page.keyboard.press('Control+,');
  await expect(page.locator('[data-testid=settings-dialog]')).toBeVisible();
  await page.locator('#settings-tab-layout').click();
  await expect(page.locator('[data-testid=settings-layout]')).toBeVisible();

  // Swap the two right-dock sections, hide the Prefabs tab and maximize Front.
  await page.locator('[data-testid=layout-right-properties-down]').click();
  await page.locator('[data-testid=layout-bottom-prefabs-visible]').uncheck();
  await page.locator('[data-testid=layout-viewport]').selectOption('front');

  const ordered = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid$=-wrap]')].map((el) =>
      el.getAttribute('data-testid'),
    ),
  );
  expect(ordered.indexOf('dock-textures-wrap')).toBeLessThan(
    ordered.indexOf('dock-properties-wrap'),
  );
  await expect(page.locator('#bottom-tab-prefabs')).toHaveCount(0);
  await expect(page.locator('[data-testid=view-title-front]')).toBeVisible();
  await expect(page.locator('[data-testid=view-title-top]')).toBeHidden();
  await page.keyboard.press('Escape');

  // The arrangement is persisted as settings, not only session state.
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
  const orderedAfter = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid$=-wrap]')].map((el) =>
      el.getAttribute('data-testid'),
    ),
  );
  expect(orderedAfter.indexOf('dock-textures-wrap')).toBeLessThan(
    orderedAfter.indexOf('dock-properties-wrap'),
  );
  await expect(page.locator('#bottom-tab-prefabs')).toHaveCount(0);
  await expect(page.locator('[data-testid=view-title-front]')).toBeVisible();
  await expect(page.locator('[data-testid=view-title-top]')).toBeHidden();

  // Entire docks can be hidden explicitly while the viewport remains usable.
  await page.keyboard.press('Control+,');
  await page.locator('#settings-tab-layout').click();
  await page.locator('[data-testid=layout-right-dock-visible]').uncheck();
  await page.locator('[data-testid=layout-bottom-dock-visible]').uncheck();
  await expect(page.locator('[data-testid=dock-textures]')).toHaveCount(0);
  await expect(page.locator('[role=tablist][aria-label="Bottom panel"]')).toHaveCount(0);
  await expect(page.locator('[data-testid=viewport-area]')).toBeVisible();
});

test('named layouts can be saved, applied, renamed, updated and deleted (T2.8)', async ({
  page,
}) => {
  const rightOrder = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-testid$=-wrap]')].map((el) =>
        el.getAttribute('data-testid'),
      ),
    );

  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
  await page.keyboard.press('Control+,');
  await page.locator('#settings-tab-layout').click();

  // Save a texture-first arrangement as the first named layout.
  await page.locator('[data-testid=layout-right-properties-down]').click();
  await page.locator('[data-testid=layout-name-input]').fill('Texture first');
  await page.locator('[data-testid=layout-save]').click();
  await expect(page.locator('[data-testid=layout-preset-select] option')).toHaveCount(2);
  await expect(page.locator('[data-testid=layout-error]')).toHaveCount(0);

  // Reset, then save a second arrangement: hidden Prefabs tab and maximized Front.
  await page.locator('[data-testid=layout-reset]').click();
  await page.locator('[data-testid=layout-bottom-prefabs-visible]').uncheck();
  await page.locator('[data-testid=layout-viewport]').selectOption('front');
  await page.locator('[data-testid=layout-name-input]').fill('Front review');
  await page.locator('[data-testid=layout-save]').click();
  await expect(page.locator('[data-testid=layout-preset-select] option')).toHaveCount(3);

  // Applying the first layout restores its arrangement exactly enough for the
  // bounded model: texture-first sections, all bottom tabs and the quad grid.
  await page.locator('[data-testid=layout-preset-select]').selectOption({ label: 'Texture first' });
  await page.locator('[data-testid=layout-apply]').click();
  let order = await rightOrder();
  expect(order.indexOf('dock-textures-wrap')).toBeLessThan(order.indexOf('dock-properties-wrap'));
  await expect(page.locator('#bottom-tab-prefabs')).toHaveCount(1);
  await expect(page.locator('[data-testid=view-title-top]')).toBeVisible();
  await page.keyboard.press('Escape');

  // The preset collection and active arrangement survive reload.
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
  order = await rightOrder();
  expect(order.indexOf('dock-textures-wrap')).toBeLessThan(order.indexOf('dock-properties-wrap'));
  await page.keyboard.press('Control+,');
  await page.locator('#settings-tab-layout').click();
  await expect(page.locator('[data-testid=layout-preset-select] option')).toHaveCount(3);

  // Rename the second layout, update it with the current arrangement and delete it.
  await page.locator('[data-testid=layout-preset-select]').selectOption({ label: 'Front review' });
  await page.locator('[data-testid=layout-name-input]').fill('Inspection');
  await page.locator('[data-testid=layout-rename]').click();
  await expect(
    page.locator('[data-testid=layout-preset-select] option', { hasText: 'Inspection' }),
  ).toHaveCount(1);
  await page.locator('[data-testid=layout-update]').click();
  await expect(page.locator('[data-testid=layout-error]')).toHaveCount(0);
  await page.locator('[data-testid=layout-delete]').click();
  await expect(page.locator('[data-testid=layout-preset-select] option')).toHaveCount(2);
  await expect(
    page.locator('[data-testid=layout-preset-select] option', { hasText: 'Inspection' }),
  ).toHaveCount(0);

  // Duplicate names are rejected without destroying the existing preset.
  await page.locator('[data-testid=layout-name-input]').fill('Texture first');
  await page.locator('[data-testid=layout-save]').click();
  await expect(page.locator('[data-testid=layout-error]')).toContainText('already exists');
});
