import type { Vec3 } from '../types/index';

/**
 * A parser for Radiant's /*QUAKED ... *‍/ entity definition blocks, in both
 * `.def` files and the game code's `.c` sources (spec, Entity definitions).
 * The approach follows id's QuakeEd, which read the blocks straight from the
 * source (`ext/Quake-2-Tools/qe4/eclass.c`).
 */

export type EntityKeyType =
  'str' | 'int' | 'float' | 'vec' | 'color' | 'angle' | 'target' | 'flagdef';

export interface EntityKeyDef {
  readonly name: string;
  readonly type: EntityKeyType;
  readonly description: string;
  /** Numeric default extracted verbatim from the QUAKED documentation, when stated there. */
  readonly defaultValue?: string;
}

export interface EntityClassDef {
  readonly className: string;
  /** The rgb colour of the definition, components in 0..1. */
  readonly color: readonly [number, number, number];
  /** Point entities carry their editor bounding box; brush entities are 'brush'. */
  readonly bbox: 'brush' | { readonly mins: Vec3; readonly maxs: Vec3 };
  /** Spawnflag names by bit position; an unused bit keeps its place as 'x' or '-'. */
  readonly spawnflags: readonly string[];
  /** The comment text between the header lines and the end of the block. */
  readonly description: string;
  /** The keys documented in the description as `"key" description` lines. */
  readonly keys: readonly EntityKeyDef[];
}

export interface QuakedParseOptions {
  /** Key-type overrides by key name, applied after the heuristics. */
  readonly overrides?: Readonly<Record<string, EntityKeyType>>;
}

const INT_KEYS = new Set([
  'angle',
  'count',
  'health',
  'dmg',
  'sounds',
  'style',
  'lip',
  'items',
  'spawnflags',
  'skin',
  'armortype',
  'armorvalue',
]);

const FLOAT_KEYS = new Set([
  'wait',
  'delay',
  'radius',
  'height',
  'distance',
  'mass',
  'gravity',
  'skyrotate',
  'volume',
  'attenuation',
  'time',
  'speedfactor',
]);

const VEC_KEYS = new Set(['origin', 'movedir', 'skyaxis', 'vangle', 'mins', 'maxs']);

function keyType(name: string, description: string): EntityKeyType {
  if (name === '_color' || name.endsWith('color')) return 'color';
  if (VEC_KEYS.has(name)) return 'vec';
  if (INT_KEYS.has(name)) return 'int';
  if (FLOAT_KEYS.has(name)) return 'float';
  if (name === 'speed') return 'int';
  void description;
  return 'str';
}

const HEADER =
  /^\/\*QUAKED\s+(\S+)\s+\(\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\)\s+(\([^)]*\)\s*\([^)]*\)|\?)\s*([^\n]*)/;

function parseHeader(line: string): {
  className: string;
  color: [number, number, number];
  bbox: EntityClassDef['bbox'];
  spawnflags: string[];
} | null {
  const m = HEADER.exec(line);
  if (!m) return null;
  const color: [number, number, number] = [parseFloat(m[2]!), parseFloat(m[3]!), parseFloat(m[4]!)];
  let bbox: EntityClassDef['bbox'];
  if (m[5]!.trim() === '?') {
    bbox = 'brush';
  } else {
    const nums = m[5]!.match(/-?[\d.]+/g)!.map(Number);
    bbox = {
      mins: [nums[0]!, nums[1]!, nums[2]!],
      maxs: [nums[3]!, nums[4]!, nums[5]!],
    };
  }
  const spawnflags = m[6]!.trim().length > 0 ? m[6]!.trim().split(/\s+/) : [];
  return { className: m[1]!, color, bbox, spawnflags };
}

const KEY_LINE = /^\s*"([^"]+)"\s*(\S.*)?$/;

/** Extracts a numeric default documented in phrases such as "(2 default)" or "default is 1". */
export function documentedDefault(description: string): string | undefined {
  const patterns = [
    /\((-?\d*\.?\d+)\s+default(?:\s|,|\))/i,
    /(?:overrides?\s+)?the\s+default\s+(-?\d*\.?\d+)/i,
    /defaults?\s*(?:value\s*)?(?:is|:|to)?\s*(-?\d*\.?\d+)/i,
    /(-?\d*\.?\d+)\s+is\s+default\b/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(description);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value)) return String(value);
  }
  return undefined;
}

/**
 * Parses every QUAKED block in the text. Sibling classes (several header
 * lines inside one comment) share the description and its keys.
 */
export function parseQuakedBlocks(text: string, options?: QuakedParseOptions): EntityClassDef[] {
  const lines = text.split('\n');
  const out: EntityClassDef[] = [];
  type Header = NonNullable<ReturnType<typeof parseHeader>>;
  let pending: Header[] = [];
  let body: string[] = [];
  let inBlock = false;

  const flush = () => {
    if (pending.length === 0) return;
    const description = body.join('\n').trim();
    const keys: EntityKeyDef[] = [];
    const seen = new Set<string>();
    for (const line of body) {
      const m = KEY_LINE.exec(line);
      if (!m || seen.has(m[1]!)) continue;
      seen.add(m[1]!);
      const type = options?.overrides?.[m[1]!] ?? keyType(m[1]!, m[2] ?? '');
      const description = (m[2] ?? '').trim();
      const defaultValue = documentedDefault(description);
      keys.push({ name: m[1]!, type, description, ...(defaultValue ? { defaultValue } : {}) });
    }
    for (const header of pending) {
      out.push({ ...header, description, keys });
    }
    pending = [];
    body = [];
  };

  for (const line of lines) {
    const header = parseHeader(line);
    if (line.includes('/*QUAKED') && header) {
      inBlock = true;
      pending.push(header);
      continue;
    }
    if (!inBlock) continue;
    if (line.includes('*/')) {
      if (body.length > 0) body.push(line.slice(0, line.indexOf('*/')));
      flush();
      inBlock = false;
      continue;
    }
    body.push(line);
  }
  flush();
  return out;
}
