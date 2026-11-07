# flatCAD engineering instructions

1. Before changing code, read [docs/PRODUCT-VISION.md](docs/PRODUCT-VISION.md) (owner-approved scope and UX contract), README.md, docs/ARCHITECTURE.md, docs/ROADMAP.md and docs/ACCEPTANCE.md plus live issues and PRs. Avoid duplicate writers and preserve pending work.
2. The authoritative project state is the schema-versioned CAD document in physical millimetres. Never write canvas pixels or tessellated mesh vertices back to its geometric parameters.
3. Sketch geometry is strictly XY. Depth features are Z-intervals. Do not add arbitrary sketch workplanes without an explicit architecture decision.
4. Exact B-rep is authoritative. Three.js triangle meshes are display derivatives. Never fake STEP from a display mesh.
5. Make source changes on bounded feature branches; submit a PR. Do not merge unqualified work or bypass human acceptance. Keep a clear list of tests actually executed.
6. Protect validity: reject malformed project files, non-finite numbers, zero/negative widths, missing profile references and unsupported schema versions. Preserve the most recent valid user document on failure.
7. When changing geometry logic, add unit and kernel tests, including a known analytic part and a STEP export/parse gate. Treat a green TypeScript build as insufficient.
8. Keep WASM processing in a worker. Dispose kernel objects and avoid an unbounded queue of outdated recomputations.
9. Do not introduce cloud dependencies, accounts, telemetry, external font CDNs or unreviewed network requests; local-first/offline behaviour is contractual.
10. Clearly mark a capability as unimplemented until a real executable acceptance gate demonstrates it. Never claim manufacturing-grade accuracy from screenshots.
11. Maintain docs/DEPENDENCIES.md and examine runtime dependency license implications before adoption.
12. Treat docs/UX-DIRECT-INTERACTION.md as the direct-first UX contract. Every new menu action should have a canvas/shortcut path where practical, and every direct action must have a menu fallback. Menus and inspectors initiate hidden.
13. Keep keyboard/grid preferences independent of the native CAD document. Do not silently change default user shortcuts, bind conflicting chord combinations or override browser input editing.
14. New tools require pointer + keyboard browser test coverage, numeric schema validation and exact OpenCascade evaluation where solids are involved.

15. Product boundary: flatCAD stays permanently 2.5D. Optimise for tutorial-free sketch → exact solid → STEP, with optional depth of precision controls. Never introduce unsolicited onboarding, guided tours, banners or instructional clutter; a user-invoked F1 help wiki is a future feature. Preserve responsive interaction, last valid solid and camera through exact worker evaluation. Follow docs/PRODUCT-VISION.md before expanding scope.
