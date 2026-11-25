import { describe, expect, it } from 'vitest';
import { createEmptyDocument, addNodePatch, applyPatch } from '@core/doc/index';
import { analyzeBrush, validateBrush } from '@core/geom/index';
import type { BrushNode, Command, MapDocument } from '@core/types/index';
import { makeBox } from '../core/geom/__tests__/helpers';
import { BrushTool, SelectTool, type ToolPointerEvent } from './tools';

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
