# flatCAD

**flatCAD** is an experimental local-first single-plane (2.5D) CAD editor. Draw profiles in one fixed XY plane using millimetres, then add or remove exact solid material along Z. It is intended to become an engineering-grade alternative to freeform drawing tools for plates, brackets, panels and machined parts.

> **Status:** M0 proof-of-concept. Not qualified for fabrication, tolerance-critical work or production use.

## Quick start

Requires Node.js 22 or newer.

~~~sh
npm install
npm run dev
~~~

Open the localhost URL Vite prints. A 100 × 60 × 8 mm demo plate with two Ø10 through-holes is loaded initially. No backend or account is required. Initial WASM load can be slow. The application does not require an internet connection after dependencies and the build have been installed.

To build a static local bundle:

~~~sh
npm run typecheck
npm test
npm run build
npm run preview
~~~

Use the rectangle or circle tools to draw profiles, select a profile, and choose **Extrude/Add** or **Cut** with exact Z and depth inputs. Edit dimensions in the properties panel. Export a STEP file from a valid solid or download a native .flatcad.json project. The 3D panel is a tessellated visualization of the exact OpenCascade solid, not the authoritative geometry.

## Direct workflow

**Multi-select:** Hold Ctrl (or Command on macOS) and click sketch objects to add/remove them from a selection. Click a selected object normally to drag the selected group; Ctrl+D duplicates and Delete removes the group. Press E to extrude or cut all selected closed profiles in one undoable action.

**Contextual extrusion:** The E popover anchors a corner to the initiating mouse position (flipping corners at viewport edges). Sketch-outline overlap is allowed; if the popup would cover the extrusion arrow, it shifts sideways. A triangular arrowhead acts as the draggable depth grip and now supports negative depths. The **Preview in solid view** checkbox shows a provisional OpenCascade B-rep recomputation, tinted by Add/Cut; disabling preview or cancelling restores the committed solid. Preview operations never modify the saved project until Apply.

**Face-driven dimensions:** While Extrude/Cut is active, focus **Start Z** or **Depth**, then click a *horizontal* face of the existing solid. Start Z becomes that face's Z elevation; Depth becomes face Z minus Start Z, so Start Z 8 and a face at Z 2 produces **−6 mm**. The face picker targets committed geometry even while optional operation preview is shown. Opposite-direction extrusion also works by typing a negative Depth directly.

**CAD mouse controls:** Under Settings → CAD navigation controls choose Fusion (default: MMB pan, Shift+MMB orbit), SOLIDWORKS, Onshape or Blender. The selection persists in settings JSON; mouse-wheel zoom remains available, and **Shift+wheel accelerates Solid zoom 3×** in both docked and floating cameras.

## Direct workflow

Choose a tool from the sketch rail, or use L (line), R (rectangle), Shift+R (centre rectangle), C (circle), P (polygon), or S (slot). Drag a shape and select it; press **E** to open contextual extrusion/cut controls. The numeric flyout lets you override Add/Cut and exact depth; drag its amber on-canvas arrow for a faster depth adjustment. Open **Settings → Keyboard shortcuts** (K) for rebinding, clearing, resetting and JSON import/export. Open **Grid and snapping** (G) to configure all three grid tiers independently. Menus contain all corresponding commands; exact properties and history panels start collapsed.

## What is implemented

- Fixed XY millimetre sketching plane with rectangles, centre rectangles, circles, regular polygons, slots, open/closed polylines, editable handles, three configurable grid tiers and snapping.
- Editable profile dimensions, selection, deletion, undo/redo and feature list.
- Sequential exact B-rep extrusion, addition and subtraction in an isolated Web Worker using replicad + OpenCascade.js. E invokes a contextual Add/Cut combo tool with an on-canvas depth arrow and editable Z/depth.
- Three.js preview and STEP export, versioned JSON project save/open and local autosave.
- Deterministic model/validation tests, real-browser acceptance tests, editable shortcut settings, settings JSON import/export and CI build gates.

## Explicitly not yet implemented

Geometric constraint solving, standalone arcs, automatic region extraction from intersecting/nested edges, trim/offset, DXF, STEP round-trip validation, arbitrary face sketching, fillets, chamfers, feature reordering, robust overlapping-profile picking, solver conflict reports, manufacturing qualification.

**Engineering caution:** The current tests are not evidence of complete B-rep correctness or reliable interchange. See [Acceptance](docs/ACCEPTANCE.md).

## Experimental UI: floating Solid and wheel fields

The View and Layout menus provide a floating Solid mode plus up to three independent floating CAD cameras. The floating window is visually transparent but **the whole rectangular viewport blocks interaction with the Sketch beneath it**, including empty pixels. Its camera uses exactly the same configured CAD mouse controls as the docked Solid (Fusion: middle-button pan, Shift+middle-button orbit, wheel zoom); left-click horizontal faces can still populate a focused Z/Depth field. **Drag the small rectangular top-left handle to move a floating viewport**, not the rendered object. Drag its bottom-left or bottom-right grip to resize (the upper corners remain clear of the toolbar). Its single Home control resets to the current camera hemisphere, then toggles to the opposite hemisphere when clicked again from a Home pose. Layout → Workspace tiles provides a floating-window background opacity slider; opacity does not change pointer blocking or CAD geometry. Frame positions, sizes and opacity are stored in UI preferences independently of the CAD document and restored after reload. Dock Solid restores the conventional tile. Numeric properties can be adjusted by hovering and scrolling (Shift for fine, Ctrl for coarse steps). Clicking a timeline Cut briefly displays its exact translucent cutter for 867 ms.

## Documents

- [Independent floating CAD render views and visibility](docs/ADR-0009-FLOAT-RENDER-VIEWS.md)
- [Owner-approved product vision and agent design contract](docs/PRODUCT-VISION.md)
- [Experimental named parameters and formula data model](docs/ADR-0007-NAMED-PARAMETERS.md)
- [Canvas-first UX and shortcuts](docs/UX-DIRECT-INTERACTION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Acceptance and qualification](docs/ACCEPTANCE.md)
- [Dependencies and licensing](docs/DEPENDENCIES.md)
- [Contributor/agent instructions](AGENTS.md)

## Licensing

The project's own license has **not yet been selected**; publication does not grant a license. Third-party dependencies have their own license obligations (including LGPL-2.1-only OpenCascade WASM); see the dependency record.

## Click–click sketch authoring (post-M1 candidate)

For rectangle, centre rectangle, circle, polygon and slot, you may **click once** to anchor the first point, then move the cursor to preview and **click again** to establish dimensions or the secondary datum. Click-and-drag remains supported. If a press/release gives a degenerate zero-size shape (including one collapsed axis), the first point is retained instead of silently discarded. Hold Shift on the second click for a square rectangle; Esc cancels.

The sketch background is not an HTML draggable object. Ordinary left-drag on a blank area in Select mode neither creates geometry nor moves the grid. Use explicit Pan tool or middle-drag for viewport navigation.

The 3D reference grid is purely visual and is placed below the lowest displayed model/cutting-tool geometry to prevent apparent sinking through the grid. This never changes the authoritative XY sketch plane or saved CAD coordinates.

## Stable Solid viewport and provenance thumbnails (candidate)

The Solid camera maintains its azimuth/elevation, zoom and pan position across ordinary add/cut operations, feature edits, pending previews, cancel and successful/failed recomputations. The camera fits the first solid automatically; thereafter **Fit** (F or View → Fit Solid) is an explicit action. The previous valid solid remains visible during worker computations rather than flashing to blank; a failed rebuild reports an error while retaining the last valid display (which may be stale relative to the current parameters).

Open the collapsed **Feature history** drawer to see one post-operation **OpenCascade B-rep-derived thumbnail** per feature. Captions are `Extrude · Rectangle 1`, `Cut · Circle 2`, etc. Cut thumbnail overlays the complete cutting tool in red, including Z overshoot. Thumbnails are generated separately from the primary Solid update and are not an alternative to exact source geometry. Large histories can take longer to generate.

Only valid horizontal faces have the bright cyan hover overlay; side faces are not coloured. Actual CAD B-rep edge endpoints have a larger 17-pixel hover radius and an equally sized translucent green 3D sphere. These visual/topological coordinates do not create persistent CAD face/vertex references.


## Resizable workspace and compact history tiles

The Sketch/Solid separator and the Solid/inspector separator support pointer dragging, keyboard arrow adjustments when focused, and double-click to restore their defaults. Their positions are stored locally under a versioned UI-layout key, **not** in the engineering project. On narrower windows, the main divider changes to a vertical Sketch/Solid split; the sketch and solid viewports resize without losing their contents or camera.

The toolbar can be **docked to the Sketch title bar** using the Dock toggle, or undocked into the floating vertical rail. All tools and shortcuts continue to work in either location; placement is remembered locally.

Feature History now presents **newest-first, compact, multi-column tiles** showing the exact post-operation B-rep-derived snapshots (including red cutting-tool overlays). Clicking one tile opens a **single** contextual operation/Start Z/Depth/delete editor above the tiles. Clicking the same tile or its × button closes it. Editing one feature does not reorder the underlying CAD feature replay.

The permanent bottom status bar and Sketch bottom strip are removed: **Undo/Redo, Grid, tool dock, zoom and profile count** live in the Sketch title bar, and the **exact B-rep volume plus a build-status indicator** live in the Solid title bar. Preview volume is explicitly marked; errors still appear as a contextual message while remaining available to assistive technology.
