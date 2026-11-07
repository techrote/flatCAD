# ADR-0009 — Independent floating CAD views and tiled visibility

**Status:** Experimental in Draft PR #21. This augments (but does not replace) the legacy Float solid layout mode. Read with the [owner product vision](PRODUCT-VISION.md) and the pending PR #20 floating face-pick/Render-menu work.

A floating render is a **transparent camera**, not a modelling workspace or a new document. The View menu can create up to three independent floating renders. Each has its own Three.js camera, zoom, orbit/navigation inputs and home/opposite/underground/auto-fit control tile. Each renderer receives the **same current exact B-rep-derived GeometryMesh** (and any provisional cutter overlay) from one authoritative kernel evaluation. The mesh is presentation, not the source of geometric state.

**Visibility and layout are independent.** The tiled Solid viewport starts visible. Layout → Workspace tiles contains a separate “Show tiled Solid viewport” checkbox; hiding this tile does **not** remove any floating render. View provides show/hide commands. The existing Float solid (replace tile) option remains for backward compatibility and can coexist with extra independent views.

The subtle visible floating border is intentional: it indicates the bounds within which the camera can clip the displayed object. The actual object is draggable from its solid pixels; free transparent pixels remain pointer-through. Pointer activation starts only on a rendered object. Auto-fit recovers an over-zoomed or clipped object. Each floating view also has a close button in its icon-only navigation tile.

**Cost constraints:** three extra renderers maximum, lazy optional ambient occlusion and bounded supersampling. Each renderer is demand-driven rather than running an idle 60 Hz GPU loop. Closing a view disposes its WebGL and Three.js resources. View positions are saved separately from the CAD document (not on every pointermove); saved views reload with their previous positions. Camera angles and zoom persist during an active session and can be manipulated separately; persistence of arbitrary camera poses across browser restarts is a separate future feature.

The primary validation gates are: independent camera direction (changing one does not affect others); two or three visible real Solid outputs with a single native model; face-pick Start Z / Depth through a floating renderer; pixel hit-based input gating; hiding and restoring the tiled Solid independently; clean deletion and bounded preference migration; and overlay/print/export correctness. Exact STEP validity is not affected by the number of display cameras.

Never add unsolicited onboarding, overlaid text labels or perpetual performance-costly effects to support this workflow.
