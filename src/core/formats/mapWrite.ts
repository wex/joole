import type {
  BrushNode,
  EntityNode,
  Face,
  GroupNode,
  MapDocument,
  MapNode,
  Vec3,
} from '@core/types/index';
import { convertBrushToIntegerPoints } from '../geom/integerPoints';

export type MapWriteMode = 'export' | 'clipboard';

export interface MapWriteResult {
  text: string;
  /**
   * Warnings from the integer plane point conversion in export mode,
   * naming the brushes that could not be converted.
   */
  warnings: string[];
}

export interface MapWriteOptions {
  mode: MapWriteMode;
  /**
   * Decides whether the optional contents, flags and value fields are
   * written for a face. The default follows the attribsInFile rule; the
   * application layer passes a texture-aware predicate that also writes
   * them when they differ from the texture's defaults or the texture is
   * missing, as the spec requires.
   */
  writeAttribs?: (face: Face) => boolean;
}

/**
 * The canonical number form: integers without decimals, other numbers
 * with at most six decimals and no trailing zeros.
 */
export function formatNumber(n: number): string {
  if (Number.isInteger(n)) {
    return String(n);
  }
  let s = n.toFixed(6);
  while (s.endsWith('0')) {
    s = s.slice(0, -1);
  }
  if (s.endsWith('.')) {
    s = s.slice(0, -1);
  }
  return s;
}

function point(p: Vec3): string {
  return `( ${formatNumber(p[0])} ${formatNumber(p[1])} ${formatNumber(p[2])} )`;
}

function faceLine(face: Face, writeAttribs: (face: Face) => boolean): string {
  const t = face.tex;
  const base = `${face.points.map(point).join(' ')} ${t.name} ${formatNumber(t.offset[0])} ${formatNumber(t.offset[1])} ${formatNumber(t.rotation)} ${formatNumber(t.scale[0])} ${formatNumber(t.scale[1])}`;
  if (writeAttribs(face)) {
    return `${base} ${formatNumber(t.contents)} ${formatNumber(t.flags)} ${formatNumber(t.value)}`;
  }
  return base;
}

function brushText(brush: BrushNode, writeAttribs: (face: Face) => boolean): string[] {
  return ['{', ...brush.faces.map((f) => faceLine(f, writeAttribs)), '}'];
}

function propLine([key, value]: [string, string]): string {
  return `"${key}" "${value}"`;
}

/**
 * Writes a MapDocument as a canonical Q2 .map file. Groups are written as
 * func_group entities carrying the _joole keys, entities inside a group
 * carry _joole_group, so the round trip loses nothing.
 */
export function writeMap(doc: MapDocument, options: MapWriteOptions): MapWriteResult {
  const writeAttribs = options.writeAttribs ?? ((face: Face) => face.tex.attribsInFile);
  const warnings: string[] = [];
  // export converts every face to integer plane points; the clipboard
  // keeps full precision, as the spec requires
  if (options.mode === 'export') {
    const nodes = new Map<string, MapNode>();
    for (const [id, node] of doc.nodes) {
      if (node.kind === 'brush') {
        const conversion = convertBrushToIntegerPoints(node);
        warnings.push(...conversion.warnings);
        nodes.set(id, conversion.brush);
      } else {
        nodes.set(id, node);
      }
    }
    doc = { ...doc, nodes };
  }
  const lines: string[] = [];

  function writeBrushChildren(node: EntityNode | GroupNode): void {
    for (const childId of node.children) {
      const child = doc.nodes.get(childId);
      if (child?.kind === 'brush') {
        lines.push(...brushText(child, writeAttribs));
      }
    }
  }

  function writeEntityBody(node: EntityNode | GroupNode, extraProps: [string, string][]): void {
    lines.push('{');
    for (const prop of [...node.props.slice(0, 1), ...extraProps, ...node.props.slice(1)].filter(
      Boolean,
    )) {
      lines.push(propLine(prop));
    }
    writeBrushChildren(node);
    lines.push('}');
  }

  function writeGroup(group: GroupNode): void {
    const keys: [string, string][] = [
      ['classname', 'func_group'],
      ['_joole_id', group.id],
      ['_joole_name', group.name],
    ];
    const parentId = doc.parent.get(group.id);
    const parentNode = parentId ? doc.nodes.get(parentId) : undefined;
    if (parentNode?.kind === 'group') {
      keys.push(['_joole_parent', parentNode.id]);
    }
    if (group.locked) {
      keys.push(['_joole_locked', '1']);
    }
    if (group.hidden) {
      keys.push(['_joole_hidden', '1']);
    }
    lines.push('{');
    for (const prop of [...keys, ...group.props]) {
      lines.push(propLine(prop));
    }
    writeBrushChildren(group);
    lines.push('}');
  }

  function writeEntity(entity: EntityNode, groupId?: string): void {
    const extra: [string, string][] = groupId ? [['_joole_group', groupId]] : [];
    writeEntityBody(entity, extra);
  }

  function writeChildren(node: EntityNode | GroupNode): void {
    for (const childId of node.children) {
      const child = doc.nodes.get(childId);
      if (!child) {
        continue;
      }
      if (child.kind === 'group') {
        writeGroup(child);
        writeChildrenInGroup(child);
      } else if (child.kind === 'entity') {
        writeEntity(child, node.kind === 'group' ? node.id : undefined);
      }
    }
  }

  function writeChildrenInGroup(group: GroupNode): void {
    for (const childId of group.children) {
      const child = doc.nodes.get(childId);
      if (!child) {
        continue;
      }
      if (child.kind === 'entity') {
        writeEntity(child, group.id);
      } else if (child.kind === 'group') {
        writeGroup(child);
        writeChildrenInGroup(child);
      }
    }
  }

  // the worldspawn first, then everything in tree order
  const world = doc.nodes.get(doc.worldspawn) as EntityNode;
  lines.push('{');
  for (const prop of world.props) {
    lines.push(propLine(prop));
  }
  writeBrushChildren(world);
  lines.push('}');
  writeChildren(world);

  return { text: lines.join('\n') + '\n', warnings };
}
