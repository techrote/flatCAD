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

## Cursor-corner extrusion, face-picked dimensions and signed depths — ADR-0003 (2026-11-06)

This section supersedes the previous **major-grid-based extrusion flyout placement**. The popup is anchored by a corner to the last pointer position in the sketch when invoked with E; clicking a profile using the extrusion tool uses the click coordinate. Prefer the upper-left corner unless the viewport requires a different corner. Sketch-outline overlap is permitted. If the popup covers the amber depth arrow, move it horizontally clear of that arrow when there is sufficient room. Preserve the initiating anchor while clicking 3D faces or editing numeric inputs.

The feature document stores Start Z and a *signed* Depth; both are physical mm. End Z = Start Z + Depth, with nonzero Depth required. A downwards cut from Start Z 8 to End Z 2 is Depth −6, *not* Start Z 14 with Depth −6. The kernel transforms every signed span into an exact positive-height B-rep interval, so old upward features remain bitwise-equivalent in document parameters.

**Focus-driven 3D face picking:** While the extrusion flyout is open, focus Start Z or Depth, then left-click a **horizontal planar face** of the *committed* solid preview. The input stays armed as the user clicks the 3D canvas. The application raycasts the committed B-rep-derived surface mesh, accepts only horizontal triangles at known feature elevations, and snaps its displayed Z to the exact source plane. Start Z is assigned the chosen plane. Depth is assigned **face Z − current Start Z**, permitting negative values. Zero-depth selections are rejected. Clicking a sloped/curved face does not silently invent a Z plane. Pending previews are display-only and cannot affect the committed face picker. Cursor navigation remains a separate concern: dragging the middle button pans/orbits, not face-picks.

**Navigation profiles** in Settings → CAD navigation controls, saved with the same validated local settings JSON:
- Fusion (default): middle-drag pans, Shift+middle-drag orbits; wheel zooms.
- SOLIDWORKS: middle-drag orbits, Ctrl+middle-drag pans, Shift+middle-drag zooms.
- Onshape: right-drag orbits, middle-drag or Ctrl+right-drag pans.
- Blender: middle-drag orbits, Shift+middle-drag pans.
All presets reserve left-click to pick rather than rotate. A normal scroll wheel zoom remains enabled; compatibility remains subject to human Windows/Firefox verification. Reference controls: https://help.autodesk.com/view/fusion360/ENU/?contextId=GS-SET-PREFERENCES , https://help.solidworks.com/2021/english/SolidWorks/sldworks/r_Middle_Mouse_Button.htm , https://cad.onshape.com/help/Content/View/view_navigation_and_the_view_cube.htm .

**Acceptance:** browser-test cursor anchoring (including sketch-overlap and handle avoidance), negative-depth exact bounds and volume, face-pick autofill of Start Z and signed Depth, mouse navigation modifiers, settings migration and persistence, and preview cancel with no native-document changes. Do not report full 3D geometry selection: only horizontal B-rep-derived face elevation picking is implemented.

## NAV-002 (2026-11-06): actual Fusion mouse navigation repair

Fusion: middle mouse drag pans; Shift+middle mouse drag orbits; right mouse drag orbits; wheel zooms. The earlier input mapping only *reported* orbit on Shift+middle drag. Three.js OrbitControls r180 reverses mouse ROTATE/PAN when Ctrl/Meta/Shift is held; the new adapter counter-swaps mouse bindings in a capture-phase pointerdown listener. This is applied consistently for all supported CAD navigation presets.

Acceptance requires measuring actual changes to the camera-target translation and camera-to-target offset (not merely a reported action string). Right-click short-press remains reserved for later context-menu work under UX-FACE-002; right-drag must not trigger that menu.

## Viewport grid isolation and click-toggle geometry (2026-11-06)

**Grid and "sinking" defect:** The old Solid presentation used an infinitely broad GridHelper drawn through Z=0, which could intersect the visible solid (especially negative-depth extrusion) and make it appear submerged or cut by grid lines. The updated **display-only** reference grid sits strictly below the minimum displayed Z (including a preview cutting tool's overshoot), with a proportional bounded gap. Sketch geometry stays on the fixed XY plane and retains exact physical Z. No B-rep coordinates or feature elevations move with the grid. It is a view affordance, not another model workplane.

**Two equivalent shape gestures:**
- Click then drag to the required dimension and release. Commit immediately when the shape is valid.
- Click and release at zero dimensions. The first click now anchors a pending primitive, with continuous rubber-band preview. The next click supplies the size or secondary datum and commits the same shape; subsequent clicks are not a third drawing mode. Escape cancels without adding geometry.
- This applies to corner and centre rectangles, circles, regular polygons, and slots. The existing polyline vertex-click sequence is unchanged. Shift makes rectangles square in either path, including the second click; geometry snapping remains in physical millimetres.
- A zero width/height or circle radius, or an identical slot endpoint, does not create a native CAD object or a history item.

**Sketch background:** The canvas is explicitly nondraggable as a browser element (dragstart/selectstart prevented). Blank left-drag in Select mode cannot move the viewport. Middle-drag continues to pan, and an intentionally chosen Pan tool remains a visible alternative, with clearly separate input mode. Never treat a plain background drag as a selection of the grid.

**Acceptance:** real browser tests for no background pan in Select, explicit middle pan, click–click rectangle/centre square/circle/polygon/slot, invalid first release, Escape cancel, and visual grid Z below both negative solids and cutting-tool overshoot. The screenshot issue is visual presentation; never "fix" it by changing OCC geometry.

## Stable Solid camera, history cards and mouseover contrast (2026-11-07)

The Solid camera is a persistent user view, not a side effect of modelling. After the first fit, any successful or failed add/cut, feature edit, cut preview or cancellation must preserve its direction, zoom and pan target. The user can select **Fit** or press F to explicitly recenter/reframe. Rebuilding geometry displays a busy status but keeps the last valid solid until replacement is accepted; invalid geometry displays a stale/error warning rather than a blank render.

Feature History expands on demand. Each chronological entry names the operation and chosen sketch type/ordinal, and shows a thumbnail of the B-rep solid **after that feature**. A Cut entry includes its entire red cutter as an overlay, making overshoot visible. Numeric Z/depth and operation controls remain editable in the same entry. Rendering this drawer must not reset Solid camera pose or block a normal rebuild.

Hover targeting deliberately distinguishes sketch and Solid operations. Highlight eligible horizontal face regions with high-contrast cyan, never colour vertical or sloped side faces. Real B-rep edge endpoints activate within a 17px radius and display a transparent green sphere of exactly the same apparent radius. Hover highlighting does not imply a stable persistent face identifier. It remains clear and does not write model parameters.


## Adaptive split workspace and newest-first history tiles (2026-11-07)

The direct canvas is given the most space. The separator between Sketch and Solid and the separator between Solid preview and the lower inspectors are keyboard-accessible separator surfaces supporting drag, Arrow keys, Home/End and double-click reset. Desktop uses a left/right Sketch/Solid split; narrow windows stack them and retain a draggable row separator. Layout ratios are clamped to sensible minimum panel sizes and stored as local UI preferences rather than inside the native CAD document.

The Sketch toolbar has an explicit **Dock / Undock** title-bar control. Docking moves the *same live toolbar* from the floating canvas rail to the header as a compact horizontal tool strip; it does not recreate buttons, drop event handlers, alter the active sketch tool or change sketch pan/zoom. This dock preference persists across reloads.

**Feature History** retains chronological source replay internally, but displays tiles **newest at the top**, with a multi-column thumbnail grid. Each tile keeps its post-feature B-rep snapshot and red full-cutter overlay for cuts. A single selected tile exposes one shared edit panel with operation, Start Z, signed Depth and Delete. Other tiles show no inputs. The panel can be closed with the same tile or a clearly labelled ×. Rebuilt snapshots must not reset the user's Solid camera.

The global bottom status bar is removed. Undo/Redo and Grid move to the Sketch header, along with tool dock, zoom and profile count. The exact solid volume moves to the Solid header. During uncommitted Add/Cut preview, that header explicitly shows the provisional volume. Errors appear as a contextual overlay; non-error status continues to be available in the accessibility status region.

**Acceptance:** real browser tests must resize both dividers with pointer gestures, confirm nonzero canvas dimensions and split persistence, test keyboard/stacked layout, dock/undock/reload without loss of shortcuts, verify newest-first tiles and hidden controls until clicked, and check title-bar commands plus volume and disappearance of the permanent footer. All these are UI mutations only; the native CAD document cannot be changed by resizing/docking.

## Tool-aware crosshair and Keybinds menu (experimental follow-up)

Tool-state glyph cues appear near, not on, the actual Sketch input hotspot. The native
crosshair remains precise: draw tools place their existing toolbar symbol below-left
of the pointer inside Sketch; when approaching an edge the cue flips to remain
within view. These presentation-only elements have `pointer-events:none`,
hide on pointer leave and for Select/Pan, and immediately track keyboard tool
selection without an extra Sketch click. They do not change snapping or
the model's physical coordinates.

The new **Keybinds** top menu shows the live assignments of all actions,
including user rebindings. Clicking a specific binding launches the existing
modal validated recording flow; selecting "View / reassign all" reveals the
full editor. The Settings menu and K shortcut remain available. Closing the
editor must clear any unfinished recording so no subsequent global CAD key is
intercepted. Pointer, keyboard and reload acceptance are required.
