# Dependencies, distribution and licensing

Package versions are deliberately pinned in package.json during M0. A committed lockfile and dependency audit are required before a qualified release.

| Component | Role | License evidence / review requirement |
|---|---|---|
| replicad | JavaScript API for OCCT B-rep modelling | MIT at upstream 1.x source; verify exact installed tarball |
| replicad-opencascadejs | OCCT WebAssembly runtime | LGPL-2.1-only in upstream package metadata; comply with notices and applicable source/relink obligations |
| Three.js | preview rendering | MIT upstream; verify exact installed version |
| Vite / TypeScript / Vitest | development/build/test toolchain | inspect installed dependency and transitive licenses |

Upstream: https://github.com/sgenoud/replicad ; https://replicad.pages.dev/docs/use-as-a-library/

**Project license is not selected.** Do not silently add an MIT license based on one dependency; an explicit owner decision is required before publishing a general-use binary. Keep WASM separate where practical and preserve applicable third-party notices.

WebAssembly is served from built local assets, not a remote CDN. Do not load telemetry, analytics or external fonts.
