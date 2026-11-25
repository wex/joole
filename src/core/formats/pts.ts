import type { Vec3 } from '@core/types/index';

/**
 * Parses a qbsp3 pointfile (.pts): one "x y z" point per line, tracing the
 * leak path from the void to the offending entity. Blank lines are ignored.
 */
export function parsePts(text: string): Vec3[] {
  const points: Vec3[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    const parts = line.split(/\s+/).map(Number);
    if (parts.length !== 3 || parts.some((v) => !Number.isFinite(v))) {
      throw new Error(`bad pointfile line: ${line}`);
    }
    points.push(parts as Vec3);
  }
  return points;
}
