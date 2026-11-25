import { describe, expect, it } from 'vitest';
import { convertWalToRgba } from '@core/formats/index';
import type { ConvertedTexture } from '@core/types/index';
import type { Vec3 } from '@core/types/index';
import { EditorApp } from './editor';
import type { EntityNode } from '@core/types/index';
import { addNodePatch } from '@core/doc/index';
import { makeBox } from '@core/geom/__tests__/helpers';

function makeApp() {
  const cache = new Map<string, ConvertedTexture>();
  return new EditorApp({
    inflate: (data) => Promise.resolve(data),
    textureClient: {
      convert: (wal, palette) =>
        Promise.resolve(convertWalToRgba(new Uint8Array(wal), new Uint8Array(palette))),
    },
    textureCache: {
      get: (key) => Promise.resolve(cache.get(key) ?? null),
      put: (key, texture) => {
        cache.set(key, texture);
        return Promise.resolve();
      },
    },
  });
}

describe('convertSelectionToEntity', () => {
  it('converts selected brushes into a brush entity, undoable in one step', () => {
    const app = makeApp();
    const a = 'brush-a';
    const b = 'brush-b';
    const placements: readonly (readonly [string, Vec3])[] = [
      [a, [0, 0, 0]],
      [b, [128, 0, 0]],
    ];
    for (const [id, min] of placements) {
      const brush = { ...makeBox(min, [min[0] + 64, 64, 64]), id };
      app.executeCommand({
        label: 'Add brush',
        run: (doc) => addNodePatch(doc, doc.worldspawn, brush),
      });
    }
    app.setSelection([a, b]);
    expect(app.convertSelectionToEntity('func_door')).toBe(true);
    // The selection is now the entity, whose children are the brushes.
    const [entityId] = app.selection;
    const entity = app.document.nodes.get(entityId!) as EntityNode;
    expect(entity.kind).toBe('entity');
    expect(entity.children.sort()).toEqual([a, b].sort());
    expect(entity.props).toContainEqual(['classname', 'func_door']);
    // One undo restores the flat worldspawn children.
    app.undo();
    const world = app.document.nodes.get(app.document.worldspawn) as EntityNode;
    expect(world.children).toContain(a);
    expect(world.children).toContain(b);
  });

  it('refuses an empty or mixed selection with a warning', () => {
    const app = makeApp();
    expect(app.convertSelectionToEntity('func_door')).toBe(false);
  });

  it('recognises brush classes from the definitions', () => {
    const app = makeApp();
    expect(app.isBrushClass('func_door')).toBe(true);
    expect(app.isBrushClass('trigger_once')).toBe(true);
    expect(app.isBrushClass('monster_soldier')).toBe(false);
    expect(app.isBrushClass('light')).toBe(false);
  });
});
