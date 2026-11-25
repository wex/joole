import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseQuakedBlocks } from './quaked';

const fixture = readFileSync('tests/fixtures/quaked/vanilla-blocks.c', 'utf8');
const defs = parseQuakedBlocks(fixture);
const byName = new Map(defs.map((def) => [def.className, def]));

describe('parseQuakedBlocks', () => {
  it('parses every class in the fixture', () => {
    // The monster block shares one comment between two sibling classes.
    expect(defs.length).toBe(6);
  });

  it('parses a point entity with a bounding box', () => {
    const soldier = byName.get('monster_soldier_light')!;
    expect(soldier.color).toEqual([1, 0.5, 0]);
    expect(soldier.bbox).toEqual({ mins: [-16, -16, -24], maxs: [16, 16, 32] });
    expect(soldier.spawnflags).toEqual(['Ambush', 'Trigger_Spawn', 'Sight']);
  });

  it('parses a brush entity with the ? marker', () => {
    const door = byName.get('func_door')!;
    expect(door.bbox).toBe('brush');
    expect(door.color).toEqual([0, 0.5, 0.8]);
    // Positional flags: x marks an unused bit but keeps the positions.
    expect(door.spawnflags).toEqual([
      'START_OPEN',
      'x',
      'CRUSHER',
      'NOMONSTER',
      'ANIMATED',
      'TOGGLE',
      'ANIMATED_FAST',
    ]);
  });

  it('extracts documented keys with types from the description', () => {
    const door = byName.get('func_door')!;
    const keys = new Map(door.keys.map((key) => [key.name, key]));
    expect(keys.get('angle')!.type).toBe('int');
    expect(keys.get('speed')!.type).toBe('int');
    expect(keys.get('wait')!.type).toBe('float');
    expect(keys.get('message')!.type).toBe('str');
    expect(keys.get('targetname')!.type).toBe('str');
    expect(keys.get('health')!.type).toBe('int');
    expect(keys.get('dmg')!.type).toBe('int');
    expect(keys.get('sounds')!.type).toBe('int');
    expect(keys.get('lip')!.type).toBe('int');
    // Every extracted key carries its description text.
    expect(keys.get('angle')!.description).toContain('opening direction');
  });

  it('keeps the description text of the class', () => {
    const door = byName.get('func_door')!;
    expect(door.description).toContain('START_OPEN');
  });

  it('parses sibling classes sharing one comment block', () => {
    expect(byName.has('monster_soldier_light')).toBe(true);
    expect(byName.has('monster_soldier')).toBe(true);
    expect(byName.get('monster_soldier')!.bbox).toEqual({
      mins: [-16, -16, -24],
      maxs: [16, 16, 32],
    });
  });

  it('applies type overrides', () => {
    const overridden = parseQuakedBlocks(fixture, { overrides: { angle: 'angle' } });
    const door = overridden.find((def) => def.className === 'func_door')!;
    expect(door.keys.find((key) => key.name === 'angle')!.type).toBe('angle');
  });

  it('parses worldspawn with no bounding box and string keys', () => {
    const world = byName.get('worldspawn')!;
    expect(world.bbox).toBe('brush');
    expect(world.keys.some((key) => key.name === 'message')).toBe(true);
  });

  it('handles colour keys as color type', () => {
    const withColor = parseQuakedBlocks(
      '/*QUAKED x_light (1 1 0) (-8 -8 -8) (8 8 8)\n"_color" the light colour\n*/',
    );
    const light = withColor.find((def) => def.className === 'x_light')!;
    expect(light.keys.find((key) => key.name === '_color')!.type).toBe('color');
  });
});
