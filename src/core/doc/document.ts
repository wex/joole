import { nanoid } from 'nanoid';
import type { BrushNode, EntityNode, Id, MapDocument, MapNode } from '@core/types/index';

/** Ids are nanoids and stay the same across saves. */
export function createId(): Id {
  return nanoid();
}

/**
 * Builds a consistent document from a node map: the parent map is derived
 * from the children arrays, and every node except the worldspawn must be
 * reachable.
 */
export function buildDocument(worldspawn: Id, nodes: Map<Id, MapNode>): MapDocument {
  const parent = new Map<Id, Id>();
  for (const node of nodes.values()) {
    if (node.kind === 'brush') {
      continue;
    }
    for (const child of node.children) {
      if (!nodes.has(child)) {
        throw new Error(`node ${node.id} lists missing child ${child}`);
      }
      if (parent.has(child)) {
        throw new Error(`node ${child} has more than one parent`);
      }
      parent.set(child, node.id);
    }
  }
  for (const id of nodes.keys()) {
    if (id !== worldspawn && !parent.has(id)) {
      throw new Error(`node ${id} is not reachable from the worldspawn`);
    }
  }
  return { nodes, parent, worldspawn };
}

/** An empty document: only the worldspawn entity. */
export function createEmptyDocument(): MapDocument {
  const worldspawn: EntityNode = {
    kind: 'entity',
    id: createId(),
    props: [['classname', 'worldspawn']],
    children: [],
  };
  return {
    nodes: new Map([[worldspawn.id, worldspawn]]),
    parent: new Map(),
    worldspawn: worldspawn.id,
  };
}

/** The direct children of a node, in order. Brushes have none. */
export function childrenOf(doc: Readonly<MapDocument>, id: Id): MapNode[] {
  const node = doc.nodes.get(id);
  if (!node || node.kind === 'brush') {
    return [];
  }
  return node.children.map((child) => doc.nodes.get(child)!);
}

/** The chain of ancestors from the immediate parent up to the worldspawn. */
export function ancestorsOf(doc: Readonly<MapDocument>, id: Id): MapNode[] {
  const chain: MapNode[] = [];
  let current = doc.parent.get(id);
  while (current !== undefined) {
    const node = doc.nodes.get(current);
    if (!node) {
      break;
    }
    chain.push(node);
    current = doc.parent.get(current);
  }
  return chain;
}

/** The direct brush children of an entity or group. */
export function brushesOf(doc: Readonly<MapDocument>, id: Id): BrushNode[] {
  return childrenOf(doc, id).filter((node): node is BrushNode => node.kind === 'brush');
}

/** Every descendant brush, for example all brushes inside a group. */
export function allBrushesOf(doc: Readonly<MapDocument>, id: Id): BrushNode[] {
  const out: BrushNode[] = [];
  for (const child of childrenOf(doc, id)) {
    if (child.kind === 'brush') {
      out.push(child);
    } else {
      out.push(...allBrushesOf(doc, child.id));
    }
  }
  return out;
}
