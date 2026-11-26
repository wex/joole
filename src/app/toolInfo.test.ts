import { describe, expect, it } from 'vitest';
import { TOOL_INFO } from './toolInfo';
import { shortcutAction } from './shortcuts';

const modes = ['select', 'brush', 'entity', 'clip', 'vertex', 'face', 'texture'] as const;

describe('tool info (T1.16)', () => {
  it('every editor tool mode has a table entry', () => {
    for (const mode of modes) {
      expect(
        TOOL_INFO.some((info) => info.id === mode),
        mode,
      ).toBe(true);
    }
  });

  it('the shortcuts in the table match shortcutAction', () => {
    for (const mode of modes) {
      const info = TOOL_INFO.find((entry) => entry.id === mode)!;
      const action = shortcutAction({
        key: info.shortcut.toLowerCase(),
        ctrl: false,
        shift: false,
        alt: false,
      });
      // The vertex/edge V key maps to the shared vertex-edge action.
      const expected = mode === 'vertex' ? 'tool-vertex-edge' : `tool-${mode}`;
      expect(action, `${mode} (${info.shortcut})`).toBe(expected);
    }
  });
});
