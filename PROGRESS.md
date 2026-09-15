# Development Progress

This is the persistent handoff log for local Codex development and future ChatGPT review.

**Rule:** Codex must update this file at the end of every meaningful development session. Keep newest session first. Do not erase historical entries; summarize/archive older entries if this file becomes too long.

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
