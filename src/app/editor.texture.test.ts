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
          rgba: new Uint8Array(64 * 64 * 4),
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

describe('chooseTexture (T1.1)', () => {
  function addSecondBox(app: EditorApp): void {
    const brush = { ...makeBox([128, 0, 0], [192, 64, 64]), id: 'second' };
    app.executeCommand({
      label: 'test',
      run: () => addNodePatch(app.document, app.document.worldspawn, brush),
    });
  }

  it('applies the texture to a selected brush in one undo step', () => {
    const app = makeApp();
    addBox(app);
    app.setSelection(new Set(['target']));
    app.chooseTexture('e1u1/clicked');
    expect(app.currentTextureName).toBe('e1u1/clicked');
    for (const face of brush(app).faces) {
      expect(face.tex.name).toBe('e1u1/clicked');
    }
    app.undo();
    for (const face of brush(app).faces) {
      expect(face.tex.name).not.toBe('e1u1/clicked');
    }
  });

  it('applies to picked faces only in the texture tool', () => {
    const app = makeApp();
    addBox(app);
    app.setToolMode('texture');
    clickFace(app);
    expect(app.faceSelectionCount).toBe(1);
    app.chooseTexture('e1u1/faceonly');
    const names = brush(app).faces.map((face) => face.tex.name);
    expect(names.filter((name) => name === 'e1u1/faceonly')).toHaveLength(1);
  });

  it('applies to every brush inside a selected group', () => {
    const app = makeApp();
    addBox(app);
    addSecondBox(app);
    app.setSelection(new Set(['target', 'second']));
    expect(app.groupSelection()).toBe(true);
    const groupId = [...app.selection][0]!;
    expect(app.document.nodes.get(groupId)?.kind).toBe('group');
    app.chooseTexture('e1u1/grouped');
    for (const id of ['target', 'second']) {
      const node = app.document.nodes.get(id) as BrushNode;
      for (const face of node.faces) {
        expect(face.tex.name).toBe('e1u1/grouped');
      }
    }
  });

  it('choosing the texture a target already has adds no undo step', () => {
    const app = makeApp();
    addBox(app);
    app.setSelection(new Set(['target']));
    app.chooseTexture('e1u1/once');
    expect(brush(app).faces[0]!.tex.name).toBe('e1u1/once');
    app.chooseTexture('e1u1/once');
    // A single undo returns to the pre-choose state, so the second click
    // created no history entry.
    app.undo();
    expect(brush(app).faces[0]!.tex.name).not.toBe('e1u1/once');
    expect(app.document.nodes.get('target')).toBeDefined();
  });

  it('without a selection only the current texture changes', () => {
    const app = makeApp();
    addBox(app);
    app.chooseTexture('e1u1/idle');
    expect(app.currentTextureName).toBe('e1u1/idle');
    for (const face of brush(app).faces) {
      expect(face.tex.name).not.toBe('e1u1/idle');
    }
  });

  it('leaving the texture tool clears the face picks', () => {
    const app = makeApp();
    addBox(app);
    app.setToolMode('texture');
    clickFace(app);
    expect(app.faceSelectionCount).toBe(1);
    app.setToolMode('select');
    expect(app.faceSelectionCount).toBe(0);
  });

  it('outside the texture tool the apply targets whole brushes, not stale face picks', () => {
    const app = makeApp();
    addBox(app);
    app.setToolMode('texture');
    clickFace(app);
    app.setToolMode('select');
    app.setSelection(new Set(['target']));
    app.chooseTexture('e1u1/whole');
    const names = brush(app).faces.map((face) => face.tex.name);
    expect(names.filter((name) => name === 'e1u1/whole')).toHaveLength(6);
  });
});

describe('faceHighlightPolygons (T1.3)', () => {
  it('returns the picked face polygons only in the texture tool', () => {
    const app = makeApp();
    addBox(app);
    app.setToolMode('texture');
    expect(app.faceHighlightPolygons()).toHaveLength(0);
    clickFace(app);
    expect(app.faceHighlightPolygons()).toHaveLength(1);
    const polygon = app.faceHighlightPolygons()[0]!;
    expect(polygon.length).toBeGreaterThanOrEqual(3);
    app.setToolMode('select');
    expect(app.faceHighlightPolygons()).toHaveLength(0);
  });
});

describe('deleteSelection (T1.9)', () => {
  it('deletes a selected brush with no confirmation and undo restores it', () => {
    const app = makeApp();
    addBox(app);
    app.setSelection(new Set(['target']));
    expect(app.deleteSelection()).toBe(true);
    expect(app.document.nodes.has('target')).toBe(false);
    expect(app.selection.size).toBe(0);
    app.undo();
    expect(app.document.nodes.has('target')).toBe(true);
  });

  it('deletes nothing when the selection is empty', () => {
    const app = makeApp();
    addBox(app);
    expect(app.deleteSelection()).toBe(false);
    expect(app.document.nodes.has('target')).toBe(true);
  });

  it('never deletes worldspawn', () => {
    const app = makeApp();
    addBox(app);
    app.setSelection(new Set([app.document.worldspawn]));
    app.deleteSelection();
    expect(app.document.nodes.has(app.document.worldspawn)).toBe(true);
  });
});
