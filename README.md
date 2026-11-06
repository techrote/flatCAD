# flatCAD

**flatCAD** is an experimental local-first single-plane (2.5D) CAD editor. Draw profiles in one fixed XY plane using millimetres, then add or remove exact solid material along Z. It is intended to become an engineering-grade alternative to freeform drawing tools for plates, brackets, panels and machined parts.

> **Status:** M0 proof-of-concept. Not qualified for fabrication, tolerance-critical work or production use.

## Quick start

Requires Node.js 22 or newer.

~~~sh
npm install
npm run dev
~~~

Open the localhost URL Vite prints. A 100 × 60 × 8 mm demo plate with two Ø10 through-holes is loaded initially. No backend or account is required. Initial WASM load can be slow. The application does not require an internet connection after dependencies and the build have been installed.

To build a static local bundle:

~~~sh
npm run typecheck
npm test
npm run build
npm run preview
~~~

Use the rectangle or circle tools to draw profiles, select a profile, and choose **Extrude/Add** or **Cut** with exact Z and depth inputs. Edit dimensions in the properties panel. Export a STEP file from a valid solid or download a native .flatcad.json project. The 3D panel is a tessellated visualization of the exact OpenCascade solid, not the authoritative geometry.

## What is implemented

- Fixed XY millimetre sketching plane with rectangle/circle tools, grid snapping, pan and zoom.
- Editable profile dimensions, selection, deletion, undo/redo and feature list.
- Sequential exact B-rep extrusion, addition and subtraction in an isolated Web Worker using replicad + OpenCascade.js.
- Three.js preview and STEP export, versioned JSON project save/open and local autosave.
- Deterministic model/validation tests and a CI build gate.

## Explicitly not yet implemented

Geometric constraints, arcs, general closed-profile detection, trim/offset, DXF, STEP round-trip validation, arbitrary face sketching, fillets, chamfers, feature reordering, robust picking of overlapping profiles, solver conflict reports, manufacturing qualification.

**Engineering caution:** The current tests are not evidence of complete B-rep correctness or reliable interchange. See [Acceptance](docs/ACCEPTANCE.md).

## Documents

- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Acceptance and qualification](docs/ACCEPTANCE.md)
- [Dependencies and licensing](docs/DEPENDENCIES.md)
- [Contributor/agent instructions](AGENTS.md)

## Licensing

The project's own license has **not yet been selected**; publication does not grant a license. Third-party dependencies have their own license obligations (including LGPL-2.1-only OpenCascade WASM); see the dependency record.
