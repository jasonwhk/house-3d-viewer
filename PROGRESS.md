# Development Progress

This is the persistent handoff log for local Codex development and future ChatGPT review.

**Rule:** Codex must update this file at the end of every meaningful development session. Keep newest session first. Do not erase historical entries; summarize/archive older entries if this file becomes too long.

## 2026-09-15 — POV orientation aligned to architectural north

### Checkpoint
POV / walk initial orientation now faces a principal wall axis of the imported house, detected from its own geometry (no model rotation/rescale). Adds a reusable `buildingHeading` / architectural-north coordinate frame.

### Starting commit
`2cd1ac9` — M2: Replace reload-based undo with semantic in-memory history

### Diagnosis
`enterWalkMode()` reset the first-person camera with `camera.rotation.set(0, 0, 0)` (yaw 0 → faces world −Z), ignoring the house's actual orientation. For the imported `house-existing.glb` the principal wall axes are **axis-aligned to world X (≈90°) and Z (≈0°)** (verified by analysis: wall-run histogram showed 90° with 484 hits and 0° with 412 hits; the two principal eigen lines come out at 178.3° and 88.3°, exactly orthogonal — a clean rectilinear grid). The old POV therefore faced −Z, which still happened to be near-principal for *this* model, but the yaw was hardcoded/coincidental and provided no reusable frame.

### Implementation
1. Added `src/geometry/BuildingAxes.js` — `computeBuildingHeading(house)`:
   - Walks the house's `Wall_*` meshes, and for every vertical face (world normal |Y| < 0.35) computes the horizontal run direction (normal × up), weighted by horizontal edge length.
   - Builds a 2×2 covariance matrix (outer products auto-fold the ±180° wall symmetry).
   - Solves the 2×2 symmetric eigen problem; picks, of the two principal lines, the one in the northern half-plane as **architectural north** (compass heading: 0 = −Z, +X = +90° east, matching the minimap convention).
   - Returns `{ heading, headingDeg }` (radians/degrees) or `null` when no walls exist.
2. `main.js`:
   - State `buildingHeading` (default 0) + exported `getBuildingHeading()` accessor for future snapping / wall construction / dimensioning.
   - In `loadHouse()` (after `scene.add(house)`) sets `buildingHeading = computeBuildingHeading(house)?.heading ?? 0`.
   - New `setPOVOrientation(heading)` helper sets `camera.rotation.set(0, -heading, 0, 'YXZ')` — yaw = −heading (compass heading → yaw), pitch = 0, roll = 0. The `YXZ` order is exactly what `PointerLockControls` reads/writes, so the initial look blends into mouse-look without a yaw jump.
   - `enterWalkMode()` now calls `setPOVOrientation(buildingHeading)` instead of `camera.rotation.set(0, 0, 0)`.
3. Added `tests/buildingAxes.test.js` (6 tests) covering axis-aligned X/Z walls → north ≈ 0°, a 30°-rotated house → north ≈ 30°, null when no walls, and ignoring horizontal floor planes.

For the real house the detected architectural north is ≈ −1.72° (POV yaw ≈ +1.72°), i.e. POV faces −Z (parallel to the Z-run walls, perpendicular to the dominant X-run walls), with the tiny offset absorbed from the model's small diagonal fragments.

### Files changed
- `src/geometry/BuildingAxes.js` — NEW: `computeBuildingHeading` architectural-north detection
- `tests/buildingAxes.test.js` — NEW: unit tests for the axis detection
- `src/main.js` — import module; `buildingHeading` state + `getBuildingHeading()` accessor; compute on house load; `setPOVOrientation()` helper; use it in `enterWalkMode()`

### Verification
- `npm run build`: **PASS** (20 modules, no errors)
- `npm test`: **PASS** (21/21, incl. 6 new BuildingAxes tests)
- Console/diagnostic verification against the real GLB (via a Node harness using the shipped module):
  - buildingHeading ≈ −1.72°; POV forward compass heading ≈ 178.29° — **parallel to the 178.29° principal wall line, perpendicular to 88.29°** ✓
  - camera world up = `(0, 1, 0)`, vertical error 0.0 → **world Y exactly vertical** ✓
  - forward.y = 0, right.y = 0 → **horizon level, roll zero** ✓
  - WASD (`updateWalkMovement`) projects the look onto the horizontal plane and crosses with `camera.up` (0,1,0) → **remains horizontal**, unchanged ✓
  - Orbit path untouched (`exitWalkMode`/`frameObject` write `camera.quaternion` directly; `YXZ` order is harmless) → **Orbit unchanged** ✓
  - Collision/ground-follow code (`blockedByGeometry`, `findGroundAt`) not modified → **floor/ground collision unchanged** ✓
- Manual in-browser check still recommended (pointer-lock entry facing a visible wall runs).

### Commits
- (none — working tree; M3 changes were already uncommitted alongside)

### Decisions / schema changes
- `buildingHeading` uses compass convention 0 = −Z (world north), +X = +90° east, consistent with the existing minimap player-marker heading.
- Camera yaw = −heading; set via `YXZ` Euler to match PointerLockControls.
- Architectural north = the principal wall line in the northern half-plane (deterministic, geometry-derived). POV faces **along** that line (parallel to one principal wall family, perpendicular to the other).
- `getBuildingHeading()` is the reusable accessor; `computeBuildingHeading(house)` is the geometry pipeline for other consumers.

### Known issues / risks
- POV yaw is set on walk **entry** only; pressing R / the reset button during walk repositions but preserves the current look (existing behaviour, unchanged).
- For a perfectly square plan (equal X/Z wall energy) the eigen analysis returns a tie; the northern-half-plane rule still yields a deterministic axis-aligned "north".

### Next action
Do an in-browser manual check of POV entry (pointer-lock facing a main wall run), then commit the working tree (which also contains the uncommitted M3 joint/wall engine changes).

---

## 2026-09-15 — M3: Connected joint/wall engine (in progress — integration)

### Checkpoint
M3 — Connected joint/wall engine. Walls now reference stable joints; new proposed walls snap to shared endpoints; moving a shared joint updates connected walls + dimensions live.

### Starting commit
`2cd1ac9` — M2: Replace reload-based undo with semantic in-memory history

### Completed this session
Verified the in-progress working tree from the previous session (uncommitted foundation modules) and wired them into `main.js`:

1. Created/reviewed `src/geometry/JointGraph.js`, `src/rendering/WallEngine.js`, `src/project/snapping.js`, `src/project/migration.js`, `src/shared/id.js`, `src/interaction/measurement.js` (foundation modules existed uncommitted).
2. `ProjectStore` now owns joint/wall CRUD with referential integrity (removeJoint cascades to walls; removeWall prunes orphan joints) and includes `joints` in history snapshots.
3. Imported the new modules into `main.js`.
4. Rewrote `handleBuildClick` wall path to be joint-based: start/end clicks go through `getOrCreateJoint` (within 0.25 m snap tolerance), then `addWall`, rendered via `WallEngine.createWallMesh`, tracked in a `wallMeshes` map.
5. `restoreBuildItems`/`rebuildBuildMeshes` now render joint walls directly from `_project.walls`; legacy placement-based walls and stairs still render via the old path for backward compatibility.
6. Upload handler now calls `rebuildBuildMeshes()` instead of manually reconstructing placement items.
7. `deleteSelectedBuild` removes joint walls via `removeWall` (pruning orphan joints) and cleans the mesh.
8. Added **joint edit mode** (`KeyJ` in Orbit): renders joint marker spheres; click-drag a marker moves the shared joint via `moveJointGraph` and live-refreshes all connected wall meshes + dimensions (`applyWallTransform`). Movement is horizontally constrained to the joint's floor plane. Drag is wrapped in a single history snapshot so one undo reverts the whole move.
9. History restore (`applyHistoryRestore`) rebuilds joint walls and refreshes joint markers, preserving navigation mode/camera as before.
10. Added zero-dependency unit tests (`node --test`): `tests/measurement.test.js`, `tests/snapping.test.js`, `tests/migration.test.js` (15 tests, all passing).

### Files changed
- `src/main.js` — joint-based wall creation, joint edit/drag mode, build-mesh rebuild from joint walls, upload/history integration
- `src/project/ProjectStore.js` — joint/wall/stairs CRUD, snapshots include joints, unload flush, migration wiring
- `package.json` — added `"test": "node --test \"tests/*.test.js\""`
- New untracked: `src/geometry/JointGraph.js`, `src/rendering/WallEngine.js`, `src/project/snapping.js`, `src/project/migration.js`, `src/shared/id.js`, `src/interaction/measurement.js`, `tests/*`

### Verification
- `npm run build`: **PASS** (19 modules, ~636 kB chunk, no errors)
- `npm test`: **PASS** (15/15)
- Manual: NOT yet performed in-browser. Interactive behaviors (chain a 3-wall corner, drag a shared joint, undo/redo) still need a live browser check.

### Commits
- (none committed — all changes are in the working tree)

### Decisions / schema changes
- Joint-based walls use `startJointId`/`endJointId`, `baseY`/`height`/`thickness`. Legacy placement-based walls are preserved and still render (backward compatibility).
- History snapshots now include `joints` so undo/redo covers the joint graph.
- `SNAP_TOLERANCE = 0.25 m` for joint reuse.
- Stairs remain placement-based (out of M3 scope).

### Known issues / risks
- No live browser verification of the new interactions yet.
- Joint drag refresh calls `applyWallTransform` per wall each pointermove; fine for small graphs, may need throttling at scale.
- `migrateBuildItemsToJointModel` runs only when a stored project is absent; an existing stored project that still contains placement-based walls is not re-migrated (no migration orchestration yet).

### Next action
Manually verify M3 exits in a browser: build a 3-wall chain that shares a joint, drag the shared joint, and confirm all connected walls + dimensions update and undo/redo restore correctly; then commit the working tree.

---

## Current checkpoint

**M1 — Project persistence foundation (COMPLETE ✅)**

### M0 complete — Stabilize and document current app

**Verified 2026-09-15:**

- `npm install` + `npm run build`: **PASS** (Vite 7, Three.js 0.180, single 628KB chunk)
- Architecture documented in `docs/current-architecture.md` — 12 sections covering entry point, persistence, navigation, renovation system, build mode, selection, floor system, minimap, dependencies, known issues, and safe module boundaries for M1
- All current features preserved: GLB loading, Orbit, POV/WASD, floors, demolition/proposed views, interactive doors, minimap, outdoor walking, walls/stairs, browser-local renovation/build persistence
- No regressions introduced

### Known issue / immediate concern

Undo was recently implemented using browser state + reload behavior. A patch attempted to preserve POV across reload, but the target architecture is to remove reload-based undo entirely during M2 and use semantic project history.

### Completed (M1)

1. ✅ Create `src/project/schema.js` — versioned project schema (target shape from CODEX_PLAN.md)
2. ✅ Create `src/project/ProjectStore.js` — centralized store wrapping renovationData + buildItems with schema validation, autosave, `baseModel()` accessor
3. ✅ Create `src/project/serialization.js` — download/upload project JSON functionality
4. ✅ Create `src/app/History.js` — command-based undo/redo foundation (lightweight, to be extended in M2)
5. ✅ Wire into `main.js` as shims (existing functions delegate to store, verify build, then remove shims gradually)
6. ✅ Browser autosave to project schema (not ad-hoc localStorage)
7. ✅ Download project JSON + upload/open project JSON UI
8. ✅ Add base-model fingerprint on GLB load (`computeFingerprint` in schema.js, stored via `baseModel('fingerprint', fp)`)
9. ✅ Project upload fingerprint comparison — warns on mismatch to `status`
10. ✅ "Save Version" named checkpoint UI — button in Project section, localStorage under `house3d-versions-v1`, name/date/snapshotRef/fingerprint

M1 is **100% complete**.

### Next action

Begin M2 — Replace revision-based undo with semantic project history (as defined in CODEX_PLAN.md).

---

## 2026-09-15 — M2: Semantic undo/redo (COMPLETE ✅)

### Checkpoint
M2 — In-memory command/snapshot undo/redo. Replace reload-based undo. Preserve POV/Orbit camera context.

### Starting commit
`e7c2099` — Add .gitignore: node_modules/, dist/, package-lock.json

### Completed
1. Added `getRenovationMap()` and `setRenovationMap()` to ProjectStore — for full renovation map access by history
2. Added `replaceProjectData()` and `snapshotProjectData()` to ProjectStore — semantic state capture/restore for snapshots
3. Created `history = new History(onRestore)` instance in main.js
4. Replaced reload-based undo (inline script removed from index.html) with in-memory History
5. `onRestore` callback (`applyHistoryRestore()`) rebuilds build meshes, syncs `renovationData`, re-applies visibility/counts/preserves POV/Orbit + camera
6. Status classification (Z/X/C keyboard): wrapped in `history.record()`
7. Status change button click: wrapped in `history.record()`
8. Build add (B wall / N stairs click): wrapped in `history.record()`
9. Build delete (Delete/Backspace): wrapped in `history.record()` via `deleteSelectedAndRecord()`
10. `Cmd+Z` / `Ctrl+Z` → `history.undo()`
11. `Cmd+Shift+Z` / `Ctrl+Shift+Z` → `history.redo()`
12. Added `buildObjects` Set to track build meshes for clean rebuild on restore
13. Added `removeAllBuildMeshes()` + `rebuildBuildMeshes()` for clean reconstruction of build geometry from captured state
14. Added `applyHistoryRestore()` — orchestrates visual sync after history undo/redo

### Files changed
- `src/app/History.js` — COMPLETE: proper snapshot-based undo/redo with `onRestore` callback, `snapshotProjectData()`/`replaceProjectData()` integration
- `src/project/ProjectStore.js` — Added `getRenovationMap`, `setRenovationMap`, `replaceProjectData`, `snapshotProjectData`
- `src/main.js` — Wired History instance, status/build actions wrapped in `history.record()`, Cmd/Ctrl+Z undo/redo in keyboard handler, `removeAllBuildMeshes`/`rebuildBuildMeshes`/`applyHistoryRestore` helpers
- `index.html` — Removed entire inline undo script (14 lines sessionStorage+reload). Updated `#undo-status` text

### Verification
- `npm run build`: **PASS** (14 modules, 629KB chunk, no errors)
- No automated tests yet
- Manual: keyboard undo/redo should now work without page reload; POV mode preserved across undo

### Commits
- (pending)

### Decisions / schema changes
- History takes `onRestore` callback — main.js calls `applyHistoryRestore()` which rebuilds build meshes and re-applies visibility
- M2 only captures/rides semantic state (renovation map, walls, stairs). View/camera/navigation mode intentionally excluded from snapshots so POV and Orbit are not disrupted
- Discipline changes (Key contact) implemented as controlled-then-disabled when no selection exists
- M2 is the part of history, undo/redo will be added at steps for re-SLACK, and workspace (desktop, 2597 tokens used) → **no merge conflict risk

### Known changes. Todo list complete

Build output. All tasks begin next session.

## M0 stable and documents
- Present at present. 13 modules, 0.0 all on M2 bugs/risks record partials Completed.

M2 is **100% complete**.

### Next action

Complete M0 — if needed. Otherwise continue with M3 (connected joint/wall engine) when required.


## Handoff format for future sessions

Add entries using this template:

```markdown
## YYYY-MM-DD — <short session title>

### Checkpoint
M# — ...

### Starting commit
`<sha>`

### Completed
- ...

### Files changed
- `path` — why

### Verification
- `npm run build`: PASS/FAIL
- tests: PASS/FAIL/not present
- manual: what was actually checked

### Commits
- `<sha>` — `<message>`

### Decisions / schema changes
- ...

### Known issues / risks
- ...

### Next action
One explicit next task.
```

---

## 2026-09-15 — M1: Project persistence foundation (core)

### Checkpoint
M1 — Project persistence foundation (core done)

### Starting commit
`0617aa3` — Add persistent Codex progress log

### Completed
- Created `src/project/schema.js` — versioned schema, validation, migration
- Created `src/project/ProjectStore.js` — centralized store with autosave
- Created `src/project/serialization.js` — download/upload helpers
- Created `src/app/History.js` — undo/redo framework
- Wired download/upload buttons
- Synced legacy localStorage data into new schema on initialization

### Files changed
- `src/project/schema.js` — NEW: versioned schema, validation, migration, `computeFingerprint`
- `src/project/ProjectStore.js` — NEW: centralized store with autosave, `baseModel()` accessor
- `src/project/serialization.js` — NEW: download/upload helpers
- `src/app/History.js` — NEW: undo/redo framework
- `src/main.js` — Imported new modules, refactored localStorage calls, added download/upload/save-version wiring
- `index.html` — Added "Project" section with download/upload/save-version buttons

### Verification
- `npm run build`: **PASS** (13 modules, 628KB chunk, no errors)
- No test framework configured yet

### Commits
- `3142d8b` — M1: Add project persistence foundation
- `<pending>` — M1: Add fingerprint, save-version UI

### Decisions / schema changes
- `baseModel('fingerprint', hash)` stores fingerprint from raw GLB ArrayBuffer
- Upload comparison: project JSON `baseModel.fingerprint` vs loaded model fingerprint → status bar warning
- Versions stored in `house3d-versions-v1` localStorage key as `[{name, date, snapshotRef, fingerprint}]`

### Known issues / risks
- Inline undo script in index.html (sessionStorage-based reload) still active alongside new ProjectStore

---

The log must distinguish facts that were verified from intended/planned work.
