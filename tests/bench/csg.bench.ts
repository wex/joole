import { it } from 'vitest';
import { subtractBrush } from '../../src/core/geom/csg';
import { makeBox } from '../../src/core/geom/__tests__/helpers';

it('subtracts one cutter from 50 targets', async ({ bench }) => {
  const cutter = makeBox([24, 24, 24], [104, 104, 104]);
  const targets = Array.from({ length: 50 }, (_, i) =>
    makeBox(
      [(i % 10) * 128, Math.floor(i / 10) * 128, 0],
      [(i % 10) * 128 + 64, Math.floor(i / 10) * 128 + 64, 64],
    ),
  );
  await bench('1 cutter and 50 targets', () => {
    for (const target of targets) {
      const result = subtractBrush(target, cutter);
      if (!result.ok) throw new Error(result.error);
    }
  }).run();
});
