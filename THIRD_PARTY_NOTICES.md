# Third-party notices

This file lists code and data incorporated into Joole from external sources, with their origins and licences.

## IBM Plex Sans and IBM Plex Mono

- **Files:** `public/fonts/IBMPlexSansVar-Roman.woff2`, `public/fonts/IBMPlexMonoVar-Roman.woff2`
- **Origin:** IBM Plex typefaces, copyright © 2017 IBM Corp., with Reserved Font Name "Plex"
- **Licence:** SIL Open Font License 1.1. The full licence text is distributed as `public/fonts/OFL.txt`.

## Lucide icons

- **Files:** SVG icon strings imported at build time from `lucide-static` 1.74.0 in `src/ui/icons.ts`
- **Origin:** Lucide Icons and Contributors; some Lucide icons are derived from Feather, copyright © 2013-present Cole Bemis
- **Licence:** ISC License; the listed Feather-derived icons are under the MIT License. The raw SVG files carry their licence header, and the licence texts are in the `lucide-static` package's `LICENSE` file.

The custom CSG Subtract, Hollow and Clip icons in `src/ui/icons/` are original Joole artwork drawn in the same visual style; they are not copied from Lucide or Feather.

## Quake 2 compile tools (qbsp3, qvis3, qrad3)

- **Files:** everything under `tools/qbsp3/`, `tools/qvis3/` and `tools/qrad3/` except the build files, plus the committed WebAssembly builds in `public/wasm/`
- **Origin:** id Software's Quake-2-Tools, copyright © 1997 id Software, Inc., copied from the GPL release with per-file provenance headers
- **Licence:** GNU General Public License v2.0 or later. Joole's modifications are listed in `tools/README.md` and carry the same licence.

## Quake 2 entity definitions and model table

- **Files:** `src/game/q2/q2.def`, `src/game/q2/models.ts` (generated), and the generator `scripts/gen-entities.ts`
- **Origin:** generated from id Software's GPL Quake 2 game source release (the `QUAKED` documentation comments and the spawn function tables), copyright © 1997 id Software, Inc.
- **Licence:** GNU General Public License v2.0 or later.

## Reference-only sources

Qoole 99, q2pro and q3edit were read as references for behaviour, formats and browser techniques, but no code was copied from them; they therefore have no licence entries here.
