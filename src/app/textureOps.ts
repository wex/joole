import type { BrushNode, FaceTexture, Id, MapDocument, MapNode, Patch } from '@core/types/index';
import { analyzeBrush } from '@core/geom/brush';
import { allBrushesOf } from '@core/doc/index';
import { texAxes } from '@core/geom/texAxes';
import { dot } from '@core/geom/vec3';

/** A face of a brush, the target of the texture tools. */
export interface FaceRef {
  readonly brush: Id;
  readonly face: number;
}

function emptyPatch(): Patch {
  return {
    before: new Map(),
    after: new Map(),
    parentBefore: new Map(),
    parentAfter: new Map(),
  };
}

function record(patch: Patch, id: Id, before: MapNode | null, after: MapNode | null): void {
  patch.before.set(id, before);
  patch.after.set(id, after);
}

/**
 * Builds a patch editing the texture parameters of the given faces. Faces of
 * one brush are edited together so the brush node is copied once.
 */
export function editTexturePatch(
  doc: Readonly<MapDocument>,
  faces: readonly FaceRef[],
  edit: (tex: FaceTexture, brush: BrushNode, faceIndex: number) => FaceTexture,
): Patch | null {
  const byBrush = new Map<Id, Map<number, FaceTexture>>();
  for (const ref of faces) {
    const brush = doc.nodes.get(ref.brush);
    if (brush?.kind !== 'brush' || ref.face < 0 || ref.face >= brush.faces.length) {
      continue;
    }
    if (!byBrush.has(ref.brush)) {
      byBrush.set(ref.brush, new Map());
    }
    const edits = byBrush.get(ref.brush)!;
    if (!edits.has(ref.face)) {
      edits.set(ref.face, edit(brush.faces[ref.face]!.tex, brush, ref.face));
    }
  }
  if (byBrush.size === 0) {
    return null;
  }
  const patch = emptyPatch();
  for (const [id, edits] of byBrush) {
    const brush = doc.nodes.get(id) as BrushNode;
    const next: BrushNode = {
      ...brush,
      faces: brush.faces.map((face, i) => (edits.has(i) ? { ...face, tex: edits.get(i)! } : face)),
    };
    record(patch, id, brush, next);
  }
  return patch;
}

/** Expands a selection to brush ids: brushes themselves plus the descendants of groups and entities. */
export function expandBrushIds(doc: Readonly<MapDocument>, ids: Iterable<Id>): Id[] {
  const out = new Set<Id>();
  for (const id of ids) {
    const node = doc.nodes.get(id);
    if (!node) continue;
    if (node.kind === 'brush') {
      out.add(id);
    } else {
      for (const brush of allBrushesOf(doc, id)) {
        out.add(brush.id);
      }
    }
  }
  return [...out];
}

/** Every face of the given brushes. */
export function allFacesOf(doc: Readonly<MapDocument>, brushIds: Iterable<Id>): FaceRef[] {
  const out: FaceRef[] = [];
  for (const id of brushIds) {
    const node = doc.nodes.get(id);
    if (node?.kind !== 'brush') continue;
    for (let i = 0; i < node.faces.length; i++) {
      out.push({ brush: id, face: i });
    }
  }
  return out;
}

/** Sets the texture name, keeping offsets, rotation and scale. */
export function applyTexturePatch(
  doc: Readonly<MapDocument>,
  faces: readonly FaceRef[],
  name: string,
): Patch | null {
  return editTexturePatch(doc, faces, (tex) => ({ ...tex, name }));
}

/** Shifts the texture offsets, staying in qbsp3's integer form. */
export function shiftTexturePatch(
  doc: Readonly<MapDocument>,
  faces: readonly FaceRef[],
  ds: number,
  dt: number,
): Patch | null {
  return editTexturePatch(doc, faces, (tex) => ({
    ...tex,
    offset: [Math.round(tex.offset[0] + ds), Math.round(tex.offset[1] + dt)],
  }));
}

/** Rotates the texture in the face plane, quantised to integer degrees. */
export function rotateTexturePatch(
  doc: Readonly<MapDocument>,
  faces: readonly FaceRef[],
  degrees: number,
): Patch | null {
  return editTexturePatch(doc, faces, (tex) => ({
    ...tex,
    rotation: Math.round(tex.rotation + degrees),
  }));
}

/** Resets offsets, rotation and scale to the defaults, keeping the texture name. */
export function resetTexturePatch(
  doc: Readonly<MapDocument>,
  faces: readonly FaceRef[],
): Patch | null {
  return editTexturePatch(doc, faces, (tex) => ({
    ...tex,
    offset: [0, 0],
    rotation: 0,
    scale: [1, 1],
  }));
}

function texelRange(
  brush: BrushNode,
  faceIndex: number,
  scale: readonly [number, number],
): { minS: number; maxS: number; minT: number; maxT: number } | null {
  const polygon = analyzeBrush(brush).polygons[faceIndex];
  const face = brush.faces[faceIndex];
  if (!polygon || !face) return null;
  const probe = {
    offset: [0, 0] as [number, number],
    rotation: 0,
    scale: scale as [number, number],
  };
  const plane = analyzeBrush(brush).planes[faceIndex];
  if (!plane) return null;
  const axes = texAxes(plane, probe);
  let minS = Infinity;
  let maxS = -Infinity;
  let minT = Infinity;
  let maxT = -Infinity;
  for (const v of polygon) {
    minS = Math.min(minS, dot(v, axes.s));
    maxS = Math.max(maxS, dot(v, axes.s));
    minT = Math.min(minT, dot(v, axes.t));
    maxT = Math.max(maxT, dot(v, axes.t));
  }
  return { minS, maxS, minT, maxT };
}

/**
 * Fit: scales the texture so it covers the face exactly once in both
 * dimensions and aligns its origin to the face corner, with rotation reset.
 * The texture size is needed because texel units are pre-division.
 */
export function fitTexturePatch(
  doc: Readonly<MapDocument>,
  faces: readonly FaceRef[],
  textureWidth: number,
  textureHeight: number,
): Patch | null {
  return editTexturePatch(doc, faces, (tex, brush, faceIndex) => {
    const range = texelRange(brush, faceIndex, [1, 1]);
    if (!range) return tex;
    const width = range.maxS - range.minS;
    const height = range.maxT - range.minT;
    if (width < 1e-9 || height < 1e-9) return tex;
    const scaleS = width / textureWidth;
    const scaleT = height / textureHeight;
    return {
      ...tex,
      rotation: 0,
      scale: [scaleS, scaleT],
      offset: [Math.round(-range.minS / scaleS), Math.round(-range.minT / scaleT)],
    };
  });
}

export type JustifyEdge = 'left' | 'right' | 'top' | 'bottom';

/** Justify: aligns one edge of the texture with the face's edge in texture space. */
export function justifyTexturePatch(
  doc: Readonly<MapDocument>,
  faces: readonly FaceRef[],
  edge: JustifyEdge,
  textureWidth: number,
  textureHeight: number,
): Patch | null {
  return editTexturePatch(doc, faces, (tex, brush, faceIndex) => {
    const range = texelRange(brush, faceIndex, tex.scale);
    if (!range) return tex;
    const offset = [...tex.offset] as [number, number];
    if (edge === 'left') {
      offset[0] = Math.round(tex.offset[0] - (range.minS + tex.offset[0]));
    } else if (edge === 'right') {
      offset[0] = Math.round(tex.offset[0] + textureWidth - (range.maxS + tex.offset[0]));
    } else if (edge === 'top') {
      offset[1] = Math.round(tex.offset[1] - (range.minT + tex.offset[1]));
    } else {
      offset[1] = Math.round(tex.offset[1] + textureHeight - (range.maxT + tex.offset[1]));
    }
    return { ...tex, offset };
  });
}
