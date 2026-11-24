import type { MapDocument, MapNode, Id } from '@core/types/index';
import { buildDocument } from '../document';

/** A small document shaped like the simple.map fixture: a worldspawn with
 * a direct brush and a group that holds a brush and a door entity. */
export function testDocument(): MapDocument {
  const face = {
    points: [
      [0, 0, 0],
      [0, 64, 0],
      [64, 0, 0],
    ] as [[number, number, number], [number, number, number], [number, number, number]],
    tex: {
      name: 'e2u1/mine10_1',
      offset: [0, 0] as [number, number],
      rotation: 0,
      scale: [1, 1] as [number, number],
      contents: 0,
      flags: 0,
      value: 0,
      attribsInFile: false,
    },
  };
  const nodes = new Map<Id, MapNode>([
    [
      'w0',
      { kind: 'entity', id: 'w0', props: [['classname', 'worldspawn']], children: ['b1', 'g1'] },
    ],
    ['b1', { kind: 'brush', id: 'b1', faces: [face, face, face, face, face, face] }],
    ['g1', { kind: 'group', id: 'g1', name: 'Entrance', props: [], children: ['b2', 'e1'] }],
    ['b2', { kind: 'brush', id: 'b2', faces: [face, face, face, face, face, face] }],
    [
      'e1',
      {
        kind: 'entity',
        id: 'e1',
        props: [
          ['classname', 'func_door'],
          ['target', 't1'],
        ],
        children: [],
      },
    ],
  ]);
  return buildDocument('w0', nodes);
}
