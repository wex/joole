import { it } from 'vitest';
import { BrushBvh } from '../../src/core/geom/picking';
import { makeBox } from '../../src/core/geom/__tests__/helpers';
import type { BrushNode, Vec3 } from '../../src/core/types/index';

function latticeBrush(index: number): BrushNode {
  const side = 28;
  const spacing = 128;
  const x = (index % side) * spacing;
  const y = (Math.floor(index / side) % side) * spacing;
  const z = Math.floor(index / (side * side)) * spacing;
  const min: Vec3 = [x, y, z];
  return { ...makeBox(min, [x + 96, y + 96, z + 96]), id: `b${index}` };
}

const brushes = Array.from({ length: 20_000 }, (_, i) => latticeBrush(i));

it('picks among 20000 brushes', async ({ bench }) => {
  const bvh = new BrushBvh();
  const start = performance.now();
  for (const brush of brushes) {
    bvh.insert(brush.id, brush);
  }
  console.log(
    `insert 20000 brushes into the picking BVH: ${(performance.now() - start).toFixed(1)} ms`,
  );

  await bench('100 ray picks among 20000 brushes', () => {
    for (let i = 0; i < 100; i++) {
      bvh.rayHits([-512 + i, -256, 48], [0.8, 0.6, 0]);
    }
  }).run();

  await bench('1000 2D picks among 20000 brushes', () => {
    for (let i = 0; i < 1000; i++) {
      bvh.pick2D([(i % 100) * 32, 48, 0], 'xy', 4);
    }
  }).run();
});
