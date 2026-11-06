# Direct authoring and interaction design — ADR-0002

Date: 2026-11-06. Status: implemented prototype, subject to execution and usability qualification. Branch: feat/fc-m1-direct-authoring (stacked on M0).

## Target audience and design rule

A technically literate person who understands that CAD sketches become solids, but who has never used a parametric CAD package, should be able to create a useful part without reading a manual. The canvas is the primary authoring surface. Menus remain complete discoverable fallbacks for every direct tool; exact numeric properties live in a collapsed inspector rather than consuming space by default.

Principles:

- Start with a nearly blank canvas, a compact icon tool rail, and simple file/sketch/model/view/settings menus.
- Direct drawing gesture first, floating parameter panel when useful, sidebar fields when precision or unusual adjustments demand them.
- Every mode change must have a visible transient cue; avoid silently changing tool semantics.
- Draw in XY physical mm; do not use screen pixels as stored CAD dimensions.
- Prefer predictable visual feedback and reversible operations over clever opaque automation.
- Keep the 3D preview derivative-only. STEP comes from the B-rep kernel, not display mesh.

## Implemented authoring tools

| Gesture / default | Behaviour | Fallback |
|---|---|---|
| V / select | Click shape to select; drag interior to translate. Drag square handles for resize / vertex reposition. Alt+drag duplicates. Shift constrains move to one axis. | Sketch → Select; Properties |
| L / line | Click successive points for open polyline. Click start point to close polygon; Enter or double click ends open line; Backspace removes pending vertex; Esc cancels. | Sketch → Line, Finish line, Close line |
| R / rectangle | Drag opposite corners; hold Shift for square aspect. | Sketch → Rectangle |
| Shift+R / centre rectangle | Drag from centre; Shift makes square. | Sketch → Centre rectangle |
| C / circle | Click centre and drag radius; edit precise radius later. | Sketch → Circle |
| P / regular polygon | Click centre and drag radius. Floating panel gives side count (3–64) and rotation angle. Shape geometry stays parametric. | Sketch → Regular polygon; Properties |
| S / slot | Drag between the centres of the rounded ends; floating radius input. Exact semicircular ends in OpenCascade worker. | Sketch → Slot; Properties |
| M / middle-click | Pan at current zoom; wheel zoom at pointer. Space can temporarily enable Pan. | View → Pan |
| E / extrude-cut combo | With a selected closed profile, open an anchored extrusion popover. Without selection, click a closed profile. Auto suggests Add or Cut based on containment. Override operation, type Start Z/Depth, or drag the amber depth handle; press Enter to apply. | Model → Extrude/Add/Cut; Feature history |

An open line is intentionally *not* extrudable. Closed paths must be simple, nondegenerate polygons. Polygon/slot/closed path can be extruded as exact B-rep solids (lines remain analytic; slot caps are circular arcs). General region extraction from intersecting polylines is not yet available.

## The E combo tool

The contextual extrusion tool follows the selected profile. Its initial Auto mode chooses Cut only when the entire outline of the selected shape lies within a previous additive profile; otherwise it chooses Add. This is a **suggestion**, not an exact boolean-intersection solver. The user can override to Add or Cut. For a suggested cut with a current solid, Through-all preloads a Z span extending one mm beyond its current bounding box; explicit depth and Z remain editable. As a result, the user can cut holes without manually remembering plate thickness.

The sketch shows an amber arrow whose draggable endpoint changes the proposed depth. A floating popover contains the numeric Start Z, Depth, operation dropdown, through-all toggle, Apply and Cancel. Applying creates one non-destructive feature referencing the original parametric profile. Feature depth and operation are editable later under Feature history. Live boolean preview while dragging is **not** yet implemented; only the arrow/dimension is live, and the exact solid recomputes upon Apply.

## Three-tier grid and snapping

Three independent preferences, each with show/hide, physical-mm spacing, hex colour and snap enable:

- Fine: 1 mm / #1b3045 / shown / snap OFF.
- Working: 5 mm / #254764 / shown / snap ON.
- Major: 25 mm / #355d81 / shown / snap OFF.

A tier with sub-8-pixel spacing is not rendered to avoid moiré and rendering overload, but its snap setting remains logically independent of visibility scaling. When multiple tiers have snapping enabled, the nearest grid point wins. Geometry snapping to corners/vertices, centres and midpoints takes priority within a 10-pixel screen-space tolerance. Alt temporarily bypasses snapping. This is not yet a full solver for tangent/intersection/perpendicular snapping. Grid settings are user preferences, not per-document physical dimensions.

## Keyboard shortcut preferences

Settings → Keyboard shortcuts (default K) opens a modal popup. Click a binding then press a replacement chord. Duplicates and malformed imported chords fail validation. Clear, reset, and JSON export/import operate on the complete preferences package (keyboard, grid and polygon defaults) in localStorage under flatcad.preferences.v1. The native CAD project is separately saved under flatcad.project.v1.

Default shortcuts: V select, L line, R corner rectangle, Shift+R centre rectangle, C circle, P polygon, S slot, M pan, E extrude/cut, G grid, K shortcut popup, Delete remove, Ctrl+D duplicate, Ctrl+Z undo, Ctrl+Shift+Z redo, Ctrl+S save. Esc cancels a pending line/extrusion. Enter confirms the contextual extrusion. Inputs deliberately do not trigger sketch shortcuts when typing.

## Native document and migration

Project schema v2 adds regular polygon, exact slot, and open/closed polyline profiles. Loading schema v1 rectangles/circles migrates into v2 without changing coordinates or feature references. Unknown versions, malformed coordinate arrays, non-finite dimensions, self-intersecting closed paths and extrusion of an open path fail closed. Preferences are independently versioned (v1) and have strict type and chord validation.

## Explicit remaining work

- Path constraints (horizontal, equal, tangent, parallel, dimension-driven solving); PlaneGCS evaluation and conflict diagnostics.
- Profile-region discovery from crossing and nested edge graphs (not implicit auto-filled paths).
- Full toolbar accessibility, responsive and touchscreen interaction, users with coarse input, explicit hover/key hints, vertex insertion and curve editing.
- Real-time B-rep ghost extrusion while dragging; face-to-profile mapping and direct 3D feature face selection.
- Fillets, chamfers, patterns, offset/trim, DXF, independent STEP round-trip and manufacturing qualification.
- Qualitative test with a new-to-CAD user. Automated success does not imply intuitive usability.

## Objective acceptance additions

1. Fresh project: draw a rectangle via R and extrude via E with no menu interaction.
2. Shift+R followed by Shift drag creates a centre-anchored equal-sided rectangle.
3. P sets the side count/rotation in an anchored panel; inspect saved JSON and exact extrusion.
4. Draw a slot, change its radius, confirm exact B-rep with curved end caps and valid volume.
5. Close a line outline and extrude; open lines are rejected.
6. Rebind R to a different chord via popup; restart, confirm persistence. Export settings JSON, import a valid file, reject duplicate/invalid input without overwriting previous valid settings.
7. Customize three grid spacings/colours, toggle visibility and per-tier snap; verify persisted JSON and pixel/world snapping behaviour at varying zoom.
8. Edit older feature dimensions and check exact recompute, undo/redo, and project JSON round-trip.
9. Test with keyboard-only, mouse, Firefox and Windows; record where users need coaching. No blanket UX quality claims without human evidence.

## Direct-selection and operation-preview extension (2026-11-06)

**Ctrl/Command + click** toggles membership of the selection set, including circles, polygons, slots and enclosed path regions already represented as profile objects. Unmodified clicking an already-selected group member preserves group selection for dragging. Ctrl-click empty space retains selection; ordinary click empty clears it. A selected group moves, duplicates and deletes in one undo-history change; E creates one ordered exact feature per selected closed profile, validated and committed atomically.

This does **not** yet imply derived region selection from intersecting sketches or general multi-face selection in the 3D viewer. All selected objects remain explicitly authored profile entities.

The extrusion flyout is positioned relative to the union of selected geometry's screen-space bounding boxes. Candidate positions are separated from the geometry by exactly the configured *major* grid spacing in millimetres, converted using the current canvas zoom. Placement avoids covering the draggable arrowhead, tries the opposite side before covering a region, and clamps inside small windows when no collision-free position exists. Placement updates on open, zoom and major-grid preference changes.

The depth handle is a **filled triangular arrowhead**, not a circular knob. Its shaft remains visible on the sketch, with live dimension feedback.

**Preview in solid view** (default ON during the session) evaluates an ephemeral feature set with the same OpenCascade Web Worker used for committed operations. The provisional result replaces the normal solid mesh visually and is coloured turquoise for Add or orange for Cut, with a persistent "PREVIEW · NOT APPLIED" label. Its volume is available as a browser-test diagnostic, but it is not saved to the CAD document or history. Cancelling/disabling preview restores the last committed B-rep mesh. Preview work is debounced (250 ms), at most one request may be in flight and stale responses are discarded when a newer input arrives. This is a resulting-solid preview, not yet a translucent union/difference ghost overlay.

The popover also retains the exact numerical operation mode, start Z and depth, and its through-all cut toggle. Numeric changes or arrow dragging trigger provisional recomputation if preview is enabled. Backend errors are reported inside the flyout, not silently treated as successful geometry.

### Acceptance additions

- Ctrl-click two independent hole profiles; E auto-selects Cut, creates two features as one undo step, and preserves a versioned native document.
- Ctrl-click toggles a selected object off; ordinary click replaces multi-selection; grouped move and duplicate are atomic and keep stable references.
- Change major grid spacing and zoom; confirm the popover offset follows physical-mm spacing while respecting viewport edges and arrow clearance.
- Compare exact B-rep volume in provisional Add/Cut preview to base geometry; turning preview off and cancelling cannot alter the saved native feature history.
- Drag the arrowhead and verify provisional depth changes before committing.
- Test worker errors, pending requests, rapid edits and stale response suppression on real browsers; stress and slow-worker qualification remain open.
