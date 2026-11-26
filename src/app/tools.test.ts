import { describe, expect, it } from 'vitest';
import { createEmptyDocument, addNodePatch, applyPatch, buildDocument } from '@core/doc/index';
import { analyzeBrush, extractWireframe, validateBrush } from '@core/geom/index';
import type { BrushNode, Command, GroupNode, MapDocument, EntityNode } from '@core/types/index';
import { makeBox } from '../core/geom/__tests__/helpers';
import {
  BrushTool,
  ClipTool,
  resizeToCommand,
  selectionBounds,
  SelectTool,
  VertexTool,
  type ToolPointerEvent,
} from './tools';

function brush(
  id: string,
  min: [number, number, number],
  max: [number, number, number],
): BrushNode {
  return { ...makeBox(min, max), id };
}

function documentWithBrushes(): MapDocument {
  let doc = createEmptyDocument();
  for (const b of [brush('a', [0, 0, 0], [64, 64, 64]), brush('b', [128, 0, 0], [192, 64, 64])]) {
    doc = applyPatch(doc, addNodePatch(doc, doc.worldspawn, b));
  }
  return doc;
}

function runScript(
  tool: { pointer(event: ToolPointerEvent): { commands: Command[] } },
  events: ToolPointerEvent[],
): Command[] {
  const commands: Command[] = [];
  for (const event of events) {
    const out = tool.pointer(event);
    commands.push(...out.commands);
  }
  return commands;
}

const down = (x: number, y: number, extra: Partial<ToolPointerEvent> = {}): ToolPointerEvent => ({
  type: 'down',
  button: 0,
  view: 'xy',
  point: [x, y, 0],
  tolerance: 4,
  shift: false,
  ctrl: false,
  ...extra,
});
const move = (x: number, y: number): ToolPointerEvent => ({ ...down(x, y), type: 'move' });
const up = (x: number, y: number): ToolPointerEvent => ({ ...down(x, y), type: 'up' });

describe('SelectTool event scripts', () => {
  it('click selects and Shift adds without producing a command', () => {
    const doc = documentWithBrushes();
    const tool = new SelectTool(() => doc, 8);
    expect(tool.pointer(down(32, 32)).selection?.has('a')).toBe(true);
    expect(tool.pointer({ ...down(160, 32), shift: true }).selection?.has('b')).toBe(true);
    expect(tool.pointer(up(160, 32)).commands).toHaveLength(0);
  });

  it('prefers the already selected overlapping brush when a drag starts', () => {
    let doc = createEmptyDocument();
    for (const b of [brush('a', [0, 0, 0], [64, 64, 64]), brush('b', [0, 0, 0], [64, 64, 64])]) {
      doc = applyPatch(doc, addNodePatch(doc, doc.worldspawn, b));
    }
    const tool = new SelectTool(() => doc, 8);
    const firstHit = tool.pointer(down(32, 32)).selection;
    expect(firstHit?.size).toBe(1);
    const selected = [...firstHit!][0]!;
    const commands = runScript(tool, [move(48, 32), up(48, 32)]);
    expect(commands.length).toBeGreaterThan(0);
    let moved = doc;
    for (const command of commands) moved = applyPatch(moved, command.run(moved));
    const box = analyzeBrush(moved.nodes.get(selected) as BrushNode).aabb;
    expect(box?.min[0]).toBe(16);
    const other = [...moved.nodes.values()].find(
      (node) => node.kind === 'brush' && node.id !== selected,
    );
    expect(analyzeBrush(other as BrushNode).aabb?.min[0]).toBe(0);
  });

  it('dragging a selected brush produces merged translation commands snapped to the grid', () => {
    const doc = documentWithBrushes();
    const tool = new SelectTool(() => doc, 8);
    tool.pointer(down(32, 32));
    const commands = runScript(tool, [move(41, 32), move(49, 40), up(49, 40)]);
    expect(commands.length).toBe(2);
    expect(commands.every((command) => command.mergeKey === commands[0]!.mergeKey)).toBe(true);
    let next = doc;
    for (const command of commands) next = applyPatch(next, command.run(next));
    const moved = next.nodes.get('a');
    expect(moved?.kind).toBe('brush');
    if (moved?.kind === 'brush') {
      expect(analyzeBrush(moved).aabb!.min.map((x) => x + 0)).toEqual([16, 8, 0]);
    }
  });

  it('empty drag box-selects overlapping brushes', () => {
    const doc = documentWithBrushes();
    const tool = new SelectTool(() => doc, 8);
    tool.pointer(down(-10, -10));
    tool.pointer(move(200, 80));
    const out = tool.pointer(up(200, 80));
    expect([...(out.selection ?? [])].sort()).toEqual(['a', 'b']);
  });

  it('Ctrl+drag rotates the selection and corner drag scales it', () => {
    const doc = documentWithBrushes();
    const rotateTool = new SelectTool(() => doc, 8);
    rotateTool.pointer({ ...down(32, 32), ctrl: true });
    const rotateCommands = runScript(rotateTool, [{ ...move(32, 40), ctrl: true }, up(32, 40)]);
    expect(rotateCommands.length).toBe(1);
    expect(rotateCommands[0]!.label).toBe('Rotate selection');

    const scaleTool = new SelectTool(() => doc, 8);
    scaleTool.setSelection(['a']);
    scaleTool.pointer(down(64, 64));
    const scaleCommands = runScript(scaleTool, [move(128, 128), up(128, 128)]);
    expect(scaleCommands.length).toBe(1);
    expect(scaleCommands[0]!.label).toBe('Scale selection');

    let rotated = doc;
    for (const command of rotateCommands) rotated = applyPatch(rotated, command.run(rotated));
    const rotatedBrush = rotated.nodes.get('a');
    expect(rotatedBrush?.kind).toBe('brush');
    if (rotatedBrush?.kind === 'brush') {
      expect(analyzeBrush(rotatedBrush).volume).toBeCloseTo(64 ** 3, 4);
    }

    let scaled = doc;
    for (const command of scaleCommands) scaled = applyPatch(scaled, command.run(scaled));
    const scaledBrush = scaled.nodes.get('a');
    expect(scaledBrush?.kind).toBe('brush');
    if (scaledBrush?.kind === 'brush') {
      expect(analyzeBrush(scaledBrush).aabb!.max.map((x) => x + 0)).toEqual([128, 128, 64]);
    }
  });
});

describe('BrushTool', () => {
  function makeBrushDoc(): MapDocument {
    return createEmptyDocument();
  }

  it('drags a grid-snapped box in a 2D view with a 64-unit default depth', () => {
    const doc = makeBrushDoc();
    const tool = new BrushTool(
      () => doc,
      () => 8,
    );
    const commands = runScript(tool, [down(0, 0), move(65, 65), up(65, 65)]);
    expect(commands).toHaveLength(1);
    expect(commands[0]!.label).toBe('Add box');
    const patched = applyPatch(doc, commands[0]!.run(doc));
    const brushes = [...patched.nodes.values()].filter((node) => node.kind === 'brush');
    expect(brushes).toHaveLength(1);
    const brush = brushes[0]!;
    expect(brush.kind).toBe('brush');
    if (brush.kind === 'brush') {
      const box = analyzeBrush(brush).aabb;
      expect(box?.min.map((x) => x + 0)).toEqual([0, 0, -32]);
      expect(box?.max.map((x) => x + 0)).toEqual([64, 64, 32]);
      expect(validateBrush(analyzeBrush(brush)).valid).toBe(true);
    }
  });

  it('creates every primitive kind and rejects a zero-size drag', () => {
    for (const kind of ['box', 'wedge', 'cylinder', 'cone', 'sphere'] as const) {
      const doc = makeBrushDoc();
      const tool = new BrushTool(
        () => doc,
        () => 8,
      );
      tool.primitive = kind;
      const commands = runScript(tool, [down(0, 0), move(64, 64), up(64, 64)]);
      expect(commands).toHaveLength(1);
      const patched = applyPatch(doc, commands[0]!.run(doc));
      const brush = [...patched.nodes.values()].find((node) => node.kind === 'brush');
      expect(brush?.kind).toBe('brush');
      if (brush?.kind === 'brush') {
        expect(validateBrush(analyzeBrush(brush))).toEqual({ valid: true, reasons: [] });
      }
    }

    const doc = makeBrushDoc();
    const tool = new BrushTool(
      () => doc,
      () => 8,
    );
    expect(runScript(tool, [down(0, 0), up(0, 0)])).toEqual([]);
  });

  it('uses the depth axis of front and side views', () => {
    const doc = makeBrushDoc();
    const frontTool = new BrushTool(
      () => doc,
      () => 8,
    );
    const front = runScript(frontTool, [
      down(0, 0, { view: 'xz' }),
      { ...move(64, 64), view: 'xz', point: [64, 0, 64] },
      { ...up(64, 64), view: 'xz', point: [64, 0, 64] },
    ]);
    const frontPatch = applyPatch(doc, front[0]!.run(doc));
    const frontBrush = [...frontPatch.nodes.values()].find((node) => node.kind === 'brush');
    if (frontBrush?.kind === 'brush') {
      expect(analyzeBrush(frontBrush).aabb?.min.map((x) => x + 0)).toEqual([0, -32, 0]);
      expect(analyzeBrush(frontBrush).aabb?.max.map((x) => x + 0)).toEqual([64, 32, 64]);
    }
  });
});

describe('typed brush size (T15.4)', () => {
  it('a click without extent asks for a size at the snapped point', () => {
    const doc = createEmptyDocument();
    const tool = new BrushTool(
      () => doc,
      () => 8,
    );
    tool.pointer(down(3, 13));
    const out = tool.pointer(up(3, 13));
    expect(out.commands).toEqual([]);
    expect(out.sizePrompt).toEqual({ view: 'xy', point: [0, 16, 0] });
    // A real drag still creates a brush and asks nothing.
    tool.pointer(down(0, 0));
    tool.pointer(move(64, 64));
    const drag = tool.pointer(up(64, 64));
    expect(drag.commands).toHaveLength(1);
    expect(drag.sizePrompt).toBeUndefined();
  });

  it('creates a brush centred on the point in the view orientation', () => {
    const doc = createEmptyDocument();
    const tool = new BrushTool(
      () => doc,
      () => 8,
    );
    // Front view: width is x, height is z, depth is y around the working plane.
    const out = tool.createAt('xz', [100, 0, 50], [128, 64, 32]);
    expect(out.commands).toHaveLength(1);
    const patched = applyPatch(doc, out.commands[0]!.run(doc));
    const brush = [...patched.nodes.values()].find((node) => node.kind === 'brush');
    expect(brush?.kind).toBe('brush');
    if (brush?.kind === 'brush') {
      const box = analyzeBrush(brush).aabb!;
      expect(box.min.map((x) => x + 0)).toEqual([36, -16, 18]);
      expect(box.max.map((x) => x + 0)).toEqual([164, 16, 82]);
      expect(out.selection).toEqual(new Set([brush.id]));
    }
  });

  it('resizes the selection about its centre and keeps flat axes', () => {
    let doc = createEmptyDocument();
    doc = applyPatch(doc, addNodePatch(doc, doc.worldspawn, brush('a', [0, 0, 0], [64, 64, 64])));
    const bounds = selectionBounds(doc, new Set(['a']))!;
    expect(bounds.min.map((x) => x + 0)).toEqual([0, 0, 0]);
    expect(bounds.max.map((x) => x + 0)).toEqual([64, 64, 64]);
    const command = resizeToCommand(doc, new Set(['a']), [128, 32, 64])!;
    const resized = applyPatch(doc, command.run(doc));
    const box = analyzeBrush(resized.nodes.get('a') as BrushNode).aabb!;
    expect(box.min.map((x) => x + 0)).toEqual([-32, 16, 0]);
    expect(box.max.map((x) => x + 0)).toEqual([96, 48, 64]);
    expect(resizeToCommand(doc, new Set(), [8, 8, 8])).toBeNull();
  });

  it('frames a selected group by its member brushes (T16.2)', () => {
    const nodes = new Map();
    const world: EntityNode = {
      kind: 'entity',
      id: 'world',
      props: [['classname', 'worldspawn']],
      children: ['g1', 'g3'],
    };
    nodes.set('world', world);
    nodes.set('a', { ...makeBox([0, 0, 0], [64, 64, 64]), id: 'a' });
    nodes.set('b', { ...makeBox([128, 0, 0], [192, 64, 64]), id: 'b' });
    nodes.set('g1', { kind: 'group', id: 'g1', name: 'group', props: [], children: ['a', 'b'] });
    nodes.set('g3', { kind: 'group', id: 'g3', name: 'empty', props: [], children: [] });
    const doc = buildDocument('world', nodes);

    // The group's bounds span both member brushes.
    const bounds = selectionBounds(doc, new Set(['g1']))!;
    expect(bounds).not.toBeNull();
    expect(bounds.min.map((x) => x + 0)).toEqual([0, 0, 0]);
    expect(bounds.max.map((x) => x + 0)).toEqual([192, 64, 64]);
    // An empty group has no bounds.
    expect(selectionBounds(doc, new Set(['g3']))).toBeNull();
  });
});

describe('ClipTool event scripts', () => {
  function clippedDocument(): MapDocument {
    let doc = createEmptyDocument();
    doc = applyPatch(
      doc,
      addNodePatch(doc, doc.worldspawn, brush('target', [0, 0, 0], [64, 64, 64])),
    );
    return doc;
  }

  it('two clicks define a clip plane and Enter clips the selection', () => {
    const doc = clippedDocument();
    const tool = new ClipTool(
      () => doc,
      () => 8,
    );
    tool.setSelection(['target']);
    expect(tool.pointer(down(32, 0)).preview).toHaveLength(1);
    expect(tool.pointer(move(32, 64)).preview).toHaveLength(1);
    const defined = tool.pointer(down(32, 64));
    expect(defined.preview).toHaveLength(1);
    const output = tool.key('Enter');
    expect(output.commands).toHaveLength(1);
    expect(output.preview).toEqual([]);
    let edited = doc;
    for (const command of output.commands) edited = applyPatch(edited, command.run(edited));
    const clipped = edited.nodes.get('target') as BrushNode;
    expect(validateBrush(analyzeBrush(clipped)).valid).toBe(true);
    expect(analyzeBrush(clipped).aabb?.min[0]).toBeCloseTo(32, 5);
    expect(output.selection?.has('target')).toBe(true);
  });

  it('clips in the xz and yz views with the view depth axis', () => {
    for (const view of ['xz', 'yz'] as const) {
      const doc = clippedDocument();
      const tool = new ClipTool(
        () => doc,
        () => 8,
      );
      tool.setSelection(['target']);
      const at = (a: number, b: number): ToolPointerEvent => ({
        ...down(0, 0),
        view,
        point: view === 'xz' ? [a, 32, b] : [32, a, b],
      });
      // A vertical line through the middle of the view: x = 32 in xz, y = 32 in yz.
      tool.pointer(at(32, 0));
      tool.pointer(at(32, 64));
      const output = tool.key('Enter');
      expect(output.commands).toHaveLength(1);
      let edited = doc;
      for (const command of output.commands) edited = applyPatch(edited, command.run(edited));
      const clipped = edited.nodes.get('target') as BrushNode;
      const analysis = analyzeBrush(clipped);
      expect(validateBrush(analysis).valid).toBe(true);
      expect(analysis.volume).toBeCloseTo(32 * 64 * 64, 4);
    }
  });

  it('Tab cycles front, back and both, and Escape cancels without a command', () => {
    const doc = clippedDocument();
    const tool = new ClipTool(
      () => doc,
      () => 8,
    );
    tool.setSelection(['target']);
    tool.pointer(down(32, 0));
    tool.pointer(down(32, 64));
    expect(tool.side).toBe('front');
    tool.key('Tab');
    expect(tool.side).toBe('back');
    tool.key('Tab');
    expect(tool.side).toBe('both');
    const cancelled = tool.key('Escape');
    expect(cancelled.commands).toEqual([]);
    expect(cancelled.preview).toEqual([]);
    expect(tool.key('Enter').commands).toEqual([]);
  });
});

describe('VertexTool event scripts', () => {
  function vertexDocument(): MapDocument {
    let doc = createEmptyDocument();
    doc = applyPatch(
      doc,
      addNodePatch(doc, doc.worldspawn, brush('target', [0, 0, 0], [64, 64, 64])),
    );
    return doc;
  }

  function makeVertexTool(doc: MapDocument) {
    return new VertexTool(
      () => doc,
      () => 8,
      () => new Set(['target']),
    );
  }

  it('dragging near a corner moves the vertex with an undoable command', () => {
    const doc = vertexDocument();
    const tool = makeVertexTool(doc);
    const down1 = tool.pointer(down(2, 2));
    expect(down1.commands).toHaveLength(0);
    const moved = tool.pointer(move(10, 10));
    expect(moved.commands).toHaveLength(1);
    let edited = doc;
    for (const command of moved.commands) edited = applyPatch(edited, command.run(edited));
    const analysis = analyzeBrush(edited.nodes.get('target') as BrushNode);
    expect(validateBrush(analysis).valid).toBe(true);
    expect(analysis.volume).toBeLessThan(analyzeBrush(doc.nodes.get('target') as BrushNode).volume);
    tool.pointer(up(10, 10));
  });

  it('shows handle dots while idle and marks the hovered one (T1.8)', () => {
    const doc = vertexDocument();
    const tool = makeVertexTool(doc);
    // Far from every handle: all dots are idle.
    const idle = tool.pointer(move(200, 200));
    expect(idle.handles!.length).toBe(8);
    expect(idle.handles!.every((h) => h.state === 0)).toBe(true);
    // Near the corner vertex at (0, 0, 64)-ish in the top view: one hover dot.
    const hovered = tool.pointer({ ...move(2, 2), tolerance: 4 });
    expect(hovered.handles!.filter((h) => h.state === 1)).toHaveLength(1);
    // In edge mode the hovered edge is also a vp-select preview segment.
    tool.toggleVertexEdge();
    const edge = tool.pointer({ ...move(32, 0), point: [32, 0, 64], tolerance: 4 });
    expect(edge.handles!.length).toBe(12);
    if (edge.handles!.some((h) => h.state === 1)) {
      expect(edge.preview!.length).toBe(1);
    }
  });

  it('a rejected drag produces no command and dashed invalid segments', () => {
    const doc = vertexDocument();
    const tool = makeVertexTool(doc);
    tool.pointer(down(2, 2));
    const output = tool.pointer(move(200, 200));
    expect(output.commands).toHaveLength(0);
    expect(output.invalid!.length).toBeGreaterThan(0);
  });

  it('V toggles between vertex and edge submodes and edge drag moves both endpoints', () => {
    const doc = vertexDocument();
    const tool = makeVertexTool(doc);
    expect(tool.submode).toBe('vertex');
    tool.toggleVertexEdge();
    expect(tool.submode).toBe('edge');
    // The front-top edge runs along x at y=0, z=64: grab its midpoint.
    tool.pointer({ ...down(32, 0), point: [32, 0, 64] });
    const moved = tool.pointer({ ...move(32, 8), point: [32, 8, 64] });
    expect(moved.commands).toHaveLength(1);
  });
});

describe('BrushTool grid lock and feedback (T1.2)', () => {
  function makeTool(grid: number) {
    const doc = createEmptyDocument();
    return {
      doc,
      tool: new BrushTool(
        () => doc,
        () => grid,
      ),
    };
  }

  it('reports the snapped cursor on idle moves in a 2D view', () => {
    const { tool } = makeTool(8);
    const out = tool.pointer({ ...move(5, 13), point: [5, 13, 0] });
    expect(out.cursor).toEqual([8, 16, 0]);
  });

  it('reports no cursor in the 3D view', () => {
    const { tool } = makeTool(8);
    const out = tool.pointer({ ...move(5, 13), view: '3d', point: [5, 13, 0] });
    expect(out.cursor ?? null).toBeNull();
  });

  it('reports the measure box while drawing', () => {
    const { tool } = makeTool(8);
    tool.pointer(down(0, 0));
    const out = tool.pointer({ ...move(70, 40), point: [70, 40, 0] });
    expect(out.measure).toEqual({ min: [0, 0, -32], max: [72, 40, 32] });
  });

  it('every bound of a painted brush is a grid multiple at large grid sizes', () => {
    for (const grid of [8, 64, 128]) {
      const { doc, tool } = makeTool(grid);
      // Deliberately off-grid pointer positions.
      const commands = runScript(tool, [
        { ...down(3, 3), point: [3, 3, 0] },
        { ...move(101, 69), point: [101, 69, 0] },
        { ...up(101, 69), point: [101, 69, 0] },
      ]);
      expect(commands).toHaveLength(1);
      const patched = applyPatch(doc, commands[0]!.run(doc));
      const created = [...patched.nodes.values()].find((node) => node.kind === 'brush');
      expect(created?.kind).toBe('brush');
      if (created?.kind === 'brush') {
        const box = analyzeBrush(created).aabb!;
        for (const axis of [0, 1, 2] as const) {
          expect((box.min[axis]! / grid) % 1, `min axis ${axis} grid ${grid}`).toBeCloseTo(0, 9);
          expect((box.max[axis]! / grid) % 1, `max axis ${axis} grid ${grid}`).toBeCloseTo(0, 9);
        }
        // The depth is at least 64 even at large grids.
        expect(box.max[2]! - box.min[2]!).toBeGreaterThanOrEqual(64);
      }
    }
  });

  it('clears cursor and measure when the tool is cancelled', () => {
    const { tool } = makeTool(8);
    tool.pointer(down(0, 0));
    tool.pointer({ ...move(64, 64), point: [64, 64, 0] });
    tool.cancel();
    const out = tool.pointer({ ...move(64, 64), view: '3d', point: [64, 64, 0] });
    expect(out.measure ?? null).toBeNull();
  });
});

describe('editing feedback (T1.7)', () => {
  it('a select move drag reports the dragged brushes from down to up', () => {
    const doc = documentWithBrushes();
    const tool = new SelectTool(() => doc, 8);
    const downOut = tool.pointer(down(32, 32));
    expect(downOut.editing?.has('a')).toBe(true);
    const upOut = tool.pointer(up(32, 32));
    expect(upOut.editing?.size).toBe(0);
  });

  it('a scale drag reports the selection and clears on up', () => {
    const doc = documentWithBrushes();
    const tool = new SelectTool(() => doc, 8);
    tool.setSelection(['a']);
    const downOut = tool.pointer(down(64, 64));
    expect(downOut.editing?.has('a')).toBe(true);
    expect(tool.pointer(up(64, 64)).editing?.size).toBe(0);
  });

  it('a box-select drag reports no editing', () => {
    const doc = documentWithBrushes();
    const tool = new SelectTool(() => doc, 8);
    const downOut = tool.pointer(down(-10, -10));
    expect(downOut.editing).toBeUndefined();
  });

  it('a vertex drag reports the edited brush and clears on up', () => {
    let doc = createEmptyDocument();
    doc = applyPatch(
      doc,
      addNodePatch(doc, doc.worldspawn, brush('target', [0, 0, 0], [64, 64, 64])),
    );
    const tool = new VertexTool(
      () => doc,
      () => 8,
      () => new Set(['target']),
    );
    const downOut = tool.pointer(down(2, 2));
    expect(downOut.editing?.has('target')).toBe(true);
    const upOut = tool.pointer(up(2, 2));
    expect(upOut.editing?.size).toBe(0);
  });

  it('a vertex down on empty space reports no editing', () => {
    let doc = createEmptyDocument();
    doc = applyPatch(
      doc,
      addNodePatch(doc, doc.worldspawn, brush('target', [0, 0, 0], [64, 64, 64])),
    );
    const tool = new VertexTool(
      () => doc,
      () => 8,
      () => new Set(['target']),
    );
    const downOut = tool.pointer(down(400, 400));
    expect(downOut.editing).toBeUndefined();
  });
});

describe('resize grid snapping (T1.10)', () => {
  function scaleDrag(grid: number, from: [number, number], to: [number, number], steps = 1) {
    const doc = documentWithBrushes();
    const tool = new SelectTool(() => doc, grid);
    tool.setSelection(['a']);
    tool.pointer(down(64, 64));
    const commands: Command[] = [];
    for (let i = 1; i <= steps; i++) {
      const x = from[0] + ((to[0] - from[0]) * i) / steps;
      const y = from[1] + ((to[1] - from[1]) * i) / steps;
      const out = tool.pointer(move(x, y));
      commands.push(...out.commands);
    }
    tool.pointer(up(to[0], to[1]));
    let next = doc;
    for (const command of commands) next = applyPatch(next, command.run(next));
    return analyzeBrush(next.nodes.get('a') as BrushNode).aabb!;
  }

  it('the moved corner lands on grid multiples for several grid sizes', () => {
    for (const grid of [1, 8, 32, 64]) {
      // Dragging off-grid snaps: (100, 100) at grid 64 becomes (128, 128)
      // only if 100 rounds to 128 — snap rounds to nearest, so 64 or 128.
      const box = scaleDrag(grid, [64, 64], [100, 100]);
      const onGrid = (x: number) => {
        const rest = Math.abs(x % grid);
        return rest < 1e-6 || grid - rest < 1e-6;
      };
      expect(onGrid(box.max[0]!)).toBe(true);
      expect(onGrid(box.max[1]!)).toBe(true);
      // The anchored corner never moves.
      expect(box.min[0]! + 0).toBe(0);
      expect(box.min[1]! + 0).toBe(0);
    }
  });

  it('the size never shrinks below one grid step and never crosses the anchor', () => {
    const box = scaleDrag(32, [64, 64], [-500, -500]);
    expect(box.max[0]! - box.min[0]!).toBeGreaterThanOrEqual(32);
    expect(box.max[1]! - box.min[1]!).toBeGreaterThanOrEqual(32);
    expect(box.min[0]! + 0).toBe(0);
    expect(box.min[1]! + 0).toBe(0);
  });

  it('a long drag ends within a tolerance of the direct step', () => {
    const direct = scaleDrag(8, [64, 64], [128, 128], 1);
    const long = scaleDrag(8, [64, 64], [128, 128], 16);
    for (const axis of [0, 1, 2]) {
      expect(Math.abs(long.max[axis]! - direct.max[axis]!)).toBeLessThan(1e-6);
      expect(Math.abs(long.min[axis]! - direct.min[axis]!)).toBeLessThan(1e-6);
    }
  });
});

describe('vertex/edge/face absolute grid snapping (T1.11)', () => {
  function vertexDocAt(min: [number, number, number], max: [number, number, number]) {
    let doc = createEmptyDocument();
    doc = applyPatch(doc, addNodePatch(doc, doc.worldspawn, brush('target', min, max)));
    return doc;
  }

  // The editor executes each command right away, so the document the tool
  // reads stays in sync with the drag; the harness does the same.
  function makeToolHolder(start: MapDocument, handleSize = 14) {
    const holder = { doc: start };
    const tool = new VertexTool(
      () => holder.doc,
      () => 8,
      () => new Set(['target']),
      () => handleSize,
    );
    const apply = (commands: readonly Command[]) => {
      for (const command of commands) {
        holder.doc = applyPatch(holder.doc, command.run(holder.doc));
      }
    };
    return { tool, apply, holder };
  }

  it('an off-grid vertex lands on the grid with its first step', () => {
    // The box corner (3, 5) is off the grid-8 lines. Dragging it toward
    // x = 11 snaps the reference point to x = 8, not x = 11.
    const { tool, apply, holder } = makeToolHolder(vertexDocAt([3, 5, 0], [67, 69, 64]));
    const downOut = tool.pointer({ ...down(3, 5), tolerance: 4 });
    expect(downOut.editing?.has('target')).toBe(true);
    // The snapped cursor sits on the grid line x = 8.
    const moved = tool.pointer(move(11, 5));
    expect(moved.cursor![0]).toBe(8);
    expect(moved.commands).toHaveLength(1);
    apply(moved.commands);
    const analysis = analyzeBrush(holder.doc.nodes.get('target') as BrushNode);
    const xs = extractWireframe(analysis.polygons).vertices.map((v) => v[0]!);
    // The grabbed vertex joined the grid at x = 8; nothing sits at x = 11.
    expect(xs.some((x) => Math.abs(x - 8) < 1e-6)).toBe(true);
    expect(xs.every((x) => Math.abs(x - 11) > 1e-6)).toBe(true);
  });

  it('reports the snapped cursor and the measure box during a drag', () => {
    const { tool } = makeToolHolder(vertexDocAt([0, 0, 0], [64, 64, 64]));
    // Face mode: the whole x = 0 face moves, so the size box follows.
    tool.submode = 'face';
    tool.pointer({ ...down(2, 32), tolerance: 6 });
    const moved = tool.pointer(move(18, 32));
    expect(moved.cursor).toBeDefined();
    // The face vertex nearest the cursor dragged towards x=18 snaps to x=16.
    expect(moved.cursor![0]).toBe(16);
    expect(moved.measure).not.toBeNull();
    expect(moved.measure!.min[0]!).toBeCloseTo(16, 4);
    expect(moved.measure!.max[0]! - moved.measure!.min[0]!).toBeCloseTo(64 - 16, 4);
  });

  it('the active dot sits on the moved vertex during the drag (T15.3)', () => {
    const { tool, apply, holder } = makeToolHolder(vertexDocAt([0, 0, 0], [64, 64, 64]));
    tool.pointer(down(0, 0));
    const moved = tool.pointer(move(16, 16));
    const active = moved.handles!.filter((h) => h.state === 2);
    expect(active).toHaveLength(1);
    // The dot is at the vertex's new position, not where it was before the
    // step's command ran.
    expect(active[0]!.point[0]).toBeCloseTo(16, 6);
    expect(active[0]!.point[1]).toBeCloseTo(16, 6);
    // After the command runs, the document's dots agree with the output.
    apply(moved.commands);
    const fromDocument = tool.handleDots().filter((h) => h.state === 2);
    expect(fromDocument[0]!.point).toEqual(active[0]!.point);
    void holder;
  });

  it('the edge dot follows the moved edge midpoint (T15.3)', () => {
    const { tool } = makeToolHolder(vertexDocAt([0, 0, 0], [64, 64, 64]));
    tool.toggleVertexEdge();
    // The edge x = 0 along y in the top view has its midpoint at (0, 32).
    tool.pointer(down(0, 32));
    const moved = tool.pointer(move(-16, 32));
    const active = moved.handles!.filter((h) => h.state === 2);
    expect(active).toHaveLength(1);
    expect(active[0]!.point[0]).toBeCloseTo(-16, 6);
    expect(active[0]!.point[1]).toBeCloseTo(32, 6);
  });

  it('the hit radius is half the handle size (T15.3)', () => {
    // Tolerance 4 means 1 world unit per CSS px; the default 14 px dot has
    // a 7 px radius.
    const near = makeToolHolder(vertexDocAt([0, 0, 0], [64, 64, 64]));
    expect(near.tool.pointer(down(6, 0)).editing?.has('target')).toBe(true);
    const far = makeToolHolder(vertexDocAt([0, 0, 0], [64, 64, 64]));
    expect(far.tool.pointer(down(9, 0)).editing).toBeUndefined();
    // Doubling the handle size doubles the radius.
    const large = makeToolHolder(vertexDocAt([0, 0, 0], [64, 64, 64]), 28);
    expect(large.tool.pointer(down(12, 0)).editing?.has('target')).toBe(true);
  });

  it('a rejected step keeps the last valid measure and up clears both', () => {
    const { tool, apply } = makeToolHolder(vertexDocAt([0, 0, 0], [64, 64, 64]));
    tool.pointer(down(2, 2));
    const valid = tool.pointer(move(10, 10));
    expect(valid.measure).not.toBeNull();
    apply(valid.commands);
    const rejected = tool.pointer(move(200, 200));
    expect(rejected.invalid!.length).toBeGreaterThan(0);
    expect(rejected.measure).toEqual(valid.measure);
    const upOut = tool.pointer(up(200, 200));
    expect(upOut.cursor).toBeNull();
    expect(upOut.measure).toBeNull();
  });
});
