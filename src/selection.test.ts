import { describe, expect, it } from "vitest";
import { DEMO } from "./model";
import { documentWithExtrusions, documentWithMovedProfiles, nextSelection, suggestGroupOperation } from "./selection";

describe("additive selection and atomic group actions", () => {
  it("Ctrl-click adds, toggles and Ctrl-click-empty keeps the selection", () => {
    expect(nextSelection([], "a", true)).toEqual(["a"]);
    expect(nextSelection(["a"], "b", true)).toEqual(["a", "b"]);
    expect(nextSelection(["a", "b"], "a", true)).toEqual(["b"]);
    expect(nextSelection(["a", "b"], null, true)).toEqual(["a", "b"]);
    expect(nextSelection(["a", "b"], null, false)).toEqual([]);
    expect(nextSelection(["a", "b"], "b", false)).toEqual(["a", "b"]);
    expect(nextSelection(["a", "b"], "c", false)).toEqual(["c"]);
  });
  it("builds two cuts as one undoable validated document without mutating input", () => {
    expect(suggestGroupOperation(DEMO, ["hole_l", "hole_r"])).toBe("cut");
    const next = documentWithExtrusions(DEMO, ["hole_l", "hole_r"], "cut", -1, 10);
    expect(next.features).toHaveLength(DEMO.features.length + 2);
    expect(next.features.slice(-2).map(f => f.profileId)).toEqual(["hole_l", "hole_r"]);
    expect(DEMO.features).toHaveLength(3);
    expect(() => documentWithExtrusions(DEMO, ["missing"], "add", 0, 1)).toThrow();
  });
  it("rejects open paths and all-cut-first histories", () => {
    const empty = { ...DEMO, features: [] };
    expect(() => documentWithExtrusions(empty, ["plate"], "cut", 0, 8)).toThrow();
    const open = { ...DEMO, profiles: [...DEMO.profiles, {
      id: "line", kind: "path" as const, closed: false, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    }] };
    expect(() => documentWithExtrusions(open, ["line"], "add", 0, 8)).toThrow("Open paths");
  });
  it("applies group translation in a single immutable update", () => {
    const [plate, left] = DEMO.profiles;
    const next = documentWithMovedProfiles(DEMO, [
      { ...plate, x: -45 } as typeof plate, { ...left, x: -30 } as typeof left,
    ]);
    expect((next.profiles[0] as { x: number }).x).toBe(-45);
    expect((DEMO.profiles[0] as { x: number }).x).toBe(-50);
    expect(next.features).toEqual(DEMO.features);
  });
});
