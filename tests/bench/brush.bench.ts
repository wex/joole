import { it } from 'vitest';
import { analyzeBrush } from '../../src/core/geom/brush';
import { makeBox } from '../../src/core/geom/__tests__/helpers';
import type { BrushNode, Vec3 } from '../../src/core/types/index';

// deterministic pseudo-random boxes, generated once outside the timing
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(42);
const brushes: BrushNode[] = [];
for (let i = 0; i < 5000; i++) {
  const origin: Vec3 = [random() * 4096 - 2048, random() * 4096 - 2048, random() * 4096 - 2048];
  const size: Vec3 = [8 + random() * 256, 8 + random() * 256, 8 + random() * 256];
  brushes.push(makeBox(origin, [origin[0] + size[0], origin[1] + size[1], origin[2] + size[2]]));
}

it('builds polygons for 5000 brushes', async ({ bench }) => {
  await bench('5000 brush polygon builds', () => {
    for (const brush of brushes) {
      analyzeBrush(brush);
    }
  }).run();
});
