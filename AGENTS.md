# AGENTS.md – Joole

Joole is a browser-based, brush-based Quake 2 map editor (TypeScript, WebGL2, Solid 2). Its functional model is Qoole 99. The licence is GNU GPL v2.0 or later (`GPL-2.0-or-later`).

This file is a guide for both human developers and coding agents: where information is found, how development proceeds and which rules apply.

## Documentation

| File                                                | Contents                                                                                                               | When to update                                                                                            |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [docs/00-spec.md](docs/00-spec.md)                  | Technical specification: goals, scope, architecture, data model, formats, algorithms, implementation phases, decisions | When functionality, scope or architecture changes, or when a detail is verified against the source code   |
| [docs/10-stack.md](docs/10-stack.md)                | Technologies, major versions, purposes and constraints                                                                 | When a dependency is added or removed or its major version changes, or when a technology decision is made |
| [docs/20-sources.md](docs/20-sources.md)            | External source projects, what they are used for, and their local copies in the `ext/` directory                       | When a new source is adopted (it is also cloned into `ext/`)                                              |
| [docs/design-system/](docs/design-system/README.md) | UI design system: tokens, components, the UI's language and voice                                                      | When UI conventions, tokens or components change                                                          |
| [PLAN.md](PLAN.md)                                  | Implementation plan: phases 0–5, work packages (`P<phase>.<n>`), dependencies, gates and risks                         | When a work package is finished (checkbox), when the order or breakdown changes, or when the spec changes |
| `AGENTS.md`                                         | Development process, commands and practices                                                                            | When a command, process or practice changes                                                               |

**Rules:**

- **The spec is normative.** If the implementation deviates from the spec, the spec is updated in the same change, or the change is not made and the question is raised. Code is not written against the spec.
- **Information lives in one place.** Technologies and versions are only in `10-stack.md`, and the spec refers there. Functional requirements are only in the spec.
- **Decisions are recorded** in the spec's _Decisions dd.mm.yyyy_ section with a date. Open items are `- [ ]` tasks in the _To be refined later_ list (spec) or the _Open technology decisions_ list (stack). A resolved item is ticked off or moved to the decisions.
- **Numbering:** `docs/` files are numbered in tens (`00`, `10`, `20` …). A new document gets the next free number, for example `30-testdata.md`.
- **Diagrams** are written in Mermaid (` ```mermaid `), so they render on GitHub and are readable as text. Embedded images and external diagram tools are not used.
- **Language:** all documentation is written in English, as are code identifiers, code comments and commit messages. File names, identifiers and commands are marked as `code` in documents.

## Project status

Phase 0 (_Foundations_) is complete. The scaffold is merged on `main` (PR #1) with branch protection enforced (PRs required, `check` and `conventional-pr-title` as required checks, linear history, no force-pushes). CI is verified both ways: green on a normal PR and red and unmergeable on a deliberate layer violation (PR #2). The production deployment is live at [joole.niko-hujanen.workers.dev](https://joole.niko-hujanen.workers.dev/) with verified security headers (`crossOriginIsolated === true`, verified 24.11.2026). One known operational issue: Cloudflare Workers Builds fail on non-`main` branch pushes, so PR preview deployments do not work yet; production deployment is unaffected. Phase 1 (_Reader and viewer_) is next.

## Directory structure and layer rules

The layered architecture, its diagram and the dependency rules are in the spec's _Architecture_ section (_Layer order and dependency rules_). The ESLint configuration is in the stack's _Code quality_ section. A summary follows.

```text
docs/             specification, stack, sources, design system
ext/              Git clones of the source projects, read-only (never in Git)
src/
  main.ts         start-up: the only file that may import every layer
  core/types/     shared data model types (types only)
  core/geom/      planes, windings, CSG, picking, BVH
  core/doc/       document model, commands, patches
  core/formats/   map, pak, pkz, wal, pcx, md2, def, pts, project (.joole.json)
  game/q2/        Q2 constants and defaults, generated q2.def, md2 table
  app/            CommandBus and undo, selection and scope, settings, tool logic
  render/         WebGL2, shaders, view drawing
  platform/       files, OPFS, IndexedDB, worker clients
  ui/             Solid panels, view input and cameras
workers/          texture conversion, qbsp3/qvis3/qrad3.wasm (committed builds)
tools/            C source of the Q2 compilers, Emscripten build and change log (README)
tests/            E2E tests (Playwright) and test data
```

Unit tests are placed next to the file they test (`foo.ts` → `foo.test.ts`).

**Dependency order** from top to bottom: **UI (`ui/`) → application (`app/`) → platform (`render/`, `platform/`, `workers/`) → core (`core/`)**. `game/q2/` sits between the core and the other layers. A layer may import only lower layers and the core.

**Hard rules** (enforced with the `import-x/no-restricted-paths` rule and the tsconfig projects):

1. `core/` does not import other `src/` layers and does not use DOM, WebGL or Node APIs. Of external packages, it uses only nanoid. It runs as is in Node.
2. The core's internal order is `core/types` ← `core/geom` ← `core/doc` ← `core/formats`. `core/types` contains only types and is imported with `import type`.
3. `game/q2/` may import only `core/`, and the core does not import `game/q2/`. Game-specific constants (palette, flags, paths, default texture, compile profiles) live only there.
4. The platform (`render/`, `platform/`, `workers/`) does not import `app/` or `ui/`. `render/` may import `platform/`, but not the other way round.
5. `workers/` may import only `core/` and `game/q2/` modules. Other layers do not import worker code. They talk to workers with messages through the worker clients in `platform/`.
6. `app/` does not import `ui/`. Imports within a layer are free.
7. The document is changed only through the `CommandBus`. The UI, renderer and platform never change the `MapDocument` directly.
8. The renderer's interface accepts only core types (`MapDocument`, `Patch`, camera). `src/main.ts` subscribes it to the application's change notifications.
9. The tools' state machine and logic (which command an input produces) live in `app/`. The `ui/` views convert input into world coordinates, handle the cameras and pass the events to the tool.
10. `solid-js` and `@solidjs/*` are used only in `ui/`.

If a change requires a new dependency direction, the spec's rule table, the Mermaid diagram and the ESLint zones are updated in the same change. Rules are not bypassed with an `eslint-disable` comment.

## Development environment

- **Node.js 26 LTS** (`.nvmrc`) and **pnpm 12** (the `packageManager` field). Corepack is not bundled with Node 26, so pnpm is installed separately.
- **A Chromium-based browser** (Chrome or Edge) for development, because the File System Access API works only there. The Firefox and Safari paths are tested separately. The supported browsers are the latest two major versions of Chrome/Edge, Firefox and Safari.
- **emsdk** (or Docker and the `emscripten/emsdk` image) is needed only when the Q2 compilers (`tools/`) are changed. The finished `.wasm` files are in the repository.
- **Source projects:** clone the repositories listed in `docs/20-sources.md` into `ext/` (the commands are in that file). They are needed for reading source code, but not for the build or tests.
- **`JOOLE_Q2_DIR`:** the path of a local Q2 installation (the directory containing `baseq2/`) for tests that use game data.
- **`JOOLE_MAPS_DIR`:** the directory of id's released Q2 map sources (base1–base3 from `base100.zip`, the CTF and match map packs) for the round-trip tests on vanilla maps. They are not part of the game installation.
- **q2pro** for testing compiled maps in the game. It is the reference engine.
- **Q2 game data:** testing requires your own legal Quake 2 installation (`baseq2/pak0.pak`). The game data is not GPL-licensed, and it is never added to the repository (see Test data).

## Commands

| Command                             | Purpose                                                                          |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| `pnpm install`                      | Install dependencies (`--frozen-lockfile` in CI)                                 |
| `pnpm dev`                          | Vite dev server with the COOP/COEP headers                                       |
| `pnpm build`                        | Production build into `dist/`                                                    |
| `pnpm preview`                      | Run the production build locally                                                 |
| `pnpm typecheck`                    | TypeScript 7 (`node node_modules/typescript7/bin/tsc -b`), all tsconfig projects |
| `pnpm lint` / `pnpm lint:fix`       | ESLint, including the layer boundaries                                           |
| `pnpm format` / `pnpm format:check` | Prettier                                                                         |
| `pnpm test`                         | Vitest, single run                                                               |
| `pnpm test:watch`                   | Vitest in watch mode                                                             |
| `pnpm test:coverage`                | Coverage, `core/` threshold ≥ 90 %                                               |
| `pnpm bench`                        | Vitest benchmarks                                                                |
| `pnpm e2e`                          | Playwright tests                                                                 |
| `pnpm build:tools`                  | Added in P2.11: qbsp3, qvis3 and qrad3 to WebAssembly into `workers/`            |
| `pnpm gen:entities`                 | Added in P4.2: generates `game/q2/q2.def` and the md2 table from the game code   |
| `pnpm check`                        | All checks before a commit: format:check, lint, typecheck, test, build           |

When a command is added to `package.json` or renamed, this table is updated in the same change.

## Development workflow

The implementation follows the spec's five phases in order. The next phase starts only when the previous phase's _Done when_ criterion is met. Features from later phases are not implemented early, but the structure must not prevent them.

A single change is made like this:

1. **Read the spec section** the change concerns, and check in `PLAN.md` which work package it belongs to and whether its dependencies are done. If the spec is unclear or contradictory, ask before implementing.
2. **Check the sources.** For algorithms and editor behaviour, the model is Qoole. For formats and constants, the source of truth is id's original engine (`ext/Quake-2`) and Quake-2-Tools (`common/qfiles.h`). For extensions (`.pkz`, package search rules), the source is q2pro. For browser solutions, the template is q3edit. Code is read from the local copy in `ext/<repo>/`, and the file-level references are in the stack's _Role of the source projects_ section. For the editor's basic features (entity definitions, CSG, `.map`), id's own editor in `ext/Quake-2-Tools/qe4/` is also worth checking. When the spec relies on a detail of the original code (a constant, a file format, an order of operations), verify it from the source code and record the result with a date in the spec.
3. **Write the test first** whenever the change concerns `core/` or `app/` code: a unit test, a fast-check property or a round-trip test. A bug fix comes with a test that fails before the fix.
4. **Implement** following the layer rules and the coding practices.
5. **Run `pnpm check`.** For changes to rendering or the UI, also run `pnpm e2e`. For performance-critical changes (geometry, render cache, parsers), run `pnpm bench` and compare against the spec's performance table.
6. **Update the documentation** in the same change: the spec, the stack, `PLAN.md` (the work package's status) and this file as needed.
7. **Commit** in small, single-purpose units (see Git).

## Coding practices

**General:**

- TypeScript's `strict` mode. No `any` type and no `@ts-ignore` comment without a justification comment. Prefer `@ts-expect-error` with a justification.
- Identifiers, comments and error message keys in English.
- A new dependency needs a justification, and it is added to `10-stack.md`. A narrow implementation of our own is preferred. The version is installed with `pnpm add` and is at least 7 days old. The `minimumReleaseAge` setting is not bypassed.

**Core (`core/`):**

- Computation is done at float64 precision. `Float32Array` is allowed only in the renderer's GPU buffers.
- Nodes (`MapNode`) are immutable. A change produces a new object, and unchanged nodes are shared between the old and new state.
- A brush's truth is its set of planes (three points per face). Vertices, edges and polygons are a derived cache and are not stored.
- All coordinates are world coordinates, and no local transform matrices are used.
- The tolerances (`PLANE_EPS`, `POINT_EPS`) are defined in one place, and no new magic numbers are added.
- A geometry operation returns valid brushes or an error (a result type), never broken geometry. Exceptions are not thrown for foreseeable errors.
- Parsers are pure functions: an `ArrayBuffer` or `string` in, a data structure out. Binary formats are read little-endian with `DataView`.
- Opening and saving must change nothing. Entity property order and unknown keys are preserved, and `.map` number formatting follows the spec.

**Commands and state:**

- Every document change is a `Command` whose `run()` returns a `Patch`. The intermediate steps of a drag are merged into one undo step with `mergeKey`.
- The selection is not part of the document or the undo history.

**Rendering and UI:**

- Drawing happens only on a change (document, camera or pointer). No continuous `requestAnimationFrame` loop is used.
- The renderer updates only the brushes reported by the patches, and the whole buffer is not rebuilt.
- Solid 2's API is used according to its own documentation. APIs removed in Solid 1 are not used (the list is in the stack). Reactivity diagnostics from the development build are fixed.
- Panel logic (validation, conversions) lives in the `app/` layer, and `ui/` only presents and forwards events.
- Styles are written as CSS Modules files (`Component.module.css`) next to the component. Colours and dimensions come from the theme's CSS variables (`docs/design-system/tokens.css`) and are never hard-coded. The UI follows the design system, including its language and voice rules.

**Privacy:** the user's files are not sent anywhere. No telemetry, no analytics and no external runtime requests (CDN fonts, third-party scripts). The application must work offline. In production, a strict Content-Security-Policy enforces this (see the stack), so inline scripts and inline `style` attributes do not work; set styles through classes or the CSSOM.

## Testing and test data

- **Unit tests (Vitest):** all `core/` and `game/q2/` code and the `app/` logic. The coverage threshold in `core/` is ≥ 90 % of lines, and the threshold is mandatory in CI.
- **Property-based tests (fast-check):** every CSG operation, building polygons and texture lock. The seed and minimised input of a failing case are added as a permanent regression test.
- **Round-trip tests:** every test map is read, written and read again. The data structure must always be identical, and the text must be the same line by line when the file is in canonical form (spec, _File formats_). The same is done for the `.joole.json` format, and each project format version has its own test file.
- **Compiler test:** qbsp3.wasm runs in Node on the test maps, and warnings about invalid brushes fail the test.
- **E2E (Playwright):** the main workflows (open, create a brush, subtract, undo, save), performance tests and screenshot comparison of the views with SwiftShader. Reference screenshots are updated only for an intentional visual change, and the reason is recorded in the commit message.
- **Renderer harness:** `tests/e2e/harness/render.html` renders `tests/fixtures/room.map` without the UI shell. It is served only by the dev server, and its query parameters choose the mode, the maximised view, the selection, the tool faces and the theme. Update the screenshot baselines with `pnpm e2e --update-snapshots` only for an intentional visual change, look at every changed image first, and give the reason in the commit message. Vite treats `.map` modules as source maps, so the harness fetches map fixtures by a plain path instead of importing them.
- **Test data:**
  - Only self-made or GPL-compatibly licensed maps and textures are added to the repository (`tests/fixtures/`).
  - id Software's game data (`pak0.pak`, `.wal` textures, vanilla maps, `colormap.pcx`) is not committed. Tests that use it read the path of a Q2 installation from `JOOLE_Q2_DIR` and the directory of id's map sources from `JOOLE_MAPS_DIR`, and they are skipped if the variable is not set. CI runs only with the repository's own data.
  - Small synthetic test files are made of the palette and the `.wal` structure, so that the basic tests work without game data. They are generated by `node tests/fixtures/build-fixtures.ts`, which also writes the renderer fixture `room.map` and the small `tests/fixtures/game/` directory used by the UI fallback-path E2E test. Large generated stress-test maps are written at test time to the ignored `tests/fixtures/generated/` directory and are never committed.

## Git and commits

- The repository is [github.com/wex/joole](https://github.com/wex/joole) (public). The main branch is `main`, and it is protected: changes arrive only through pull requests with green CI, without force-pushes. Changes are made in small, single-purpose units.
- Pull requests are squash-merged. The PR title becomes the commit message on `main`, so it must follow Conventional Commits (CI checks it).
- Commit messages follow the Conventional Commits format in English (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `perf:`), for example `feat(geom): add CSG subtract`. The scope is the directory name: `geom`, `formats`, `doc`, `q2`, `app`, `render`, `platform`, `ui`, `tools`.
- `pnpm check` passes before a commit. CI (GitHub Actions) runs the same, plus the E2E tests and the WASM build reproducibility check, for every pull request. Hooks are not bypassed (`--no-verify`).
- The lockfile (`pnpm-lock.yaml`) is committed. Build outputs (`dist/`, coverage reports, Playwright reports), local game data and `ext/` are in `.gitignore`.
- The `ext/` directory and its contents are never added to Git, not as submodules and not with `git add -f`. Before committing, check that `git status` shows no `ext/` paths.

## License and borrowed code

- Joole is released under GNU GPL v2.0 or later. The SPDX identifier is `GPL-2.0-or-later` (`package.json`, `LICENSE` and the source file headers).
- Code from Qoole, q2pro, Quake-2, Quake-2-Tools and q3edit may be used (all "GPL v2 or later"). When code is moved or translated into another language:
  - the origin (project, file, function) and the original copyright notices are recorded at the top of the file
  - the source is added to `THIRD_PARTY_NOTICES.md` (created with the first borrowing)
  - a new source project is added to `docs/20-sources.md`.
- The licence of added code and data must allow Joole to be distributed under GPLv2. For example, MIT, BSD, ISC, LGPL and GPL-2.0-or-later allow it. Font files may also be OFL-1.1 (the IBM Plex fonts), because they are separate files distributed alongside the code, with their licence included. GPLv3-only or Apache-2.0 code would force the whole work to GPLv3, so such code is not added without a separate decision.

## Instructions for coding agents

- Read the relevant sections of the spec and the stack before a change. Do not assume an API, version or format detail: check it from the source code, documentation or npm.
- Solid 2 was released in November 2026. Solid examples in training data are most likely Solid 1's API, so use Solid 2's documentation and the agent guidance that ships with it.
- TypeScript 7's `tsc` is a native binary with no stable JS API, installed as the `typescript7` alias. The `typescript` package is TS 6.0 and exists only for typescript-eslint and the editor. Do not import either in runtime code, and never call a bare `tsc` in scripts.
- Do not download, extract or commit Q2 game data.
- **`ext/` is read-only.** Do not modify its files, do not run `git` commands there that change state (except `pull` at the user's request), and do not import code from it into the build. Generator scripts (`pnpm gen:entities`) may read `ext/`, but their output is committed, and the build, tests and CI must not depend on `ext/`. Borrowed code is copied into `src/` or `tools/` and its origin is recorded.
- **Searching `ext/`:** ripgrep and the search tools based on it honour `.gitignore`, so a search from the project root skips `ext/`. Search by giving the path explicitly (for example `rg TextureAxisFromPlane ext/Quake-2-Tools`) or use the `--no-ignore` option. Likewise, results from `ext/` must not clutter searches about Joole's own code.
- When you refer to code in `ext/` in documentation, use the path from the repository root plus the function name (for example `bsp/qbsp3/textures.c`, `TextureAxisFromPlane`). Line numbers go stale.
- Do not change security settings (`minimumReleaseAge`, the COOP/COEP policy, the Content-Security-Policy) to work around a build or CI problem; ask first.
- When you make a decision that the documentation does not cover, record it in the right document and mention it in your summary.
