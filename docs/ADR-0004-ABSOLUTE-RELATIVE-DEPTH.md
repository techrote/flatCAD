# ADR-0004 — Absolute and relative extrusion depth definitions

**Status:** Proposed design, research and numerical requirements. Not an implemented schema feature.  
**Context:** flatCAD is a single-XY-plane B-rep CAD editor whose version-2 Feature stores `z` (Start Z, millimetres) and signed `depth`. Upstream parametric edits must not unexpectedly change a feature's construction meaning.

## Distinguish three independent concepts

1. **Parameter entry:** The user may type signed **relative depth ΔZ**, or an **absolute End Z**. The immediate solid interval is mathematically identical:

   `End Z = Start Z + Depth`
   
   `Depth = End Z − Start Z`

   Example `Start Z = 8, Depth = -6` and `Start Z = 8, End Z = 2` both create the exact Z interval [2,8].

2. **Datum attachment:** The Start/End plane may be a fixed world Z or may follow a selected upstream feature face, with an optional signed offset. This is a dependency constraint, not the same as a text-entry unit or numeric absolute/relative input. Displaying `End Z = 2` does not automatically attach to a feature.
3. **Extent type:** A static distance, dynamic `through all`, and `to next/selected plane` are different semantic operations. Through-all must recalculate if the host part grows; capturing [−1,9] as an immutable cut depth is not equivalent. Existing through-all checkbox currently converts to a static overshoot interval; that is explicitly a limitation.

## Immediate UI implementation recommendation

Add an inline **Depth mode** segmented control beside the Extrude dialog's field:
- `Relative ΔZ` (default): label field **Depth**, show signed displacement in millimetres. Entering `−6` from Start Z 8 produces End Z 2.
- `Absolute End Z`: label field **End Z**, show literal model elevation in millimetres. Entering `2` from Start Z 8 produces signed Depth −6.
- A passive tooltip always shows the other representation, e.g. `End Z 2 mm / Depth −6 mm`; change of input mode does not alter the solid. When Start Z changes while editing, relative mode holds ΔZ constant and absolute mode holds End Z constant.
- Face-click latching in Relative mode sets `Depth = selected face elevation − Start Z`; in Absolute mode simply fills `End Z = selected face elevation`.
- Signed zero-depth must remain invalid. User should see a specific validation message rather than an accidental no-op.
- The on-canvas arrow controls final end elevation and updates whichever representation is active; arrow direction reflects signed Depth.

**Safest first implementation:** Keep native schema v2 unchanged, with signed `Feature.z` and `Feature.depth` as authoritative; store the UI display/input mode in validated user preferences only. On Apply, normalize any absolute End Z entry to signed ΔZ, then run the existing exact OCC B-rep. Save/open/STEP and old v1/v2 geometry stay unchanged. Do not repurpose the persisted `depth` field. UI mode is not a parametric dependency relation.

## Full parametric follow-up (schema proposal, do NOT adopt without solver/regression review)

Add separate, explicitly versioned feature definitions, e.g.:

```json
{
  "schemaVersion": 3,
  "features": [{
    "id": "pocket",
    "profileId": "hole",
    "operation": "cut",
    "start": { "type": "feature-plane", "featureId": "base", "side": "end", "offsetMm": 0 },
    "extent": { "type": "distance", "signedMm": -6 }
  }]
}
```

Other extent options: `{"type":"to-plane","target":...}` and `{"type":"through-all","marginMm":1}`. Feature-plane references are to *semantic start/end planes*, not unstable OpenCascade face indices. A change to an upstream feature's signed direction should preserve which semantic face is meant, with explicit UI diagnostics for broken references, cycles or deleted source features. Freeze resolved values and their source revision only as diagnostic evidence, never as authority. Migrate v2 `z/depth` to fixed Start Z + fixed signed distance without changing their numeric values.

## Required exactness regression matrix

| Initial state | User mode | Edit | Required resolved result |
|---|---|---|---|
| Start 8, Depth -6 | Relative | Change Start to 10 | End 4 (hold ΔZ -6) |
| Start 8, End 2 | Absolute | Change Start to 10 | Depth -8 (hold End 2) |
| Start 8, Depth +6 | Relative | Enter Depth -6 | End 2 |
| Start 8, End 2 | Absolute | Pick face Z=3 | End 3, Depth -5 |
| Start 8, Depth -6 | Either | Toggle mode twice | No numeric/model change |
| Start 8, End 8 | Either | Apply | Reject zero thickness |
| Upstream base 8 → 12 | Fixed Start 8 | Rebuild | Start remains 8 |
| Upstream base 8 → 12 | Attached start=end base | Rebuild | Start becomes 12 |
| Through-all host Z 0..8 → 0..12 | Through-all | Rebuild | Cut extends through full new host |
| v1/v2 saved positive feature | Load/migrate | Rebuild/export | Same B-rep bounds, volume and STEP topology |

## Decisions / tradeoffs

- **Recommended:** implement UI-only ΔZ/End Z selector before introducing attached datum references or dependent extent modes. This is useful immediately and has much lower regression risk.
- **Defer:** real face-attachment logic until stable semantic feature-plane references, dependency graph, error propagation and cycle detection exist. Do not base parametric identity on temporary raycast triangle IDs.
- **Defer:** true through-all semantics until dependent recomputation is qualified; meanwhile clearly label that the checkbox captures finite overshoot.
- **Observability:** record resolved Z endpoints and selected extent mode in feature diagnostic display; test undo/redo and JSON/STEP with exact values.
