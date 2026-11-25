import type { EntityClassDef } from './quaked';

/**
 * Merges mod entity definitions into the vanilla set (spec, Entity
 * definitions): a mod class overrides the vanilla class of the same name in
 * place, and new mod classes are appended in file order.
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
      out[existing] = def;
    } else {
      indexByName.set(def.className, out.length);
      out.push(def);
    }
  }
  return out;
}
