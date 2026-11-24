import type { BrushNode, Plane, Vec3 } from '@core/types/index';
import { planeFromPoints } from './plane';
import { baseWindingForPlane, splitWinding } from './winding';
import { cross, distance, dot } from './vec3';
import { PLANE_EPS, POINT_EPS } from './constants';

export interface AnalyzedBrush {
  /** Per input face; null when the face's three points are collinear. */
  planes: (Plane | null)[];
  /** Per input face; null when the face is empty, that is, redundant. */
  polygons: (Vec3[] | null)[];
  /** Positive for a valid closed brush, zero for an empty one. */
  volume: number;
  /** Null when the brush has no polygons at all. */
  aabb: { min: Vec3; max: Vec3 } | null;
}

/**
 * Builds the derived geometry of a brush: for each face, the base winding
 * is clipped by all the other planes (spec, Geometry core). The interior
 * of the brush is behind each plane, because normals point outwards.
 */
export function analyzeBrush(brush: BrushNode): AnalyzedBrush {
  const planes = brush.faces.map((face) => planeFromPoints(...face.points));

  const polygons = planes.map((plane, i) => {
    if (!plane) {
      return null;
    }
    let winding: Vec3[] | null = baseWindingForPlane(plane);
    for (let j = 0; j < planes.length; j++) {
      if (i === j || winding === null) {
        continue;
      }
      const clipper = planes[j];
      if (!clipper) {
        continue;
      }
      winding = splitWinding(winding, clipper).back;
    }
    // fewer than three points cannot form a polygon
    return winding !== null && winding.length >= 3 ? winding : null;
  });

  // Signed tetrahedron volumes, fan-triangulated from each polygon's first
  // vertex. The Quake winding order is clockwise viewed from outside, so
  // the raw sum is negative for an outward-facing closed brush.
  let rawVolume = 0;
  let min: Vec3 | null = null;
  let max: Vec3 | null = null;
  for (const polygon of polygons) {
    if (!polygon) {
      continue;
    }
    const v0 = polygon[0]!;
    for (let i = 2; i < polygon.length; i++) {
      rawVolume += dot(v0, cross(polygon[i - 1]!, polygon[i]!)) / 6;
    }
    for (const p of polygon) {
      if (!min || !max) {
        min = [...p];
        max = [...p];
      } else {
        for (let j = 0; j < 3; j++) {
          min[j] = Math.min(min[j]!, p[j]!);
          max[j] = Math.max(max[j]!, p[j]!);
        }
      }
    }
  }

  return {
    planes,
    polygons,
    volume: -rawVolume,
    aabb: min && max ? { min, max } : null,
  };
}

export type BrushInvalidReason =
  'degenerate-face-points' | 'duplicate-plane' | 'redundant-face' | 'too-few-faces' | 'no-volume';

export interface BrushValidation {
  valid: boolean;
  reasons: BrushInvalidReason[];
}

/** The spec's validity rule: volume > 0, at least four faces, no redundant face. */
export function validateBrush(analysis: AnalyzedBrush): BrushValidation {
  const reasons: BrushInvalidReason[] = [];
  if (analysis.planes.some((plane) => plane === null)) {
    reasons.push('degenerate-face-points');
  }
  // A duplicate contributes nothing but still counts towards the volume
  // sum, so it must be caught explicitly: clipping never empties it.
  const realPlanes = analysis.planes.filter((plane) => plane !== null);
  for (let i = 0; i < realPlanes.length && !reasons.includes('duplicate-plane'); i++) {
    for (let j = i + 1; j < realPlanes.length; j++) {
      const a = realPlanes[i]!;
      const b = realPlanes[j]!;
      if (distance(a.n, b.n) <= PLANE_EPS && Math.abs(a.d - b.d) <= PLANE_EPS) {
        reasons.push('duplicate-plane');
        break;
      }
    }
  }
  if (analysis.polygons.some((polygon, i) => polygon === null && analysis.planes[i] !== null)) {
    reasons.push('redundant-face');
  }
  const faceCount = analysis.polygons.filter((polygon) => polygon !== null).length;
  if (faceCount < 4) {
    reasons.push('too-few-faces');
  }
  if (analysis.volume <= 0) {
    reasons.push('no-volume');
  }
  return { valid: reasons.length === 0, reasons };
}

export interface BrushWireframe {
  vertices: Vec3[];
  /** Index pairs into vertices, undirected and deduplicated. */
  edges: [number, number][];
}

/** Vertices and edges for the wireframe views, merging within POINT_EPS. */
export function extractWireframe(polygons: (Vec3[] | null)[]): BrushWireframe {
  const vertices: Vec3[] = [];
  const edgeKeys = new Set<string>();
  const edges: [number, number][] = [];

  function vertexIndex(p: Vec3): number {
    for (let i = 0; i < vertices.length; i++) {
      if (distance(vertices[i]!, p) <= POINT_EPS) {
        return i;
      }
    }
    vertices.push([...p]);
    return vertices.length - 1;
  }

  for (const polygon of polygons) {
    if (!polygon) {
      continue;
    }
    const indices = polygon.map(vertexIndex);
    for (let i = 0; i < indices.length; i++) {
      const a = indices[i]!;
      const b = indices[(i + 1) % indices.length]!;
      if (a === b) {
        continue;
      }
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        edges.push([Math.min(a, b), Math.max(a, b)]);
      }
    }
  }

  return { vertices, edges };
}
