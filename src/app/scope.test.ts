import { describe, expect, it } from 'vitest';
import { addNodePatch, createId } from '@core/doc/index';
import type { Vec3 } from '@core/types/index';
import { makeBox } from '@core/geom/__tests__/helpers';
import { convertWalToRgba } from '@core/formats/index';
import type { ConvertedTexture } from '@core/types/index';
import { EditorApp } from './editor';
import { groupNodesPatch, setGroupFlagPatch } from './groups';

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

function addBrush(app: EditorApp, min: Vec3, max: Vec3): string {
  const id = createId();
  const brush = { ...makeBox(min, max), id };
  app.executeCommand({
    label: 'Add brush',
    run: (doc) => addNodePatch(doc, app.insertionParent, brush),
  });
  return id;
}

describe('scope', () => {
  it('entering a group limits selection to it', () => {
    const app = makeApp();
    const first = addBrush(app, [-64, 0, 0], [0, 64, 64]);
    const second = addBrush(app, [64, 0, 0], [128, 64, 64]);
    const { patch, id } = groupNodesPatch(app.document, [first], createId);
    app.executeCommand({ label: 'group', run: () => patch });
    expect(app.enterScope(id)).toBe(true);
    expect(app.scope).toBe(id);
    // Outside nodes are rejected from the selection.
    app.setSelection([second]);
    expect(app.selection.size).toBe(0);
    // Inside the scope the selection works.
    app.setSelection([first]);
    expect(app.selection.has(first)).toBe(true);
    app.exitScope();
    expect(app.scope).toBeNull();
    app.setSelection([second]);
    expect(app.selection.has(second)).toBe(true);
  });

  it('inScope walks the tree correctly', () => {
    const app = makeApp();
    const first = addBrush(app, [-64, 0, 0], [0, 64, 64]);
    const { patch, id } = groupNodesPatch(app.document, [first], createId);
    app.executeCommand({ label: 'group', run: () => patch });
    expect(app.inScope(first)).toBe(true);
    app.enterScope(id);
    expect(app.inScope(first)).toBe(true);
    expect(app.inScope(app.document.worldspawn)).toBe(false);
    expect(app.inScope(id)).toBe(true);
  });

  it('new brushes land in the scope group as insertion parent', () => {
    const app = makeApp();
    const first = addBrush(app, [-64, 0, 0], [0, 64, 64]);
    const { patch, id } = groupNodesPatch(app.document, [first], createId);
    app.executeCommand({ label: 'group', run: () => patch });
    app.enterScope(id);
    expect(app.insertionParent).toBe(id);
    const added = addBrush(app, [200, 0, 0], [264, 64, 64]);
    expect(app.document.parent.get(added)).toBe(id);
    app.exitScope();
    expect(app.insertionParent).toBe(app.document.worldspawn);
    const outside = addBrush(app, [400, 0, 0], [464, 64, 64]);
    expect(app.document.parent.get(outside)).toBe(app.document.worldspawn);
  });

  it('enterScope rejects non-groups and leaving twice is safe', () => {
    const app = makeApp();
    const brush = addBrush(app, [0, 0, 0], [64, 64, 64]);
    expect(app.enterScope(brush)).toBe(false);
    expect(app.scope).toBeNull();
    app.exitScope();
    expect(app.scope).toBeNull();
  });

  it('hidden flags do not affect inScope', () => {
    const app = makeApp();
    const first = addBrush(app, [-64, 0, 0], [0, 64, 64]);
    const { patch, id } = groupNodesPatch(app.document, [first], createId);
    app.executeCommand({ label: 'group', run: () => patch });
    app.executeCommand({
      label: 'hide',
      run: () => setGroupFlagPatch(app.document, id, 'hidden', true),
    });
    app.enterScope(id);
    expect(app.inScope(first)).toBe(true);
  });
});
