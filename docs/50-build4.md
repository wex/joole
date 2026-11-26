# Build 4 – work order for the TODO phase-1.6 items

This document is the implementation plan and progress tracker for the items listed in
`TODO.md` under _Phase 1.6: More features and fixes_. It follows the pattern of
`docs/50-build3.md` (build 3 / phase 1.5): each work package is one commit on
`feature/build4-phase1.6`, the packages merge as a single pull request, and the phase
ends with the release of **v1.5.0**.

Item numbers continue the phase-1/1.5 sequence (#25–#35 were phase 1.5).

## Work packages

### T16.1 – Version and build number in the top bar (#36)

**TODO item:** _Add a version & build number to the app. It should be displayed in the
top bar, before the dark/light mode toggle._

**Analysis:**

- `package.json` carries `"version": "1.0.0"` — bump it to `1.5.0` as part of the
  release preparation (or in this package; decide in the package, record here).
- The build number should be the git short hash (or commit count) injected at build
  time. The vite config can inject it with `define` (e.g. `__JOOLE_BUILD__` via
  `git rev-parse --short HEAD` at build time; fall back to `dev` when git is absent,
  e.g. in some CI/deploy contexts — Cloudflare Workers Builds DOES have the repo, but
  verify). Declare the constant in a `src/` type declaration file.
- Display: the top bar, before the theme toggle. Find the theme toggle in
  `src/ui/EditorShell.tsx` and add a small muted text element following the design
  system's typography (check `docs/design-system/` for a suitable token; the title-bar
  text style). Format: `v1.5.0 (abc1234)` or per the design system voice — keep it
  quiet, it is metadata, not a headline.
- Tests: a unit test is impractical for a define-injected constant; an e2e assertion
  that the top bar shows `v`-prefixed text matching the package version is enough.
- Docs: manual (the top bar section), spec if it describes the top bar.

### T16.2 – Space frames a selected group (#37)

**TODO item:** _When a group is selected, pressing space should focus on the group._

**Analysis:**

- T15.5 implemented Space framing via `app.selectionBounds()` →
  `selectionBounds(doc, ids)` in `src/app/tools.ts` line 356, which delegates to
  `boundsOf`. The shell call site is `EditorShell.tsx` line 1017.
- **Lead:** when a group is selected, the selection may contain the GROUP id rather
  than the member brush ids, and `boundsOf` may only resolve brush/entity ids,
  returning null or an empty box for a group id. Check how groups are represented in
  the selection (`src/app/groups.ts`, `groupPick.ts`, `selection.ts`) and extend
  `boundsOf` (or the selection-to-ids expansion) so a selected group frames its
  member contents. Verify: does clicking a group in the 3D/2D view select the group
  id or its brushes? The Tree panel also selects groups.
- Test first: unit test in `src/app/` for group bounds; e2e: select a group, press
  Space in a hovered 2D view, assert the camera centers on the group's contents
  (follow the T15.5 e2e in the spec that covers Space).

### T16.3 – Collapsed bottom panel flush with the window (#38)

**TODO item:** _There is a gap between bottom panel and app window while it's toggled
closed - it should be flush with the window._

**Analysis:**

- The center grid is `grid-template-rows: minmax(0, 1fr) var(--size-splitter)
var(--bottom-panel-height, 160px)` (`EditorShell.module.css` line 21). T15.9
  collapsed the panel by hiding the splitter and shrinking the height to the tab
  strip (`calc(var(--size-titlebar) + 1px)` per the build-3 notes).
- **Lead:** the leftover gap is probably the `+ 1px`, a border on the panel or the
  shell, or a splitter row that is hidden visually but still occupies its grid
  track. Inspect the collapsed state in the browser: measure the tab strip bottom
  versus the window bottom. Fix in the module CSS so the strip sits flush. Check
  both themes and that the expanded state is unchanged.
- Test: e2e assertion measuring the bottom panel's bounding box against the window
  inner height (follow the T15.9 spec `tests/e2e/dock.spec.ts` or wherever the
  collapse tests live).

### T16.4 – Persist panel widths/heights (#39)

**TODO item:** _App should remember panel widths/heights, when those are resized -
now resizing Properties/textures-panel is resetted - store in settings._

**Analysis:**

- `bottomHeight` is already persisted. `rightWidth` IS already plumbed in the shell:
  signal at `EditorShell.tsx` line 181, `reportSetting('rightWidth', next)` at line
  351, and `applySettingsPartial` handles it at line 232.
- **The bug is almost certainly that `rightWidth` is missing from the settings
  schema** in `src/app/settings.ts` — the grep found only `bottomHeight` there
  (lines 13, 47, 70). So the width is reported, but dropped when the settings object
  is validated/saved, and reset on reload. Add `rightWidth` to the type, the defaults
  and the sanitizer, mirroring `bottomHeight` exactly.
- Check for OTHER resizable panels: are the inner vertical splitters (between the
  Properties and Textures sections inside the right dock, if resizable) and the
  bottom panel height covered? The TODO mentions "Properties/textures -panel" — if
  the two sections inside the dock have their own draggable divider, that ratio may
  also need a setting. Scope: persist what exists as user-resizable today; do not add
  new splitters.
- Tests: settings unit tests (round-trip, invalid values dropped), e2e: resize, wait
  for the debounced save (> the persistence debounce — see build-3 notes), reload,
  assert the width is kept.

## Release preparation – v1.5.0 (final package, after T16.1–T16.4)

- Decide the version source of truth: bump `package.json` `version` to `1.5.0`
  (T16.1 displays it). **Open question for the owner if not answered: does v1.5.0
  cover phases 1.5+1.6 together (both un-released so far)?** Assumed yes.
- Check how the production deployment works: the live site is a Cloudflare Workers
  deployment of `main` (see Project status in AGENTS.md). A release is presumably:
  merge the PR → deployment follows automatically; optionally a git tag `v1.5.0` and
  a GitHub release. **Confirm with the owner whether they want a tag/release notes.**
- Write release notes from the two phase changelogs (the spec's Decisions sections
  and the PR bodies of #27/#28 plus this branch).

## Gate

The phase gate follows build 3:

1. Every package committed, tests green, docs updated (manual, spec decisions,
   design system where a component changes).
2. `pnpm check` green.
3. Full `pnpm e2e` — in CI for the authoritative result. Local firefox degradation
   on WSL is a known environmental issue (see below); CI is the arbiter.
4. PR opened with per-package table and verification evidence.

## Operational notes (carried from builds 2/3 — read before starting)

- **Persistence debounce:** settings saves are debounced; e2e tests that reload
  after changing a persisted layout value must wait for the save first.
- **Screenshot baselines:** local captures are GPU-accelerated (WSLg) and do NOT
  pixel-match CI's software rasterization — see the leak.spec.ts comments. The
  tool overlay (`[data-testid=tool-hint]`) is transient and must be masked in any
  new canvas screenshot assertion.
- **EditorShell effects ordering:** all Solid `createEffect` blocks must sit inside
  `EditorShell` after the signal/element declarations and before the JSX return —
  the TDZ production crash of build 3 (`Cannot access 'me' before initialization`)
  came from violating this.
- **vite preview zombies:** kill stale `vite preview` processes before e2e runs, and
  rebuild after changing source — the preview serves `dist/`.
- **Firefox on WSL:** degrades under sustained parallel load (evaluation stalls even
  against the live site). Not a product bug; use `--workers=1` locally or rely on CI.
- The manual screenshots follow the capture-spec pattern of builds 2/3 if the layout
  changes visibly (T16.1 top bar, T16.3 flush panel probably do — retake
  `manual/images/overview-dark.png` / `overview-light.png` at the end).
- `docs/50-build3.md` has the full phase-1.5 detail and its Decisions/implementation
  notes; the same documentation duties apply here (spec decisions with dates, manual,
  AGENTS.md documentation-table row for this file — already added? verify).
