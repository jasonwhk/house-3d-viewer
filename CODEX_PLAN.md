# House 3D Viewer — Codex Development Plan

## Mission

Turn this repository from a Three.js house viewer into a local-first construction and renovation planning tool built around the real imported house geometry.

The application must support accurate connected geometry, construction-service placement/routing, measurement and quantity takeoff, POV inspection/editing, and portable project versions.

This file is the canonical implementation plan for Codex. Read it before starting work. Update `PROGRESS.md` after every meaningful work session/commit so another agent can understand exactly what is complete, what changed, and what remains.

## Non-negotiable principles

1. **Respect real house geometry and scale.** Internal geometry uses metres. Never silently rescale the imported house or approximate dimensions merely to make editing easier.
2. **Construction geometry is semantic data, not just Three.js meshes.** Rendering is derived from the project model.
3. **Connected geometry.** Walls, floor boundaries, service routes, etc. use shared joints/nodes where appropriate. Moving a shared joint updates connected elements.
4. **Measurements are first-class.** Every construction object exposes the quantities that matter: count, length, area, volume, route length, etc.
5. **POV remains first-class.** Do not solve editing by forcing users back to Orbit. Inspection and eventually construction placement must work from POV where sensible.
6. **Local-first and portable.** Browser autosave is recovery/cache only. A downloadable/uploadable project JSON is the canonical portable project state.
7. **Undo/redo must not change navigation context.** Editing history should preserve POV/Orbit state, camera position/orientation, floor and relevant view state.
8. **Base model is immutable.** Existing GLB geometry is the reference/as-built model. Renovation data is an overlay.
9. **Public-repo privacy.** Never commit private addresses, GPS coordinates, private notes, source scans, or user-specific renovation project files.
10. **Small verified increments.** Keep the app runnable. Run build/tests before declaring a checkpoint complete.

## Architecture target

Refactor away from a monolithic `src/main.js` over time. Do not perform a risky all-at-once rewrite. Introduce modules incrementally.

Suggested structure:

```text
src/
  app/
    AppState.js
    History.js
  project/
    schema.js
    ProjectStore.js
    migrations.js
    serialization.js
  geometry/
    JointGraph.js
    WallModel.js
    SurfaceModel.js
    snapping.js
    measurements.js
  construction/
    devices.js
    routes.js
    quantities.js
  rendering/
    houseRenderer.js
    renovationRenderer.js
    helpers.js
  interaction/
    selection.js
    orbitEditing.js
    povEditing.js
  ui/
    quantityPanel.js
    projectPanel.js
```

Exact names may change if there is a strong technical reason; record deviations in `PROGRESS.md`.

## Canonical project model

Design a versioned JSON schema before adding more ad-hoc localStorage state. Minimum top-level shape:

```json
{
  "schemaVersion": 1,
  "project": {
    "id": "...",
    "name": "...",
    "createdAt": "...",
    "updatedAt": "..."
  },
  "baseModel": {
    "asset": "house-existing.glb.dat",
    "fingerprint": "...",
    "units": "m",
    "upAxis": "Y"
  },
  "floors": [],
  "joints": [],
  "walls": [],
  "surfaces": [],
  "openings": [],
  "stairs": [],
  "devices": [],
  "routes": [],
  "renovation": {},
  "measurements": [],
  "view": {}
}
```

Use stable IDs. References must use IDs, not Three.js UUIDs. Three.js objects may store the corresponding semantic ID in `userData`.

The loader must validate schema version and base-model fingerprint. Unknown/newer versions should fail safely with a useful message. Future migrations belong in `migrations.js`.

## Geometry model

### Joints

A joint is a stable XYZ point in metres. Walls reference `startJointId` and `endJointId`. Multiple walls may share a joint.

Moving a joint must update every connected rendered element and all dependent quantities.

### Walls

A wall record should contain at least:

- stable ID
- floor ID
- start/end joint IDs
- height
- thickness
- construction/renovation status
- optional material/system metadata

Derived quantities:

- centreline length
- gross face area
- net face area after openings (when openings are implemented)
- volume

Wall rendering must handle connected endpoints cleanly. Avoid simple overlapping boxes as the final representation. Begin with robust butt/miter join logic and document limitations.

### Floors / ceilings / room surfaces

Represent editable surfaces as polygons whose vertices reference joints where appropriate. Compute:

- polygon area
- perimeter
- optional room wall area
- net area when exclusions/openings are later supported

Invalid/self-intersecting polygons must be rejected or clearly flagged rather than producing trusted quantities.

## Snapping

Implement an explicit snapping service with visible feedback. Initial snap targets:

- existing editable joint
- wall endpoint
- wall centreline/segment
- wall intersection
- floor plane
- vertical alignment with joints on another floor
- optional metric grid

When a placement will join an existing node, highlight the target before commit. Snap tolerance must be defined in world metres and adjusted sensibly for screen interaction.

## Measurement engine

Measurements must derive from semantic geometry, not rendered pixel dimensions.

Required tools/quantities:

- point-to-point 3D distance
- horizontal distance
- vertical rise/drop
- polyline route length
- wall length/height/area
- polygon area/perimeter
- counts grouped by construction type

Add unit tests for geometry math. Display sensible units: mm/cm for small offsets, m for lengths, m² for areas, m³ where useful.

## Construction systems

After project persistence and geometry foundations are stable, add construction planning in this order.

### Electrical devices

Place semantic devices on wall/ceiling/floor surfaces:

- socket
- light point / luminaire position
- switch
- LAN/data outlet
- junction point

Store host surface/object ID when available, XYZ position, orientation, mounting height and subtype. Quantity panel groups counts by type/floor/room where data exists.

### Routes

Use node/polyline-based routes for:

- electrical cable/conduit
- cold water
- hot water
- wastewater
- ventilation duct
- AC/refrigerant line

Each route stores service type, subtype/size, points/junctions and metadata. Calculate true 3D route length. Support vertical risers and branches rather than assuming all routes are planar.

### Plumbing-specific data

Allow pipe diameter/DN and service classification. For wastewater, preserve elevation/drop information so slope support can be added later. Do not claim hydraulic validity from geometry alone.

## Quantity / BOM panel

Create a live quantity panel derived from project state. It should eventually show, at minimum:

- walls: length, gross/net area, volume
- floors/ceilings: area
- sockets/switches/lights/data outlets: counts
- cable/conduit: length by type
- water pipe: length by service/diameter
- wastewater: length by DN
- ventilation: unit count + duct length/type
- AC: unit count + refrigerant route length

Selecting a quantity row should highlight the contributing objects. Never store aggregate totals as authoritative state; recalculate them from project objects.

## Project save/load/version workflow

Implement these user-facing actions:

- **Autosave locally** for crash/reload recovery
- **Save Version**: create a named checkpoint in project state/history metadata
- **Download Project**: download canonical JSON
- **Upload/Open Project**: validate and load JSON
- **Export Snapshot** may be added later if useful

Downloaded project files should use a recognizable extension/name such as `house-renovation-YYYYMMDD-HHMM.json` while remaining ordinary JSON.

On load:

1. parse safely
2. validate schema
3. validate units/up-axis
4. compare base-model fingerprint
5. show a clear warning/error on mismatch
6. reconstruct semantic state
7. derive Three.js rendering from semantic state
8. restore saved view state only after model/state is ready

Do not use page reload as the primary implementation for undo/redo or project state application.

## Undo / redo

Replace reload-based history with in-memory command/snapshot history tied to semantic project state.

Undo/redo must support, incrementally:

- renovation status changes
- create/delete/move joint
- create/delete/edit wall
- create/delete/edit surface
- place/delete/move device
- create/edit/delete route

History actions must preserve navigation mode. If user is in POV, undo/redo remains in POV without teleporting or resetting orientation.

Keyboard:

- macOS: Cmd-Z undo, Cmd-Shift-Z redo
- Windows/Linux: Ctrl-Z undo, Ctrl-Shift-Z and optionally Ctrl-Y redo

## POV editing requirements

POV is not just a viewer mode. Build toward these interactions:

- aim at wall -> inspect/select wall
- aim at wall -> place socket/switch at hit position
- aim at ceiling -> place light point
- start/continue route from a visible hit point
- show placement preview and dimensions before committing
- cancel without changing navigation mode

Large topology edits (complex wall/floor polygons) may initially remain easier in Orbit, but the architecture must not prevent future POV editing.

## Milestones

### M0 — Stabilize and document current app

- Confirm clean local `npm install` / `npm run build`.
- Document current architecture and known bugs.
- Preserve current GLB loading, Orbit, POV, floors, demolition/proposed views, doors, minimap, outdoor walking, walls/stairs.
- Add baseline tests/lint only if they can be introduced without destabilizing the app.

Exit: current behavior builds locally and is documented.

### M1 — Project persistence foundation

- Introduce canonical versioned project schema.
- Import existing renovation/build localStorage data into schema where practical.
- Project store + validation.
- Local autosave.
- Download project JSON.
- Upload/open project JSON.
- Base-model fingerprint validation.
- Named Save Version checkpoints.

Exit: a project can be edited, downloaded, browser storage cleared, uploaded, and reconstructed equivalently.

### M2 — History and navigation-state correctness

- Remove reload-based undo.
- Implement undo + redo in project store/history.
- Preserve POV/Orbit and camera context.
- Cover renovation status and existing local wall/stair actions first.

Exit: repeated undo/redo does not switch modes or reset camera unexpectedly.

### M3 — Connected joint/wall engine

- Stable joint records.
- Walls reference joints.
- Snap endpoints to joints.
- Moving shared joint updates connected walls.
- Connected wall rendering/join behavior.
- Live wall dimensions.
- Convert/migrate existing proposed walls where possible.

Exit: create a 3-wall corner/chain, move a shared joint, and all connected walls + dimensions update correctly.

### M4 — Surfaces and area

- Polygon floor/ceiling surfaces.
- Joint-connected boundaries.
- Area/perimeter calculation.
- Validation of malformed polygons.
- Visual dimension/area overlay.

Exit: editable room/floor polygon reports repeatable area and updates after joint movement.

### M5 — Measurement + quantity engine

- Measurement module with tests.
- Point distance and polyline length tools.
- Live wall/surface quantities.
- Quantity panel with selection/highlighting.

Exit: quantities are derived from semantic model and agree with known test geometries.

### M6 — Electrical devices

- Sockets, switches, light points, LAN/data and junctions.
- Surface-aware placement.
- Mounting height/orientation.
- POV placement for wall/ceiling devices.
- Counts in quantity panel.

Exit: walk through house, place sockets/lights accurately, save/load, and obtain counts.

### M7 — Service routing

- Generic route graph/polyline.
- Electrical conduit/cable.
- Cold/hot water.
- Wastewater with DN/elevation metadata.
- Ventilation ducts.
- AC refrigerant lines.
- True 3D route lengths and BOM grouping.

Exit: trace multi-floor routes with vertical segments and obtain stable lengths after save/load.

### M8 — Construction-planning refinement

- Openings and net wall areas.
- Better wall joins.
- Route branch/junction editing.
- Floor/room associations.
- Labels/dimension annotations.
- Exportable quantity report if useful.

## Codex working protocol

At the beginning of every session:

1. `git pull --ff-only`
2. read `CODEX_PLAN.md`
3. read `PROGRESS.md`
4. inspect recent commits
5. run the current baseline build/tests
6. continue the **Current checkpoint** from `PROGRESS.md`; do not jump ahead merely because a later feature is interesting

During work:

- Prefer small coherent commits.
- Do not commit generated dependencies/build output unless already required by repo policy.
- Keep existing user workflows operational.
- Add tests for geometry/persistence calculations whenever practical.
- If an architectural assumption changes, update this plan and explain why in `PROGRESS.md`.

At the end of every session:

1. run tests/build
2. update `PROGRESS.md`
3. include exact commit SHA(s)
4. state what was verified manually vs automatically
5. state unresolved bugs/risks
6. set one explicit **Next action**
7. commit the progress log
8. push to the configured remote when allowed by the user's local workflow

## Definition of done for a milestone

A milestone is not complete because code exists. It is complete only when:

- acceptance/exit criteria above are demonstrated
- `npm run build` succeeds
- relevant automated tests succeed
- no known regression blocks Orbit/POV/basic model loading
- project schema compatibility is considered
- `PROGRESS.md` records evidence and remaining limitations

## Guardrails

- Do not replace the real house with a schematic/demo model.
- Do not introduce furniture/catalog work before construction milestones unless explicitly requested.
- Do not make measurements authoritative until model scale/units are verified.
- Do not encode project truth only in mesh transforms or `userData`.
- Do not use Three.js UUIDs as persistent IDs.
- Do not silently discard unknown project data on load/save.
- Do not commit actual private project JSON files to this public repository.
