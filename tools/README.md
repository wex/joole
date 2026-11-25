# Quake 2 compiler ports

`qbsp3/` contains the qbsp3 sources copied from the GPL `Quake-2-Tools` project, with provenance headers in every copied file.

Joole changes:

1. `map.c` reads plane points with `atof` rather than `atoi`, so fractional geometry survives the compiler oracle; Joole's export writer performs the validated integer conversion itself.
2. `cmdlib.c` uses `getcwd` rather than obsolete `getwd` for Emscripten.
3. No threading changes are needed for qbsp3: upstream forces `numthreads = 1`.

Build with `pnpm build:tools` (or `make -C tools/qbsp3` when `emcc` is installed). The output is committed in `workers/wasm/` for reproducibility and normal development without emsdk.
