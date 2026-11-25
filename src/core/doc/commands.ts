import type { EntityNode, GroupNode, Id, MapDocument, MapNode, Patch } from '@core/types/index';

type ContainerNode = EntityNode | GroupNode;

function isContainer(node: MapNode | undefined): node is ContainerNode {
  return node !== undefined && node.kind !== 'brush';
}

function requireContainer(doc: Readonly<MapDocument>, id: Id, role: string): ContainerNode {
  const node = doc.nodes.get(id);
  if (!node) {
    throw new Error(`${role} node ${id} does not exist`);
  }
  if (!isContainer(node)) {
    throw new Error(`${role} node ${id} cannot have children`);
  }
  return node;
}

function requireNode(doc: Readonly<MapDocument>, id: Id): MapNode {
  const node = doc.nodes.get(id);
  if (!node) {
    throw new Error(`node ${id} does not exist`);
  }
  return node;
}

function withChildren<T extends ContainerNode>(node: T, children: Id[]): T {
  return { ...node, children };
}

function insertChild(children: readonly Id[], child: Id, index?: number): Id[] {
  const at = index === undefined ? children.length : Math.max(0, Math.min(index, children.length));
  return [...children.slice(0, at), child, ...children.slice(at)];
}

function emptyPatch(): Patch {
  return {
    before: new Map(),
    after: new Map(),
    parentBefore: new Map(),
    parentAfter: new Map(),
  };
}

function recordNode(patch: Patch, id: Id, before: MapNode | null, after: MapNode | null): void {
  patch.before.set(id, before);
  patch.after.set(id, after);
}

function descendantIds(doc: Readonly<MapDocument>, id: Id): Id[] {
  const out: Id[] = [];
  const visit = (nodeId: Id) => {
    const node = doc.nodes.get(nodeId);
    if (!node) {
      return;
    }
    out.push(nodeId);
    if (node.kind !== 'brush') {
      for (const child of node.children) {
        visit(child);
      }
    }
  };
  visit(id);
  return out;
}

/**
 * Adds a new node below a container. The node itself must be new; a container
 * with children is rejected because moving an existing subtree is reparenting,
 * and adding a multi-node subtree needs one patch built by its caller.
 */
export function addNodePatch(
  doc: Readonly<MapDocument>,
  parentId: Id,
  node: MapNode,
  index?: number,
): Patch {
  const parent = requireContainer(doc, parentId, 'parent');
  if (doc.nodes.has(node.id)) {
    throw new Error(`node ${node.id} already exists`);
  }
  if (node.kind !== 'brush' && node.children.length > 0) {
    throw new Error(`node ${node.id} cannot be added with existing children`);
  }
  const patch = emptyPatch();
  recordNode(patch, node.id, null, node);
  recordNode(
    patch,
    parentId,
    parent,
    withChildren(parent, insertChild(parent.children, node.id, index)),
  );
  patch.parentBefore.set(node.id, null);
  patch.parentAfter.set(node.id, parentId);
  return patch;
}

/** Removes a node and every descendant from the document tree. */
export function removeNodePatch(doc: Readonly<MapDocument>, id: Id): Patch {
  if (id === doc.worldspawn) {
    throw new Error('the worldspawn cannot be removed');
  }
  requireNode(doc, id);
  const parentId = doc.parent.get(id);
  if (parentId === undefined) {
    throw new Error(`node ${id} has no parent`);
  }
  const parent = requireContainer(doc, parentId, 'parent');
  const patch = emptyPatch();
  for (const removed of descendantIds(doc, id)) {
    recordNode(patch, removed, requireNode(doc, removed), null);
    patch.parentBefore.set(removed, doc.parent.get(removed) ?? null);
    patch.parentAfter.set(removed, null);
  }
  recordNode(
    patch,
    parentId,
    parent,
    withChildren(
      parent,
      parent.children.filter((child) => child !== id),
    ),
  );
  return patch;
}

/** Replaces one node object in place. The replacement keeps the same id. */
export function replaceNodePatch(doc: Readonly<MapDocument>, id: Id, replacement: MapNode): Patch {
  const before = requireNode(doc, id);
  if (replacement.id !== id) {
    throw new Error(`replacement id ${replacement.id} does not match ${id}`);
  }
  if (replacement.kind !== before.kind) {
    throw new Error(
      `replacement cannot change node ${id} from ${before.kind} to ${replacement.kind}`,
    );
  }
  if (before.kind !== 'brush' && replacement.kind !== 'brush') {
    const sameChildren =
      before.children.length === replacement.children.length &&
      before.children.every((child, index) => child === replacement.children[index]);
    if (!sameChildren) {
      throw new Error(`replacement cannot change the children of node ${id}; use reparenting`);
    }
  }
  const patch = emptyPatch();
  recordNode(patch, id, before, replacement);
  return patch;
}

/**
 * Moves a node below another container. The same container may be used to
 * reorder the node. Moving a container below itself or one of its descendants
 * is rejected because it would create a cycle.
 */
export function reparentNodePatch(
  doc: Readonly<MapDocument>,
  id: Id,
  newParentId: Id,
  index?: number,
): Patch {
  if (id === doc.worldspawn) {
    throw new Error('the worldspawn cannot be reparented');
  }
  const node = requireNode(doc, id);
  const newParent = requireContainer(doc, newParentId, 'parent');
  if (id === newParentId || descendantIds(doc, id).includes(newParentId)) {
    throw new Error(`node ${newParentId} is ${id} or its descendant`);
  }
  const oldParentId = doc.parent.get(id);
  if (oldParentId === undefined) {
    throw new Error(`node ${id} has no parent`);
  }
  const oldParent = requireContainer(doc, oldParentId, 'parent');
  const patch = emptyPatch();
  const without = oldParent.children.filter((child) => child !== id);
  if (oldParentId === newParentId) {
    recordNode(
      patch,
      oldParentId,
      oldParent,
      withChildren(oldParent, insertChild(without, id, index)),
    );
  } else {
    recordNode(patch, oldParentId, oldParent, withChildren(oldParent, without));
    recordNode(
      patch,
      newParentId,
      newParent,
      withChildren(newParent, insertChild(newParent.children, id, index)),
    );
  }
  patch.parentBefore.set(id, oldParentId);
  patch.parentAfter.set(id, newParentId);
  // The moved node object itself is unchanged; containers carry the tree edit.
  void node;
  return patch;
}
