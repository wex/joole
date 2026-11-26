import { expect, test } from '@playwright/test';

test('the tool overlay appears on tool changes and hides after the timeout (T1.16)', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();

  // Pressing C shows the Clip overlay with its shortcut.
  await page.keyboard.press('c');
  const hint = page.locator('[data-testid=tool-hint]');
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('Clip');
  await expect(hint).toContainText('C');

  // The chip is twice its original size (T15.8): the 26 px name line plus
  // padding, and it stays inside the views.
  const box = (await hint.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(60);
  const area = (await page.locator('[data-testid=viewport-area]').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(area.x);
  expect(box.x + box.width).toBeLessThanOrEqual(area.x + area.width);

  // It disappears after 2.5 s — no fade, just gone.
  await page.clock.fastForward(2600);
  await expect(hint).toHaveCount(0);

  // The Texture toolbar button activates the texture tool and shows the overlay.
  await page.getByRole('button', { name: /Texture \(T\)/ }).click();
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('Texture');
  // The Entity button works too — both were dead before.
  await page.clock.fastForward(2600);
  await page.getByRole('button', { name: /Entity \(E\)/ }).click();
  await expect(hint).toContainText('Entity');

  // V enters the vertex tool; pressing it again shows the Edge submode.
  await page.clock.fastForward(2600);
  await page.keyboard.press('v');
  await expect(hint).toContainText('Vertex');
  await page.keyboard.press('v');
  await expect(hint).toContainText('Edge');
});

test('the overlay stays hidden when the setting is off (T1.16)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
  await page.keyboard.press('Control+,');
  await expect(page.locator('[data-testid=settings-dialog]')).toBeVisible();
  await page.getByLabel('Show tool overlay').uncheck();
  await page.keyboard.press('Escape');
  await page.keyboard.press('c');
  await expect(page.locator('[data-testid=tool-hint]')).toHaveCount(0);
});
