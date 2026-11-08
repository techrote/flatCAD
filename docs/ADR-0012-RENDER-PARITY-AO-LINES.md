# ADR-0012 — Colour parity, measurable AO and simplified CAD lines

**Status:** Draft renderer qualification, based exactly on PR #24
`2e1035cb9beb6b947f09ed0bfd69cdd389f3cf4a`.
Previous PR #21–#24 accepted/qualified source remains immutable.

## Owner requirements

- Owner confirms switching MSAA back to **Browser Default** restores the original
  image. This is not evidence of broken state restoration; the open defect is
  a visible **direct renderer vs offscreen composer output mismatch** when
  explicit MSAA or AO are selected.
- Make matching model lighting, background and transparency with identical
  scene/camera when comparing direct vs composer. Do not pretend different
  sample counts will be pixel identical at edges.
- AO must remain off by default. Prove that enabling it changes occlusion
  around rendered object geometry with the *same* offscreen MSAA sample count,
  not merely that it changes colour/AA or requires a different pipeline.
- Screen-space CAD lines **on, 1 CSS px, pure black and fully opaque** are the
  new fresh-user default. Replace Presentation dropdown with a single
  **Lines** checkbox and keep one direct width control. Other preferences,
  including the earlier Clean CAD preset, remain reversible and editable.

## Root-cause investigation

Three.js r180 `SSAOPass` uses `SSAOShader` to compare normalized orthographic
depth differences, rejecting any sample with
`delta <= minDistance || delta >= maxDistance`. The old
`minDistance=.005` and a `near=.1, far=100000` camera correspond to a
minimum gap of approximately **500 world millimetres**. That excludes the
entire 100×60×8mm sample model. The new display-only helper converts a
world-mm-scaled occlusion threshold to the normalized range, based on the
camera clipping span and selected AO kernel radius. Invalid nonfinite
inputs fail validation. Exact B-rep geometry, input units and saved model
are unchanged.

## Line migration and interaction

Old `flatcad.render.v1` preferences carried `edgeMode =
native | screen | hidden`. New `linesEnabled` is preferred when present;
legacy `hidden` maps to false and other values to true. Legacy custom width,
opacity, colour and lighting values are preserved. Fresh defaults are
1 CSS px black `LineSegments2`, opacity 1, visible. The original
0.5px/50% Clean CAD preset remains opt-in. New UI has a single Lines
checkbox plus independent width, colour and opacity controls. Changing
visibility destroys/creates only derivative Three.js edge geometry;
nothing is stored in native CAD data.

## Parity evidence

Automated Chromium screenshots compare:
- direct canvas at Browser Default with AO off,
- the same camera/settings via explicit offscreen 0- and 4-sample MSAA,
- AO on/off holding offscreen MSAA fixed at four samples,
- return to the original Browser Default path.

Report background pixel RGBA, average background/surface differences and
the percentage of model pixels changing by more than five colour values.
Do not infer visible AO solely from a changed background. Record the exact
source tree and screen captures. The clean parity target is matching
background transparency, model surface lighting and output colour within
small tolerances, allowing edge AA differences.

## Release barriers

No merge until TypeScript/Vitest, production WASM/Playwright, cross-browser
Windows Chromium/Firefox and Linux Firefox and independent owner physical GPU
comparison are green. Physical owner checks focus on flat-face colour,
transparent floating backgrounds, AO around holes and recesses, line width,
antialiasing sample parity, 1–3 cameras and GPU load.
