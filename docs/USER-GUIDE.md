# flatCAD user guide

**Applies to:** Beta 1, the accepted 2.5D Sketch/Solid workspace. See the [reference sheet](REFERENCE-SHEET.md) for the full shortcut and control tables.

## Start the application

Install Node.js 22 or newer, then run from a local repository checkout:

```sh
npm install --no-audit --no-fund
npm run dev
```

Open the localhost address printed in the terminal. For an offline production preview after dependency installation, run `npm run build` and `npm run preview`. An OpenCascade WASM worker loads on startup; its first initialization may take longer than subsequent operations.

The initial view contains an example mounting plate (100 × 60 × 8 mm) with two through-holes. Use **File → New project** to start with an empty document. Give the project a name in the top bar.

## Understand the workspace

- **Sketch** is a single XY plane. Coordinates, profiles and dimensions are stored in millimetres; on-screen pixels are never the saved geometry.
- **Solid** displays a tessellation of the exact OpenCascade B-rep, not a separately editable mesh. Orbit, pan and zoom do not move the part.
- **Properties** exposes precise values for the current selection. **Profiles** lists authored sketch objects.
- **Feature History** contains the ordered operations that build the solid. History thumbnails show the model after each operation, including a red cutter for cuts.

The normal workflow is **draw a closed profile → select it → press E → choose Add or Cut → apply → save/export**.

## Make a plate with a hole

1. Choose **File → New project**. Press **R** (Rectangle); draw a rectangle in Sketch by dragging, or click one corner and then the opposite corner. Its dimensions can be refined later.
2. Press **V** (Select) and click the rectangle. Press **E** to open Extrude/Cut.
3. Choose **Add** (or keep Auto if it proposes Add). Set **Start Z = 0 mm** and **Depth = 8 mm**. Choose **Apply**. A solid plate appears in Solid.
4. Press **C** (Circle). Draw a circle inside the rectangle and select it with **V**.
5. Press **E** again. Check that the operation is **Cut**, or select Cut explicitly. Use **Through-all** or specify a cutter spanning both faces (for example, **Start Z = -1 mm**, **Depth = 10 mm** for an 8 mm plate). Apply.
6. Open **Feature History** to inspect or edit either operation; select the current-solid / **Now** control to return from historical inspection.
7. Choose **File → Save native project** for an editable `.flatcad.json` download. Choose **File → Export STEP** for an exchange file.

The Auto operation is a **suggestion based on profile containment**, not a substitute for inspecting the result. If a Boolean operation fails, check that the profile is closed and that the intended Z intervals intersect.

## Sketch and edit profiles

Select tools from the Sketch rail or use shortcuts: **L** line/polyline, **R** rectangle, **Shift+R** centre rectangle, **C** circle, **P** polygon and **S** slot. Rectangles, circles, polygons and slots accept either drag-to-size or two-click construction. Hold **Shift** while sizing a rectangle to make it square.

**Polyline:** press **L**, click successive vertices, click the starting point to close it, or press **Enter** to finish an open line. **Backspace** removes the last pending point; **Esc** cancels. An open path cannot be extruded.

**Selection:** press **V** and click an object. **Ctrl+click** (Command+click on macOS) adds/removes items in a group. Drag selected geometry to move it; **Alt+drag** duplicates it. Use the context bar or Properties for exact numeric edits. **Ctrl+D** duplicates; **Delete** removes; **Ctrl+Z** and **Ctrl+Shift+Z** undo/redo.

The Sketch rail can dock in the Sketch title bar or float above the workspace. Drag its top grip to move it; bringing it near either Sketch edge snaps it to that side. A click on the grip without dragging returns it to the title bar. Docking and position are stored as interface settings, not project geometry.

## Extrusion, cutting and precise Z values

Press **E** with a selected closed profile, or invoke E and then click a closed profile. The popup provides:

| Control | Effect |
| --- | --- |
| **Auto / Add / Cut** | Auto proposes an operation; Add unions solid material, Cut subtracts it |
| **Start Z** | Starting plane in millimetres |
| **Depth** | Signed displacement along Z; negative values extend downward |
| **Through-all** | Preloads a cutter interval spanning the existing solid |
| **Amber arrow** | Interactive depth adjustment in Sketch |
| **Preview in solid view** | Recomputes an *uncommitted* exact-solid preview; cancel restores the committed view |
| **Apply / Cancel** | Commits one operation or discards the pending proposal |

For a downward feature from Z=8 to Z=2, set **Start Z = 8**, **Depth = -6**.

You can also choose an existing **horizontal** Solid face as a numeric reference: focus **Start Z** and click the face to copy its elevation; focus **Depth** and click a face to set the difference from Start Z. Vertical and sloping faces are not valid references for this action. The face pick uses committed geometry, even when a provisional cut is visible.

### Feature history and parameters

Feature History is an inspection/editing surface, not a second modelling engine. Select a thumbnail to inspect that stage; edit operation, Start Z or Depth in the corresponding feature controls. The UI may show recent features first, but the underlying exact-solid replay keeps the original operation order. **Now** returns to the current model. Older sketches and features remain linked by stable profile IDs.

For reusable numeric expressions, open **Model → Named parameters…**. Precision controls are optional: drawing does not require setting up formulas or constraints first.

## Navigation and workspace layout

With the default **Fusion** mouse preset in Solid: **middle-drag pans**, **Shift+middle-drag or right-drag orbits**, and the **wheel zooms**. **Shift+wheel** zooms Solid more quickly. **F** fits the main Solid view. The Sketch canvas has its own pan/zoom: middle-drag pans and wheel zooms.

Other CAD navigation presets are under **Settings → CAD navigation controls…**. They affect the camera, not the model.

Use **Layout → Workspace tiles…** to arrange panels and adjust floating-window opacity. **View → New floating view** creates an independent Solid camera (up to three extras). Drag its top move bar and bottom-corner grips to move/resize it. Each floating camera operates on the **same** exact model. The entire floating rectangle owns mouse input, even if its background is fully transparent. Window positions, panel layout and appearance are saved separately from the CAD document.

**Render → Effects and antialiasing…** opens a nonmodal inspector. The accepted comparison setup uses native 1× resolution, explicit 4× MSAA and AO off. Higher-resolution supersampling and AO remain experimental; changing display settings never changes the exported solid.

## Save, reopen and exchange files

| Action | Location | Result |
| --- | --- | --- |
| New | **File → New project** | Starts an empty local model |
| Save | **File → Save native project** or **Ctrl+S** | Downloads an editable `.flatcad.json` file |
| Open | **File → Open project…** | Validates and loads a native project |
| Export STEP | **File → Export STEP** | Downloads a `.step` file derived from the B-rep |
| Settings export/import | **Settings** menu | Saves/restores shortcut, grid and navigation preferences separately |

Browser local storage provides autosave convenience, **not a portable backup**. Download the native project when keeping important work. STEP is an output format here, not a way to reopen an editable flatCAD document.

## Current limits and support

This beta is deliberately **2.5D**: no arbitrary workplanes, sketch-on-face authoring, geometric constraint solver, trim/offset, standalone arcs, fillets, chamfers, DXF, STEP import or general overlapping-edge region extraction. Independent STEP reader validation, tolerance testing and manufacturing qualification are not complete.

If tools fail to compile after a fresh checkout, use `npm install` rather than `npm ci` (no committed package lockfile). If the Solid viewport is unavailable, check browser WebGL support; continue to use Sketch and retain your native project. Invalid native JSON is rejected rather than silently rewriting the last valid model.

For technical acceptance criteria, see [ACCEPTANCE.md](ACCEPTANCE.md); for recorded design decisions, see [PRODUCT-VISION.md](PRODUCT-VISION.md) and [ARCHITECTURE.md](ARCHITECTURE.md).
