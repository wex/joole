import { describe, expect, it } from 'vitest';
import { shortcutAction } from './shortcuts';

const key = (k: string, extra: Partial<Parameters<typeof shortcutAction>[0]> = {}) => ({
  key: k,
  ctrl: false,
  shift: false,
  alt: false,
  ...extra,
});

it('maps Space to frame-selection and not with modifiers (T15.5)', () => {
  expect(shortcutAction({ key: ' ', ctrl: false, shift: false, alt: false })).toBe(
    'frame-selection',
  );
  expect(shortcutAction({ key: ' ', ctrl: true, shift: false, alt: false })).toBeNull();
  expect(shortcutAction({ key: ' ', ctrl: false, shift: true, alt: false })).toBeNull();
});

describe('shortcutAction', () => {
  it('maps tool and grid keys', () => {
    expect(shortcutAction(key('s'))).toBe('tool-select');
    expect(shortcutAction(key('B'))).toBe('tool-brush');
    expect(shortcutAction(key('['))).toBe('grid-down');
    expect(shortcutAction(key(']'))).toBe('grid-up');
    expect(shortcutAction(key('n'))).toBe('next-leak');
  });

  it('maps platform editing conventions', () => {
    expect(shortcutAction(key('z', { ctrl: true }))).toBe('undo');
    expect(shortcutAction(key('z', { ctrl: true, shift: true }))).toBe('redo');
    expect(shortcutAction(key('y', { ctrl: true }))).toBe('redo');
    expect(shortcutAction(key('s', { ctrl: true }))).toBe('save');
    expect(shortcutAction(key('c', { ctrl: true }))).toBe('copy');
    expect(shortcutAction(key('v', { ctrl: true }))).toBe('paste');
    expect(shortcutAction(key('d', { ctrl: true }))).toBe('duplicate');
  });

  it('does not steal shifted plain keys or alt combinations', () => {
    expect(shortcutAction(key('s', { shift: true }))).toBeNull();
    expect(shortcutAction(key('z', { ctrl: true, alt: true }))).toBeNull();
  });
});

describe('delete shortcut (T1.9)', () => {
  it('Delete and Backspace map to delete without modifiers', () => {
    expect(shortcutAction(key('Delete'))).toBe('delete');
    expect(shortcutAction(key('Backspace'))).toBe('delete');
  });

  it('a modified Delete is not a delete', () => {
    expect(shortcutAction(key('Delete', { ctrl: true }))).toBeNull();
    expect(shortcutAction(key('Delete', { shift: true }))).toBeNull();
    expect(shortcutAction(key('Backspace', { alt: true }))).toBeNull();
  });
});
