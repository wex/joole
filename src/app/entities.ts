import { addNodePatch, createId, mergePatches, reparentNodePatch, applyPatch } from '@core/doc/index';
import type { EntityNode, Id, MapDocument, Patch, Vec3 } from '@core/types/index';

/** Reads one property of an entity. */
export function entityProp(node: EntityNode, key: string): string | undefined {
  return node.props.find(([k]) => k === key)?.[1];
}

/** Writes one property of an entity, keeping the position of existing keys. */
export function withEntityProp(node: EntityNode, key: string, value: string): EntityNode {
  const index = node.props.findIndex(([k]) => k === key);
  const props: [string, string][] = node.props.filter(([k]) => k !== key);
  props.splice(index < 0 ? props.length : Math.min(index, props.length), 0, [key, value]);
  return { ...node, props };
}

/**
 * The patch that places a point entity at a world point, as a child of the
 * given parent. The origin is written in the .map's canonical integer form.
 */
export function createPointEntityPatch(
  doc: Readonly<MapDocument>,
  classname: string,
  point: Vec3,
  parent: Id,
): { patch: Patch; id: Id } {
  if (!/^[A-Za-z0-9_]+$/.test(classname)) throw new Error(`invalid classname ${classname}`);
  const entity: EntityNode = {
    kind: 'entity',
    id: createId(),
    props: [
      ['classname', classname],
      ['origin', point.map((value) => String(value === 0 ? 0 : value)).join(' ')],
    ],
    children: [],
  };
  return { patch: addNodePatch(doc, parent, entity), id: entity.id };
}

/**
 * The patch that turns brushes into a brush entity (func_*, trigger_*): a
 * new entity is created below the brushes' parent and the brushes become its
 * children. Brush entities have no origin in Quake 2 — the brushes carry the
 * geometry. One composite patch, so undo restores the flat structure in a
 * single step.
 */
export function convertBrushesToEntityPatch(
  doc: Readonly<MapDocument>,
  classname: string,
  brushIds: readonly Id[],
  makeId: () => Id,
): { patch: Patch; id: Id } {
  if (brushIds.length === 0) throw new Error('no brushes selected');
  if (!/^[A-Za-z0-9_]+$/.test(classname)) throw new Error(`invalid classname ${classname}`);
  const parents = new Set(brushIds.map((id) => doc.parent.get(id)));
  if (parents.size !== 1) throw new Error('the brushes must share one parent');
  const parentId = [...parents][0]!;
  for (const id of brushIds) {
    if (doc.nodes.get(id)?.kind !== 'brush') {
      throw new Error('only brushes can form a brush entity');
    }
  }
  const entity: EntityNode = {
    kind: 'entity',
    id: makeId(),
    props: [['classname', classname]],
    children: [],
  };
  let composite = addNodePatch(doc, parentId, entity);
  let working = applyPatch(doc, composite);
  for (const id of brushIds) {
    const step = reparentNodePatch(working, id, entity.id);
    composite = mergePatches(composite, step);
    working = applyPatch(working, step);
  }
  return { patch: composite, id: entity.id };
}
