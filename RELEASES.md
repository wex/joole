# Release notes

## 1.0.0 — 26.11.2026

Joole 1.0 is a browser-based, brush-based Quake 2 map editor. It runs entirely client-side at [joole.niko-hujanen.workers.dev](https://joole.niko-hujanen.workers.dev/), works offline once installed, and never sends the user's files anywhere.

### Editing

- Brush creation, movement, rotation and resizing with grid snapping in one 3D and three orthographic views
- CSG subtract, intersect and hollow; plane clipping with a live preview; mirror operations
- Vertex, edge and face editing with validity enforcement
- Texture browser, application, alignment tools, texture lock and surface flags, reading textures and game data from a local Quake 2 installation, including mods and `.pkz` packages
- Entities from definitions generated out of id's GPL game source: placement, conversion of brushes to brush entities, a generated property panel, spawnflags, target link lines, class-coloured boxes and md2 wireframe previews
- Groups, hiding and locking in the tree view, and scoped editing inside a group
- Prefabs saved in the browser's persistent storage, insertable by click or drag-and-drop
- Full undo/redo; projects in the lossless `.joole.json` format; `.map` import/export with round-trip fidelity

### Compilation

- id's original qbsp3, qvis3 and qrad3 compiled to WebAssembly, running threaded in workers — a map compiles to a playable, lit BSP without leaving the browser
- Leak detection with the pointfile path drawn in the views; the N key steps along it
- Fast, normal and final compile profiles

### Platform

- Offline-capable progressive web application with an update prompt
- Chrome/Edge, Firefox and Safari (latest two major versions); threaded compilation where cross-origin isolation is available, single-threaded fallback elsewhere
- No telemetry, no analytics, no external runtime requests; enforced by a strict Content-Security-Policy in production

### Known limitations

- Qoole `.qle` import is planned after 1.0
- The performance targets are verified on the reference hardware (Ryzen 7 7800X3D + RTX 4080 Super): 208.7 fps orbiting 20,000 textured brushes against the 60 fps target, and 5.83 ms median drag frames against the 8 ms target. This hardware is far stronger than the integrated GPUs the targets were sized for; the reasoning and the accepted residual risk are recorded in the spec
