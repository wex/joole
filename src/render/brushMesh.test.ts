import { describe, expect, it } from 'vitest';
import { texAxes } from '@core/geom/index';
import { expectVec, makeBox, testTex } from '@core/geom/__tests__/helpers';
import type { BrushNode, Vec3 } from '@core/types/index';
import {
  SURF_NODRAW,
  SURF_SKY,
  SURF_TRANS33,
  SURF_TRANS66,
  CONTENTS_PLAYERCLIP,
} from '@game/q2/index';
import {
  batchKey,
  boxEdges,
  buildBrushMesh,
  classifyFace,
  entityBox,
  entityOrigin,
  FACE_STRIDE,
  LINE_STRIDE,
} from './brushMesh';

function readVertex(data: ArrayBuffer, i: number) {
  const floats = new Float32Array(data);
  const bytes = new Int8Array(data);
  const uints = new Uint32Array(data);
  const f = (i * FACE_STRIDE) / 4;
  return {
    position: [floats[f]!, floats[f + 1]!, floats[f + 2]!] as Vec3,
    uv: [floats[f + 3]!, floats[f + 4]!],
    normal: [
      bytes[i * FACE_STRIDE + 20]!,
      bytes[i * FACE_STRIDE + 21]!,
      bytes[i * FACE_STRIDE + 22]!,
    ],
    index: uints[f + 6]!,
  };
}

describe('classifyFace', () => {
  it('maps surface flags and clip contents to draw classes', () => {
    expect(classifyFace({ flags: 0, contents: 1 })).toBe('opaque');
    expect(classifyFace({ flags: SURF_SKY, contents: 0 })).toBe('sky');
    expect(classifyFace({ flags: SURF_TRANS33, contents: 0 })).toBe('trans33');
    expect(classifyFace({ flags: SURF_TRANS66, contents: 0 })).toBe('trans66');
    expect(classifyFace({ flags: SURF_NODRAW | SURF_SKY, contents: 0 })).toBe('tool');
    expect(classifyFace({ flags: 0, contents: CONTENTS_PLAYERCLIP })).toBe('tool');
  });
});

describe('buildBrushMesh', () => {
  const cube = makeBox([0, 0, 0], [64, 64, 64]);

  it('fan-triangulates six quads into one batch of 36 vertices with 12 edges', () => {
    const mesh = buildBrushMesh(cube, 7);
    expect(mesh.parts).toHaveLength(1);
    expect(mesh.parts[0]!.key).toBe(batchKey('opaque', 'e2u1/mine10_1'));
    expect(mesh.parts[0]!.vertexCount).toBe(36);
    expect(mesh.parts[0]!.data.byteLength).toBe(36 * FACE_STRIDE);
    expect(mesh.lineCount).toBe(12);
    expect(mesh.lines.byteLength).toBe(12 * LINE_STRIDE);
    expectVec(mesh.aabb!.min, [0, 0, 0]);
    expectVec(mesh.aabb!.max, [64, 64, 64]);
  });

  it('every triangle is counter-clockwise seen from outside, with the face normal and the index', () => {
    const { data, vertexCount } = buildBrushMesh(cube, 7).parts[0]!;
    for (let i = 0; i < vertexCount; i += 3) {
      const a = readVertex(data, i);
      const b = readVertex(data, i + 1);
      const c = readVertex(data, i + 2);
      const u = [
        b.position[0] - a.position[0],
        b.position[1] - a.position[1],
        b.position[2] - a.position[2],
      ];
      const v = [
        c.position[0] - a.position[0],
        c.position[1] - a.position[1],
        c.position[2] - a.position[2],
      ];
      const n = [
        u[1]! * v[2]! - u[2]! * v[1]!,
        u[2]! * v[0]! - u[0]! * v[2]!,
        u[0]! * v[1]! - u[1]! * v[0]!,
      ];
      const dotNormal = n[0]! * a.normal[0]! + n[1]! * a.normal[1]! + n[2]! * a.normal[2]!;
      expect(dotNormal).toBeGreaterThan(0);
      expect(Math.max(...a.normal.map(Math.abs))).toBe(127);
      expect(a.index).toBe(7);
    }
  });

  it('the UVs are qbsp3 texel coordinates from texAxes', () => {
    const tex = { ...testTex(), offset: [16, 8] as [number, number], rotation: 90 };
    const brush: BrushNode = { ...cube, faces: cube.faces.map((face) => ({ ...face, tex })) };
    const { data, vertexCount } = buildBrushMesh(brush, 0).parts[0]!;
    for (let i = 0; i < vertexCount; i++) {
      const vertex = readVertex(data, i);
      const n: Vec3 = [vertex.normal[0]! / 127, vertex.normal[1]! / 127, vertex.normal[2]! / 127];
      const axes = texAxes({ n, d: 0 }, tex);
      const p = vertex.position;
      expect(vertex.uv[0]).toBeCloseTo(
        p[0] * axes.s[0] + p[1] * axes.s[1] + p[2] * axes.s[2] + 16,
        4,
      );
      expect(vertex.uv[1]).toBeCloseTo(
        p[0] * axes.t[0] + p[1] * axes.t[1] + p[2] * axes.t[2] + 8,
        4,
      );
    }
  });

  it('splits faces into one part per class and texture', () => {
    const brush: BrushNode = {
      ...cube,
      faces: cube.faces.map((face, i) => ({
        ...face,
        tex: { ...face.tex, name: i < 2 ? 'sky1' : 'wall', flags: i < 2 ? SURF_SKY : 0 },
      })),
    };
    const parts = buildBrushMesh(brush, 0).parts;
    expect(parts.map((part) => [part.cls, part.texture, part.vertexCount]).sort()).toEqual([
      ['opaque', 'wall', 24],
      ['sky', 'sky1', 12],
    ]);
  });
});

describe('point entities', () => {
  it('parses the origin property', () => {
    expect(entityOrigin([['origin', '160 32 -32.5']])).toEqual([160, 32, -32.5]);
    expect(entityOrigin([['angle', '90']])).toBeNull();
    expect(entityOrigin([['origin', '1 2']])).toBeNull();
    expect(entityOrigin([['origin', '1 x 2']])).toBeNull();
  });

  it('draws a box of twelve distinct axis-aligned edges', () => {
    const edges = boxEdges(entityBox([0, 0, 0]));
    expect(edges).toHaveLength(12);
    const keys = new Set(edges.map(([a, b]) => `${a.join()}|${b.join()}`));
    expect(keys.size).toBe(12);
    for (const [a, b] of edges) {
      const differing = [0, 1, 2].filter((i) => a[i] !== b[i]);
      expect(differing).toHaveLength(1);
      expect(Math.abs(b[differing[0]!]! - a[differing[0]!]!)).toBe(16);
    }
  });
});
