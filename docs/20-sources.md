# Sources

This document lists the sources related to the project, with descriptions of their contents and what they are used for.

## Local copies (`ext/`)

All Git repositories listed below are cloned into the project's `ext/` directory, so their code can be read and searched locally. Each directory is named after its repository.

- `ext/` is in `.gitignore`, and neither it nor its contents are ever added to Joole's Git repository (not as submodules either).
- `ext/` is read-only reference code. Its files are not modified, and Joole's code does not import them or refer to them in the build. Generator scripts (for example generating `q2.def` from the game code) may read `ext/`, but their output is committed, so the build, tests and CI do not need `ext/`. If code is borrowed, it is copied into `src/` or `tools/` and its origin is recorded (see AGENTS.md, *License and borrowed code*).
- Cloning on a new machine:

  ```sh
  mkdir -p ext && cd ext
  git clone https://github.com/q2pro/q2pro.git
  git clone https://github.com/demoth/qoole.git
  git clone https://github.com/drdator/q3edit.git
  git clone https://github.com/id-Software/Quake-2-Tools.git
  git clone https://github.com/id-Software/Quake-2.git
  ```

- Updating: `git -C ext/<repo> pull`. When the documentation refers to a specific place in the source code, the commit it refers to can be recorded in the document (`git -C ext/<repo> log -1 --format=%h`).

| Directory | Branch | Commit on 24.11.2026 |
| --- | --- | --- |
| `ext/q2pro` | `master` | `601a8df8` (2025-12-11) |
| `ext/qoole` | `master` | `6e61028` (2019-09-21) |
| `ext/q3edit` | `main` | `02f8764` (2026-08-05) |
| `ext/Quake-2-Tools` | `master` | `707e849` (2012-01-31) |
| `ext/Quake-2` | `master` | `372afde` (2012-01-31) |

## Repositories

- https://github.com/q2pro/q2pro (`ext/q2pro`)
  - A modern Quake 2 client
  - Contains the data models and logic needed for handling textures, maps and models, among other things
  - Languages: C

- https://github.com/demoth/qoole (`ext/qoole`)
  - The editor's model: Qoole
  - A desktop program for designing, texturing and rendering Quake 2 maps
  - Languages: C/C++

- https://github.com/drdator/q3edit (`ext/q3edit`)
  - A similar browser implementation for editing Quake 3 maps
  - The WebGL implementation in particular is a useful reference
  - Languages: TypeScript, C (the q3map and bspc compilers)

- https://github.com/id-Software/Quake-2-Tools (`ext/Quake-2-Tools`)
  - id Software's original Quake 2 map tools: qbsp3, qvis3 and qrad3 (GPL v2 or later)
  - Contains the surface and contents flag constants in `common/qfiles.h`, the compiler's UV computation (`bsp/qbsp3/textures.c`) and `.map` parsing (`bsp/qbsp3/map.c`)
  - The source code is compiled to WebAssembly with Emscripten for compiling in the browser
  - `qe4/` contains the source code of id's own Q2 map editor, QuakeEd 4: parsing entity definitions (`/*QUAKED … */`), CSG, hollowing, reading and writing `.map`, and displaying the leak file
  - Languages: C

- https://github.com/id-Software/Quake-2 (`ext/Quake-2`)
  - id Software's original Quake 2 engine and game code (GPL v2 or later, released on 21.12.2001)
  - The source of truth for vanilla behaviour: the filesystem search order (`qcommon/files.c`, `FS_AddGameDirectory`) and the format definitions (`qcommon/qfiles.h`)
  - `game/*.c` contains 148 `/*QUAKED*/` blocks, from which the vanilla entity definitions are generated, and the spawn functions, from which the md2 model paths are collected. `ctf/` is an example of a mod's source code and definitions.
  - Languages: C
