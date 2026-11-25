import type { BrushNode, Id, MapDocument, MapNode, Patch } from '@core/types/index';
import type { FaceRef } from './textureOps';

export type TriState = 'on' | 'off' | 'mixed';

export interface SurfaceState {
  /** Per-bit tri-state over the target faces, keyed by the bit value. */
  readonly flags: ReadonlyMap<number, TriState>;
  readonly contents: ReadonlyMap<number, TriState>;
  /** The common light value, or 'mixed' when the faces differ. */
  readonly value: number | 'mixed';
  /** Whether every target face carries its attributes in the file. */
  readonly attribsInFile: boolean;
}

function tri(bits: readonly (number | undefined)[], bit: number): TriState {
  let on = 0;
  let count = 0;
  for (const bitsOfFace of bits) {
    if (bitsOfFace === undefined) continue;
    count++;
    if ((bitsOfFace & bit) !== 0) on++;
  }
  if (count === 0 || on === 0) return 'off';
  return on === count ? 'on' : 'mixed';
}

/** Reads the combined surface state of the target faces for the panel. */
export function readSurfaceState(
  doc: Readonly<MapDocument>,
  faces: readonly FaceRef[],
  flagBits: readonly number[],
  contentBits: readonly number[],
): SurfaceState {
  const brushes: BrushNode[] = [];
  const faceIndices: number[] = [];
  for (const ref of faces) {
    const node = doc.nodes.get(ref.brush);
    if (node?.kind === 'brush' && ref.face >= 0 && ref.face < node.faces.length) {
      brushes.push(node);
      faceIndices.push(ref.face);
    }
  }
  const flagValues = brushes.map((brush, i) => brush.faces[faceIndices[i]!]?.tex.flags);
  const contentValues = brushes.map((brush, i) => brush.faces[faceIndices[i]!]?.tex.contents);
  const values = brushes.map((brush, i) => brush.faces[faceIndices[i]!]?.tex.value);
  const flags = new Map<number, TriState>();
  for (const bit of flagBits) flags.set(bit, tri(flagValues, bit));
  const contents = new Map<number, TriState>();
  for (const bit of contentBits) contents.set(bit, tri(contentValues, bit));
  const defined = values.filter((v): v is number => v !== undefined);
  const value =
    defined.length === 0
      ? 0
      : defined.every((v) => v === defined[0])
        ? defined[0]!
        : ('mixed' as const);
  return {
    flags,
    contents,
    value,
    attribsInFile:
      brushes.length > 0 &&
      brushes.every((brush, i) => brush.faces[faceIndices[i]!]?.tex.attribsInFile === true),
  };
}

function record(patch: Patch, id: Id, before: MapNode | null, after: MapNode | null): void {
  patch.before.set(id, before);
  patch.after.set(id, after);
}

/**
 * Builds a patch editing surface attributes of the given faces. Editing marks
 * the face's `attribsInFile`, because an edited attribute must be written to
 * the `.map` even when the file the face came from omitted it.
 */
export function editSurfacePatch(
  doc: Readonly<MapDocument>,
  faces: readonly FaceRef[],
  edit: (tex: { contents: number; flags: number; value: number }) => {
    contents: number;
    flags: number;
    value: number;
  },
): Patch | null {
  const byBrush = new Map<Id, Map<number, { contents: number; flags: number; value: number }>>();
  for (const ref of faces) {
    const brush = doc.nodes.get(ref.brush);
    if (brush?.kind !== 'brush' || ref.face < 0 || ref.face >= brush.faces.length) {
      continue;
    }
    if (!byBrush.has(ref.brush)) byBrush.set(ref.brush, new Map());
    const edits = byBrush.get(ref.brush)!;
    if (!edits.has(ref.face)) {
      const tex = brush.faces[ref.face]!.tex;
      edits.set(ref.face, edit({ contents: tex.contents, flags: tex.flags, value: tex.value }));
    }
  }
  if (byBrush.size === 0) return null;
  const patch: Patch = {
    before: new Map(),
    after: new Map(),
    parentBefore: new Map(),
    parentAfter: new Map(),
  };
  for (const [id, edits] of byBrush) {
    const brush = doc.nodes.get(id) as BrushNode;
    const next: BrushNode = {
      ...brush,
      faces: brush.faces.map((face, i) =>
        edits.has(i)
          ? { ...face, tex: { ...face.tex, ...edits.get(i)!, attribsInFile: true } }
          : face,
      ),
    };
    record(patch, id, brush, next);
  }
  return patch;
}

/** Toggles one bit on the target faces: on if any face has it off, else off. */
export function toggleBitPatch(
  doc: Readonly<MapDocument>,
  faces: readonly FaceRef[],
  field: 'flags' | 'contents',
  bit: number,
): Patch | null {
  const state = readSurfaceState(
    doc,
    faces,
    field === 'flags' ? [bit] : [],
    field === 'contents' ? [bit] : [],
  );
  const current = (field === 'flags' ? state.flags : state.contents).get(bit) ?? 'off';
  const turnOn = current !== 'on';
  return editSurfacePatch(doc, faces, (tex) => ({
    ...tex,
    [field]: turnOn ? tex[field] | bit : tex[field] & ~bit,
  }));
}
