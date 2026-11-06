# Architecture — flatCAD

**Decision record: ADR-0001, initial M0 prototype, 2026-11-06.**

## Scope and coordinate conventions

- All authoring takes place on a single fixed XY plane, in millimetres (right-handed coordinates). +Z represents depth out of that plane.
- 2D viewport +Y points upward. Pointer-to-world mapping must invert browser canvas Y.
- Each sketch profile has a persistent ID and exact scalar parameters. Rectangles use lower-left x/y and positive width/height; circles use centre x/y and positive radius.
- Feature history is an ordered list of {profileId, operation, z, depth}. Z is the lower extent, depth is positive. Feature evaluation is sequential. A cut is allowed only after an additive feature.
- A profile can be reused by multiple features. Changing its parameters regenerates all dependent features. Deleting a referenced profile must either remove its dependent features explicitly or be rejected.
- Native format uses schemaVersion=1 and units='mm'. Unknown versions and malformed input fail closed.

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
