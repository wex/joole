import {
  addNodePatch,
  applyPatch,
  createEmptyDocument,
  mergePatches,
  removeNodePatch,
} from '@core/doc/index';
import { parseMap, writeMap } from '@core/formats/index';
import type { BrushNode, Face, Id, MapDocument, Patch, Vec3 } from '@core/types/index';
import { createId } from '@core/doc/index';

function brushesIn(root: Readonly<MapDocument>): BrushNode[] {
  return [...root.nodes.values()].filter((node): node is BrushNode => node.kind === 'brush');
}

/** Serialises the selected brushes as a full-precision .map snippet. */
export function selectionToMapText(
  doc: Readonly<MapDocument>,
  selection: ReadonlySet<Id>,
): string | null {
  let out = createEmptyDocument();
  let count = 0;
  for (const id of selection) {
    const node = doc.nodes.get(id);
    if (node?.kind !== 'brush') continue;
    out = applyPatch(out, addNodePatch(out, out.worldspawn, node));
    count++;
  }
  return count === 0 ? null : writeMap(out, { mode: 'clipboard' }).text;
}

function movedBrush(brush: BrushNode, delta: Vec3): BrushNode {
  return {
    ...brush,
    id: createId(),
    faces: brush.faces.map((face) => ({
      ...face,
      points: face.points.map((p) => [
        p[0] + delta[0],
        p[1] + delta[1],
        p[2] + delta[2],
      ]) as Face['points'],
    })),
  };
}

/** Removes the selected nodes as one undoable patch. */
export function removeSelectionPatch(
  doc: Readonly<MapDocument>,
  selection: ReadonlySet<Id>,
): Patch | null {
  let patch: Patch | null = null;
  let working = doc;
  for (const id of selection) {
    if (!working.nodes.has(id) || id === working.worldspawn) continue;
    const effective: Patch = removeNodePatch(working, id);
    patch = patch ? mergePatches(patch, effective) : effective;
    working = applyPatch(working, effective);
  }
  return patch;
}

export interface PasteResult {
  readonly patch: Patch | null;
  readonly ids: Id[];
}

/** Parses a .map snippet and adds its brushes to worldspawn with fresh ids. */
export function mapTextToPastePatch(
  doc: Readonly<MapDocument>,
  text: string,
  offset: Vec3 = [0, 0, 0],
  parent: Id | null = null,
): PasteResult {
  const parsed = parseMap(text);
  let patch: Patch | null = null;
  let working = doc;
  const ids: Id[] = [];
  const target = parent ?? doc.worldspawn;
  for (const source of brushesIn(parsed)) {
    const brush = movedBrush(source, offset);
    const effective: Patch = addNodePatch(working, target, brush);
    patch = patch ? mergePatches(patch, effective) : effective;
    working = applyPatch(working, effective);
    ids.push(brush.id);
  }
  return { patch, ids };
}
