/**
 * Builds the Gate 4 single-player sample map `maps/sp-sample.map` with
 * Joole's own geometry operations: the room shell is a solid box hollowed by
 * CSG subtraction, exactly as the editor's tools perform it. Run with:
 * pnpm exec vite-node tests/fixtures/build-sp-sample.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  addNodePatch,
  applyPatch,
  buildDocument,
  createId,
  mergePatches,
} from '../../src/core/doc/index';
import { subtractBrush } from '../../src/core/geom/csg';
import { makeBox as rawBox } from '../../src/core/geom/__tests__/helpers';
import { writeMap } from '../../src/core/formats/mapWrite';
import { parseMap } from '../../src/core/formats/mapParse';
import type { BrushNode, EntityNode, MapNode, Patch, Vec3 } from '../../src/core/types/index';

const TEX = 'e2u1/mine10_1';

function makeBox(min: Vec3, max: Vec3): BrushNode {
  const brush = rawBox(min, max);
  return {
    ...brush,
    id: createId(),
    faces: brush.faces.map((face) => ({
      ...face,
      tex: { ...face.tex, name: TEX },
    })),
  };
}

function subtractAll(targets: BrushNode[], cutter: BrushNode): BrushNode[] {
  const out: BrushNode[] = [];
  for (const target of targets) {
    const result = subtractBrush(target, cutter);
    if (!result.ok) throw new Error(`subtract failed: ${result.error}`);
    out.push(...result.value.map((brush) => ({ ...brush, id: createId() })));
  }
  return out;
}

// The layout: two rooms joined by a corridor doorway, carved from one shell.
const shell = makeBox([-64, -64, -64], [640, 320, 192]);
const roomA = makeBox([0, 0, 0], [256, 256, 128]);
const corridor = makeBox([256, 96, 0], [320, 160, 128]);
const roomB = makeBox([320, 0, 0], [576, 256, 128]);

let walls = subtractAll([shell], roomA);
walls = subtractAll(walls, corridor);
walls = subtractAll(walls, roomB);

// The door fills the doorway cross-section and slides open on trigger.
const door = makeBox([272, 96, 0], [288, 160, 128]);
// The button juts out of the room-A wall next to the doorway.
const button = makeBox([240, 176, 48], [256, 192, 80]);

function pointEntity(classname: string, origin: Vec3, extra: [string, string][] = []): EntityNode {
  return {
    kind: 'entity',
    id: createId(),
    props: [['classname', classname], ['origin', origin.map((v) => String(v)).join(' ')], ...extra],
    children: [],
  };
}

function brushEntity(
  classname: string,
  brush: BrushNode,
  extra: [string, string][] = [],
): EntityNode {
  return {
    kind: 'entity',
    id: createId(),
    props: [['classname', classname], ...extra],
    children: [brush.id],
  };
}

const playerStart = pointEntity('info_player_start', [64, 128, 24], [['angle', '0']]);
const monster = pointEntity('monster_soldier', [448, 128, 24], [['angle', '180']]);
const lightA = pointEntity('light', [128, 128, 96]);
const lightB = pointEntity('light', [448, 128, 96]);
const doorEntity = brushEntity('func_door', door, [
  ['targetname', 'door1'],
  ['angle', '-1'],
]);
const buttonEntity = brushEntity('func_button', button, [['target', 'door1']]);

const nodes = new Map<string, MapNode>();
const worldChildren: string[] = [];
for (const wall of walls) {
  nodes.set(wall.id, wall);
  worldChildren.push(wall.id);
}
for (const brush of [door, button]) {
  nodes.set(brush.id, brush);
}
for (const entity of [playerStart, monster, lightA, lightB, doorEntity, buttonEntity]) {
  nodes.set(entity.id, entity);
  worldChildren.push(entity.id);
}
const world: EntityNode = {
  kind: 'entity',
  id: 'world',
  props: [
    ['classname', 'worldspawn'],
    ['message', 'joole sample'],
  ],
  children: worldChildren,
};
nodes.set('world', world);
const doc = buildDocument('world', nodes);

const result = writeMap(doc, { mode: 'export' });
if (result.warnings.length > 0) {
  throw new Error(`export warnings: ${result.warnings.join('; ')}`);
}
mkdirSync('tests/fixtures/maps', { recursive: true });
writeFileSync('tests/fixtures/maps/sp-sample.map', result.text);

// Self-check: the text parses back with the same node count.
const roundTrip = parseMap(result.text);
console.log(
  `sp-sample.map written: ${doc.nodes.size} nodes, ${walls.length} wall brushes, round-trip ${roundTrip.nodes.size} nodes`,
);
