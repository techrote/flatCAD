# ADR-0008 — Fixed-XY inclined and axially twisted Z features

**Status:** Experimental implementation candidate in Draft PR #19. Do not claim engineering acceptance from source inspection or static build success.

## Scope

flatCAD remains permanently **2.5D**. Every source sketch stays in the same fixed XY plane. Optional feature parameters alter how that planar profile progresses as Z changes. They do not introduce arbitrary sketching planes or unrestricted 3D authoring.

- **Incline X/Y (degrees)**: a linear oblique prism. Its cross-section translates laterally by `ΔX = signedDepth × tan(inclineX)` and `ΔY = signedDepth × tan(inclineY)` from the *authored Start Z*. Cross-sections remain parallel to XY, not tilted end caps. Kernel extrusion direction and distance are normalized to preserve the original exact Z range (and associated native dimension semantics).
- **Axial twist (degrees)**: section rotates around its authored profile centre as Z progresses from Start Z to End Z. This is a continuous B-rep sweep, not merely rotating the end face or a triangle approximation. Negative depth requires reversing the sweep and starting with the final rotated section at the lower Z.
- Both Add and Cut can use either operation, and all history, live previews, and export replay through the authoritative OpenCascade worker.

## Data and compatibility

Optional v2 Feature fields `tiltX`, `tiltY`, and `twist` default to zero. Legacy features preserve their original numeric schema and geometries. All three support named-parameter expressions using the existing optional binding metadata. Values must be finite; tilt angles are bounded at ±65 degrees and twist at ±720 degrees. **Combined nonzero incline and twist is rejected** until separately demonstrated sound: mixed screw/directional sweeps are not implicitly approximated.

The extrusion flyout's **Angle / axial twist** controls start collapsed. Feature-history controls offer the same optional fields. Zero-angle features retain the established simple extrusion path. For negative signed depths, the worker normalizes construction lower→upper while preserving direction and twist relative to the authored high Start Z.

## Qualification

Real WASM tests must cover exact volume and XY/Z bounds of a known inclined rectangle, signed negative-direction cutting tool, an axially twisted rectangle, native JSON/undo/reopen, actual boolean Add/Cut, and STEP exports. Independently import STEP in another kernel/process and compare topology, volume and bounds before production/manufacturing claims. Profile self-intersection at large twists or combined topology failures must produce an explicit error without blanking the last valid solid.

**Design warning:** "Angled extrusion" here is a sheared sweep whose sections remain XY-parallel; traditional draft/taper is a different operation and is not implicitly implemented.
