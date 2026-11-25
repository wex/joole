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

/**
 * Composes two consecutive patches into one history patch. `first` is the
 * older patch and `second` starts from the document produced by it. This is
 * used only for mergeKey collapsing; renderer notifications still receive the
 * incremental second patch.
 */
export function mergePatches(first: Patch, second: Patch): Patch {
  function merged<A>(a: Map<Id, A>, b: Map<Id, A>): Map<Id, A> {
    const out = new Map<Id, A>();
    for (const id of new Set([...a.keys(), ...b.keys()])) {
      out.set(id, a.has(id) ? a.get(id)! : b.get(id)!);
    }
    return out;
  }

  function mergedAfter<A>(a: Map<Id, A>, b: Map<Id, A>): Map<Id, A> {
    const out = new Map<Id, A>();
    for (const id of new Set([...a.keys(), ...b.keys()])) {
      out.set(id, b.has(id) ? b.get(id)! : a.get(id)!);
    }
    return out;
  }

  return {
    before: merged(first.before, second.before),
    after: mergedAfter(first.after, second.after),
    parentBefore: merged(first.parentBefore, second.parentBefore),
    parentAfter: mergedAfter(first.parentAfter, second.parentAfter),
  };
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
