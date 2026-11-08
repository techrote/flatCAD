# ADR-0010 — Display-edge and render diagnostics (experimental)

**Scope:** Additional render-only controls stacked after the physically accepted #21 and the qualified #22 UI follow-up. This is a diagnostic instrument, not an engineering-geometry change or an automatic release qualification.

## Screenshot evidence and hypothesis

The owner supplied six otherwise matched Windows/Firefox comparison captures at AO off/on and supersampling native/1.5×/2×. In a fixed Solid crop, dark edge/detail coverage decreases sharply with higher render resolution while the flat-blue face colour remains substantially constant. Enabling the existing SSAO pass changes broad surface brightness only slightly. These observations motivate isolating the raster-edge width from the render-resolution factor before claiming one antialiasing option is superior.

The old `WebGLRenderer({antialias:true})` already requested native MSAA at 1×. Calling 1× "AA off" would misstate the current behavior. The alternative AO EffectComposer render path may have different sample and output-colour behavior and must be qualified separately.

## Real diagnostic controls

- **Native / screen-width / hidden edges.** Native uses the previous `THREE.LineSegments` and `LineBasicMaterial` drawing mode. WebGL lines normally occupy one backing pixel regardless of nominal `linewidth`. Optional screen-width uses `LineSegments2`, `LineSegmentsGeometry` and `LineMaterial` from the already installed Three.js package. Its width is measured in CSS pixels and should not collapse at higher backing resolution. Edge colour and opacity apply in both non-hidden modes.
- **Requested supersampling:** native, 1.25×, 1.5×, 1.75×, 2×, 2.5× and 3×. The existing ceiling of 3× device DPR, 4096 backing pixels per dimension and eight million backing pixels per viewport is unchanged. Show the actual primary viewport CSS/backing size and effective pixel ratio. Higher requested settings can be clipped by the budget.
- **Downsampling:** no adjustable filter exists in the current pipeline. WebGL draws at higher backing resolution; the browser compositor scales the canvas to CSS layout. The panel reports that limitation rather than introducing a placebo filter. An actual custom downsample shader/filter would be separate experimental source with colour-space and GPU-budget qualification.
- **Lighting:** adjust the existing ambient light (default 2) and key directional light (default 3). The blue fill light remains at 1; these controls mutate only Three.js scene lights and do not introduce shadow maps.
- **AO sample radius:** adjust the existing `SSAOPass.kernelRadius` (default 8) only when AO is enabled. The existing `minDistance`, `maxDistance`, sample structure and OutputPass remain unchanged.
- **No scene dimming:** Render inspector is nonmodal and appears at the screen edge for live A/B comparisons. This is a different UI contract from other modal preference dialogs.

## Persistence and authority

All settings remain `flatcad.render.v1` presentation preferences. The validator accepts original v1 settings that supplied only AO and supersampling, filling the additional diagnostics with exact baseline defaults. Inputs fail closed on invalid ranges/types. They never modify `.flatcad.json`, sketch/profile IDs, B-rep, STEP export, kernel-worker input, or feature-history geometry.

The existing native-line look and light intensities remain the default. Every floating camera receives the same options, but its camera is independent. Slider colour/width/opacity updates reuse GPU materials when the edge mode is unchanged; switching Native/Screen/Hidden creates or disposes presentation-only line geometry.

## Exit criteria

TypeScript, unit validation/migration, production WASM build, full Chromium browser tests and cross-browser graphical matrix must pass at the **actual PR tree**. Browser tests verify nonmodal inspector, independent line modes including a visible drawing difference, lighting, AO radius, saved preferences and unchanged exact CAD volume. Owner hardware recheck must inspect edge thickness invariance across render scales, occluded lines, 2–3 floating cameras, AO quality, resize, FPS and GPU load. No performance or manufacturing-grade claim is made from software-rendered CI.
