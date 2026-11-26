import { analyzeBrush, extractWireframe, texAxes } from '@core/geom/index';
import type { BrushNode, FaceTexture, Plane, Vec3 } from '@core/types/index';
import {
  CONTENTS_MONSTERCLIP,
  CONTENTS_PLAYERCLIP,
  SURF_HINT,
  SURF_NODRAW,
  SURF_SKIP,
  SURF_SKY,
  SURF_TRANS33,
  SURF_TRANS66,
} from '@game/q2/index';
import type { Aabb } from './camera';

/**
 * How the 3D view draws a face (spec, 3D view): opaque faces first, then the
 * transparent TRANS33 and TRANS66 faces; sky in the sky colour; nodraw, clip,
 * hint and skip faces as dimmed or hidden tool faces.
 */
export type FaceClass = 'opaque' | 'sky' | 'trans33' | 'trans66' | 'tool';

export function classifyFace(tex: Pick<FaceTexture, 'flags' | 'contents'>): FaceClass {
  if (tex.flags & (SURF_NODRAW | SURF_HINT | SURF_SKIP)) {
    return 'tool';
  }
  if (tex.contents & (CONTENTS_PLAYERCLIP | CONTENTS_MONSTERCLIP)) {
    return 'tool';
  }
  if (tex.flags & SURF_SKY) {
    return 'sky';
  }
  if (tex.flags & SURF_TRANS33) {
    return 'trans33';
  }
  if (tex.flags & SURF_TRANS66) {
    return 'trans66';
  }
  return 'opaque';
}

/** The key of a per-texture batch: faces of one class and one texture. */
export function batchKey(cls: FaceClass, texture: string): string {
  return `${cls}|${texture}`;
}

/**
 * The face vertex format of the spec: position 3×f32, UV 2×f32, normal 3×i8
 * (one padding byte) and the brush index u32, 28 bytes. The UV is in texels,
 * before the division by the texture's size, which the shader does with the
 * size of the texture bound for the batch. A texture that finishes loading
 * therefore needs no geometry rebuild.
 */
export const FACE_STRIDE = 28;
export const FACE_OFFSET_POSITION = 0;
export const FACE_OFFSET_UV = 12;
export const FACE_OFFSET_NORMAL = 20;
export const FACE_OFFSET_INDEX = 24;

/**
 * A handle dot instance (T1.8): the world-space centre as 3×f32 and the state
 * u32 — 0 idle, 1 hover, 2 active. The size and colour come from the state.
 */
export const HANDLE_STRIDE = 16;
export const HANDLE_OFFSET_CENTER = 0;
export const HANDLE_OFFSET_STATE = 12;

/** A wireframe line instance: endpoints a and b as 3×f32 and the index u32. */
export const LINE_STRIDE = 28;
export const LINE_OFFSET_A = 0;
export const LINE_OFFSET_B = 12;
export const LINE_OFFSET_INDEX = 24;

export interface BrushMeshPart {
  readonly key: string;
  readonly cls: FaceClass;
  readonly texture: string;
  readonly vertexCount: number;
  readonly data: ArrayBuffer;
}

export interface BrushMesh {
  readonly parts: BrushMeshPart[];
  readonly lines: ArrayBuffer;
  readonly lineCount: number;
  readonly aabb: Aabb | null;
}

/** The Newell normal of a polygon: its orientation by the right-hand rule. */
function newellNormal(polygon: readonly Vec3[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return [x, y, z];
}

function packNormal(component: number): number {
  return Math.max(-127, Math.min(127, Math.round(component * 127)));
}

interface PartBuilder {
  cls: FaceClass;
  texture: string;
  triangles: { polygon: Vec3[]; plane: Plane; tex: FaceTexture }[];
  vertexCount: number;
}

/**
 * Builds a brush's share of the GPU buffers: its face polygons
 * fan-triangulated into per-batch vertex data, counter-clockwise seen from
 * outside the brush, and its wireframe edges as line instances.
 */
export function buildBrushMesh(brush: BrushNode, index: number): BrushMesh {
  const analysis = analyzeBrush(brush);
  const builders = new Map<string, PartBuilder>();
  brush.faces.forEach((face, i) => {
    const polygon = analysis.polygons[i];
    const plane = analysis.planes[i];
    if (!polygon || !plane || polygon.length < 3) {
      return;
    }
    const n = newellNormal(polygon);
    const oriented =
      n[0] * plane.n[0] + n[1] * plane.n[1] + n[2] * plane.n[2] < 0
        ? [...polygon].reverse()
        : polygon;
    const cls = classifyFace(face.tex);
    const key = batchKey(cls, face.tex.name);
    let builder = builders.get(key);
    if (!builder) {
      builder = { cls, texture: face.tex.name, triangles: [], vertexCount: 0 };
      builders.set(key, builder);
    }
    builder.triangles.push({ polygon: oriented, plane, tex: face.tex });
    builder.vertexCount += (oriented.length - 2) * 3;
  });

  const parts: BrushMeshPart[] = [];
  for (const [key, builder] of builders) {
    const data = new ArrayBuffer(builder.vertexCount * FACE_STRIDE);
    const floats = new Float32Array(data);
    const bytes = new Int8Array(data);
    const uints = new Uint32Array(data);
    let vertex = 0;
    const put = (p: Vec3, plane: Plane, axes: ReturnType<typeof texAxes>) => {
      const base = vertex * FACE_STRIDE;
      const f = base / 4;
      floats[f] = p[0];
      floats[f + 1] = p[1];
      floats[f + 2] = p[2];
      floats[f + 3] = p[0] * axes.s[0] + p[1] * axes.s[1] + p[2] * axes.s[2] + axes.shiftS;
      floats[f + 4] = p[0] * axes.t[0] + p[1] * axes.t[1] + p[2] * axes.t[2] + axes.shiftT;
      bytes[base + FACE_OFFSET_NORMAL] = packNormal(plane.n[0]);
      bytes[base + FACE_OFFSET_NORMAL + 1] = packNormal(plane.n[1]);
      bytes[base + FACE_OFFSET_NORMAL + 2] = packNormal(plane.n[2]);
      uints[(base + FACE_OFFSET_INDEX) / 4] = index;
      vertex++;
    };
    for (const { polygon, plane, tex } of builder.triangles) {
      const axes = texAxes(plane, tex);
      for (let i = 1; i + 1 < polygon.length; i++) {
        put(polygon[0]!, plane, axes);
        put(polygon[i]!, plane, axes);
        put(polygon[i + 1]!, plane, axes);
      }
    }
    parts.push({ key, cls: builder.cls, texture: builder.texture, vertexCount: vertex, data });
  }

  const wireframe = extractWireframe(analysis.polygons);
  const lines = writeLines(
    wireframe.edges.map(([a, b]) => [wireframe.vertices[a]!, wireframe.vertices[b]!]),
    index,
  );
  return { parts, lines, lineCount: wireframe.edges.length, aabb: analysis.aabb };
}

/** Line instances for a list of segments, all with the same index. */
export function writeLines(
  segments: readonly (readonly [Vec3, Vec3])[],
  index: number,
): ArrayBuffer {
  const data = new ArrayBuffer(segments.length * LINE_STRIDE);
  const floats = new Float32Array(data);
  const uints = new Uint32Array(data);
  segments.forEach(([a, b], i) => {
    const f = (i * LINE_STRIDE) / 4;
    floats.set(a, f);
    floats.set(b, f + 3);
    uints[f + 6] = index;
  });
  return data;
}

/** The half size of a point entity box until the entity definitions (P4.4). */
export const ENTITY_BOX_HALF = 8;

/** The "origin" property of an entity, or null when it is missing or broken. */
export function entityOrigin(props: readonly (readonly [string, string])[]): Vec3 | null {
  const value = props.find(([key]) => key === 'origin')?.[1];
  if (value === undefined) {
    return null;
  }
  const numbers = value.trim().split(/\s+/).map(Number);
  if (numbers.length !== 3 || numbers.some((n) => !Number.isFinite(n))) {
    return null;
  }
  return [numbers[0]!, numbers[1]!, numbers[2]!];
}

/** The twelve edges of an axis-aligned box. */
export function boxEdges(box: Aabb): [Vec3, Vec3][] {
  const corner = (i: number): Vec3 => [
    i & 1 ? box.max[0] : box.min[0],
    i & 2 ? box.max[1] : box.min[1],
    i & 4 ? box.max[2] : box.min[2],
  ];
  const edges: [Vec3, Vec3][] = [];
  for (let i = 0; i < 8; i++) {
    for (const bit of [1, 2, 4]) {
      if (!(i & bit)) {
        edges.push([corner(i), corner(i | bit)]);
      }
    }
  }
  return edges;
}

/** The box of a point entity around its origin. */
export function entityBox(origin: Vec3, half = ENTITY_BOX_HALF): Aabb {
  return {
    min: [origin[0] - half, origin[1] - half, origin[2] - half],
    max: [origin[0] + half, origin[1] + half, origin[2] + half],
  };
}
