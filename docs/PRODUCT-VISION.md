# flatCAD — Product vision and agent decision contract

**Authority:** Owner-confirmed product direction, 7 November 2026.  
**Purpose:** Durable guidance for contributors and coding agents. This document defines intended behaviour; it does **not** certify that any feature is implemented or qualified. Read with [AGENTS.md](../AGENTS.md), [architecture](ARCHITECTURE.md), [direct-interaction UX](UX-DIRECT-INTERACTION.md), [roadmap](ROADMAP.md), and [acceptance](ACCEPTANCE.md).

## One-sentence mission

> **From napkin sketch to engineering-grade STEP, with no tutorial required.**

flatCAD is a local-first, **permanently 2.5D**, precision-first mechanical drawing tool. A person with no CAD experience should be able to open it, draw a rough shape, turn it into a useful solid, and export a valid STEP model without first reading a manual or typing dimensions. A practiced engineer should be able to refine that *same* model with as much numerical, parametric, and diagnostic control as the task warrants.

**Complexity should be available, never compulsory.** The program should stay out of the user's way.

## Hard product boundaries

- **2.5D by design, not a transitional MVP.** Sketches live on one fixed XY plane in physical millimetres. Ordered add/cut/pocket-like features operate along Z. Do not expand the product into arbitrary workplanes, sketch-on-face authoring, lofts, freeform surfaces, or general-purpose 3D CAD without a new, explicit owner decision. The separate INTUIT3D project covers broader CAD ambitions.
- **Real engineering geometry.** Preserve exact, validated OpenCascade B-reps as the source of truth. Three.js meshes and canvas pixels are presentation, never saved geometric authority. A rough-looking sketch may use approximate *user-entered* dimensions, but its resulting model must faithfully and exactly represent the parameters actually stored.
- **Engineering-grade STEP is the goal, not an achievement already established.** Validate solids, booleans, dimensions, units, tolerances, and exported STEP with independent readback. Keep current limitations visible in engineering documentation. Never claim print/manufacturing readiness solely from a successful build, screenshot, exported Blob, or green browser test.
- **Local-first and nonintrusive.** No login, mandatory services, telemetry, external network dependency, or hidden data migration. Projects, UI preferences, worker state, and exports remain appropriately separated.

## Interaction philosophy: drawing first, precision on demand

- **No prerequisite tutorial, no compulsory numbers.** The default workflow is direct manipulation: sketch freely, select what matters, form solids, and refine later. Do not force a constraint solver or parameter form before the first useful drawing action.
- **Continuous refinement.** An informal sketch can become a dimensionally specified, constrained, engineerable part incrementally, without conversion to a different editor or loss of stable profile/feature references.
- **Progressive disclosure and configurable expertise levels.** A future beginner/intermediate/expert *UI preset* may adjust control density, hints, suggestions, inspector visibility, and keyboard/interaction settings; individual elements should be independently configurable or disableable. Levels must never create different modelling engines or silently rewrite geometry. Expertise presets are a plan, not currently implemented functionality.
- **Suggest, do not secretly decide.** Contextual add/cut, snapping, inferred intent, and later constraints may assist the user, but potentially destructive or irreversible choices require clear user control, safe defaults, and reliable undo.
- **Sleek workspace.** Default to unobtrusive tools, compact titlebars, hidden-on-demand detail, and direct visual feedback. Preserve the ability to reveal full numerical controls, diagnostics, and history. Do not add visible instructional clutter because a workflow might confuse a newcomer.
- **Discoverable actions rather than explanations.** Make object selection, dragging, extrusion, cutting, resizing, and feedback self-evident through the controls themselves; keep accessible menu/keyboard fallbacks. Avoid coercive modes or workflows that require memorising commands.

### Explicit no-onboarding decision

**Do not introduce welcome screens, guided tours, tutorial overlays, instructional banners, first-run walkthroughs, or other unsolicited signposting.** Do not add explanatory UI as a speculative response to the planned usability study. Existing meaningful hover feedback and context-sensitive action controls are not an excuse to inject a tutorial layer. Preserve the current quiet, direct workspace.

**Future documentation UI:** An unobtrusive, **user-invoked F1 / Windows-help-style wiki popup**, ideally searchable and context-aware. It must never open automatically and is **not yet implemented**. Documentation can grow without taking permanent screen space.

## Geometry, sketching, and history

- Keep the easy path unconstrained; support sophisticated geometric/dimensional constraints **later and optionally**, with clear conflict diagnostics. Do not make constraint negotiation necessary to draw.
- Extend sketch capabilities where they improve actual 2.5D modelling: closed-region extraction, arcs, trim/offset, topology, reliable snap, editable dimensions, safe feature dependencies. Preserve exact kernel evaluation and consistent native-document semantics.
- Feature history must remain editable and ordered in calculation even when displayed newest-first for compact navigation. Preserve IDs and valid project states through undo/redo, parameter edits, and native JSON reopen.
- Accept that higher-end users may request deep control without requiring novice users to understand the same abstractions.

## Responsiveness without sacrificing authority

- **Never blank, flash away, or unnecessarily reset the last valid solid** during kernel startup, rebuild, preview, error recovery, or feature editing.
- Keep solid camera orientation, zoom, orbit target, selection, sketch position, and focus stationary across operations unless the user explicitly requests a view change.
- Support immediate direct-manipulation feedback while exact OpenCascade work happens in a worker. Clearly distinguish uncommitted preview from committed geometry; never serialize a visual approximation as a CAD result.
- Discard stale computations and prevent older worker results from replacing newer user intent. Report failures without corrupting or obscuring the last valid document.
- Profile real interactive workloads before making performance claims based on synthetic examples.

## Future performance feature: exact history checkpoints

For complex feature chains, consider **freeze** and **flatten/bake** as different, deliberately designed operations:

1. **Freeze/checkpoint:** Preserve the editable upstream feature history, but cache an **exact OpenCascade B-rep** for the history prefix. Later operations start from that exact cached solid. Parameter, topology, unit, or kernel-version changes that invalidate the prefix must invalidate/rebuild affected checkpoints. Cache identity, integrity, portability, and memory tradeoffs need explicit design and tests.
2. **Flatten/bake:** A separate explicit operation to replace prior modelling steps with an authoritative exact solid snapshot. Because this can sacrifice editability, require clear acknowledgement, undo/recovery, persistence semantics, and STEP/geometry verification. Never introduce it silently as a memory/performance optimization.

Neither capability is implemented or approved for immediate insertion into the active UI. Benchmark actual large-history bottlenecks before prioritising this work.

## Owner's cold-start usability study — Monday, 9 November 2026

The owner plans to place the application in front of colleagues with only this instruction:

> “figure out what this program does and make something cool for me to 3D print”

This is a **discovery test**, not a guided plate-building exercise. The owner intentionally does not want more onboarding, guidance, or interface signposting added in preparation. Observe authentic stumbling points, attempted interactions, mental models, time-to-first-shape/solid/export, and geometry/export failures without scripting participants' actions. User-observed friction should inform later design decisions, not justify intrusive help by default.

The canonical technical acceptance specimen remains a **100 × 60 × 8 mm plate with two Ø10 through-holes** and independent STEP readback, per [ACCEPTANCE.md](ACCEPTANCE.md). Do not substitute the informal test for exact engineering qualification; they test different things. A STEP model may require downstream conversion for a slicer; do not suggest a direct-to-printer path exists unless actually supported.

## Development and acceptance priorities

1. **Preserve current behaviour and act on owner-observed interaction feedback.** At the 7 November handover, latest experimental workspace work is in the stacked Draft PRs [#10](https://github.com/techrote/flatCAD/pull/10) → [#11](https://github.com/techrote/flatCAD/pull/11) → [#12](https://github.com/techrote/flatCAD/pull/12) → [#13](https://github.com/techrote/flatCAD/pull/13), not all on `main`. Refresh branch heads, CI, and human feedback before changing them. Do not bypass their dependencies or merge unqualified geometry/UI work.
2. **Make the real sketch → solid → STEP path reliable** in browsers and on target desktop hardware. Finish independent STEP reopening and measurements; keep the manufacturing-qualification distinction explicit.
3. **Improve genuine drafting power without imposing it.** Robust region construction and precision tools should supplement, not block, casual sketching.
4. **Scale history and interaction after measuring bottlenecks.** Consider exact caching/checkpointing when performance evidence warrants it.
5. **Add optional F1 help and expertise configuration deliberately**, without introducing unsolicited instruction or clutter.

### Agent pre-flight checklist

Before proposing an interaction or architecture change, ask:

- Does this make the no-tutorial napkin-sketch-to-STEP flow more direct, or merely add controls, labels, and steps?
- Does the basic sketch workflow still work without typed numbers or constraints?
- Can expert users access exact parameters without changing the model's underlying representation?
- Does the visual response preserve committed geometry, camera, interaction context, and truthful preview state?
- Are B-rep correctness, native document integrity, and STEP export proven by executable tests on the exact proposed source?
- Does this respect permanent 2.5D scope, the inactive status of future features, and the no-unprompted-onboarding decision?

When these goals conflict, prefer **correctness, reversible user control, and unobtrusive direct interaction** over decorative UX or guessed automation. Request an explicit owner decision for a genuine product-boundary tradeoff.
