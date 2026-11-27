import type { EntityClassDef } from './quaked';

/**
 * Merges mod entity definitions into the vanilla set (spec, Entity
 * definitions): a mod class overrides the vanilla class metadata of the same name
 * in place, while documented keys merge by key name, and new mod classes are appended in file order.
 */
export function mergeEntityDefs(
  base: readonly EntityClassDef[],
  mod: readonly EntityClassDef[],
): EntityClassDef[] {
  const out = [...base];
  const indexByName = new Map(out.map((def, i) => [def.className, i]));
  for (const def of mod) {
    const existing = indexByName.get(def.className);
    if (existing !== undefined) {
      const baseDef = out[existing]!;
      const keys = [...baseDef.keys];
      const keyIndex = new Map(keys.map((key, index) => [key.name, index]));
      for (const key of def.keys) {
        const at = keyIndex.get(key.name);
        if (at === undefined) {
          keyIndex.set(key.name, keys.length);
          keys.push(key);
        } else {
          keys[at] = key;
        }
      }
      out[existing] = { ...def, keys };
    } else {
      indexByName.set(def.className, out.length);
      out.push(def);
    }
  }
  return out;
}
