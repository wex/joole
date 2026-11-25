import type { Vec3 } from '@core/types/index';

/** A parsed md2 wireframe: unique triangle edges of frame 0 as point pairs. */
export interface Md2Wireframe {
  readonly edges: readonly (readonly [Vec3, Vec3])[];
  readonly bounds: { readonly min: Vec3; readonly max: Vec3 };
  readonly numTris: number;
  readonly numFrames: number;
}

const MD2_IDENT = 0x32504449; // 'IDP2' little-endian
const MD2_VERSION = 8;

/**
 * Parses an md2 model (Quake 2 `IDP2`, version 8) and extracts frame 0 as a
 * wireframe of unique triangle edges, the form Qoole draws in the editor.
 * Throws on malformed data; the format has no partial results.
 */
export function parseMd2(buffer: ArrayBuffer): Md2Wireframe {
  const view = new DataView(buffer);
  if (view.byteLength < 68) throw new Error('md2 too small for the header');
  if (view.getInt32(0, true) !== MD2_IDENT) throw new Error('not an md2: bad ident');
  if (view.getInt32(4, true) !== MD2_VERSION) throw new Error('unsupported md2 version');
  const numXyz = view.getInt32(24, true);
  const numTris = view.getInt32(36, true);
  const numFrames = view.getInt32(44, true);
  const ofsTris = view.getInt32(56, true);
  const ofsFrames = view.getInt32(60, true);
  const frameSize = view.getInt32(16, true);
  if (numXyz <= 0 || numTris <= 0 || numFrames <= 0) throw new Error('md2 has no geometry');
  if (ofsFrames + frameSize > view.byteLength) throw new Error('md2 frame data truncated');

  // Frame 0: scale, translate, then numXyz compressed vertices.
  const scale: Vec3 = [
    view.getFloat32(ofsFrames, true),
    view.getFloat32(ofsFrames + 4, true),
    view.getFloat32(ofsFrames + 8, true),
  ];
  const translate: Vec3 = [
    view.getFloat32(ofsFrames + 12, true),
    view.getFloat32(ofsFrames + 16, true),
    view.getFloat32(ofsFrames + 20, true),
  ];
  // The frame name occupies 16 bytes after translate; vertices follow.
  const vertexBase = ofsFrames + 40;
  const bytes = new Uint8Array(buffer);
  const verts: Vec3[] = [];
  for (let i = 0; i < numXyz; i++) {
    const at = vertexBase + i * 4;
    if (at + 4 > view.byteLength) throw new Error('md2 vertices truncated');
    verts.push([
      bytes[at]! * scale[0] + translate[0],
      bytes[at + 1]! * scale[1] + translate[1],
      bytes[at + 2]! * scale[2] + translate[2],
    ]);
  }

  // Triangles: 3 vertex indices then 3 uv indices, all uint16.
  if (ofsTris + numTris * 12 > view.byteLength) throw new Error('md2 triangles truncated');
  const edgeSet = new Set<string>();
  const edges: (readonly [Vec3, Vec3])[] = [];
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const v of verts) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis]!, v[axis]!);
      max[axis] = Math.max(max[axis]!, v[axis]!);
    }
  }
  const addEdge = (a: number, b: number) => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push([verts[a]!, verts[b]!]);
  };
  for (let t = 0; t < numTris; t++) {
    const at = ofsTris + t * 12;
    const a = view.getUint16(at, true);
    const b = view.getUint16(at + 2, true);
    const c = view.getUint16(at + 4, true);
    if (a >= numXyz || b >= numXyz || c >= numXyz) throw new Error('md2 index out of range');
    addEdge(a, b);
    addEdge(b, c);
    addEdge(c, a);
  }
  return { edges, bounds: { min, max }, numTris, numFrames };
}
