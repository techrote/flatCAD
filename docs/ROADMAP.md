# Programme roadmap

| Milestone | Definition | Exit gate | Status |
|---|---|---|---|
| M0 — kernel proof and vertical slice | local web build; editable rectangle/circle profiles; add/cut; exact STEP | fresh checkout build, real browser WASM, known volume, STEP independently reopened | **in progress** |
| M1 — sketch editor | polylines/arcs/slots, accurate snapping, selection and drawing UX | drafting workflow tests at different zoom levels and devices | planned |
| M2 — constraint solver | geometric and dimensional constraints, solving diagnostics | under/fully/over-constrained examples, edit stability | planned |
| M3 — full feature system | derived closed regions, pockets, through-all, parametric history and safe recompute | topological regression, redo/reopen and controlled error recovery | planned |
| M4 — interoperability | STEP import/round-trip, DXF/SVG, STL, schema migrations | third-party CAD test corpus and unit conversions | planned |
| M5 — engineering hardening | geometry tolerance model, persistence resilience, performance, offline packaging, accessibility | published reproducible qualification suite | planned |

## M0 engineering backlog

- [x] Versioned 2D document model, validation, example part and tests.
- [x] Browser UI scaffolding, canvas drawing, properties, history, persistence.
- [x] OpenCascade/replicad worker and B-rep add/cut source implementation.
- [x] Three.js preview and STEP export source implementation.
- [ ] Verify deterministic dependency lockfile in CI.
- [ ] Execute a real browser (not just a build) with the shipped WASM.
- [ ] Measure computed volume for analytic demo against expected result.
- [ ] Independently reopen and interrogate STEP output.
- [ ] Retain browser evidence/artifacts and performance baseline.
- [ ] Independent review and decision to merge.

## First qualification specimen

Plate: 100 mm × 60 mm × 8 mm, two Ø10 mm through-holes at x=-35 and x=+35 mm, y=0 mm. Base at z=0..8, cutters extend beyond both faces (z=-1..9). Analytic expected volume:

V = (100×60 − 2π×5²)×8 = 46,743.3629385641 mm³.

Key checks: one valid connected solid, bounding box 100 × 60 × 8, through-holes genuinely open, STEP reopening agrees with analytic values within documented tolerance.

## Sequencing

Do not claim M0 is complete from a screenshot, compile or passing schema tests alone. Geometry/WASM execution and independent STEP reopening are hard gates. After M0, the highest-value work is correct sketch profile topology and constraints, not decorative UI.
