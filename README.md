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

**CAD mouse controls:** Under Settings → CAD navigation controls choose Fusion (default: MMB pan, Shift+MMB orbit), SOLIDWORKS, Onshape or Blender. The selection persists in settings JSON; mouse wheel zoom remains available.

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

## Documents

- [Canvas-first UX and shortcuts](docs/UX-DIRECT-INTERACTION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Acceptance and qualification](docs/ACCEPTANCE.md)
- [Dependencies and licensing](docs/DEPENDENCIES.md)
- [Contributor/agent instructions](AGENTS.md)

## Licensing

The project's own license has **not yet been selected**; publication does not grant a license. Third-party dependencies have their own license obligations (including LGPL-2.1-only OpenCascade WASM); see the dependency record.
