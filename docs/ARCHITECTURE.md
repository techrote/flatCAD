# Architecture — flatCAD

**Decision record: ADR-0001, initial M0 prototype, 2026-11-06.**

## Scope and coordinate conventions

- All authoring takes place on a single fixed XY plane, in millimetres (right-handed coordinates). +Z represents depth out of that plane.
- 2D viewport +Y points upward. Pointer-to-world mapping must invert browser canvas Y.
- Each sketch profile has a persistent ID and exact scalar parameters. Rectangles use lower-left x/y and positive width/height; circles use centre x/y and positive radius. V2 adds regular polygons, round-ended slots and open/closed polylines; V1 rectangles/circles migrate at load.
- Feature history is an ordered list of {profileId, operation, z, depth}. **Z is the operation's Start Z plane and Depth is a nonzero signed displacement**; the occupied interval is [min(z,z+depth), max(z,z+depth)]. Existing positive-depth v1/v2 documents retain their original geometry. The exact kernel constructs positive-height solids over that interval, avoiding negative extrusion orientation ambiguity. Evaluation remains sequential; a cut requires a prior additive feature.
- A profile can be reused by multiple features. Changing its parameters regenerates all dependent features. Deleting a referenced profile must either remove its dependent features explicitly or be rejected.
- Native format uses schemaVersion=2 and units='mm' (and loads legacy v1). Unknown versions and malformed input fail closed. User preferences are stored separately from native model documents.

## Data flow

~~~text
Pointer / property input / native JSON
         |
  validation of versioned document
         |
  immutable state / undo history / autosave
         |                               \
  2D Canvas editor                       Web Worker (WASM / replicad)
                                         |
                                   exact B-rep feature replay
                                         |
                            triangle/edge mesh       STEP Blob
                                 |
                            Three.js renderer
~~~

Neither display mesh nor canvas pixels flow back into the native geometry definition.

## Isolation

Vite bundles the WebAssembly asset locally. Worker initializes OpenCascade once and serializes model-build requests. Geometry failure returns a visible error; UI remains usable. The first worker prototype regenerates the entire solid for each request, avoids caching stale B-reps, and disposes intermediate objects. Later: cancellation/supersession, incremental evaluation, precise topology diagnostics and resource profiling.

## Initial product cuts

M0 deliberately supports only independent analytic rectangles and circles. It does not claim planar arrangement extraction, overlapping/nested profile recognition, sketch constraint solving, holes created from an unconstrained path, or robust solid healing. These are major engineering milestones, not UI polish.

## Engineering risks

1. **Kernel/WASM startup:** asset location and worker bundling in offline production builds must be proven in a real browser.
2. **Boolean/topological validity:** recompute must handle touching faces, degenerate intersections, zero-thickness results, invalid solids and memory pressure.
3. **Sketch constraints:** use a 2D constraint solver as a separate subsystem with explicit under/over-constrained diagnostics. Evaluate PlaneGCS WASM but do not conflate a solver with region topology extraction.
4. **Stable feature references:** avoid face IDs as persistent sketch references; XY profile IDs plus explicit Z intervals minimize topological naming ambiguity.
5. **Interchange:** validate STEP export by independently reopening it in another kernel/process, comparing volume, bounds and solid count; never equate file creation with correct geometry.
6. **Licensing:** assess OpenCascade.js LGPL distribution requirements before releases; project license remains undecided.

## Design principles

- Exact dimensions are document data, not strings painted into a canvas.
- Native file must be deterministic, human-readable and versioned.
- Preview is replaceable without affecting saved geometry.
- Undo/reopen must never silently mutate an accepted model.
- A local static HTTP server is acceptable; a permanently running backend is not required.

## ADR-0005: stable presentation and feature-history evidence (2026-11-07)

**Problem:** `Preview.setMesh` previously removed the displayed group before constructing the replacement and fitted the camera on every committed rebuild. `rebuild()` also erased `committedBuild` before the asynchronous worker returned, so preview cancellation or a failed recompute could remove the last valid mesh and cause repeated blank flashes.

**Solution:** construct a new Three.js display group before releasing the old group, and retain the last accepted `KernelBuild` through worker rebuilds. A failed recompute marks presentation stale but does not erase its last accepted solid. No successful operation changes camera pose after initial fitting. The explicit Fit action is the only subsequent reframing operation. Deleting every solid intentionally clears the viewport and resets initial framing for a new project. A status attribute records build state (`rebuilding`, `ready`, `stale`), not a new CAD model state.

**History:** the worker can optionally capture the exact OpenCascade solid after each ordered feature, including a separate exact cutting tool for cuts. It produces B-rep-derived meshes and volume, while the native sketch/feature document stays authoritative. The browser generates small isometric Canvas2D snapshots (including red full-cutter overlay). This optional history task runs only when the drawer is opened and only after the main Solid has had a chance to update. Future releases should add incremental snapshot caching, viewport virtualization and workload limits for very long feature histories.

**Hover:** model-edge endpoints from OCCT are distinguished from tessellation vertices in the geometry protocol. Mouse proximity uses a 17 CSS-pixel radius; the translucent green sphere is rendered at the matching apparent radius given current orthographic zoom and viewport size. Cyan face overlay is restricted to selectable horizontal planes with exact source elevation; side/sloped faces are excluded. This is NOT stable naming of OCC face identities, which remains separate work.


## ADR-0006: UI-only responsive panel persistence

Workspace divider proportions and Sketch toolbar docking are kept in a separate versioned local preference 'flatcad.layout.v1' using finite ratio validation. They are **not part of schema-v2 native CAD documents** and cannot influence the exact B-rep builder or STEP export. A constrained split-grid layout and pointer/keyboard-accessible separators expose the presentation controls; Canvas2D and Three.js ResizeObservers resize backing viewports when their containers change. Narrow layouts use the same ratio as a stacked split.

Feature history is a view of the immutable feature list. Ordering is reversed **for display only**; exact feature replay remains in original sequence. Thumbnail cards are selection controls; the single active-card editor is assembled on demand. B-rep snapshot generation remains deferred until the History drawer opens, independently of the primary Solid viewer, avoiding repeated heavy workers when users merely resize panels.
