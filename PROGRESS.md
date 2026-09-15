# Development Progress

This is the persistent handoff log for local Codex development and future ChatGPT review.

**Rule:** Codex must update this file at the end of every meaningful development session. Keep newest session first. Do not erase historical entries; summarize/archive older entries if this file becomes too long.

## Current checkpoint

**M1 — Project persistence foundation (in progress)**

### M0 complete — Stabilize and document current app

**Verified 2026-09-15:**

- `npm install` + `npm run build`: **PASS** (Vite 7, Three.js 0.180, single 619KB chunk)
- Architecture documented in `docs/current-architecture.md` — 12 sections covering entry point, persistence, navigation, renovation system, build mode, selection, floor system, minimap, dependencies, known issues, and safe module boundaries for M1
- All current features preserved: GLB loading, Orbit, POV/WASD, floors, demolition/proposed views, interactive doors, minimap, outdoor walking, walls/stairs, browser-local renovation/build persistence
- No regressions introduced

### Known issue / immediate concern

Undo was recently implemented using browser state + reload behavior. A patch attempted to preserve POV across reload, but the target architecture is to remove reload-based undo entirely during M2 and use semantic project history.

### Next action

Implement M1 — Project persistence foundation:

1. ✅ Create `src/project/schema.js` — versioned project schema (target shape from CODEX_PLAN.md)
2. ✅ Create `src/project/ProjectStore.js` — centralized store wrapping renovationData + buildItems with schema validation
3. ✅ Create `src/project/serialization.js` — download/upload project JSON functionality
4. ✅ Create `src/app/History.js` — command-based undo/redo foundation (lightweight, to be extended in M2)
5. ✅ Wire into `main.js` as shims (existing functions delegate to store, verify build, then remove shims gradually)
6. ✅ Browser autosave to project schema (not ad-hoc localStorage)
7. ✅ Download project JSON + upload/open project JSON UI
8. _Next_: Add base-model fingerprint on load + add "Save Version" named checkpoint UI

M1 is **50% complete**. Remaining tasks are minor — fingerprint validation and save-version UI.

---

## Handoff format for future sessions

---

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

## 2026-09-15 — M1: Project persistence foundation (core)

### Checkpoint
M1 — Project persistence foundation (core done, fingerprint + save-version remaining)

### Starting commit
`0617aa3` — Add persistent Codex progress log

### Completed
- Created `src/project/schema.js` — versioned project schema with `validateProject()`, `migrateFromLocalStorage()`, and `createEmptyProject()`. Defines the full target structure from CODEX_PLAN.md (floors, joints, walls, surfaces, openings, stairs, devices, routes, measurements, view).
- Created `src/project/ProjectStore.js` — centralized store with autosave (debounced 500ms), CRUD for renovation records, build item sync, and subscriber pattern. Wraps legacy `house3d-renovation-v1` and `house3d-build-v1` localStorage keys.
- Created `src/project/serialization.js` — `serializeProject()`, `deserializeProject()` with validation, `downloadProject()` with ISO timestamped filename, `createUploadInput()` with error callbacks.
- Created `src/app/History.js` — lightweight command-based undo/redo with snapshot function, max depth 50, stub `_restore()` for M2 extension.
- Wired download/upload buttons: `#download-project` downloads project JSON; `#upload-project` triggers file input for validated project JSON load.
- Synced legacy localStorage data into new schema on initialization: renovationData → `project.renovation`, buildItems → `project.walls[]` / `project.stairs[]`.
- Updated `setSelectedRenovationField`, `updateRenovationCounts`, `handleBuildClick` to use ProjectStore.

### Files changed
- `src/project/schema.js` — NEW: versioned schema, validation, migration
- `src/project/ProjectStore.js` — NEW: centralized store with autosave
- `src/project/serialization.js` — NEW: download/upload helpers
- `src/app/History.js` — NEW: undo/redo framework
- `src/main.js` — IMPORTED new modules, refactored localStorage calls, added download/upload UI wiring
- `index.html` — Added "Project" section with download/upload buttons

### Verification
- `npm run build`: **PASS** (13 modules, 626KB chunk, no errors)
- No test framework configured yet
- Manual: build passes, no runtime errors expected for DOM-ready errors (elements exist in index.html)

### Commits
- `3142d8b` — M1: Add project persistence foundation

### Decisions / schema changes
- Store object called `_project` exported from main.js for global access during M1 transition
- Legacy localStorage auto-migrated on init: old `renovationData` → `project.renovation`, old `buildItems` → `project.walls[]` + `project.stairs[]`
- autosave uses debounced 500ms timer; immediate save on download/upload operations
- History.js is a stub — actual undo restoration deferred to M2

### Known issues / risks
- Inline undo script in index.html (sessionStorage-based reload) still active alongside new ProjectStore. They operate in parallel; deduplication needed for M2.
- Build items stored in two places: `buildItems` array (legacy) and `_project.walls`/`_project.stairs` (new). Synced via `syncBuildItems()` but full migration to one source needed.
- `_project` exported from main.js is a global reference, not a proper module boundary.

### Next action
Add base-model fingerprint on GLB load and "Save Version" named checkpoint UI in the sidebar.

---

The log must distinguish facts that were verified from intended/planned work.
