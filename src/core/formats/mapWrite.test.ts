import { describe, expect, it } from 'vitest';
import type { MapNode } from '@core/types/index';
import { writeMap } from './mapWrite';
import { makeBox } from '../geom/__tests__/helpers';

describe('export integration', () => {
  it('the export mode writes integer points and warns for off-grid brushes', () => {
    const box = makeBox([0.2, 0.1, 0.3], [64.2, 64.1, 64.3]);
    const doc = {
      nodes: new Map<string, MapNode>([
        [
          'w',
          {
            kind: 'entity',
            id: 'w',
            props: [['classname', 'worldspawn']],
            children: ['test'],
          },
        ],
        ['test', box],
      ]),
      parent: new Map([['test', 'w']]),
      worldspawn: 'w',
    };
    const result = writeMap(doc, { mode: 'export' });
    // every number triplet in parentheses is integers
    const decimals = result.text.match(/\(\s*-?\d+\.\d+/);
    expect(decimals).toBeNull();
    // the conversion moved vertices, so a warning is reported
    expect(result.warnings.length).toBeGreaterThan(0);
    // clipboard keeps the decimals
    const clipboard = writeMap(doc, { mode: 'clipboard' });
    expect(clipboard.text).toContain('0.2');
    expect(clipboard.warnings).toEqual([]);
  });
});
