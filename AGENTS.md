# flatCAD engineering instructions

1. Before changing code, read README.md, docs/ARCHITECTURE.md, docs/ROADMAP.md and docs/ACCEPTANCE.md plus live issues and PRs. Avoid duplicate writers and preserve pending work.
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
