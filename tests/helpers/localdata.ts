import { describe } from 'vitest';

export type LocalDataVariable = 'JOOLE_Q2_DIR' | 'JOOLE_MAPS_DIR';

export function localDataPath(variable: LocalDataVariable): string | undefined {
  return process.env[variable];
}

export function hasLocalData(variable: LocalDataVariable): boolean {
  return localDataPath(variable) !== undefined;
}

export const describeWithQ2Dir = describe.skipIf(!hasLocalData('JOOLE_Q2_DIR')) as typeof describe;
export const describeWithMapsDir = describe.skipIf(
  !hasLocalData('JOOLE_MAPS_DIR'),
) as typeof describe;
