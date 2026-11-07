# ADR-0007 — Named parametric values without mandatory constraints

**Status:** Experimental in Draft PR #16, pending CI, independent STEP readback, and owner acceptance. This is not a declaration of production-grade parametric CAD.

## Intent

flatCAD remains permanently 2.5D and drawing-first. Users never have to name a dimension, enter a number, or invoke a solver to make a shape. An advanced user can optionally bind any supported numeric sketch field or feature Z/depth to an algebraic expression, composed from reusable named parameters. A named parameter can itself depend on other named parameters. The parameter manager is accessible from Model → Named parameters or the collapsed Parameters inspector tile; it never opens automatically.

## Data

Version-2 native documents may include optional metadata:

```json
{
  "parameters": [
    {"name": "plateWidth", "expression": "120"},
    {"name": "holePitch", "expression": "plateWidth / 2"},
    {"name": "thickness", "expression": "6 + 2"}
  ],
  "bindings": [
    {"target": "profile:plate:width", "expression": "plateWidth"},
    {"target": "feature:base:depth", "expression": "thickness"}
  ]
}
```

Persisted numeric geometry fields remain finite physical millimetres and are **materialized from formulas** when bound. They remain the only scalars passed into the exact OpenCascade builder. Expressions never flow to the WebGL renderer or STEP exporter as substituted text. On open/edit, every derived dimension undergoes the same strict v2 geometric validation. A malformed formula, undefined name, cycle, division by zero, zero depth, or resulting invalid geometry fails closed without saving the proposed edit.

### Expression scope

Literal decimals and exponents; user-named values; `pi` and `e`; `+ - * / ^`, parentheses, and unary signs are supported. Powers are right-associative. No JavaScript evaluation, function calls, network sources, string concatenation, units parser or arbitrary code execution. Named values are evaluated as a dependency graph, with deterministic cycle rejection. Names are case-sensitive and must be simple identifiers. Current formulas are scalar mm quantities; angular/percentage and explicit dimensional unit algebra are future extensions, not implied.

The parameter manager allows renaming a parameter while updating all expressions and field bindings that reference it. Deleting a referenced parameter is rejected until dependent bindings or definitions are updated, rather than silently destroying relationships.

### Override semantics

A direct numerical edit of a bound field replaces that field's link with the explicitly entered literal. The original expression remains recoverable with undo. Unrelated bindings are unchanged. A shared named parameter edit regenerates all its dependents, including history snapshots, using exact geometry. The native undo/redo stack snapshots complete formula metadata alongside geometry.

### Compatibility and caveats

- Existing native v1 and v2 files without formulas continue to load as before; v1 projects cannot carry new formula metadata.
- The optional metadata is currently a v2 backwards-compatible extension; older flatCAD readers may not preserve the new expression links. Use the updated editor for round-trip authoring.
- References target persistent sketch-profile IDs and feature IDs, never unstable OCC face IDs.
- A formula can produce an invalid model (for example, a negative radius); the attempted change is rejected rather than rounded or silently healed.
- Expression dependencies are **not a geometric constraint solver**. There is no cycle between sketch solution and formulas, no sketch tangent/parallel solver, and no non-XY workplanes.
- Manufacturing integrity and independent STEP readback are separate acceptance requirements.

## Acceptance

Unit tests: chained dependencies, operator precedence, round-trip metadata, strict numeric geometry, cycles, invalid/injected tokens, missing binding references.

Browser tests: define and rename a parameter, bind an authored value, change a parameter, confirm exact B-rep volume changes and persists in native JSON, undo, reopen, and export STEP. Verify no unsolicited UI. Manual Windows/Firefox and third-party STEP interrogation remain owner/independent gates.
