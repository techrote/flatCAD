# flatCAD reference sheet

**Beta 1 defaults.** Shortcuts can be changed under **Keybinds → View / reassign all…** or **Settings → Keyboard shortcuts…**. See the [user guide](USER-GUIDE.md) for task instructions.

## Tools and shortcuts

| Action | Default | Notes |
| --- | --- | --- |
| Select | **V** | Click or drag selected profiles |
| Line / polyline | **L** | Click vertices; Enter finishes open; click first closes |
| Rectangle | **R** | Drag or click–click opposite corners; Shift constrains square |
| Centre rectangle | **Shift+R** | Draw from centre; Shift constrains square while sizing |
| Circle | **C** | Centre then radius |
| Regular polygon | **P** | Adjustable sides/rotation in Properties |
| Slot | **S** | Define rounded-end centres, then radius |
| Pan tool | **M** | Sketch navigation tool; middle-drag also pans |
| Extrude / Cut | **E** | Select closed profile(s) first, or choose them after E |
| Fit main Solid | **F** | Reframes the main Solid camera |
| Grid and snapping | **G** | Three independent grid tiers and geometry snap |
| Keyboard shortcuts | **K** | Opens the rebindable shortcut editor |
| Delete selected | **Delete** | Removes selection and dependent features as required |
| Duplicate | **Ctrl+D** | Copies selected profiles |
| Undo / Redo | **Ctrl+Z / Ctrl+Shift+Z** | History of model edits |
| Save native project | **Ctrl+S** | Downloads `.flatcad.json` |
| Temporary Sketch pan | **Hold Space** | Restores the previous drawing tool when released |
| Cancel / confirm tool | **Esc / Enter** | Contextual extrusion and pending polyline operations |

On macOS, Command can be used for multi-selection; configurable shortcut bindings may differ from the Windows defaults.

## Pointer and navigation

| Surface / input | Result |
| --- | --- |
| Sketch: drag shape or click two points | Create rectangle, circle, polygon or slot |
| Sketch: Shift while sizing rectangle | Square aspect ratio |
| Sketch: select + drag | Move selection; Shift constrains movement to one axis |
| Sketch: Ctrl/Command + click | Add/remove a profile from the selection |
| Sketch: Alt + drag selected profile | Duplicate while moving |
| Sketch: middle-drag / wheel | Pan / zoom |
| Solid (Fusion default): middle-drag | Pan |
| Solid (Fusion default): Shift + middle-drag, or right-drag | Orbit |
| Solid: wheel / Shift + wheel | Zoom / accelerated zoom |
| Floating Solid: top bar / bottom corners | Move / resize viewport |
| Sketch toolbar: drag top grip / click grip | Move or snap / return to title bar |
| Numeric fields: wheel | Adjust value; Shift fine, Ctrl coarse |

**Alternative CAD mouse presets:** Settings → CAD navigation controls…

| Preset | Orbit | Pan |
| --- | --- | --- |
| Fusion (default) | Shift+middle-drag or right-drag | Middle-drag |
| SOLIDWORKS | Middle-drag | Ctrl+middle-drag |
| Onshape | Right-drag | Middle-drag or Ctrl+right-drag |
| Blender | Middle-drag | Shift+middle-drag |

## Modelling and units

| Term | Meaning |
| --- | --- |
| Sketch plane | Fixed XY, millimetres |
| Feature | Ordered exact B-rep add or cut from a closed profile |
| Start Z | Initial plane for an extrusion/cut, mm |
| Depth | Signed Z displacement, mm; occupied interval spans Start Z to Start Z + Depth |
| Through-all | Cutter span extending across existing solid bounds |
| Auto | Conservative Add/Cut suggestion; review before Apply |
| Face reference | Horizontal committed Solid faces only, for Start Z or Depth |
| Preview | Uncommitted exact-solid evaluation; Cancel does not change the saved document |
| Current solid / Now | Latest feature result rather than a historical snapshot |

## Menus and files

| Menu | Main commands |
| --- | --- |
| File | New, Open, Save native project, Export STEP |
| Sketch | Drawing tools, Finish/Close line, Duplicate, Delete, Properties |
| Model | Extrude/Cut, explicit Add/Cut, Feature History, Named parameters |
| View | Fit Solid, floating views, tiled Solid visibility, Properties, Profiles, History |
| Layout | Workspace tiles, Float/Dock Solid, tiled Solid visibility |
| Render | Effects and antialiasing, experimental AO |
| Keybinds | Current bindings, reassign a command, full shortcut editor |
| Settings | Keyboard, grid, text, mouse navigation, preferences import/export/reset |

| File / state | Purpose |
| --- | --- |
| `.flatcad.json` | Editable, versioned native project, downloaded locally |
| `.step` | B-rep export for external CAD; **independent readback not yet qualified** |
| `flatcad-settings.json` | Shortcut, grid, polygon and mouse preferences |
| Browser local storage | Autosave and UI preferences; not a backup |

**Default sketch grid:** Fine 1 mm (shown, snap off), Working 5 mm (shown, snap on), Major 25 mm (shown, snap off). Geometric snapping to vertices, centres and midpoints is enabled.

**Release qualification:** UI accepted on Windows hardware and automated cross-browser tests; no claim of manufacturing readiness, verified STEP round-trip, arbitrary 3D CAD or complete constraint solving. See [ACCEPTANCE.md](ACCEPTANCE.md).
