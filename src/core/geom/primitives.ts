import type { BrushNode, FaceTexture, Result, Vec3 } from '@core/types/index';
import { analyzeBrush, validateBrush } from './brush';
import { planeFromPoints } from './plane';
import { cross, dot, sub } from './vec3';

export type PrimitiveKind = 'box' | 'wedge' | 'cylinder' | 'cone' | 'sphere';

/** Qoole's fixed sphere-detail presets; the number is the exact face count. */
export const SPHERE_SIDE_PRESETS = [14, 18, 20, 26] as const;
export type PrimitiveError = 'invalid-primitive';

export interface PrimitiveOptions {
  readonly id: string;
  readonly min: Vec3;
  readonly max: Vec3;
  readonly texture: FaceTexture;
  readonly sides: number;
}

function rounded(x: number): number {
  const value = Math.round(x);
  return value === 0 ? 0 : value;
}

function centroid(points: readonly Vec3[]): Vec3 {
  const sum = points.reduce<Vec3>(
    (acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]],
    [0, 0, 0],
  );
  return [sum[0] / points.length, sum[1] / points.length, sum[2] / points.length];
}

/** Turns convex mesh polygons into outward-wound plane-point faces. */
function brushFromPolygons(
  id: string,
  vertices: readonly Vec3[],
  polygons: readonly number[][],
  texture: FaceTexture,
): Result<BrushNode, PrimitiveError> {
  const middle = centroid(vertices);
  const faces = polygons.map((polygon) => {
    const points = polygon.map((index) => vertices[index]!);
    const center = centroid(points);
    // Guard against a numerically unfortunate first triple: choose the triple
    // with the largest triangle area rather than blindly using indices 0,1,2.
    let best: [Vec3, Vec3, Vec3] = [points[0]!, points[1]!, points[2]!];
    let bestArea = -1;
    for (let a = 0; a < points.length; a++) {
      for (let b = a + 1; b < points.length; b++) {
        for (let c = b + 1; c < points.length; c++) {
          const ab = sub(points[a]!, points[b]!);
          const cb = sub(points[c]!, points[b]!);
          const area = dot(cross(ab, cb), cross(ab, cb));
          if (area > bestArea) {
            bestArea = area;
            best = [points[a]!, points[b]!, points[c]!];
          }
        }
      }
    }
    const plane = planeFromPoints(...best);
    if (plane && dot(plane.n, sub(center, middle)) < 0) {
      best = [best[0], best[2], best[1]];
    }
    return { points: best, tex: texture };
  });
  const brush: BrushNode = { kind: 'brush', id, faces };
  return validateBrush(analyzeBrush(brush)).valid
    ? { ok: true, value: brush }
    : { ok: false, error: 'invalid-primitive' };
}

function ring(cx: number, cy: number, rx: number, ry: number, z: number, sides: number): Vec3[] {
  return Array.from({ length: sides }, (_, i) => {
    const angle = (i * 2 * Math.PI) / sides;
    return [rounded(cx + Math.cos(angle) * rx), rounded(cy + Math.sin(angle) * ry), rounded(z)];
  });
}

/**
 * Creates the editing primitives. Cylinder, cone and sphere vertices are
 * rounded to integers, so grid-aligned integer bounds stay integer-point
 * brushes. A sphere is an even-sided bipyramid: `sides / 2` equatorial
 * vertices joined to the top and bottom poles, so the face count is exact.
 */
export function createPrimitiveBrush(
  kind: PrimitiveKind,
  options: PrimitiveOptions,
): Result<BrushNode, PrimitiveError> {
  const { id, texture, sides } = options;
  const min = options.min.map(rounded) as Vec3;
  const max = options.max.map(rounded) as Vec3;
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  if (size.some((x) => x <= 0) || sides < 3) {
    return { ok: false, error: 'invalid-primitive' };
  }
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;

  if (kind === 'box') {
    const v: Vec3[] = [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y1, z0],
      [x0, y1, z0],
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1],
    ];
    return brushFromPolygons(
      id,
      v,
      [
        [0, 3, 2, 1],
        [4, 5, 6, 7],
        [0, 1, 5, 4],
        [1, 2, 6, 5],
        [2, 3, 7, 6],
        [3, 0, 4, 7],
      ],
      texture,
    );
  }

  if (kind === 'wedge') {
    const v: Vec3[] = [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y1, z0],
      [x0, y1, z0],
      [x1, y0, z1],
      [x1, y1, z1],
    ];
    return brushFromPolygons(
      id,
      v,
      [
        [0, 3, 2, 1],
        [1, 2, 5, 4],
        [0, 1, 4],
        [3, 5, 2],
        [0, 4, 5, 3],
      ],
      texture,
    );
  }

  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rx = (x1 - x0) / 2;
  const ry = (y1 - y0) / 2;

  if (kind === 'cylinder') {
    const bottom = ring(cx, cy, rx, ry, z0, sides);
    const top = ring(cx, cy, rx, ry, z1, sides);
    const vertices = [...bottom, ...top];
    const polygons: number[][] = [
      Array.from({ length: sides }, (_, i) => i),
      Array.from({ length: sides }, (_, i) => sides + i),
    ];
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      polygons.push([i, j, sides + j, sides + i]);
    }
    return brushFromPolygons(id, vertices, polygons, texture);
  }

  if (kind === 'cone') {
    const bottom = ring(cx, cy, rx, ry, z0, sides);
    const apexIndex = bottom.length;
    const vertices = [...bottom, [rounded(cx), rounded(cy), z1] as Vec3];
    const polygons: number[][] = [Array.from({ length: sides }, (_, i) => i)];
    for (let i = 0; i < sides; i++) {
      polygons.push([i, (i + 1) % sides, apexIndex]);
    }
    return brushFromPolygons(id, vertices, polygons, texture);
  }

  // An even-sided bipyramid. Qoole's sphere menu likewise uses a small set of
  // exact side counts rather than continuous latitude/longitude segmentation;
  // a convex ring-and-pole construction keeps every plane simple while giving
  // the requested count exactly. The polygons are triangles, so rounding the
  // vertices cannot introduce non-planar quad faces.
  const ringSides = Math.floor(sides / 2);
  if (ringSides < 3 || sides !== ringSides * 2) {
    return { ok: false, error: 'invalid-primitive' };
  }
  const cz = (z0 + z1) / 2;
  const equator = ring(cx, cy, rx, ry, cz, ringSides);
  const topIndex = equator.length;
  const bottomIndex = equator.length + 1;
  const vertices: Vec3[] = [
    ...equator,
    [rounded(cx), rounded(cy), z1],
    [rounded(cx), rounded(cy), z0],
  ];
  const polygons: number[][] = [];
  for (let i = 0; i < ringSides; i++) {
    const j = (i + 1) % ringSides;
    polygons.push([topIndex, i, j]);
    polygons.push([bottomIndex, j, i]);
  }
  return brushFromPolygons(id, vertices, polygons, texture);
}
