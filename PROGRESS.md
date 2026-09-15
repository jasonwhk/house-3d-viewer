# Development Progress

This is the persistent handoff log for local Codex development and future ChatGPT review.

**Rule:** Codex must update this file at the end of every meaningful development session. Keep newest session first. Do not erase historical entries; summarize/archive older entries if this file becomes too long.

## Current checkpoint

**M0 — Stabilize and document current app**

### Current repository state

The repository currently provides a Vite/Three.js viewer with:

- real house GLB overlay/reference model
- Orbit navigation
- first-person POV/WASD navigation
- floor views and ceiling visibility
- semantic element selection
- renovation Existing/Demolish/Proposed classification
- renovation display modes
- interactive doors
- minimap
- floor teleport shortcuts
- local proposed wall/stair placement
- outdoor walkable ground
- browser-local renovation/build persistence
- initial renovation undo/recovery behavior

The code is still substantially concentrated in `src/main.js`. Existing build walls are rendered as independent boxes and are **not yet** a connected joint-based geometry model. Current persistence is not yet the canonical portable project schema described in `CODEX_PLAN.md`.

### Important product direction

The priority is construction planning, not furniture/gameplay.

Target construction features include:

- connected walls/floors with shared joints
- exact length/area/volume quantities
- sockets, switches, lights, LAN/data
- electrical cable/conduit routing
- cold/hot water piping
- wastewater routing
- ventilation ducts/units
- AC/refrigerant routing
- POV placement where sensible
- live quantity/BOM panel
- portable save/download/upload project versions

### Known issue / immediate concern

Undo was recently implemented using browser state + reload behavior. A patch attempted to preserve POV across reload, but the target architecture is to remove reload-based undo entirely during M2 and use semantic project history.

### Next action

Start M0 locally:

1. pull latest `main`
2. run `npm install` and `npm run build`
3. inspect current `src/main.js`, `index.html`, and `style.css`
4. document current state flow, persistence keys, navigation transitions and rendering dependencies
5. identify safe module boundaries for M1 without rewriting the application all at once
6. update this log with findings and exact verification results

Do **not** start sockets/pipes or furniture yet. M1 project persistence is the next implementation milestone after M0 is verified.

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

The log must distinguish facts that were verified from intended/planned work.
