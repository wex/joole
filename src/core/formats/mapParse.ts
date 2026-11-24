import { nanoid } from 'nanoid';
import type {
  BrushNode,
  EntityNode,
  Face,
  GroupNode,
  MapDocument,
  MapNode,
  Vec3,
} from '@core/types/index';
import { tokenizeMap } from './mapTokenize';
import type { MapToken } from './mapTokenize';

export class MapParseError extends Error {
  constructor(
    message: string,
    public readonly line: number,
    public readonly col: number,
  ) {
    super(`${message} at line ${line}, column ${col}`);
    this.name = 'MapParseError';
  }
}

class Cursor {
  pos = 0;
  constructor(private readonly tokens: MapToken[]) {}

  peek(): MapToken | undefined {
    return this.tokens[this.pos];
  }

  next(): MapToken {
    const token = this.tokens[this.pos++];
    if (!token) {
      const last = this.tokens[this.tokens.length - 1];
      throw new MapParseError('unexpected end of file', last?.line ?? 1, last?.col ?? 1);
    }
    return token;
  }

  expect(text: string): MapToken {
    const token = this.next();
    if (token.text !== text) {
      throw new MapParseError(
        `expected '${text}' but found '${token.text}'`,
        token.line,
        token.col,
      );
    }
    return token;
  }

  number(): number {
    const token = this.next();
    const value = parseFloat(token.text);
    if (Number.isNaN(value)) {
      throw new MapParseError(`expected a number but found '${token.text}'`, token.line, token.col);
    }
    return value;
  }

  get done(): boolean {
    return this.pos >= this.tokens.length;
  }
}

function parsePoint(cursor: Cursor): Vec3 {
  cursor.expect('(');
  const x = cursor.number();
  const y = cursor.number();
  const z = cursor.number();
  cursor.expect(')');
  return [x, y, z];
}

function parseFace(cursor: Cursor): Face {
  const points: [Vec3, Vec3, Vec3] = [parsePoint(cursor), parsePoint(cursor), parsePoint(cursor)];
  const texture = cursor.next();
  if (texture.text === ')' || texture.text === '{' || texture.text === '}') {
    throw new MapParseError('missing texture name', texture.line, texture.col);
  }
  const xoff = cursor.number();
  const yoff = cursor.number();
  const rot = cursor.number();
  const xscale = cursor.number();
  const yscale = cursor.number();
  // the last three fields are optional
  let contents = 0;
  let flags = 0;
  let value = 0;
  let attribsInFile = false;
  const ahead = cursor.peek();
  if (ahead && ahead.text !== '}' && ahead.text !== '(') {
    contents = cursor.number();
    flags = cursor.number();
    value = cursor.number();
    attribsInFile = true;
  }
  return {
    points,
    tex: {
      name: texture.text,
      offset: [xoff, yoff],
      rotation: rot,
      scale: [xscale, yscale],
      contents,
      flags,
      value,
      attribsInFile,
    },
  };
}

function parseBrush(cursor: Cursor): BrushNode {
  cursor.expect('{');
  const faces: Face[] = [];
  while (cursor.peek()?.text === '(') {
    faces.push(parseFace(cursor));
  }
  cursor.expect('}');
  if (faces.length === 0) {
    const token = cursor.peek();
    throw new MapParseError('brush without faces', token?.line ?? -1, token?.col ?? -1);
  }
  return { kind: 'brush', id: nanoid(), faces };
}

interface RawEntity {
  props: [string, string][];
  brushes: BrushNode[];
}

function parseEntity(cursor: Cursor): RawEntity {
  cursor.expect('{');
  const props: [string, string][] = [];
  const brushes: BrushNode[] = [];
  for (;;) {
    const token = cursor.peek();
    if (!token) {
      throw new MapParseError('unexpected end of file inside entity', -1, -1);
    }
    if (token.text === '}') {
      cursor.next();
      return { props, brushes };
    }
    if (token.text === '{') {
      brushes.push(parseBrush(cursor));
      continue;
    }
    // a key-value pair of two quoted strings
    const key = cursor.next();
    const value = cursor.next();
    if (value.text === '{' || value.text === '}') {
      throw new MapParseError(`expected a value for key '${key.text}'`, value.line, value.col);
    }
    props.push([key.text, value.text]);
  }
}

function propOf(props: [string, string][], key: string): string | undefined {
  return props.find(([k]) => k === key)?.[1];
}

/**
 * Parses a Q2 .map file into a MapDocument. func_group entities become
 * GroupNodes: the _joole_id, _joole_name, _joole_parent, _joole_locked and
 * _joole_hidden keys define the tree structure, entities with _joole_group
 * are attached to their group, and all other keys stay in props. A
 * func_group without _joole keys is imported as a group too.
 */
export function parseMap(text: string): MapDocument {
  const cursor = new Cursor(tokenizeMap(text));
  const raw: RawEntity[] = [];
  while (!cursor.done) {
    raw.push(parseEntity(cursor));
  }
  if (raw.length === 0) {
    throw new MapParseError('empty file', 1, 1);
  }

  const nodes = new Map<string, MapNode>();
  const parent = new Map<string, string>();

  function link(childId: string, parentId: string, children: string[]): void {
    parent.set(childId, parentId);
    children.push(childId);
  }

  // first pass: create nodes, with groups keyed by their _joole_id
  interface PendingEntity {
    entity: RawEntity;
    node: EntityNode | GroupNode;
    isGroup: boolean;
    jooleParent?: string;
    jooleGroup?: string;
  }
  const pending: PendingEntity[] = [];
  const groupByJooleId = new Map<string, GroupNode>();

  for (const rawEntity of raw) {
    const classname = propOf(rawEntity.props, 'classname') ?? '';
    const isGroup = classname === 'func_group';
    // the original key order is kept, including unknown keys; only the
    // structural _joole keys are stripped, to be regenerated on write
    const rest = rawEntity.props.filter(([k]) => !k.startsWith('_joole_')) as [string, string][];
    if (isGroup) {
      const jooleId = propOf(rawEntity.props, '_joole_id');
      const node: GroupNode = {
        kind: 'group',
        id: jooleId ?? nanoid(),
        name: propOf(rawEntity.props, '_joole_name') ?? '',
        props: rest.filter(([k]) => k !== 'classname'),
        children: [],
      };
      const locked = propOf(rawEntity.props, '_joole_locked');
      const hidden = propOf(rawEntity.props, '_joole_hidden');
      if (locked === '1') {
        node.locked = true;
      }
      if (hidden === '1') {
        node.hidden = true;
      }
      nodes.set(node.id, node);
      groupByJooleId.set(node.id, node);
      pending.push({
        entity: rawEntity,
        node,
        isGroup,
        jooleParent: propOf(rawEntity.props, '_joole_parent'),
      });
    } else {
      const node: EntityNode = {
        kind: 'entity',
        id: nanoid(),
        props: rest,
        children: [],
      };
      nodes.set(node.id, node);
      pending.push({
        entity: rawEntity,
        node,
        isGroup,
        jooleGroup: propOf(rawEntity.props, '_joole_group'),
      });
    }
  }

  // second pass: build the tree. The first entity is the world.
  const worldspawn = pending[0]!.node.id;
  const looseOrder: string[] = [];

  for (const item of pending) {
    const node = item.node;
    // brushes are direct children of their entity or group
    for (const brush of item.entity.brushes) {
      nodes.set(brush.id, brush);
      link(brush.id, node.id, node.children);
    }
    if (node.id === worldspawn) {
      continue;
    }
    let host: EntityNode | GroupNode = pending[0]!.node as EntityNode;
    if (item.isGroup && item.jooleParent && groupByJooleId.has(item.jooleParent)) {
      host = groupByJooleId.get(item.jooleParent)!;
    } else if (!item.isGroup && item.jooleGroup && groupByJooleId.has(item.jooleGroup)) {
      host = groupByJooleId.get(item.jooleGroup)!;
    }
    if (host.id === worldspawn) {
      // preserve file order at the top level
      link(node.id, worldspawn, looseOrder);
    } else {
      link(node.id, host.id, host.children);
    }
  }

  // top-level order follows the file
  const world = nodes.get(worldspawn) as EntityNode;
  for (const id of looseOrder) {
    world.children.push(id);
  }

  return { nodes, parent, worldspawn };
}
