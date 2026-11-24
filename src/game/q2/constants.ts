/**
 * Quake 2 constants, checked against ext/Quake-2-Tools/common/qfiles.h
 * on 24.11.2026.
 */

export const CONTENTS_SOLID = 1;
export const CONTENTS_WINDOW = 2;
export const CONTENTS_AUX = 4;
export const CONTENTS_LAVA = 8;
export const CONTENTS_SLIME = 16;
export const CONTENTS_WATER = 32;
export const CONTENTS_MIST = 64;
export const CONTENTS_AREAPORTAL = 0x8000;
export const CONTENTS_PLAYERCLIP = 0x10000;
export const CONTENTS_MONSTERCLIP = 0x20000;
export const CONTENTS_CURRENT_0 = 0x40000;
export const CONTENTS_CURRENT_90 = 0x80000;
export const CONTENTS_CURRENT_180 = 0x100000;
export const CONTENTS_CURRENT_270 = 0x200000;
export const CONTENTS_CURRENT_UP = 0x400000;
export const CONTENTS_CURRENT_DOWN = 0x800000;
export const CONTENTS_ORIGIN = 0x1000000;
export const CONTENTS_MONSTER = 0x2000000;
export const CONTENTS_DEADMONSTER = 0x4000000;
export const CONTENTS_DETAIL = 0x8000000;
export const CONTENTS_TRANSLUCENT = 0x10000000;
export const CONTENTS_LADDER = 0x20000000;

export const SURF_LIGHT = 0x1;
export const SURF_SLICK = 0x2;
export const SURF_SKY = 0x4;
export const SURF_WARP = 0x8;
export const SURF_TRANS33 = 0x10;
export const SURF_TRANS66 = 0x20;
export const SURF_FLOWING = 0x40;
export const SURF_NODRAW = 0x80;
export const SURF_HINT = 0x100;
export const SURF_SKIP = 0x200;

/** The texture new brushes get, as in Qoole. */
export const DEFAULT_TEXTURE = 'e2u1/mine10_1';
/** The base game directory every installation has. */
export const BASE_GAME_DIR = 'baseq2';
/** Location of the palette inside the game data. */
export const PALETTE_PATH = 'pics/colormap.pcx';

/**
 * Compile profile names. Their parameters are filled in during P5.2:
 * fast = qbsp3 and qvis3 -fast without qrad3, normal, final = qrad3 -extra.
 */
export const COMPILE_PROFILES = ['fast', 'normal', 'final'] as const;
export type CompileProfile = (typeof COMPILE_PROFILES)[number];
