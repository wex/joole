import type { EntityClassDef, EntityKeyDef } from '@core/formats/index';

/**
 * Compiler/game-verified keys that the light QUAKED block documents only as
 * prose. qrad3 reads light/_light, _color, style/_style, target, angle and
 * _cone; the user-facing aliases below are the canonical Quake 2 editor keys.
 */
const LIGHT_KEYS: EntityKeyDef[] = [
  {
    name: 'light',
    type: 'float',
    description: 'light intensity (300 default)',
    defaultValue: '300',
  },
  {
    name: '_color',
    type: 'color',
    description: 'light colour as red green blue, normalized by qrad3 (white default)',
    defaultValue: '1 1 1',
  },
  {
    name: 'style',
    type: 'int',
    description: 'light style; styles 32 and above can be switched in game (0 default)',
    defaultValue: '0',
  },
  {
    name: '_cone',
    type: 'float',
    description: 'spotlight cone angle in degrees (10 default)',
    defaultValue: '10',
  },
  {
    name: 'target',
    type: 'target',
    description: 'target entity the spotlight points at',
  },
  {
    name: 'targetname',
    type: 'str',
    description: 'name used by triggers and other entities to switch this light',
  },
  {
    name: 'angle',
    type: 'angle',
    description: 'spotlight direction when the light has no target',
  },
];

/**
 * Key metadata corrections where release 3.21's implementation proves the
 * QUAKED prose stale. These still describe the key values written in a map,
 * not the scaled runtime fields: plat accel 50 becomes runtime accel 5.
 */
const CORRECTED_KEYS: Readonly<Record<string, readonly EntityKeyDef[]>> = {
  func_button: [
    {
      name: 'wait',
      type: 'float',
      description: 'wait before returning (3 default in release 3.21; -1 = never return)',
      defaultValue: '3',
    },
  ],
  func_plat: [
    {
      name: 'accel',
      type: 'float',
      description: 'acceleration key; 50 is equivalent to the runtime fallback after scaling',
      defaultValue: '50',
    },
  ],
};

function mergeKeys(base: readonly EntityKeyDef[], extra: readonly EntityKeyDef[]): EntityKeyDef[] {
  const out = [...base];
  const at = new Map(out.map((key, index) => [key.name, index]));
  for (const key of extra) {
    const existing = at.get(key.name);
    if (existing === undefined) {
      at.set(key.name, out.length);
      out.push(key);
    } else {
      out[existing] = { ...out[existing]!, ...key };
    }
  }
  return out;
}

/** Adds hand-verified Q2 metadata that cannot be recovered from quoted QUAKED key lines. */
export function withQ2EntityMetadata(defs: readonly EntityClassDef[]): EntityClassDef[] {
  return defs.map((def) => {
    let keys = def.keys;
    if (def.className === 'light') keys = mergeKeys(keys, LIGHT_KEYS);
    const corrections = CORRECTED_KEYS[def.className];
    if (corrections) keys = mergeKeys(keys, corrections);
    return keys === def.keys ? def : { ...def, keys };
  });
}

/**
 * Defaults verified against the game or compiler implementation, not merely
 * the prose of a QUAKED block. This distinction matters: several QUAKED lines
 * are stale or describe scaled units imprecisely (for example func_button's
 * documented one-second wait is three seconds in release 3.21, and func_plat's
 * documented accel value is not equivalent to the engine fallback). Values
 * here are either exact engine fallbacks or compiler fallbacks, so writing
 * them explicitly does not change the created entity's behavior.
 */
const VERIFIED_CREATION_DEFAULTS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  // g_spawn.c: gravity defaults to 800.
  worldspawn: { gravity: '800' },
  // qrad3 lightmap.c: intensity 300, white color, style 0 and cone 10.
  light: { light: '300', _color: '1 1 1', style: '0', _cone: '10' },
  // g_func.c SP_func_door.
  func_door: { speed: '100', wait: '3', lip: '8', dmg: '2' },
  // g_func.c SP_func_button (note: the QUAKED wait comment is stale).
  func_button: { speed: '40', wait: '3', lip: '4' },
  // g_func.c SP_func_plat: speed 200 becomes the same 20 units/s after scaling.
  func_plat: { speed: '200', lip: '8' },
  // g_func.c SP_func_rotating.
  func_rotating: { speed: '100', dmg: '2' },
  // g_trigger.c SP_trigger_multiple.
  trigger_multiple: { wait: '0.2' },
};

/**
 * Creation-default key/value pairs of one class in documented-key order.
 * QUAKED-extracted defaults remain panel hints, but only this implementation-
 * verified subset is written physically into a newly created entity.
 */
export function entityCreationDefaults(
  defs: readonly EntityClassDef[],
  classname: string,
): [string, string][] {
  const def = defs.find((item) => item.className === classname);
  const verified = VERIFIED_CREATION_DEFAULTS[classname];
  if (!def || !verified) return [];
  const out: [string, string][] = [];
  for (const key of def.keys) {
    const value = verified[key.name];
    if (value !== undefined) out.push([key.name, value]);
  }
  // worldspawn has no creation-only rows outside its documented keys, but keep
  // a defensive pass for supplemental metadata that is not in def.keys.
  for (const [key, value] of Object.entries(verified)) {
    if (!out.some(([existing]) => existing === key)) out.push([key, value]);
  }
  return out;
}
