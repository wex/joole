import { describe, expect, it } from 'vitest';
import { parseMap, MapParseError } from './mapParse';

const MINIMAL = `{
"classname" "worldspawn"
}
`;

describe('parseMap structure', () => {
  it('parses a minimal file', () => {
    const doc = parseMap(MINIMAL);
    expect(doc.nodes.get(doc.worldspawn)?.kind).toBe('entity');
  });

  it('keeps entity property order and unknown keys', () => {
    const doc = parseMap(`${MINIMAL}{
"target" "t1"
"classname" "func_door"
"speed" "100"
"unknownkey" "kept"
}
`);
    const entity = [...doc.nodes.values()].find(
      (n) => n.kind === 'entity' && n.id !== doc.worldspawn,
    );
    expect(entity?.kind === 'entity' && entity.props).toEqual([
      ['target', 't1'],
      ['classname', 'func_door'],
      ['speed', '100'],
      ['unknownkey', 'kept'],
    ]);
  });

  it('sets attribsInFile only when the three fields are present', () => {
    const withAttribs = parseMap(`{
"classname" "worldspawn"
{
( 0 0 0 ) ( 0 64 0 ) ( 64 0 0 ) tex 0 0 0 1 1 1 2 3
( 0 0 0 ) ( 64 0 0 ) ( 0 64 0 ) tex 0 0 0 1 1
( 0 0 0 ) ( 0 0 64 ) ( 0 64 0 ) tex 0 0 0 1 1
( 0 0 0 ) ( 0 64 0 ) ( 0 0 64 ) tex 0 0 0 1 1
( 0 0 0 ) ( 64 0 0 ) ( 0 0 64 ) tex 0 0 0 1 1
( 0 0 0 ) ( 0 0 64 ) ( 64 0 0 ) tex 0 0 0 1 1
}
}
`);
    const brush = [...docValues(withAttribs)].find((n) => n.kind === 'brush');
    if (brush?.kind !== 'brush') {
      throw new Error('no brush');
    }
    expect(brush.faces[0]!.tex.attribsInFile).toBe(true);
    expect(brush.faces[0]!.tex.contents).toBe(1);
    expect(brush.faces[0]!.tex.flags).toBe(2);
    expect(brush.faces[0]!.tex.value).toBe(3);
    expect(brush.faces[1]!.tex.attribsInFile).toBe(false);
    expect(brush.faces[1]!.tex.contents).toBe(0);
  });

  it('imports a foreign func_group without _joole keys as a group', () => {
    const doc = parseMap(`${MINIMAL}{
"classname" "func_group"
"custom" "foreign"
}
`);
    const group = [...doc.nodes.values()].find((n) => n.kind === 'group');
    expect(group?.kind === 'group' && group.props).toEqual([['custom', 'foreign']]);
  });

  it('attaches entities to their group and strips the structural keys', () => {
    const doc = parseMap(`${MINIMAL}{
"classname" "func_group"
"_joole_id" "g1"
"_joole_name" "Room"
"_joole_locked" "1"
}
{
"classname" "func_door"
"_joole_group" "g1"
}
`);
    const group = [...doc.nodes.values()].find((n) => n.kind === 'group');
    const door = [...doc.nodes.values()].find(
      (n) => n.kind === 'entity' && n.id !== doc.worldspawn,
    );
    expect(group?.kind === 'group' && group.name).toBe('Room');
    expect(group?.kind === 'group' && group.locked).toBe(true);
    expect(door && doc.parent.get(door.id)).toBe(group?.id);
    expect(door?.kind === 'entity' && door.props.some(([k]) => k.startsWith('_joole_'))).toBe(
      false,
    );
  });

  it('nests groups through _joole_parent', () => {
    const doc = parseMap(`${MINIMAL}{
"classname" "func_group"
"_joole_id" "outer"
}
{
"classname" "func_group"
"_joole_id" "inner"
"_joole_parent" "outer"
}
`);
    const inner = [...doc.nodes.values()].find((n) => n.kind === 'group' && n.id === 'inner');
    expect(inner && doc.parent.get(inner.id)).toBe('outer');
  });

  it('handles comments in all forms', () => {
    const doc = parseMap(`// line comment
# hash comment
; semicolon comment
/* block
   comment */
{
"classname" "worldspawn" // trailing
}
`);
    expect(doc.nodes.size).toBe(1);
  });

  it('reports errors with line and column', () => {
    try {
      parseMap('{\n"classname" ');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(MapParseError);
      expect((error as MapParseError).line).toBeGreaterThan(0);
    }
  });
});

function docValues(doc: ReturnType<typeof parseMap>) {
  return doc.nodes.values();
}
