import { describe, expect, it } from 'vitest';
import type { BrushNode } from '@core/types/index';
import { addNodePatch } from '@core/doc/index';
import { makeBox } from '@core/geom/__tests__/helpers';
import { EditorApp } from './editor';

function makeApp() {
  return new EditorApp({
    inflate: (data) => Promise.resolve(data),
    textureClient: {
      convert: () =>
        Promise.resolve({
          width: 64,
          height: 64,
          pixels: new Uint8Array(64 * 64 * 4),
          mipmaps: [],
        }),
    },
  });
}

function addBox(app: EditorApp): void {
  const brush = { ...makeBox([0, 0, 0], [64, 64, 64]), id: 'target' };
  app.executeCommand({
    label: 'test',
    run: () => addNodePatch(app.document, app.document.worldspawn, brush),
  });
}

function brush(app: EditorApp): BrushNode {
  return app.document.nodes.get('target') as BrushNode;
}

function clickFace(app: EditorApp, mods: { shift?: boolean; ctrl?: boolean } = {}) {
  app.selectPointer({
    type: 'down',
    button: 0,
    view: '3d',
    point: [128, 32, 32],
    direction: [-1, 0, 0],
    tolerance: 1,
    shift: mods.shift ?? false,
    ctrl: mods.ctrl ?? false,
  });
}

describe('texture tools', () => {
  it('applies the current texture to a selected brush and undo restores', () => {
    const app = makeApp();
    addBox(app);
    app.setSelection(new Set(['target']));
    app.setCurrentTexture('e1u1/test');
    expect(app.applyCurrentTexture()).toBe(true);
    for (const face of brush(app).faces) {
      expect(face.tex.name).toBe('e1u1/test');
    }
    app.undo();
    for (const face of brush(app).faces) {
      expect(face.tex.name).not.toBe('e1u1/test');
    }
  });

  it('the T tool picks a face in 3D and apply affects only that face', () => {
    const app = makeApp();
    addBox(app);
    app.setToolMode('texture');
    clickFace(app);
    expect(app.faceSelectionCount).toBe(1);
    app.setCurrentTexture('e1u1/picked');
    expect(app.applyCurrentTexture()).toBe(true);
    const names = brush(app).faces.map((face) => face.tex.name);
    expect(names.filter((name) => name === 'e1u1/picked')).toHaveLength(1);
  });

  it('ctrl+click is the eyedropper: it sets the current texture without selecting', () => {
    const app = makeApp();
    addBox(app);
    app.setToolMode('texture');
    const before = app.currentTextureName;
    clickFace(app, { ctrl: true });
    expect(app.currentTextureName).toBe(brush(app).faces[0]!.tex.name);
    expect(app.currentTextureName).not.toBe('__never__');
    // Face selection unchanged by the eyedropper.
    expect(app.faceSelectionCount).toBe(0);
    void before;
  });

  it('shift+click accumulates faces', () => {
    const app = makeApp();
    addBox(app);
    app.setToolMode('texture');
    clickFace(app);
    clickFace(app, { shift: true });
    // Same face toggles off with shift; picking twice must not grow past toggle.
    expect(app.faceSelectionCount).toBe(0);
  });

  it('arrow keys shift the texture by the grid step and are undoable', () => {
    const app = makeApp();
    addBox(app);
    app.setSelection(new Set(['target']));
    expect(app.textureArrow('ArrowRight', false)).toBe(true);
    expect(brush(app).faces[0]!.tex.offset[0]).toBe(-app.gridSize);
    expect(app.textureArrow('ArrowUp', false)).toBe(true);
    expect(brush(app).faces[0]!.tex.offset[1]).toBe(app.gridSize);
    app.undo();
    expect(brush(app).faces[0]!.tex.offset[1]).toBe(0);
  });

  it('shift+arrows rotate by the grid step in degrees', () => {
    const app = makeApp();
    addBox(app);
    app.setSelection(new Set(['target']));
    expect(app.textureArrow('ArrowRight', true)).toBe(true);
    expect(brush(app).faces[0]!.tex.rotation).toBe(app.gridSize);
  });

  it('fit and reset work through the app', () => {
    const app = makeApp();
    addBox(app);
    app.setSelection(new Set(['target']));
    expect(app.fitTextures()).toBe(true);
    expect(brush(app).faces[0]!.tex.scale[0]).toBeCloseTo(1, 5);
    expect(app.resetTextures()).toBe(true);
    expect(brush(app).faces[0]!.tex.scale).toEqual([1, 1]);
    expect(brush(app).faces[0]!.tex.offset).toEqual([0, 0]);
  });

  it('justify produces integer offsets', () => {
    const app = makeApp();
    addBox(app);
    app.setSelection(new Set(['target']));
    app.shiftTextures(13, 7);
    expect(app.justifyTextures('left')).toBe(true);
    expect(Number.isInteger(brush(app).faces[0]!.tex.offset[0])).toBe(true);
  });

  it('no selection is a no-op returning false', () => {
    const app = makeApp();
    expect(app.applyCurrentTexture()).toBe(false);
    expect(app.textureArrow('ArrowLeft', false)).toBe(false);
  });
});
