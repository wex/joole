import type { Id, MapDocument, MapNode } from '@core/types/index';
import type { Patch } from '@core/types/index';

/**
 * Applies a patch immutably: the result shares every unchanged node with
 * the input document. A null entry in after removes the node, a null in
 * parentBefore means the node had no parent. Keeping the children arrays
 * of the affected parents in step is the command's responsibility, since
 * they are part of the node objects the patch carries.
 */
export function applyPatch(doc: Readonly<MapDocument>, patch: Patch): MapDocument {
  const nodes = new Map<Id, MapNode>(doc.nodes);
  for (const [id, node] of patch.after) {
    if (node === null) {
      nodes.delete(id);
    } else {
      nodes.set(id, node);
    }
  }
  const parent = new Map<Id, Id>(doc.parent);
  for (const [id, parentId] of patch.parentAfter) {
    if (parentId === null) {
      parent.delete(id);
    } else {
      parent.set(id, parentId);
    }
  }
  return { nodes, parent, worldspawn: doc.worldspawn };
}

/** The inverse of a patch, for undo: before and after are swapped. */
export function invertPatch(patch: Patch): Patch {
  return {
    before: patch.after,
    after: patch.before,
    parentBefore: patch.parentAfter,
    parentAfter: patch.parentBefore,
  };
}
