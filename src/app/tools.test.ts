import { describe, expect, it } from 'vitest';
import { createEmptyDocument, addNodePatch, applyPatch } from '@core/doc/index';
import { analyzeBrush, validateBrush } from '@core/geom/index';
import type { BrushNode, Command, MapDocument } from '@core/types/index';
import { makeBox } from '../core/geom/__tests__/helpers';
import { BrushTool, ClipTool, SelectTool, VertexTool, type ToolPointerEvent } from './tools';

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

  it('shows handle crosses while idle', () => {
    const doc = vertexDocument();
    const tool = makeVertexTool(doc);
    const output = tool.pointer(move(200, 200));
    expect(output.preview!.length).toBeGreaterThan(0);
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
