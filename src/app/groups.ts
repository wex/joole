import {
  addNodePatch,
  mergePatches,
  removeNodePatch,
  reparentNodePatch,
  replaceNodePatch,
  applyPatch,
} from '@core/doc/index';
import type { GroupNode, Id, MapDocument, Patch } from '@core/types/index';

/**
 * The patch that groups nodes under a new group below their common parent.
 * One composite patch: undo restores the flat structure in a single step.
 */
export function groupNodesPatch(
  doc: Readonly<MapDocument>,
  ids: readonly Id[],
  makeId: () => Id,
  name = 'group',
): { patch: Patch; id: Id } {
  if (ids.length === 0) throw new Error('nothing selected');
  const parents = new Set(ids.map((id) => doc.parent.get(id)));
  if (parents.size !== 1) throw new Error('the nodes must share one parent');
  const parentId = [...parents][0]!;
  const parent = doc.nodes.get(parentId);
  if (!parent || (parent.kind !== 'entity' && parent.kind !== 'group')) {
    throw new Error('the parent cannot hold a group');
  }
  const group: GroupNode = { kind: 'group', id: makeId(), name, props: [], children: [] };
  let composite = addNodePatch(doc, parentId, group);
  let working = applyPatch(doc, composite);
  for (const id of ids) {
    if (id === group.id) throw new Error('a group cannot contain itself');
    const step = reparentNodePatch(working, id, group.id);
    composite = mergePatches(composite, step);
    working = applyPatch(working, step);
  }
  return { patch: composite, id: group.id };
}

/**
 * The patch that dissolves a group: its children move to the group's parent
 * at the group's position, and the group node is removed. One undo step.
 */
export function ungroupNodesPatch(doc: Readonly<MapDocument>, groupId: Id): Patch {
  const group = doc.nodes.get(groupId);
  if (!group || group.kind !== 'group') throw new Error(`node ${groupId} is not a group`);
  const parentId = doc.parent.get(groupId);
  if (parentId === undefined) throw new Error('the group has no parent');
  let composite: Patch | null = null;
  let working = doc;
  for (const child of group.children) {
    const step = reparentNodePatch(working, child, parentId);
    composite = composite ? mergePatches(composite, step) : step;
    working = applyPatch(working, step);
  }
  const removal = removeNodePatch(working, groupId);
  composite = composite ? mergePatches(composite, removal) : removal;
  return composite;
}

/** The patch that sets or clears a group's hidden or locked flag. */
export function setGroupFlagPatch(
  doc: Readonly<MapDocument>,
  groupId: Id,
  flag: 'hidden' | 'locked',
  value: boolean,
): Patch {
  const group = doc.nodes.get(groupId);
  if (!group || group.kind !== 'group') throw new Error(`node ${groupId} is not a group`);
  const next: GroupNode = { ...group };
  if (value) {
    next[flag] = true;
  } else {
    delete next[flag];
  }
  return replaceNodePatch(doc, groupId, next);
}

/**
 * The effective hidden and locked state of a node: a node is hidden or
 * locked when any ancestor group is.
 */
export function effectiveGroupState(
  doc: Readonly<MapDocument>,
  id: Id,
): { hidden: boolean; locked: boolean } {
  let hidden = false;
  let locked = false;
  let at: Id | undefined = id;
  while (at !== undefined) {
    const node = doc.nodes.get(at);
    if (node?.kind === 'group') {
      if (node.hidden) hidden = true;
      if (node.locked) locked = true;
    }
    at = doc.parent.get(at);
  }
  return { hidden, locked };
}

/** Every descendant id of a node, including the node itself. */
export function subtreeIds(doc: Readonly<MapDocument>, id: Id): Id[] {
  const out: Id[] = [];
  const walk = (at: Id) => {
    out.push(at);
    const node = doc.nodes.get(at);
    if (node && (node.kind === 'entity' || node.kind === 'group')) {
      for (const child of node.children) walk(child);
    }
  };
  walk(id);
  return out;
}

/**
 * The outermost group containing `id` that lies below the scope (T1.13), or
 * null when the node is not in any visible group. A group inside the scope
 * group itself does not count: inside a group's scope its members are edited
 * as individuals. Locked or hidden groups make the hit unselectable.
 */
export function outermostGroupInScope(
  doc: Readonly<MapDocument>,
  id: Id,
  scopeId: Id | null,
): Id | null | 'locked' {
  const chain: Id[] = [];
  let at: Id | undefined = doc.parent.get(id);
  while (at !== undefined) {
    const node = doc.nodes.get(at);
    if (!node) break;
    if (at === scopeId) break;
    if (node.kind === 'group') chain.push(at);
    at = doc.parent.get(at);
  }
  if (chain.length === 0) return null;
  const outermost = chain[chain.length - 1]!;
  return effectiveGroupState(doc, outermost).locked || effectiveGroupState(doc, outermost).hidden
    ? 'locked'
    : outermost;
}
