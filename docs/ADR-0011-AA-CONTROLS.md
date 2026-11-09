# ADR-0011 — Independent MSAA and high-resolution SSAA controls

**Status:** Experimental, Draft PR stacked after #23. No changes to the
physically accepted #21 or qualified #22 and #23 baselines.

## Diagnosis

The original WebGLRenderer uses `antialias: true` for the browser's default
canvas MSAA. When AO is enabled the presentation path switches to
`EffectComposer` with offscreen render targets, which previously had
zero samples. Hence AA behavior differed across AO states. AO Off never
disabled native canvas MSAA; AO On was unable to reuse that canvas AA.

## Implementation contract

- `msaaSamples = "browser"` preserves the accepted direct WebGL render
  path when AO is off. With AO on, this uses the existing offscreen composer
  with zero multisample samples, and the UI explicitly reports that distinction.
- Explicit MSAA `0 | 2 | 4 | 8` uses a
  `WebGLRenderTarget({samples})` input to `EffectComposer`, followed by
  `RenderPass`, optionally `SSAOPass`, and `OutputPass`. This permits MSAA
  both with and without SSAO. Samples are limited by device
  `WebGLRenderer.capabilities.maxSamples` and by a maximum of **64M
  multisample pixel-samples per active viewport**. Display the **effective**
  count; never label a clamped value as the user's requested count. Composer
  is disposed on switching back to the native direct path.
- Supersampling is **linear backing resolution**, not MSAA. New options
  are 4× and 8×. The default per-view budget remains **8M framebuffer
  pixels** and a 4096px maximum dimension. Explicit high-budget options
  16M, 32M and 64M raise the maximum dimension to 8192px, constrained
  by GPU texture-size capability. The effective linear ratio can still be
  lower than requested; display it and actual canvas backing dimensions.
- The two controls multiply costs. For an 800×600 CSS viewport, 8×
  SSAA generates about 30.7M pixels before DPR, while MSAA 8 potentially
  multiplies the sample attachment costs again. The 64M sample-pixel ceiling
  limits the combination, but multiple floating cameras can still consume
  substantial memory. Experimental hardware acceptance is mandatory.
- Avoid regenerating GPU buffers on each movement of unrelated render
  sliders; only MSAA pipeline, render ratio and viewport size change
  framebuffer allocations. Demand-driven idle rendering is retained.
- Browser compositor smoothing remains the default downsampler. A second
  diagnostic nearest/pixelated mode sets the canvas CSS `image-rendering`
  property. This is **not** a custom selectable sinc/Lanczos/box filter.
  Any custom filter requires a new shader-backed resolve/downsample pass
  and controlled tests for colour space, gamma, edge contrast, transparency,
  compositing and memory bandwidth.

## Saved preference and preset migration

Settings remain version 1 and separately persisted under
`flatcad.render.v1`. Legacy preferences omit three new fields
(`msaaSamples`, `renderPixelBudget`, `downsampleMode`) and migrate
to Browser MSAA, 8M pixels and original browser smoothing. Original
render lighting/edge defaults are **unchanged**.

The optional **Clean CAD** preset is the owner's visual preference:
screen-width edges 0.5 CSS px and 50% opacity, ambient 0.75, directional
key 5, AO off, SSAA 1×. It may be reset; it is not the general default.
No native CAD geometry, feature history, STEP, model validation or physics
is touched.

## Qualification and release limitations

Automated tests must prove schema migrations, requested/effective ratios,
8× on a small bounded viewport, MSAA state independent of AO, sample and
pixel clamps, downsampling CSS, preset persistence, no changed volume and
clean WebGL context behavior on Chromium and Firefox. Physical GPU testing
must separately qualify sample count/quality, 4×/8× appearance,
VRAM use on 24GB and 4GB GPUs, interactive drag/pan frametimes, colour
continuity and GPU resource cleanup with multiple simultaneous cameras.
No performance, fabrication or general release claim follows from CI.
