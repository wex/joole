import { describe, expect, it } from 'vitest';
import { createEmptyDocument, addNodePatch, applyPatch } from '@core/doc/index';
import { analyzeBrush } from '@core/geom/index';
import type { BrushNode, Command, MapDocument } from '@core/types/index';
import { makeBox } from '../core/geom/__tests__/helpers';
import { SelectTool, type ToolPointerEvent } from './tools';

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

function runScript(tool: SelectTool, events: ToolPointerEvent[]): Command[] {
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
