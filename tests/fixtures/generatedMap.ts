import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type Point = [number, number, number];

function faceLine(input: [Point, Point, Point], normal: Point, texture: string): string {
  const [p0, p1, p2] = input;
  const t1 = [p0[0] - p1[0], p0[1] - p1[1], p0[2] - p1[2]];
  const t2 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
  const cross = [
    t1[1]! * t2[2]! - t1[2]! * t2[1]!,
    t1[2]! * t2[0]! - t1[0]! * t2[2]!,
    t1[0]! * t2[1]! - t1[1]! * t2[0]!,
  ];
  const points =
    cross[0]! * normal[0] + cross[1]! * normal[1] + cross[2]! * normal[2] > 0
      ? input
      : [p0, p2, p1];
  return `${points.map((p) => `( ${p.join(' ')} )`).join(' ')} ${texture} 0 0 0 1 1`;
}

/** Axis-aligned box faces in the same outward winding as the fixtures. */
function boxBrush(min: Point, max: Point, texture: string): string[] {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  return [
    '{',
    faceLine(
      [
        [x1, y0, z0],
        [x1, y1, z0],
        [x1, y0, z1],
      ],
      [1, 0, 0],
      texture,
    ),
    faceLine(
      [
        [x0, y0, z0],
        [x0, y1, z0],
        [x0, y0, z1],
      ],
      [-1, 0, 0],
      texture,
    ),
    faceLine(
      [
        [x0, y1, z0],
        [x1, y1, z0],
        [x0, y1, z1],
      ],
      [0, 1, 0],
      texture,
    ),
    faceLine(
      [
        [x0, y0, z0],
        [x1, y0, z0],
        [x0, y0, z1],
      ],
      [0, -1, 0],
      texture,
    ),
    faceLine(
      [
        [x0, y0, z1],
        [x1, y0, z1],
        [x0, y1, z1],
      ],
      [0, 0, 1],
      texture,
    ),
    faceLine(
      [
        [x0, y0, z0],
        [x1, y0, z0],
        [x0, y1, z0],
      ],
      [0, 0, -1],
      texture,
    ),
    '}',
  ];
}

const textures = ['e2u1/mine10_1', 'e2u1/mine10_2'] as const;

/**
 * A deterministic stress-test map: count axis-aligned, non-overlapping 96³
 * boxes on a 128-unit cubic lattice inside worldspawn. The text is generated
 * at test time and never committed because even 5,000 brushes is megabytes of
 * repetitive data.
 */
export function generateBrushMap(count: number): string {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError('brush count must be a positive integer');
  }
  const side = Math.ceil(Math.cbrt(count));
  const spacing = 128;
  const size = 96;
  const start = (-side * spacing) / 2;
  const lines = ['{', '"classname" "worldspawn"', '"message" "generated performance map"'];
  for (let i = 0; i < count; i++) {
    const x = start + (i % side) * spacing;
    const y = start + (Math.floor(i / side) % side) * spacing;
    const z = start + Math.floor(i / (side * side)) * spacing;
    lines.push(
      ...boxBrush([x, y, z], [x + size, y + size, z + size], textures[i % textures.length]!),
    );
  }
  lines.push('}', '');
  return lines.join('\n');
}

/** Writes a generated map below tests/fixtures/generated and returns its path. */
export function writeGeneratedBrushMap(count: number, projectRoot: string): string {
  const directory = path.join(projectRoot, 'tests/fixtures/generated');
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `brushes-${count}.map`);
  writeFileSync(file, generateBrushMap(count));
  return file;
}
