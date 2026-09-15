# Current Architecture Documentation

> M0 checkpoint — produced 2026-09-15 by Codex. All facts verified against source.

## 1. Repository structure

```
house-3d-viewer/
├── index.html              # Single-page shell (168 lines)
├── src/
│   ├── main.js             # Monolithic application logic, 1102 lines
│   └── style.css           # All styles, 105 lines
├── public/
│   ├── models/
│   │   ├── house-existing.glb.dat   # Real house GLB (browser-safe filename)
│   │   └── README.md
│   └── .nojekyll
├── package.json            # Vite 7.1.5 + Three.js 0.180.0
├── vite.config.js          # (exists, contents TBD)
├── CODEX_PLAN.md           # Canonical implementation plan
└── PROGRESS.md             # Handoff log (current checkpoint: M0)
```

No `.gitignore` present. `node_modules/` is never committed. Build output is in `dist/`. No test framework configured.

## 2. Entry point and boot sequence

**`index.html`** loads two things:

1. An inline script (lines ~132-168) that sets up undo via sessionStorage + page reload, and POV-resume-after-undo via sessionStorage.
2. `<script type="module" src="/src/main.js">` which bootstraps the Three.js app.

Boot order in `main.js`:

1. DOM element references resolved (`querySelector` on ~30 ids).
2. Storage state loaded: `renovationData` from `localStorage('house3d-renovation-v1')`, `buildItems` from `localStorage('house3d-build-v1')`.
3. Three.js setup: scene, camera, renderer, minimap renderer, orbitControls, pointerLockControls, lights, grid, raycasters, clock.
4. Key module-scoped variables: `house`, `selectedObject`, `navigationMode`, `doorStates`, `buildRoot`, `buildMode`, `buildItems`, `outsideGround`, `floorLevels`, `walkableMeshes`, `groundMeshes`, `collisionMeshes`.
5. `loadHouse()` async function fetches `models/house-existing.glb.dat`, parses GLB, populates collision/walkable/ground meshes, creates outdoor ground, restores build items, frames camera, sets default renovation view.
6. Event listeners registered: renovation view toggle, status editor, discipline select, note input, mode switch, pointer lock events, floor controls, ceiling toggle, reset, click (orbit raycast), build buttons, keyboard shortcuts.
7. `ResizeObserver` on canvas mount + `requestAnimationFrame` render loop.

## 3. Persistence

### localStorage keys

| Key | Type | Format | Content |
|-----|------|--------|---------|
| `house3d-renovation-v1` | object | `{ [objectPath]: { status, discipline, note } }` | Renovation status (existing/demolish/proposed) per object path |
| `house3d-build-v1` | array | `[{ id, type, a[], b[], baseY, topY, height, thickness, width }]` | Built walls and stairs (Orbit-mode placement) |
| `house3d-renovation-undo-v1` (sessionStorage) | array | `[ {}, {}, { ... } ]` | Undo stack copies of full renovationData JSON |
| `house3d-resume-pov-after-undo` (sessionStorage) | string | `"1"` | Flag to re-enter POV after reload |

**Data format**: `renovationData` maps path strings (parent/child name combinations from `objectKey()`) to `{ status: 'existing'|'demolish'|'proposed', discipline: 'architecture'|'electrical'|'ventilation'|'hvac'|'plumbing', note: string }`.

**Undo mechanism**: snapshot the entire `renovationData` JSON onto a sessionStorage stack before each status change, then reload the page (`location.reload()`) to discard Three.js state. On reload, the inline script detects `house3d-resume-pov-after-undo` flag and re-enters POV mode after DOMContentLoaded.

This is explicitly noted as a temporary mechanism to be replaced in M2 with semantic history in the project store.

## 4. Navigation modes

### Orbit mode
- Uses `OrbitControls` with damping (0.06), screen-space panning, 1-60 range.
- Camera starts at (12, 9, 14), FOV 38.
- Grid helper visible when orbit.
- Click selects objects via raycast on `house` root.
- Build tools (B wall, N stairs) active.

### POV/Walk mode
- Uses `PointerLockControls`.
- Camera FOV 72 (wider for first-person).
- WASD movement with collision detection (3 probe rays: center + left/right offsets at 2 heights).
- Ground following via raycast straight down from player feet.
- Step-up max 0.34m, max drop 0.6m.
- Player: 1.64m eye height, 0.24m radius, 1.65 m/s walk, 3.4 m/s sprint.
- Teleport floors: 1 (Digit1), 2 (Digit2), 3 (Digit3).
- Doors: interactive F key with hinge pivot animation.
- Selection: E key (aims ray 4.5m forward), Z/X/C classify.
- Minimap: orthographic top-down view, floor-aware, tactical-map expansion.

### Transitions
- `enterWalkMode()`: disables orbit, hides grid, adds `walk-mode` body class, shows minimap/hud/popup, respawns on floor 1.
- `exitWalkMode()`: restores initial camera view, enables orbit, hides walk-mode elements.

## 5. Renovation display system

Four view modes (G key cycles): **asbuilt**, **demolition** (default), **proposed**, **combined**.

Each材质 in `renovationData` caches four variants derived from originals:
- **demolish**: lerp color toward red (0xc95d49), 68% mix, 62% opacity
- **proposed**: lerp toward teal (0x4f9a8d), 58% mix, 90% opacity
- **dim**: lerp toward grey-green (0x7f8983), 35% mix, 26% opacity
- **original**: unmodified

Visibility rules vary by view mode — proposed objects hidden in asbuilt/demolition, demolished hidden in proposed.

Selection uses a `BoxHelper` (orange) around the selected object.

## 6. Build mode (proposed walls/stairs)

Active only in Orbit mode. Click two points to place a wall or stairs:

- **Walls**: Simple `BoxGeometry` between start/end points at y = height/2. Persisted to `house3d-build-v1`.
- **Stairs**: Group of step boxes autogenerated from 18cm rise increment.

All built geometry goes into `buildRoot` group. Deletion traverses up to find the group to remove.

Built materials use `rgba(79,154,141/.82)` teal color.

## 7. Selection system

**Orbit**: `pointerdown` → `pointerup` with movement < 5px triggers raycast. Hits `house` root. Selects `semanticNodeFor()` result.

**POV**: Raycast 4.5m from camera center. `currentLookObject` updated every frame. E key calls `selectObject()`.

`objectKey()` builds path from parent chain names. First match for `/^(wall|door|window|opening|ceiling|floor|fixture|object|stair|sink|toilet|bathtub|cabinet)/i`.

Selection panel shows object name, type, floor, status, discipline, note fields.

## 8. Floor system

`floorLevels` Map keys: "0" (basement), "1", "2", "3", "4". Populated from `walkableMeshes` by traversing house and checking names matching `Floor_N` or `FN`.

Visibility per floor filters house meshes: `floorFor(mesh) === selectedFloor`. "All" included.

Ceiling toggle hides elements with "ceiling" in ancestor names.

## 9. Minimap

Separate `Renderer` + `OrthographicCamera` on `#minimap-viewport`. Renders house from top-down at camera's XYZ. Color inverted (dark background). Floor-aware (only shows current floor meshes).

Player marker: yellow circle + direction arrow. Scales: 2.2-14 map zoom units → 1m/2m/4m scale bar.

## 10. Dependencies

- **Three.js 0.180.0** (r180). Uses: Scene, PerspectiveCamera, WebGLRenderer, OrbitControls, PointerLockControls, GLTFLoader, GridHelper, Raycaster, BoxHelper, BoxGeometry, Group, MeshStandardMaterial, HemisphereLight, DirectionalLight, PCFSoftShadowMap, ACESFilmicToneMapping, sRGBColorSpace, GridHelper, Vector2/3, Box3, Clock, Color, etc.
- **Vite 7.1.5** (v7.3.6 installed). Bundles as single chunk (619KB minified). No code splitting.

No linting, no tests, no formatting presets configured.

## 11. Known issues / risks

1. **Undo via reload** — The entire Three.js scene tears down on undo. POV state preserved via sessionStorage but this is fragile. Headed for M2 replacement with in-store history.
2. **Monolithic main.js** — 1102 lines with no modules except Three.js additions. Architecture target in CODEX_PLAN.md specifies modular breakdown.
3. **No module resolution file type** — `vite.config.js` exists but `main.js` uses `type:"module"` in package.json. Only `*.js` is treated as ESM.
4. **No build artifacts gitignored** — No `.gitignore`. `dist/` output not committed (just models).
5. **Storage schema is ad-hoc** — `renovationData` is a plain object keyed by path strings. No schema version, no IDs, no schema validation on load.
6. **Build items are raw geometry** — No joint/wall model, no semantic meaning. Pure `BoxGeometry` with material override.
7. **Clock import missing** — `clock.getDelta()` called but not imported. Appears to work via Three.js global or bundler shim.
8. **Single chunk warning** — 619KB output triggers Vite chunk size warning. No code-splitting.
9. **`clearSelection` function referenced before declaration** — Used in `pointerup` event handler (line ~792 area) but declared at ~line 478. Due to function hoisting and event handler assignment after declaration, this works at runtime but is fragile.
10. **Flash compatibility** — Per memory notes, the Qwen Flash model needs special tool-call parsing; unrelated to this project but relevant for development tooling.

## 12. Safe module boundaries for M1

The following are safe extraction candidates that don't rewrite the whole app:

1. **`src/project/ProjectStore.js`** — Replace localStorage access pattern with a centralized store that wraps `renovationData` + `buildItems` with validation.
2. **`src/app/History.js`** — Factor undo logic into a command queue (for M2).
3. **`src/interaction/Navigation.js`** — Extract orbit/walk transitions into a single module.
4. **`src/rendering/RenovationRenderer.js`** — Extract material variants + visibility logic as a standalone service.
5. **`src/rendering/Helpers.js`** — `floorFor`, `isCeiling`, `isWalkable`, `semanticNodeFor`, `typeFor`, `objectKey`, `renovationRecordFor`, `effectiveRenovationStatus`.

Transition approach: import new modules into `main.js`, keep existing functions as shims that delegate, verify build, then remove shims. No hot-reload needed since Vite's dev server handles this.
