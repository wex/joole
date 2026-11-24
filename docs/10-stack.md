# Technology stack

This document describes Joole's technology stack: what is used, what for, and with which constraints. The functional requirements are in the specification ([00-spec.md](00-spec.md)), and the external source projects are listed in [20-sources.md](20-sources.md).

Versions are recorded as major versions. Exact versions are locked in `package.json` and `pnpm-lock.yaml`. A new dependency or version must have been published at least 7 days before it is adopted (see [Dependency management](#dependency-management)). The situation was checked on 24.11.2026.

## Summary

| Area                          | Technology                                                                              | Major version     | Purpose                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------ |
| Language                      | TypeScript (native `tsc`)                                                               | 7                 | All application code, `strict` mode, type checking                       |
| Lint-time TypeScript API      | TypeScript                                                                              | 6                 | The compiler API for typescript-eslint and the editor's language service |
| Runtime (development, CI)     | Node.js LTS                                                                             | 26                | Tooling, tests, running the `core/` code without a browser               |
| Package manager               | pnpm                                                                                    | 12                | Dependencies, scripts, lockfile                                          |
| Build and dev server          | Vite                                                                                    | 8                 | Dev server, production build, workers, static assets                     |
| UI                            | Solid (`solid-js`, `@solidjs/web`)                                                      | 2                 | Panels: properties, tree, texture browser, log, menus                    |
| Solid's Vite integration      | `@solidjs/vite-plugin`                                                                  | 3                 | JSX transform for Solid 2                                                |
| Rendering                     | WebGL2 + GLSL ES 3.00                                                                   | –                 | All four views in one canvas, no 3D library                              |
| Ids                           | nanoid                                                                                  | 6                 | Persistent node `Id`s                                                    |
| Native tools                  | Emscripten (emsdk)                                                                      | 7                 | qbsp3, qvis3 and qrad3 to WebAssembly                                    |
| PWA                           | vite-plugin-pwa (Workbox)                                                               | 2                 | Service worker and offline use (phase 5)                                 |
| Styles                        | CSS Modules (built into Vite) + CSS Grid                                                | –                 | Panel styles and layout                                                  |
| Icons                         | `lucide-static`                                                                         | 1                 | UI icons as static SVGs, plus custom CSG, Hollow and Clip icons          |
| Hosting                       | Cloudflare Workers (static assets)                                                      | –                 | Static production hosting with the COOP and COEP headers, preview per PR |
| CI                            | GitHub Actions                                                                          | –                 | Checks, E2E and WASM build reproducibility                               |
| Unit tests                    | Vitest + `@vitest/coverage-v8`                                                          | 5                 | The `core/` code, parsers, benchmarks, coverage                          |
| Property-based tests          | fast-check                                                                              | 4                 | CSG and geometry invariants                                              |
| E2E and screenshot comparison | Playwright                                                                              | 1                 | Workflows, performance tests, pixel comparison of the views              |
| Lint                          | ESLint (flat config) + typescript-eslint + eslint-plugin-import-x + eslint-plugin-solid | 10 / 8 / 4 / 0.20 | Layer boundaries, type rules, Solid 2 rules                              |
| Formatting                    | Prettier                                                                                | 3                 | Consistent code style                                                    |

## Language and typing: TypeScript 7

TypeScript 7 is the native implementation written in Go, and its `tsc` is many times faster than the 5.x and 6.x compilers. It is used only for type checking (`tsc -b`). Vite and Vitest strip types with their own transform, so the application build does not depend on `tsc`. TS 7.0 does not allow `--noEmit` in referenced composite projects (TS6310), so each project uses `emitDeclarationOnly` and writes declarations into the ignored `.tsbuild/` cache. No JavaScript is emitted.

- **Baseline options:** `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`, `isolatedModules`, `moduleResolution: "bundler"`, and `target`/`lib` at least ES2023.
- **Per-layer `tsconfig` projects** (project references):
  - `core/` and `game/q2/`: `"lib": ["ES2023"]` without the `DOM` and `WebWorker` libraries, and `"types": []`, so the global DOM and WebGL types (`document`, `WebGL2RenderingContext`) and Node's types are compile errors. An import restriction alone is not enough, because these types do not come from imports.
  - `app/`, `render/`, `platform/` and `ui/`: the `DOM` library. `src/main.ts` belongs to the same project.
  - `workers/`: the `WebWorker` library, without `DOM`.
  - Tests (`*.test.ts`, `*.bench.ts`): a project of their own, with the Vitest and `@types/node` types. The source projects contain no test files, so test types do not leak into the core.
- **Two TypeScript versions (decided 24.11.2026):** typescript-eslint 8 supports TypeScript's JS API only for versions below 6.1 (`typescript >=4.8.4 <6.1.0` in every `@typescript-eslint/*` package), and TS 7.0's root export has no compiler API. Therefore:
  - `typescript` is TS 6.0. typescript-eslint's parser and type-aware rules, and the editor's language service, resolve it. TS 6.0 was designed to match TS 7's semantics, so the two rarely disagree.
  - TS 7.0 is installed under the alias `typescript7` (`"typescript7": "npm:typescript@^7"`). Its `bin/tsc` is a Node launcher, so `pnpm typecheck` runs `node node_modules/typescript7/bin/tsc -b`. Both packages provide a `tsc` bin, so scripts never call a bare `tsc`.
  - The alias must not be named `@typescript/native`, because typescript-eslint treats that name as the opt-in for its experimental `tsgo` backend.
  - **Not chosen: the experimental `tsgo` backend** (`projectService: { EXPERIMENTAL_backend: 'tsgo' }`, available since typescript-eslint 8.73.0). It is explicitly experimental, and a maintainer stated on 10.11.2026 that it "is not yet ready for use". It needs a TS 7.1 prerelease as `@typescript/native`, still requires TS 6, and is currently up to about 1.5× slower than the classic backend on large projects. Revisit it when it leaves experimental status. TS 6 is removed once typescript-eslint supports TS 7 directly.
- **Editor:** the workspace's `typescript` (TS 6.0) by default. TS 7's native language server may be used if the editor supports it.

## Runtime and package management: Node.js 26 LTS and pnpm 12

The application runs in the browser. Node is needed only in development and CI: Vite, tests, ESLint and running the WASM tools in Node (the compiler test). Node 26 has been the Active LTS version since 28.10.2026.

- The version is pinned in `.nvmrc` and in the `engines.node` field of `package.json` (`>=26`).
- pnpm is chosen because its strict dependency isolation prevents using packages that are not listed in `package.json`, and because its installs are fast. The version is pinned in the `packageManager` field. Corepack is no longer bundled with Node 25+, so pnpm is installed separately (`npm install -g pnpm@12` or pnpm's own install script).
- The repository is a single package, not a monorepo. `pnpm-workspace.yaml` exists only for pnpm's settings.

### Dependency management

- `pnpm-workspace.yaml`: `minimumReleaseAge: 10080` (7 days in minutes). pnpm then refuses to install versions less than a week old, which protects against supply-chain attacks. The setting must not be bypassed to work around build problems.
- Versions use the `^` form, and the lockfile is in version control. CI installs with `pnpm install --frozen-lockfile`.
- Runtime dependencies are deliberately kept few: Solid, nanoid, the PWA runtime and the Lucide SVGs, which are bundled at build time. Math, geometry, parsers and rendering are our own code.
- Note: Solid 2.0.0 and `@solidjs/vite-plugin` 3.0 were released on 17.11.2026. They meet the 7-day rule, but the latest 2.0.x patch releases may not meet it yet.

## Build and dev server: Vite 8

Vite provides the dev server and the production build (Rolldown).

- **Workers:** `new Worker(new URL('./x.worker.ts', import.meta.url), { type: 'module' })`. Vite bundles workers separately. Uses: converting `.wal` textures to RGBA8, and running qbsp3, qvis3 and qrad3.
- **WASM and assets:** the `.wasm` files produced by Emscripten are loaded with a `?url` import, and shaders are loaded as strings with a `?raw` import.
- **COOP/COEP:** `server.headers` and `preview.headers` set `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`, so that `SharedArrayBuffer` and threaded WASM also work in development. In production, Cloudflare Workers sends the same headers based on the `public/_headers` file (see [Hosting and CI](#hosting-and-ci)).
- **Path aliases** mirror the directory structure (`@core/*`, `@game/*`, `@app/*`, `@render/*`, `@platform/*`, `@ui/*`). The `workers/` directory gets no alias, because nothing imports it. The aliases are defined in both the `tsconfig` and the Vite settings.

## UI: Solid 2

Solid 2 (`solid-js` 2 and `@solidjs/web` 2) is chosen as the panel library. Fine-grained reactivity updates only the DOM nodes whose data changes, and no virtual DOM is needed. This fits well with a model in which every command produces a patch of the changed nodes.

- **Scope:** the `ui/` layer only, that is, panels, menus, dialogs, the tree view, the texture and prefab browsers and the log pane. The views' `<canvas>` is a single DOM element that Solid creates but does not render. The renderer draws it itself. The renderer's interface accepts only core types (`MapDocument`, `Patch`, camera data), and `src/main.ts` subscribes it to the `app/` layer's change notifications. `render/` does not import `app/` or `ui/` (see the spec's layer rules).
- **State bridge:** `app/` provides the selection, settings and document change notifications. `ui/` turns them into Solid signals and stores. `core/`, `game/`, `app/`, `render/`, `platform/` and `workers/` do not import `solid-js`.
- **Vite integration:** `@solidjs/vite-plugin` 3 (a Babel-based JSX transform). The old `vite-plugin-solid` 2.x is for Solid 1 and is not installed.
- **Solid 2's API differs from Solid 1:** `createResource`, `batch`, `startTransition`, `on`, `produce`, `createComputed` and `createMutable` have been removed, and asynchrony goes through `createMemo` and the `<Loading>` component. Solid 1 examples and documentation are not used as they are (Solid 1's documentation is at v1.solidjs.com). Solid 2's development build reports reactivity mistakes as diagnostic codes, and they are fixed rather than suppressed.
- **Styles and layout:** CSS Modules (`*.module.css`), which Vite supports without extra dependencies. Each component has its own module, and class names are scoped to the component. Theme colours and dimensions are global CSS variables in one file (the design system's `tokens.css`, see [design-system/README.md](design-system/README.md)). The main layout (four views, side and bottom panels) uses CSS Grid. The fonts (IBM Plex Sans and Mono) are self-hosted from `public/fonts/`, because the app makes no external requests.
- **Icons:** Lucide via `lucide-static` (ISC; the icons derived from Feather are MIT, both GPLv2-compatible). Each icon is imported as an SVG string (`lucide-static/icons/<name>.svg?raw`), so only the used icons are bundled. `lucide-solid` is not used, because it requires `solid-js` 1. Custom icons for CSG Subtract, Hollow and Clip follow the same style (16 × 16, 1.5px stroke, `currentColor`) and live in `src/ui/icons/`. Lucide publishes almost daily, so the 7-day rule applies to every update.

## Rendering: WebGL2 without a 3D library

The raw WebGL2 API is chosen because the rendering is narrow and fully controlled: textured convex polygons, wireframes, the grid and handles. A library such as Three.js would bring its own scene graph that would compete with the document model.

- One WebGL2 context and one canvas. The views are delimited with `gl.viewport` and `gl.scissor`.
- Shaders are written in GLSL ES 3.00 (`#version 300 es`) as separate `.glsl` files in the `render/` directory.
- Thick lines are drawn with instanced quads, and the grid is drawn procedurally in a fragment shader.
- Textures: `REPEAT`, `generateMipmap`, `NEAREST_MIPMAP_LINEAR`.
- Math (vectors, matrices, planes) is our own code in the `core/` code at float64 precision. Conversion to `Float32Array` happens only when GPU buffers are written. Libraries such as gl-matrix are not used.
- Picking is done on the CPU with the BVH of the `core/geom/` module, not with a GPU id buffer.

## Geometry core and file formats

`core/` is dependency-free TypeScript code whose only external dependency is nanoid for ids. All parsers are pure functions (an `ArrayBuffer` or `string` in, a data structure out). They run both in the browser and in Node.

The modules are listed in dependency order: each may import only the ones above it.

| Module         | Contents                                                                                                             | External reference                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `core/types`   | data model types (`Id`, `Vec3`, `Plane`, `FaceTexture`, `Face`, node types, `MapDocument`, `Patch`), no runtime code | –                                                                                                  |
| `core/geom`    | vector and matrix math, planes, windings, CSG, picking, BVH, tolerances (`PLANE_EPS`, `POINT_EPS`)                   | Qoole `source/Objects/Geometry.cpp`, Quake-2-Tools `common/polylib.c`                              |
| `core/doc`     | creating nodes (nanoid), command implementations (`Command.run` → `Patch`), applying patches                         | Qoole `source/Qoole/QooleOp.cpp`                                                                   |
| `core/formats` | `.map`, `.pak`, `.pkz` (ZIP), `.wal`, `.pcx`, `.md2`, entity definitions, `.pts`, `.joole.json`                      | q2pro `inc/format/*.h` and `src/common/files.c` (`load_zip_file`), Quake-2-Tools `common/qfiles.h` |
| `game/q2`      | palette, surface and contents flags, directories, compile profiles, default texture                                  | Qoole `source/Game/Quake2.cpp`                                                                     |

The CommandBus, undo history (merging, memory limit) and selection live in the `app/` layer. They use the pure functions of the `core/doc` module.

## Browser platform APIs (`platform/`)

| API                                                                                    | Purpose                                                                                                       | Support                            |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| File System Access API (`showDirectoryPicker`, `showOpenFilePicker`, `createWritable`) | Choosing the game folder, opening a map and saving directly to the file, writing the `.bsp` to `baseq2/maps/` | Chromium                           |
| `<input type=file webkitdirectory>`, drag and drop, `<a download>`                     | Fallback path for opening and saving                                                                          | Firefox, Safari                    |
| `Blob.slice`                                                                           | Reading `.pak` files in chunks without loading the whole file into memory                                     | All                                |
| OPFS (Origin Private File System)                                                      | Autosave, prefabs, cache of converted textures                                                                | All                                |
| IndexedDB                                                                              | Settings, recent files, File System Access handles                                                            | All                                |
| Web Workers                                                                            | Texture conversion, WASM compilers                                                                            | All                                |
| `SharedArrayBuffer` + COOP/COEP                                                        | Threaded qvis3/qrad3                                                                                          | All, when the headers are in place |
| Pointer Lock API                                                                       | The 3D view's fly camera                                                                                      | All                                |
| Service Worker                                                                         | PWA, offline use                                                                                              | All                                |

Feature support is checked at runtime (feature detection), not by the browser's name.

**Supported browsers:** the latest two major versions of Chrome/Edge, Firefox and Safari. That comfortably covers WebGL2, OPFS, module workers and `DecompressionStream('deflate-raw')` (Chrome 103, Firefox 113 and Safari 16.4 onwards).

## Q2 compilers: Emscripten 7

qbsp3, qvis3 and qrad3 are compiled to WebAssembly from id Software's original [Quake-2-Tools](https://github.com/id-Software/Quake-2-Tools) source code (`ext/Quake-2-Tools`). According to the file headers, the licence is "GPL v2 or later". The version choice is recorded in the spec's decisions of 24.11.2026.

- **Template:** q3edit compiles q3map the same way (`q3map-compiler/Makefile`, `src/q3map-worker.ts`). Starting flags: `-sMODULARIZE=1`, `-sEXPORT_NAME=…`, `-sFORCE_FILESYSTEM=1`, `-sINVOKE_RUN=0`, `-sEXIT_RUNTIME=0`, `-sALLOW_MEMORY_GROWTH=1` and `-sEXPORTED_RUNTIME_METHODS=FS,callMain`. The environment is `web,worker,node`, so that the same build also works in CI's compiler test in Node.
- **Two builds per tool:** a threaded one (`-pthread`, requires COOP/COEP) and a single-threaded fallback build. Quake-2-Tools' `common/threads.c` is written for the Win32 and pthreads APIs, so it is adapted to Emscripten's pthreads support.
- **The native code** lives in the `tools/` directory: a copy of the needed Quake-2-Tools files, the Emscripten changes, a Makefile and a README in which every change to the original is recorded, as q3edit does.
- **Phasing:** a single-threaded `qbsp3.wasm` (environment `node`) is made in phase 2 for the compiler test. The browser builds, qvis3, qrad3 and threads are done in phase 5.
- **Distribution and reproducibility:** the finished `.wasm` files and their JS glue code are committed to the `workers/` directory, so developers do not need emsdk. CI rebuilds them with a pinned `emscripten/emsdk` Docker image and fails if the result differs from the committed files. The first build verifies that the output is deterministic (no timestamps or absolute paths). `pnpm build:tools` runs the same build locally.

## Testing

| Tool          | Target                                          | Notes                                                                                                                                                                                                                                                            |
| ------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest 5      | `core/`, `game/q2/`, `app/` (Node environment)  | Coverage with `@vitest/coverage-v8`, target ≥ 90 % of lines in the `core/` directory. Benchmarks (`vitest bench`) for the CSG targets in the performance table.                                                                                                  |
| fast-check 4  | CSG operations, building polygons, texture lock | Random convex brushes are used to check that results are valid and volumes are preserved.                                                                                                                                                                        |
| Vitest + WASM | Compiler test                                   | qbsp3.wasm runs in Node on the test maps, and the test fails on warnings.                                                                                                                                                                                        |
| Playwright 1  | E2E, performance, screenshot comparison         | The main browser is Chromium. Screenshot comparison runs in headless Chromium with SwiftShader software rendering (`--use-angle=swiftshader`), so the result is the same on every machine. Firefox and WebKit are tested in phase 5 for the load and save paths. |

`@solidjs/testing-library`, intended for unit testing UI components, exists for Solid 2 only as a release candidate, so it is not part of the base stack. Panels are tested with Playwright, and panel logic is kept in the `app/` layer, where Vitest can test it.

## Code quality

- **ESLint 10** with a flat config (`eslint.config.js`) and **typescript-eslint 8** (see the TS 7 limitation above).
- **Layer boundaries** are defined in the spec's _Layer order and dependency rules_ section and enforced with **eslint-plugin-import-x 4**'s rule `import-x/no-restricted-paths`. The original `eslint-plugin-import` (2.x) does not support ESLint 10. Path aliases (`@core/*` etc.) are resolved with the `eslint-import-resolver-typescript` package (`createTypeScriptImportResolver`), so that the zones also recognise alias imports. `src/main.ts` is not the target of any zone, so it may import everything. Starting configuration:

  ```js
  'import-x/no-restricted-paths': ['error', { zones: [
    { target: './src/core', from: ['./src/game', './src/app', './src/render', './src/platform', './src/ui', './workers'] },
    { target: './src/core/types', from: ['./src/core/geom', './src/core/doc', './src/core/formats'] },
    { target: './src/core/geom', from: ['./src/core/doc', './src/core/formats'] },
    { target: './src/core/doc', from: ['./src/core/formats'] },
    { target: './src/game', from: ['./src/app', './src/render', './src/platform', './src/ui', './workers'] },
    { target: ['./src/render', './src/platform'], from: ['./src/app', './src/ui'] },
    { target: './src/platform', from: './src/render' },
    { target: './src/app', from: './src/ui' },
    { target: './workers', from: ['./src/app', './src/ui', './src/render', './src/platform'] },
    { target: ['./src/app', './src/render', './src/platform', './src/ui'], from: './workers' },
  ]}]
  ```

  The last zone ensures that workers are reached only through messages. `new Worker(new URL(…, import.meta.url))` is not an import, so the worker clients in `platform/` work. Package-level restrictions use the built-in `no-restricted-imports` rule: `solid-js` and `@solidjs/*` are allowed only in `ui/`. Imports from the `core/types` module must use the `import type` form (`@typescript-eslint/consistent-type-imports`).

- **eslint-plugin-solid** is enabled for the `ui/` directory with its `v2` configuration. The configuration contains Solid 2's rules (for example `solid/removed-api`, which prevents use of the APIs removed in Solid 1). Support was checked from the package README on 24.11.2026.
- **Prettier 3** formats the code. ESLint's style rules are turned off (`eslint-config-prettier`), so the tools do not conflict.

## Role of the source projects

The sources are described in [20-sources.md](20-sources.md), and their local copies are in the `ext/<repo>/` directory. The table lists the source projects' most important files for the technical solutions, and the paths are relative to each repository's root (for example `ext/q2pro/inc/format/pak.h`). All are licensed "GPL v2 or later", so code may be moved into Joole (`GPL-2.0-or-later`) as long as the copyright notices are kept.

| Source                                                               | Files                                                                                                                                           | What is taken from it                                                                                                                                                                |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [q2pro](https://github.com/q2pro/q2pro)                              | `inc/format/{pak,wal,pcx,md2,bsp}.h`, `src/common/files.c`, `src/refresh/images.c`, `src/refresh/models.c`                                      | Binary format structures, the search order of paks and directories (mods), reading md2                                                                                               |
| [Quake-2](https://github.com/id-Software/Quake-2)                    | `qcommon/files.c` (`FS_AddGameDirectory`), `qcommon/qfiles.h`, `game/*.c` (`/*QUAKED*/` blocks, spawn functions), `ctf/*.c`                     | Vanilla engine behaviour (search order), generating entity definitions and the md2 table, an example of a mod's definitions (CTF)                                                    |
| [Quake-2-Tools](https://github.com/id-Software/Quake-2-Tools) `qe4/` | `eclass.c`, `csg.c` (`CSG_MakeHollow`, `CSG_Subtract`), `brush.c`, `map.c`, `points.c`, `vertsel.c`, `select.c`, `textures.c`                   | id's own Q2 editor QuakeEd 4: parsing `/*QUAKED … */` entity definitions, CSG and hollowing, building brushes from planes, reading and writing `.map`, the leak file, vertex editing |
| [Quake-2-Tools](https://github.com/id-Software/Quake-2-Tools)        | `common/qfiles.h`, `bsp/qbsp3/textures.c` (`TextureAxisFromPlane`, `TexinfoForBrushTexture`), `bsp/qbsp3/map.c`, `bsp/qbsp3/leakfile.c`         | Surface and contents flag constants, UV computation exactly as in the compiler, the `.map` parsing rules, the `.pts` format, the code compiled to WASM                               |
| [Qoole](https://github.com/demoth/qoole)                             | `source/Objects/Geometry.cpp`, `source/Objects/EntList.cpp`, `source/Game/Quake2.cpp`, `source/Qoole/QooleOp.cpp`, `source/Render/Selector.cpp` | The editor's behaviour: CSG, hollowing, plane clip, operations and undo, picking                                                                                                     |
| [q3edit](https://github.com/drdator/q3edit)                          | `q3map-compiler/Makefile`, `src/q3map-worker.ts`, `src/gl-utils.ts`, `src/pak.ts`, `src/map-parser.ts`                                          | Emscripten flags and the worker model for compilers, WebGL2 practices, browser-side pak and map handling                                                                             |

## Hosting and CI

**Cloudflare Workers static assets** hosts the production build (decided 24.11.2026). Cloudflare recommends Workers rather than Pages for new projects, and new features land there. `wrangler.jsonc` in the repository root sets `name: "joole"`, a `compatibility_date` and `assets.directory: "./dist"`; there is no Worker script. The `public/_headers` file (copied into `dist/` by Vite) sets `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` for all paths, so that `SharedArrayBuffer` and threaded WASM work. COEP requires all resources to come from the same origin. This fits the principle that no external runtime requests are made. The PWA's service worker is served from the same origin.

- **Content-Security-Policy:** `_headers` also sets `Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`, which enforces the no-external-requests rule. `wasm-unsafe-eval` is needed to compile WebAssembly, and `blob:`/`data:` images are needed for texture thumbnails. Inline scripts and inline `style` attributes are not allowed. Styles set through the CSSOM, as Solid's `style` prop does, are allowed. `vite preview` sends the same CSP so that the E2E tests run under it; the dev server does not, because Vite's HMR needs inline scripts. If Emscripten's pthread workers turn out to need `blob:` workers (P5.1), `worker-src` gains `blob:` with the reason recorded here.

- **Deployment:** Cloudflare's Git integration (Workers Builds) builds and deploys from GitHub: `main` goes to production, and other branches get a preview URL. No Cloudflare API token is stored in GitHub, and `wrangler` is not a project dependency. Because `main` accepts only PRs with green CI, production deploys only checked commits.
- **Domain:** the Cloudflare subdomain (`joole.<account>.workers.dev`) for now. A custom domain can be added at release (P5.7).
- Creating the Cloudflare account and connecting it to the repository is the owner's action.

**GitHub Actions** runs CI for every pull request and for the `main` branch:

- `pnpm install --frozen-lockfile`, `pnpm check` and `pnpm e2e` (Playwright, Chromium and SwiftShader). Node 26 is installed with the `actions/setup-node` action and pnpm with the `pnpm/action-setup` action.
- WASM job: `tools/` is built with the `emscripten/emsdk` Docker image and compared with the committed `.wasm` files.
- Third-party actions are pinned to a commit SHA, not a tag.

**Repository (decided 24.11.2026):** [github.com/wex/joole](https://github.com/wex/joole) under the `wex` GitHub account (it can be transferred to an organization later), public from the start. Pull requests are squash-merged, so the PR title becomes the commit message on `main` and must follow Conventional Commits; CI checks the title with a small script. `main` is protected: no direct pushes or force-pushes, the CI checks must pass, and the history is linear. No approving review is required, so a solo developer can merge their own PRs. The repository is created before CI is taken into use (P0.1).

## Keeping reference code out of the tooling (`ext/`)

`ext/` contains clones of the source projects, which include, among other things, hundreds of TypeScript files, their own tests (`ext/q3edit/tests/*.test.ts`), `package.json` files and an `index.html` (q3edit). These must not end up in Joole's build, tests or checks. Therefore:

- **tsconfig:** `include` lists only the `src/`, `workers/` and `tests/` directories.
- **Vitest:** `include` is limited to the `src/` and `tests/` directories, and the default `**/*.test.ts` search is not used.
- **Playwright:** `testDir` is `tests/e2e`.
- **ESLint:** a global `ignores: ['ext/**']` in the flat config.
- **Prettier:** `ext/` is added to `.prettierignore`. Prettier also honours `.gitignore`, but the separate entry makes the exclusion visible.
- **Vite:** `optimizeDeps.entries: ['index.html']`, because otherwise Vite scans dependencies from every HTML file in the project, including `ext/q3edit/index.html`. In addition, `server.watch.ignored` contains `**/ext/**`, so that the dev server does not watch thousands of reference files.
- **pnpm:** `pnpm-workspace.yaml` contains only settings and no `packages` list, so the `package.json` files in `ext/` do not become workspace packages.

## Open technology decisions

None at the moment.
