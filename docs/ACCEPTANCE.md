# Acceptance and engineering qualification

**Status: acceptance criteria, not evidence of execution.** Run this against an exact PR SHA and record runner, browser version, WASM version and output files.

## Automated tests

1. Validate model documents: reject unknown schema, invalid units, null/NaN/Infinity input, negative dimensions, duplicate IDs, dangling feature references, cut-first history and unsupported feature type.
2. Edit behavior: dimension changes preserve profile IDs and feature references; deleting a selected profile removes dependent features with explicit user intent; undo/redo retains structurally valid documents.
3. Kernel golden plate: create exactly one solid with 100×60×8 dimensions and two Ø10 through cuts. Compare calculated mass/volume and bounds against analytical values; record kernel version and modelling tolerance.
4. Boolean variants: add-to-add, partial-depth cut, no-intersection cuts, tangent surfaces, touching edges, invalid and disjoint solids. Do not silently heal a failure without reporting it.
5. STEP: export, reopen in an independent process (e.g. FreeCAD/OpenCascade CLI) and compare solid count, volume, bbox and face classification. A nonempty STEP Blob is insufficient.
6. Worker lifecycle: repeated changes, invalid input recovery, stale response ordering, memory and timeout failure.
7. Browser: first load + production preview under localhost without external network; mouse drawing, zoom, typed dimensions, undo, native JSON save/open and export.
8. Performance: 10, 100 and 500 features; measure worker start, rebuild, mesh generation, preview update, WASM memory and UX responsiveness.

## Acceptance tolerances (provisional; tighten with evidence)

- Input coordinates persisted as full JavaScript finite doubles (UI rounding must not alter underlying values).
- Analytic volume relative error <= 1e-7 on the golden example.
- Golden bounding-box absolute error <= 1e-5 mm.
- Reopen exact native JSON geometry equivalence; STEP tolerance agreed separately based on reader.
- No NaN/Infinity in preview mesh and no unbounded memory growth over repeat rebuilds.

## Mandatory manual acceptance

- Create a plate, add two holes, extrude/cut, edit a past parameter, undo, save, reopen, STEP export.
- Verify axes and +Z direction with known geometry and view controls.
- Check target Windows desktop browser, Firefox, and high-DPI layout; manual keyboard use.
- Open STEP in actual downstream mechanical CAD and inspect dimensions/solid status.

## Reporting format

~~~text
Commit SHA:
Platform/browser/runner:
Command/test:
Actual result and artifact:
Expected result:
Tolerance:
PASS / FAIL / NOT RUN:
Blocked items and human acceptance:
~~~

Never report a test as passing when only source inspection was performed.

## Ctrl-selection, contextual extrusion and optional solid preview

Automated tests must verify additive/toggle Ctrl-click selection, one-history-action group transforms/deletions and one-history-action multi-extrude; reject open paths without partial commits. The flyout must remain a major-grid interval from the selected geometry when viewport space permits, and avoid the arrowhead. Preview uses exact B-rep worker evaluation, must not modify localStorage/native document, must remain visibly labelled uncommitted, and must restore the committed mesh on cancellation or unchecked state. Change input rapidly to detect stale preview writes, and use volume/bbox checks to distinguish geometry work from a cosmetic-only visualization. These checks do not replace independent STEP round-trip or target-hardware acceptance.

## 2026-11-06 direct extrusion additions

1. Cursor-corner popup: invoke E with pointer inside sketch; popup must anchor one corner to the cursor, fall back to other corners at viewport boundaries, and shift sideways only if it would cover the depth arrow. Sketch outline may be overlapped.
2. Signed parameters: accept Start Z 8 / Depth −6, validate nonzero finite depth, preserve the original signed native feature, and verify B-rep bounds Z 2..8 and analytically expected volume. Existing positive-depth documents remain unchanged. Verify add and subtract, STEP header, undo and JSON round trip.
3. Face-pick: with Start Z focused, click a committed horizontal top face and get the exact plane Z (e.g. 8). With Depth focused, click a committed face at Z 2 while Start Z 8 and obtain −6 without rewriting Start Z. Ignore sloped surfaces and provisional preview shapes; use feature-plane source values rather than float32 raycast Z as authoritative.
4. Navigation: Fusion default middle pan and Shift+middle orbit; separately validate SOLIDWORKS, Onshape and Blender mouse schemes, settings persistence and old JSON imports. Left-click remains available for picking faces.
5. These additions are CAD prototype acceptance only; full STEP import/round-trip and human manufacturing qualification are separate.

## FlatCAD sketch click-release and visual grid regression

- On a nonzero valid drag, shape is created once on mouse release. On a zero-size release, **no** invalid profile is committed, a pending first datum is shown and a second click commits the primitive. Test corner and centre rectangles, circle, polygon and slot; Shift on second click constrains square. Esc and tool changes cancel.
- The sketch Canvas element must not be draggable by the browser. A blank background left-drag in Select mode must leave the pan transform unchanged; explicit middle button or selected Pan tool can move the viewport. Verify click-capture and button-release events after a cancelled gesture.
- Solid reference grid is below the lowest displayed solid Z, including below-zero extrusions and any translucent red cut-tool overshoot. Visual grid positioning must not mutate the native project, B-rep bounds, physical XY plane or saved feature history.

## Stable Solid and history rendering acceptance

1. With a valid solid displayed, orbit/pan/zoom to a non-default camera pose. Edit a sketch parameter, open E, change cut depth, toggle preview, cancel and Apply. Camera orientation/zoom must stay unchanged unless the user explicitly selects Fit (F). Persist the camera while the worker rebuilds, even through invalid input.
2. Record `#preview[data-rendered-solid]` while the worker is busy. It must not transition to false between successful operations, preview toggling and cancellation. When a B-rep recompute fails, the last valid solid must remain visible with an explicit stale/error status; a truly empty new document may intentionally clear it.
3. Open Feature history after a completed build: each feature has an operation + sketch-derived name and B-rep-derived post-operation thumbnail; for cuts the thumbnail visibly overlays red cutter geometry including overshoot, with total cutter volume recorded separately. Changing a parameter regenerates thumbnails; changing only selection does not reconstruct them.
4. Hover a horizontal face: high-contrast cyan planar overlay. Hover a vertical side: NO side face overlay. Hover an actual OCCT edge-endpoint: green translucent sphere matching the full 17 CSS-pixel hit radius, correctly scaled under zoom; don't treat tessellation's arbitrary internal vertices as CAD vertices. Mouseover never edits the native document.
5. Unit and Chromium regression tests gate each change; Windows/Firefox/HiDPI and novice manual acceptance remain separate. Explicitly measure large history performance and worker memory before manufacturing-grade assertions.
