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


## Verified source-tree measurements — 8 November 2026

At the initial diagnostic checkpoint (before the compositor clear repair),
the same 684×323px Chromium capture showed:
- Direct Browser Default background RGBA: **[11,18,32,255]**
- Offscreen explicit 0/4 MSAA background RGBA: **[59,75,99,255]**
- Full-image direct vs 4 MSAA mean absolute RGB difference: **46.0/255**
- Offscreen AO off vs on at fixed 4 MSAA: **0.0 RGB difference across every pixel**
- Return to Browser Default: pixel-identical direct screenshot.

This proves **no effective AO signal** on the exact demo geometry; a
corrected `minDistance` alone does not establish a functioning SSAO
implementation. Accordingly AO is now relegated to an **experimental
diagnostics drawer collapsed by default**, not shown as a normal display
quality feature. The normal render pipeline leaves AO off.

Three.js r180 `RenderPass` sets its clear colour **before** binding the
offscreen target. As a result, the clear colour is interpreted in the
default target's sRGB space before the offscreen `OutputPass` encodes it
again. The first correction prelinearizes only the offscreen clear
colour and mirrors alpha state for transparent floating windows;
no mesh surface shaders are rewritten.

After the targeted correction, the same Chromium screenshot test
reported:
- Direct background: **[11,18,32,255]**
- Offscreen 4 MSAA background: **[11,18,32,255]**
- Full-image mean RGB difference: **0.533/255**, dominated by expected
  changes in antialiasing edge coverage.
- Background mean RGB difference: **0.406/255** (nearby edge fringes).
- Offscreen AO on/off remained **pixel-identical**.
- Returning to Browser Default remained pixel-identical.

The qualification test now enforces mean image difference under 2/255
and background difference under 1.5/255 on its fixed Chromium viewport.
It also records floating-view opacity parity separately. This is strong
colour-parity evidence for the tested environment, not yet a substitute
for Firefox/NVIDIA hardware acceptance.

### Follow-up for AO (not in product defaults)

A future physically meaningful AO shader can be designed around a
bounded orthographic clipping interval and per-object depth masks,
then validated against known cavities. Its value should be established
through *measured local darkening of rendered faces*, not by merely
changing composer state. Keep the experimental toggle hidden until
such evidence exists. Do not silently enable more expensive passes.
