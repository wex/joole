import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { convertWalToRgba } from '@core/formats/index';
import type { ByteSource, ConvertedTexture } from '@core/types/index';
import { addNodePatch } from '@core/doc/index';
import { analyzeBrush } from '@core/geom/index';
import { makeBox } from '@core/geom/__tests__/helpers';
import type { BrushNode } from '@core/types/index';
import { EditorApp } from './editor';

function source(bytes: Uint8Array): ByteSource {
  return {
    size: bytes.byteLength,
    read: (offset, length) => Promise.resolve(bytes.slice(offset, offset + length)),
  };
}

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(`tests/fixtures/${name}`));
}

function textureGameEntries() {
  return [
    { path: 'baseq2/pics/colormap.pcx', source: source(fixture('colormap.pcx')) },
    { path: 'baseq2/textures/e2u1/mine10_1.wal', source: source(fixture('harness.wal')) },
  ];
}

function makeApp() {
  let conversions = 0;
  const cache = new Map<string, ConvertedTexture>();
  const app = new EditorApp({
    inflate: (data) => Promise.resolve(data),
    textureClient: {
      convert: (wal, palette) => {
        conversions++;
        return Promise.resolve(convertWalToRgba(new Uint8Array(wal), new Uint8Array(palette)));
      },
    },
    textureCache: {
      get: (key) => Promise.resolve(cache.get(key) ?? null),
      put: (key, texture) => {
        cache.set(key, texture);
        return Promise.resolve();
      },
    },
  });
  return {
    app,
    cache,
    conversionCount: () => conversions,
  };
}

describe('EditorApp brush primitives', () => {
  it('normalizes sphere detail to the fixed Qoole presets', () => {
    const { app } = makeApp();
    expect(app.setBrushPrimitive('sphere', 8)).toBe(true);
    expect(app.brushSides).toBe(14);
    expect(app.setBrushPrimitive('sphere', 18)).toBe(true);
    expect(app.brushSides).toBe(18);
    expect(app.setBrushPrimitive('sphere', 21)).toBe(true);
    expect(app.brushSides).toBe(20);
    expect(app.setBrushPrimitive('cylinder', 8)).toBe(true);
    expect(app.brushSides).toBe(8);
  });
});

describe('EditorApp', () => {
  it('opens a valid map, reports it and emits a document event', async () => {
    const { app } = makeApp();
    const events: string[] = [];
    app.subscribe((event) => events.push(event.type));

    expect(
      await app.openMapText('simple.map', new TextDecoder().decode(fixture('simple.map'))),
    ).toBe(true);

    expect(app.mapName).toBe('simple.map');
    expect(app.document.nodes.size).toBeGreaterThan(1);
    expect(events).toContain('document');
    expect(app.logEntries().at(-1)).toMatchObject({ level: 'ok' });
    expect(app.logEntries().at(-1)?.text).toContain('Opened map simple.map');
  });

  it('rejects an invalid map without replacing the current document', async () => {
    const { app } = makeApp();
    const before = app.document;

    expect(await app.openMapText('broken.map', '{ "classname" "worldspawn"')).toBe(false);

    expect(app.document).toBe(before);
    expect(app.mapName).toBeNull();
    expect(app.logEntries().at(-1)?.level).toBe('error');
    expect(app.logEntries().at(-1)?.text).toContain('Map failed to open');
  });

  it('opens game data, reads the palette and indexes textures', async () => {
    const { app } = makeApp();
    const events: string[] = [];
    app.subscribe((event) => events.push(event.type));

    expect(await app.openGameEntries(textureGameEntries(), 'fixture game')).toBe(true);

    expect(app.gameOpen).toBe(true);
    expect(app.textureCount).toBe(1);
    expect(events).toContain('game');
    expect(app.logEntries().at(-1)?.text).toBe('Game data opened: 1 texture.');
  });

  it('rejects files without a baseq2 directory and says what to choose', async () => {
    const { app } = makeApp();

    expect(await app.openGameEntries([], 'empty')).toBe(false);

    expect(app.gameOpen).toBe(false);
    expect(app.logEntries().at(-1)?.level).toBe('error');
    expect(app.logEntries().at(-1)?.text).toContain('Choose the Quake 2 folder');
  });

  it('loads a texture through the worker once and then uses the cache', async () => {
    const { app, conversionCount } = makeApp();
    await app.openGameEntries(textureGameEntries(), 'fixture game');

    const first = await app.loadTexture('e2u1/mine10_1');
    const second = await app.loadTexture('e2u1/mine10_1');

    expect(first).toMatchObject({ width: 64, height: 64 });
    expect(second).toMatchObject({ width: 64, height: 64 });
    expect(conversionCount()).toBe(1);
  });

  it('keeps grid sizes to powers of two from 1 to 256', () => {
    const { app } = makeApp();

    expect(app.setGridSize(8)).toBe(true);
    expect(app.gridSize).toBe(8);
    expect(app.setGridSize(12)).toBe(false);
    expect(app.gridSize).toBe(8);
    expect(app.setGridSize(512)).toBe(false);
    expect(app.setGridSize(1)).toBe(true);
    expect(app.increaseGridSize()).toBe(true);
    expect(app.gridSize).toBe(2);
    app.setGridSize(256);
    expect(app.increaseGridSize()).toBe(true);
    expect(app.gridSize).toBe(256);
    expect(app.decreaseGridSize()).toBe(true);
    expect(app.gridSize).toBe(128);
  });

  it('caps the log and keeps the newest entries', () => {
    const { app } = makeApp();
    for (let i = 0; i < 510; i++) {
      app.log('info', `line ${i}`);
    }

    const entries = app.logEntries();
    expect(entries).toHaveLength(500);
    expect(entries[0]?.text).toBe('line 10');
    expect(entries.at(-1)?.text).toBe('line 509');
  });

  it('addEntityAt places a grid-snapped point entity as an undoable command', () => {
    const { app } = makeApp();
    const id = app.addEntityAt('info_player_start', [3, 5, 1]);
    expect(id).not.toBeNull();
    const entity = app.document.nodes.get(id!);
    expect(entity?.kind).toBe('entity');
    if (entity?.kind === 'entity') {
      expect(entity.props).toEqual([
        ['classname', 'info_player_start'],
        ['origin', '0 8 0'],
      ]);
    }
    expect(app.undo()).toBe(true);
    expect(app.document.nodes.has(id!)).toBe(false);
  });
  it('CSG Subtract uses the selection as cutters and is undoable', () => {
    const { app } = makeApp();
    const target = { ...makeBox([0, 0, 0], [64, 64, 64]), id: 'target' };
    const cutter = { ...makeBox([32, 32, 32], [96, 96, 96]), id: 'cutter' };
    for (const brush of [target, cutter]) {
      app.executeCommand({
        label: 'Add brush',
        run: (doc) => addNodePatch(doc, doc.worldspawn, brush),
      });
    }
    app.setSelection(['cutter']);

    expect(app.csgSubtract()).toBe(true);
    expect(app.document.nodes.has('cutter')).toBe(true);
    const fragments = [...app.selection];
    expect(fragments.length).toBeGreaterThan(1);
    const volume = fragments.reduce(
      (sum, id) => sum + analyzeBrush(app.document.nodes.get(id) as BrushNode).volume,
      0,
    );
    expect(volume).toBeCloseTo(64 ** 3 - 32 ** 3, 3);

    expect(app.undo()).toBe(true);
    expect(app.document.nodes.get('target')).toEqual(target);
    expect([...app.selection]).toEqual(['cutter']);
  });
  it('CSG Intersect replaces overlapping selections and is undoable', () => {
    const { app } = makeApp();
    const a = { ...makeBox([0, 0, 0], [64, 64, 64]), id: 'a' };
    const b = { ...makeBox([32, 0, 0], [96, 64, 64]), id: 'b' };
    for (const brush of [a, b]) {
      app.executeCommand({
        label: 'Add brush',
        run: (doc) => addNodePatch(doc, doc.worldspawn, brush),
      });
    }
    app.setSelection(['a', 'b']);
    expect(app.csgIntersect()).toBe(true);
    expect(app.document.nodes.has('b')).toBe(false);
    expect(analyzeBrush(app.document.nodes.get('a') as BrushNode).volume).toBeCloseTo(
      32 * 64 * 64,
      5,
    );
    expect(app.undo()).toBe(true);
    expect(app.document.nodes.get('a')).toEqual(a);
    expect(app.document.nodes.get('b')).toEqual(b);
  });
  it('Hollow inward replaces one selected brush and is undoable', () => {
    const { app } = makeApp();
    const target = { ...makeBox([0, 0, 0], [64, 64, 64]), id: 'target' };
    app.executeCommand({
      label: 'Add brush',
      run: (doc) => addNodePatch(doc, doc.worldspawn, target),
    });
    app.setSelection(['target']);
    expect(app.hollowSelection('inward')).toBe(true);
    // The fragments group automatically (T1.14), and the group is selected.
    expect(app.selection.size).toBe(1);
    const selected = app.document.nodes.get([...app.selection][0]!);
    expect(selected?.kind).toBe('group');
    expect((selected as { name: string }).name).toBe('hollow');
    expect((selected as { children: string[] }).children.length).toBeGreaterThan(1);
    expect(app.undo()).toBe(true);
    expect(app.document.nodes.get('target')).toEqual(target);
  });
  it('clipKey applies the Clip tool command and is undoable', () => {
    const { app } = makeApp();
    const target = { ...makeBox([0, 0, 0], [64, 64, 64]), id: 'target' };
    app.executeCommand({
      label: 'Add brush',
      run: (doc) => addNodePatch(doc, doc.worldspawn, target),
    });
    app.setSelection(['target']);
    app.setToolMode('clip');
    app.selectPointer({
      type: 'down',
      button: 0,
      view: 'xy',
      point: [32, 0, 0],
      tolerance: 4,
      shift: false,
      ctrl: false,
    });
    app.selectPointer({
      type: 'down',
      button: 0,
      view: 'xy',
      point: [32, 64, 0],
      tolerance: 4,
      shift: false,
      ctrl: false,
    });
    const output = app.clipKey('Enter');
    expect(output.commands).toHaveLength(1);
    expect(analyzeBrush(app.document.nodes.get('target') as BrushNode).aabb?.min[0]).toBeCloseTo(
      32,
      5,
    );
    expect(app.undo()).toBe(true);
    expect(app.document.nodes.get('target')).toEqual(target);
  });
  it('flip, mirror and rotate90 are undoable commands on the selection', () => {
    const { app } = makeApp();
    const target = { ...makeBox([0, 0, 0], [64, 32, 16]), id: 'target' };
    app.executeCommand({
      label: 'Add brush',
      run: (doc) => addNodePatch(doc, doc.worldspawn, target),
    });
    app.setSelection(['target']);

    expect(app.flipSelection(0)).toBe(true);
    expect(app.undo()).toBe(true);
    expect(app.document.nodes.get('target')).toEqual(target);

    expect(app.rotate90Selection()).toBe(true);
    const rotated = app.document.nodes.get('target') as BrushNode;
    expect(rotated).not.toEqual(target);
    for (const face of rotated.faces) {
      for (const point of face.points) {
        for (const c of point) expect(Number.isInteger(c)).toBe(true);
      }
    }
    expect(app.undo()).toBe(true);
    expect(app.document.nodes.get('target')).toEqual(target);

    expect(app.mirrorSelection(1)).toBe(true);
    expect(app.document.nodes.size).toBe(3);
    expect(app.document.nodes.get('target')).toEqual(target);
    expect(app.selection.has('target')).toBe(false);
    expect(app.selection.size).toBe(1);
    expect(app.undo()).toBe(true);
    expect(app.document.nodes.size).toBe(2);
  });
});

describe('texture lock', () => {
  it('move with lock on keeps textures anchored and produces integer parameters', () => {
    const { app } = makeApp();
    const target = { ...makeBox([0, 0, 0], [64, 64, 64]), id: 'target' };
    app.executeCommand({
      label: 'Add brush',
      run: (doc) => addNodePatch(doc, doc.worldspawn, target),
    });
    app.setSelection(['target']);
    app.setTextureLock(true);
    expect(app.textureLockEnabled).toBe(true);
    const before = app.document.nodes.get('target') as BrushNode;
    app.selectPointer({
      type: 'down',
      button: 0,
      view: 'xy',
      point: [32, 32, 0],
      tolerance: 4,
      shift: false,
      ctrl: false,
    });
    const output = app.selectPointer({
      type: 'move',
      button: 0,
      view: 'xy',
      point: [48, 32, 0],
      tolerance: 4,
      shift: false,
      ctrl: false,
    });
    expect(output.commands.length).toBeGreaterThan(0);
    const after = app.document.nodes.get('target') as BrushNode;
    // Texture parameters changed to compensate the move on faces whose
    // texture axis has a component along the move direction.
    const changed = after.faces.some(
      (face, i) =>
        face.tex.offset[0] !== before.faces[i]!.tex.offset[0] ||
        face.tex.offset[1] !== before.faces[i]!.tex.offset[1],
    );
    expect(changed).toBe(true);
    for (const face of after.faces) {
      expect(Number.isInteger(face.tex.offset[0])).toBe(true);
      expect(Number.isInteger(face.tex.offset[1])).toBe(true);
    }
    expect(app.undo()).toBe(true);
  });

  it('move with lock off leaves texture parameters unchanged', () => {
    const { app } = makeApp();
    const target = { ...makeBox([0, 0, 0], [64, 64, 64]), id: 'target' };
    app.executeCommand({
      label: 'Add brush',
      run: (doc) => addNodePatch(doc, doc.worldspawn, target),
    });
    app.setSelection(['target']);
    expect(app.textureLockEnabled).toBe(false);
    const before = app.document.nodes.get('target') as BrushNode;
    app.selectPointer({
      type: 'down',
      button: 0,
      view: 'xy',
      point: [32, 32, 0],
      tolerance: 4,
      shift: false,
      ctrl: false,
    });
    app.selectPointer({
      type: 'move',
      button: 0,
      view: 'xy',
      point: [48, 32, 0],
      tolerance: 4,
      shift: false,
      ctrl: false,
    });
    const after = app.document.nodes.get('target') as BrushNode;
    expect(after.faces.map((f) => f.tex)).toEqual(before.faces.map((f) => f.tex));
  });
});

describe('typed brush size (T15.4)', () => {
  it('creates a brush in one undo step and remembers the size', () => {
    const { app } = makeApp();
    const before = app.document.nodes.size;
    expect(app.createBrushAt('xy', [32, 32, 0], [128, 64, 32])).toBe(true);
    expect(app.document.nodes.size).toBe(before + 1);
    const id = [...app.selection][0]!;
    const box = analyzeBrush(app.document.nodes.get(id) as BrushNode).aabb!;
    expect(box.min.map((x) => x + 0)).toEqual([-32, 0, -16]);
    expect(box.max.map((x) => x + 0)).toEqual([96, 64, 16]);
    expect(app.lastBrushSize).toBe('128 64 32');
    app.undo();
    expect(app.document.nodes.size).toBe(before);
  });

  it('prefills and resizes the selection in the view orientation', () => {
    const { app } = makeApp();
    app.createBrushAt('xy', [0, 0, 0], [64, 32, 16]);
    // In the front view, width is x, height is z and depth is y.
    expect(app.selectionSizePrompt('xz')).toEqual({ center: [0, 0, 0], text: '64 16 32' });
    expect(app.resizeSelectionTo('xz', [128, 16, 32])).toBe(true);
    const id = [...app.selection][0]!;
    const box = analyzeBrush(app.document.nodes.get(id) as BrushNode).aabb!;
    expect(box.max[0]! - box.min[0]!).toBeCloseTo(128, 6);
    expect((box.min[0]! + box.max[0]!) / 2).toBeCloseTo(0, 6);
    app.undo();
    const restored = analyzeBrush(app.document.nodes.get(id) as BrushNode).aabb!;
    expect(restored.max[0]! - restored.min[0]!).toBeCloseTo(64, 6);
    app.setSelection(new Set());
    expect(app.selectionSizePrompt('xy')).toBeNull();
    expect(app.resizeSelectionTo('xy', [8, 8, 8])).toBe(false);
  });
});
