import { replaceNodePatch } from '@core/doc/index';
import type { EntityClassDef } from '@core/formats/index';
import type { EntityNode, Id, MapDocument, Patch } from '@core/types/index';
import { entityProp, withEntityProp } from './entities';

/** One row of the entity panel's key–value table. */
export interface EntityKeyRow {
  readonly key: string;
  readonly value: string;
  /** The definition's typing, when the key is documented. */
  readonly type: string;
  readonly description: string;
  /** Documented keys come first in definition order; unknown keys keep file order after them. */
  readonly documented: boolean;
}

export interface EntityPanelState {
  /** Null when the selection is not exactly one entity. */
  readonly entityId: Id | null;
  readonly classname: string;
  readonly category: string;
  /** Category names in alphabetical order, for the upper select. */
  readonly categories: readonly string[];
  /** Class names of the entity's own category, for the lower select. */
  readonly categoryClasses: readonly string[];
  readonly def: EntityClassDef | null;
  /** Spawnflag rows: bit value, name, checked. */
  readonly spawnflags: readonly { bit: number; name: string; checked: boolean }[];
  readonly keys: readonly EntityKeyRow[];
  /** All targetname values in the map, for the target dropdown. */
  readonly targetnames: readonly string[];
  /** The keys whose values are other entities' targetnames. */
  readonly linkedTarget: string | null;
}

/**
 * Well-known key types when the class does not document the key: angle is
 * universal in Quake 2, and the panel's typed editors (compass, dropdowns,
 * colour picker) key off these.
 */
const UNIVERSAL_KEY_TYPES: Readonly<Record<string, string>> = {
  angle: 'angle',
  spawnflags: 'int',
  target: 'target',
  targetname: 'str',
  killtarget: 'target',
  pathtarget: 'target',
  deathtarget: 'target',
  combattarget: 'target',
  origin: 'vec',
  _color: 'color',
};

/** The category prefix of a class name: monster for monster_soldier. */
export function entityCategory(classname: string): string {
  return classname.includes('_') ? classname.split('_')[0]! : 'misc';
}

/**
 * The panel state for the selection. With several entities selected the
 * panel stays empty for now — multi-entity editing is a later refinement.
 */
export function entityPanelState(
  doc: Readonly<MapDocument>,
  selection: ReadonlySet<Id>,
  defs: readonly EntityClassDef[],
): EntityPanelState {
  const empty: EntityPanelState = {
    entityId: null,
    classname: '',
    category: '',
    categories: [],
    categoryClasses: [],
    def: null,
    spawnflags: [],
    keys: [],
    targetnames: collectTargetnames(doc),
    linkedTarget: null,
  };
  if (selection.size !== 1) return empty;
  const [id] = selection;
  const node = doc.nodes.get(id!);
  if (!node || node.kind !== 'entity' || id === doc.worldspawn) return empty;

  const classname = entityProp(node, 'classname') ?? '';
  const def = defs.find((d) => d.className === classname) ?? null;
  const category = entityCategory(classname);

  const categories = [
    ...new Set(
      defs.filter((d) => d.className !== 'worldspawn').map((d) => entityCategory(d.className)),
    ),
  ].sort();
  const categoryClasses = defs
    .filter((d) => entityCategory(d.className) === category && d.className !== 'worldspawn')
    .map((d) => d.className);

  const flagValue = Number(entityProp(node, 'spawnflags') ?? '0') || 0;
  const spawnflags = (def?.spawnflags ?? []).map((name, i) => ({
    bit: 1 << i,
    name,
    checked: (flagValue & (1 << i)) !== 0,
  }));

  // Keys: documented keys in definition order first (even when absent? no —
  // only present keys are rows), then undocumented in file order.
  const documented = def ? new Map(def.keys.map((k) => [k.name, k])) : new Map();
  const keys: EntityKeyRow[] = node.props
    .filter(([k]) => k !== 'classname')
    .map(([key, value]) => {
      const docKey = documented.get(key);
      return {
        key,
        value,
        type: docKey?.type ?? UNIVERSAL_KEY_TYPES[key] ?? 'str',
        description: docKey?.description ?? '',
        documented: !!docKey,
      };
    });

  return {
    entityId: id!,
    classname,
    category,
    categories,
    categoryClasses,
    def,
    spawnflags,
    keys,
    targetnames: collectTargetnames(doc),
    linkedTarget: entityProp(node, 'target') ?? null,
  };
}

/** Every targetname in the map, sorted, for the target dropdown. */
export function collectTargetnames(doc: Readonly<MapDocument>): string[] {
  const names = new Set<string>();
  for (const node of doc.nodes.values()) {
    if (node.kind !== 'entity') continue;
    const value = entityProp(node, 'targetname');
    if (value) names.add(value);
  }
  return [...names].sort();
}

/** The patch that sets one key of an entity, or removes it with an empty value. */
export function setEntityPropPatch(
  doc: Readonly<MapDocument>,
  id: Id,
  key: string,
  value: string,
): Patch {
  const node = doc.nodes.get(id);
  if (!node || node.kind !== 'entity') throw new Error(`node ${id} is not an entity`);
  let next: EntityNode;
  if (value === '') {
    next = { ...node, props: node.props.filter(([k]) => k !== key) };
  } else {
    next = withEntityProp(node, key, value);
  }
  return replaceNodePatch(doc, id, next);
}

/** The patch that renames one key of an entity, keeping its position and value. */
export function renameEntityPropPatch(
  doc: Readonly<MapDocument>,
  id: Id,
  oldKey: string,
  newKey: string,
): Patch {
  const node = doc.nodes.get(id);
  if (!node || node.kind !== 'entity') throw new Error(`node ${id} is not an entity`);
  if (!/^[A-Za-z0-9_]+$/.test(newKey)) throw new Error(`invalid key ${newKey}`);
  const props: [string, string][] = node.props.map(([k, v]) => [k === oldKey ? newKey : k, v]);
  return replaceNodePatch(doc, id, { ...node, props });
}

/** The patch that changes the entity's class. The other keys are untouched. */
export function setEntityClassPatch(doc: Readonly<MapDocument>, id: Id, classname: string): Patch {
  return setEntityPropPatch(doc, id, 'classname', classname);
}

/** The patch that toggles one spawnflag bit. */
export function toggleSpawnflagPatch(doc: Readonly<MapDocument>, id: Id, bit: number): Patch {
  const node = doc.nodes.get(id);
  if (!node || node.kind !== 'entity') throw new Error(`node ${id} is not an entity`);
  const current = Number(entityProp(node, 'spawnflags') ?? '0') || 0;
  const next = current ^ bit;
  return setEntityPropPatch(doc, id, 'spawnflags', next === 0 ? '' : String(next));
}

/**
 * The target link endpoints for the 2D views: pairs of entity origins where
 * one entity's target names the other's targetname.
 */
export function targetLinks(doc: Readonly<MapDocument>): readonly (readonly [Id, Id])[] {
  const byTargetname = new Map<string, Id>();
  for (const node of doc.nodes.values()) {
    if (node.kind !== 'entity') continue;
    const name = entityProp(node, 'targetname');
    if (name) byTargetname.set(name, node.id);
  }
  const links: [Id, Id][] = [];
  for (const node of doc.nodes.values()) {
    if (node.kind !== 'entity') continue;
    const target = entityProp(node, 'target');
    if (!target) continue;
    const to = byTargetname.get(target);
    if (to && to !== node.id) links.push([node.id, to]);
  }
  return links;
}
