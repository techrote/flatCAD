# M0 executed evidence — 6 November 2026

This record is **partial qualification**, not full M0 closure.

## Source / runner

- Exact tested source SHA: 12fb091c2e107df6b7cfd4310a403f694008d04d
- PR: https://github.com/techrote/flatCAD/pull/1
- Workflow: https://github.com/techrote/flatCAD/actions/runs/42223576762
- GitHub-hosted Ubuntu 24.04, Node 22, Playwright 1.56.1, Chromium headless.
- Installed direct dependencies via npm install; no lockfile yet.

## Executed results

| Test | Result | Evidence |
|---|---|---|
| TypeScript strict check | PASS | CI quality job |
| Vitest model validation | PASS | CI quality job |
| Production Vite bundle of main and WASM worker | PASS | CI quality job |
| Real browser WebAssembly build of analytic demo | PASS | Playwright golden test |
| B-rep geometry volume comparison | PASS | Difference less than 0.0001 mm³ vs (6000 - 50π) × 8 |
| Bounding-box coordinates | PASS | [-50,-30,0] to [50,30,8] mm |
| STEP generation and ISO-10303-21 header | PASS | Playwright downloaded nonempty STEP |
| Browser create/drag rectangle then extrude | PASS | Second Playwright test |
| Native project download schema/profile/feature | PASS | Second Playwright test |

Browser output: **2 passed (7.8s)**. These tests exercised a localhost Vite **development server**, not yet a production-built browser deployment. A follow-up adds production-preview execution and a screenshot; record its exact head/run separately after execution.

## Incomplete / prohibited claims

- No independent STEP reader/process has reopened and verified output.
- No independent solid-count/topology validation, parametric variant corpus, resource stress or production offline reload.
- No Windows/Firefox/local-hardware, DPI, accessibility or human graphical inspection.
- No deterministic committed dependency lockfile and complete license notices.
- UI supports rectangles/circles, not constraints or arbitrary closed regions.

**Disposition: M0 remains OPEN / PR remains Draft.**
