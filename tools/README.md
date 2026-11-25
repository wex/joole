# Quake 2 compiler ports

`qbsp3/` contains the qbsp3 sources copied from the GPL `Quake-2-Tools` project, with provenance headers in every copied file.

Joole changes:

1. `map.c` reads plane points with `atof` rather than `atoi`, so fractional geometry survives the compiler oracle; Joole's export writer performs the validated integer conversion itself.
2. `cmdlib.c` uses `getcwd` rather than obsolete `getwd` for Emscripten.
3. No threading changes are needed for qbsp3: upstream forces `numthreads = 1`.

`qvis3/` and `qrad3/` contain the qvis3 and qrad3 sources copied the same way.

Joole changes there:

1. `qvis3.c` drops its duplicate of the `pw` debug print, which `common/polylib.c` already provides; wasm-ld rejects the duplicate symbol.
2. `common/lbmlib.c` and `lbmlib.h` were copied from the top-level Quake-2-Tools `common/` for qrad3's colormap loading.
3. All tools build with `-fcommon` for the legacy tentative definitions, and qvis3/qrad3 build with a 4 MB stack (`-sSTACK_SIZE`), because their recursion overflows the 64 kB default.

Build with `pnpm build:tools` (or `make -C tools/qbsp3` when `emcc` is installed). The output is committed in `workers/wasm/` for reproducibility and normal development without emsdk.
