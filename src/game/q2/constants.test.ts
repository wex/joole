import { describe, expect, it } from 'vitest';
import {
  BASE_GAME_DIR,
  COMPILE_PROFILES,
  CONTENTS_SOLID,
  CONTENTS_DETAIL,
  CONTENTS_LADDER,
  DEFAULT_TEXTURE,
  PALETTE_PATH,
  SURF_NODRAW,
  SURF_SKY,
  SURF_TRANS33,
} from './constants';

describe('q2 constants', () => {
  it('matches qfiles.h values', () => {
    expect(CONTENTS_SOLID).toBe(1);
    expect(CONTENTS_DETAIL).toBe(0x8000000);
    expect(CONTENTS_LADDER).toBe(0x20000000);
    expect(SURF_NODRAW).toBe(0x80);
    expect(SURF_SKY).toBe(0x4);
    expect(SURF_TRANS33).toBe(0x10);
  });

  it('names the default texture, base directory and palette', () => {
    expect(DEFAULT_TEXTURE).toBe('e2u1/mine10_1');
    expect(BASE_GAME_DIR).toBe('baseq2');
    expect(PALETTE_PATH).toBe('pics/colormap.pcx');
  });

  it('has the three compile profiles of the spec', () => {
    expect([...COMPILE_PROFILES]).toEqual(['fast', 'normal', 'final']);
  });
});
