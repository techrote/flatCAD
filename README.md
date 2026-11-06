# flatCAD

**flatCAD** is a local-first, single-plane (2.5D) parametric CAD application.

Sketch in the fixed XY plane with real dimensions, then add or remove material by extruding profiles along Z. The aim is the speed of a lightweight drawing board with the geometry integrity of an engineering CAD tool.

> **Development status:** early prototype. Do not rely on it for manufacturing until its geometric operations, STEP interchange and regression tests are qualified.

## Scope

- Fixed XY sketch plane and millimetre-based model coordinates.
- Constrained 2D geometry (planned), region selection and non-destructive feature history.
- Exact B-rep extrude, add and subtract operations; 3D preview.
- Editable local project files, offline operation and STEP interoperability.

## Getting started

Implementation and architecture documentation are being developed on a feature branch. See the open pull requests for the first executable prototype.

## Development policy

Engineering claims must be backed by tests. A successful visual preview alone does not establish a valid solid or an interoperable STEP file. See `docs/` as implementation proceeds.

## License

Project licensing is pending an explicit decision. Dependencies have independent licenses; see the dependency/license documentation in the implementation branch. No license is granted for this repository merely by publication.
