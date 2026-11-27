import { describe, expect, it } from 'vitest';
import { applyPatch, buildDocument } from '@core/doc/index';
import { parseQuakedBlocks } from '@core/formats/index';
import { withQ2EntityMetadata } from '@game/q2/index';
import { readFileSync } from 'node:fs';
import type { EntityNode } from '@core/types/index';
import {
  collectTargetnames,
  entityPanelState,
  renameEntityPropPatch,
  setEntityClassPatch,
  setEntityPropPatch,
  targetLinks,
  toggleSpawnflagPatch,
} from './entityPanel';

const defs = withQ2EntityMetadata(parseQuakedBlocks(readFileSync('src/game/q2/q2.def', 'utf8')));

function entity(id: string, props: [string, string][], children: string[] = []): EntityNode {
  return { kind: 'entity', id, props, children };
}

function docWith(...entities: EntityNode[]) {
  const nodes = new Map();
  const world = entity(
    'world',
    [['classname', 'worldspawn']],
    entities.map((e) => e.id),
  );
  nodes.set('world', world);
  for (const e of entities) nodes.set(e.id, e);
  return buildDocument('world', nodes);
}

const soldier = () =>
  entity('e1', [
    ['classname', 'monster_soldier'],
    ['origin', '64 64 32'],
    ['angle', '90'],
  ]);

describe('entityPanelState', () => {
  it('is empty with no or multi selection', () => {
    const doc = docWith(soldier());
    expect(entityPanelState(doc, new Set(), defs).entityId).toBeNull();
    expect(entityPanelState(doc, new Set(['e1', 'world']), defs).entityId).toBeNull();
  });

  it('reads the class, category and keys of the selected entity', () => {
    const doc = docWith(soldier());
    const state = entityPanelState(doc, new Set(['e1']), defs);
    expect(state.entityId).toBe('e1');
    expect(state.classname).toBe('monster_soldier');
    expect(state.category).toBe('monster');
    expect(state.categories).toContain('monster');
    expect(state.categories).toContain('func');
    expect(state.categoryClasses).toContain('monster_soldier');
    expect(state.categoryClasses).not.toContain('func_door');
    // Keys exclude classname but keep origin and angle in file order.
    expect(state.keys.map((k) => k.key)).toEqual(['origin', 'angle']);
    expect(state.keys.find((k) => k.key === 'angle')?.type).toBe('angle');
  });

  it('shows documented and compiler-verified light keys even when absent', () => {
    const light = entity('l1', [
      ['classname', 'light'],
      ['origin', '0 0 32'],
    ]);
    const state = entityPanelState(docWith(light), new Set(['l1']), defs);
    const keys = state.keys.map((row) => row.key);
    for (const key of ['light', '_color', 'style', '_cone', 'target', 'targetname', 'origin']) {
      expect(keys).toContain(key);
    }
    expect(state.keys.find((row) => row.key === 'light')).toMatchObject({
      present: false,
      defaultValue: '300',
      value: '',
    });
    expect(state.keys.find((row) => row.key === 'origin')?.present).toBe(true);
  });

  it('worldspawn is selectable and exposes its documented keys without inventing values', () => {
    const doc = docWith(soldier());
    const state = entityPanelState(doc, new Set(['world']), defs);
    expect(state.entityId).toBe('world');
    expect(state.worldspawn).toBe(true);
    expect(state.keys.map((row) => row.key)).toEqual([
      'sky',
      'skyaxis',
      'skyrotate',
      'sounds',
      'gravity',
      'message',
    ]);
    expect(state.keys.find((row) => row.key === 'gravity')?.defaultValue).toBe('800');
    expect(state.keys.every((row) => !row.present)).toBe(true);
  });

  it('reads spawnflags from the definition with bit positions', () => {
    const withFlags = entity('e1', [
      ['classname', 'monster_soldier'],
      ['spawnflags', '3'],
    ]);
    const doc = docWith(withFlags);
    const state = entityPanelState(doc, new Set(['e1']), defs);
    // monster_soldier: Ambush(1) Trigger_Spawn(2) Sight(4)
    expect(state.spawnflags.length).toBe(3);
    expect(state.spawnflags[0]).toEqual({ bit: 1, name: 'Ambush', checked: true });
    expect(state.spawnflags[1]).toEqual({ bit: 2, name: 'Trigger_Spawn', checked: true });
    expect(state.spawnflags[2]).toEqual({ bit: 4, name: 'Sight', checked: false });
  });
});

describe('prop editing patches', () => {
  it('setEntityPropPatch writes a key and preserves order', () => {
    const doc = docWith(soldier());
    const next = applyPatch(doc, setEntityPropPatch(doc, 'e1', 'targetname', 'sold1'));
    const e = next.nodes.get('e1') as EntityNode;
    expect(e.props.find(([k]) => k === 'targetname')).toEqual(['targetname', 'sold1']);
    // classname keeps position 0.
    expect(e.props[0]).toEqual(['classname', 'monster_soldier']);
  });

  it('setEntityPropPatch with empty value removes the key', () => {
    const doc = docWith(soldier());
    const next = applyPatch(doc, setEntityPropPatch(doc, 'e1', 'angle', ''));
    const e = next.nodes.get('e1') as EntityNode;
    expect(e.props.some(([k]) => k === 'angle')).toBe(false);
  });

  it('renameEntityPropPatch renames in place', () => {
    const doc = docWith(soldier());
    const next = applyPatch(doc, renameEntityPropPatch(doc, 'e1', 'angle', 'facing'));
    const e = next.nodes.get('e1') as EntityNode;
    expect(e.props).toContainEqual(['facing', '90']);
    expect(e.props.some(([k]) => k === 'angle')).toBe(false);
  });

  it('setEntityClassPatch adds missing defaults of the new class without overwriting keys', () => {
    const doc = docWith(soldier());
    const next = applyPatch(
      doc,
      setEntityClassPatch(doc, 'e1', 'light', [
        ['light', '300'],
        ['angle', '45'],
      ]),
    );
    const e = next.nodes.get('e1') as EntityNode;
    expect(e.props).toContainEqual(['light', '300']);
    // angle already existed and is not overwritten.
    expect(e.props).toContainEqual(['angle', '90']);
  });

  it('toggleSpawnflagPatch flips bits and clears zero', () => {
    const doc = docWith(soldier());
    const on = applyPatch(doc, toggleSpawnflagPatch(doc, 'e1', 1));
    expect((on.nodes.get('e1') as EntityNode).props).toContainEqual(['spawnflags', '1']);
    const off = applyPatch(on, toggleSpawnflagPatch(on, 'e1', 1));
    expect((off.nodes.get('e1') as EntityNode).props.some(([k]) => k === 'spawnflags')).toBe(false);
  });

  it('setEntityClassPatch changes only the classname', () => {
    const doc = docWith(soldier());
    const next = applyPatch(doc, setEntityClassPatch(doc, 'e1', 'monster_infantry'));
    const e = next.nodes.get('e1') as EntityNode;
    expect(e.props[0]).toEqual(['classname', 'monster_infantry']);
    expect(e.props).toContainEqual(['angle', '90']);
  });
});

describe('target links', () => {
  it('collects targetnames and links target to targetname', () => {
    const button = entity('b1', [
      ['classname', 'func_button'],
      ['target', 'door1'],
      ['origin', '0 0 32'],
    ]);
    const door = entity('d1', [
      ['classname', 'func_door'],
      ['targetname', 'door1'],
      ['origin', '128 0 32'],
    ]);
    const doc = docWith(button, door);
    expect(collectTargetnames(doc)).toEqual(['door1']);
    expect(targetLinks(doc)).toEqual([['b1', 'd1']]);
  });

  it('ignores dangling targets and self-links', () => {
    const a = entity('a1', [
      ['classname', 'func_button'],
      ['target', 'missing'],
    ]);
    const b = entity('b1', [
      ['classname', 'func_button'],
      ['target', 'self'],
      ['targetname', 'self'],
    ]);
    expect(targetLinks(docWith(a, b))).toEqual([]);
  });
});
