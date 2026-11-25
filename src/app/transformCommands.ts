import type { BrushNode, Command, Id, MapDocument, MapNode, Patch } from '@core/types/index';
import { allBrushesOf, replaceNodePatch } from '@core/doc/index';
import { snapBrushToGrid, transformBrush, type Mat4 } from '@core/geom/index';

function emptyPatch(): Patch {
  return {
    before: new Map(),
    after: new Map(),
    parentBefore: new Map(),
    parentAfter: new Map(),
  };
}

function mergeIndependent(into: Patch, patch: Patch): void {
  for (const [id, node] of patch.before) into.before.set(id, node);
  for (const [id, node] of patch.after) into.after.set(id, node);
  for (const [id, node] of patch.parentBefore) into.parentBefore.set(id, node);
  for (const [id, node] of patch.parentAfter) into.parentAfter.set(id, node);
}

/** Brush descendants of the requested nodes, deduplicated when a group and its child are both selected. */
export function brushTargets(doc: Readonly<MapDocument>, ids: readonly Id[]): BrushNode[] {
  const out = new Map<Id, BrushNode>();
  for (const id of ids) {
    const node: MapNode | undefined = doc.nodes.get(id);
    if (!node) {
      continue;
    }
    if (node.kind === 'brush') {
      out.set(id, node);
    } else {
      for (const brush of allBrushesOf(doc, id)) {
        out.set(brush.id, brush);
      }
    }
  }
  return [...out.values()];
}

/**
 * Creates a move/rotate/scale command. Groups are expanded to their
 * descendant brushes because the document has no local transform matrices.
 */
export function createTransformCommand(
  label: string,
  ids: readonly Id[],
  matrix: Mat4,
  mergeKey?: string,
): Command {
  return {
    label,
    mergeKey,
    run(doc) {
      const patch = emptyPatch();
      for (const brush of brushTargets(doc, ids)) {
        const result = transformBrush(brush, matrix);
        if (!result.ok) {
          throw new Error(`${label} would make brush ${brush.id} invalid`);
        }
        mergeIndependent(patch, replaceNodePatch(doc, brush.id, result.value));
      }
      return patch;
    },
  };
}

/** Explicit snap command; there is deliberately no automatic rounding after rotations. */
export function createSnapToGridCommand(ids: readonly Id[], grid: number): Command {
  return {
    label: 'Snap to grid',
    run(doc) {
      const patch = emptyPatch();
      for (const brush of brushTargets(doc, ids)) {
        const result = snapBrushToGrid(brush, grid);
        if (!result.ok) {
          throw new Error(`Snap to grid would make brush ${brush.id} invalid`);
        }
        mergeIndependent(patch, replaceNodePatch(doc, brush.id, result.value));
      }
      return patch;
    },
  };
}
