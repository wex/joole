import { it } from 'vitest';

it('trivial benchmark', async ({ bench }) => {
  await bench('square root', () => {
    Math.sqrt(2);
  }).run();
});
