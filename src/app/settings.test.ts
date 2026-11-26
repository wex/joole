import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings, updateSettings } from './settings';

describe('settings (T1.12)', () => {
  it('falls back to the defaults for missing and invalid values', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ gridSize: 0 }).gridSize).toBe(DEFAULT_SETTINGS.gridSize);
    expect(parseSettings({ gridSize: 3.5 }).gridSize).toBe(DEFAULT_SETTINGS.gridSize);
    expect(parseSettings({ thumbSize: 500 }).thumbSize).toBe(DEFAULT_SETTINGS.thumbSize);
    expect(parseSettings({ theme: 'blue' }).theme).toBe('dark');
  });

  it('keeps valid values and unknown keys', () => {
    const parsed = parseSettings({ gridSize: 32, thumbSize: 96, futureKey: { a: 1 } });
    expect(parsed.gridSize).toBe(32);
    expect(parsed.thumbSize).toBe(96);
    expect(parsed['futureKey']).toEqual({ a: 1 });
  });

  it('a partial update merges and does not overwrite the rest', () => {
    const first = updateSettings(parseSettings(null), { gridSize: 16 });
    const second = updateSettings(first, { thumbSize: 96 });
    expect(second.gridSize).toBe(16);
    expect(second.thumbSize).toBe(96);
    expect(second.rightWidth).toBe(DEFAULT_SETTINGS.rightWidth);
  });
});
