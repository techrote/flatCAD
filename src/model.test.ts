import { describe, expect, it } from "vitest";
import {
  DEMO, appendFeature, deleteProfile, updateProfile, validateDocument,
} from "./model";

const copy = () => JSON.parse(JSON.stringify(DEMO));

describe("schema v1 validation", () => {
  it("accepts and preserves a demo solid description", () => {
    const doc = validateDocument(copy());
    expect(doc.profiles).toHaveLength(3);
    expect(doc.features.map(f => f.operation)).toEqual(["add", "cut", "cut"]);
    expect(doc.units).toBe("mm");
  });
  it.each([
    ["wrong version", (x: any) => x.schemaVersion = 2],
    ["wrong units", (x: any) => x.units = "inch"],
    ["non-finite width", (x: any) => x.profiles[0].width = Infinity],
    ["zero width", (x: any) => x.profiles[0].width = 0],
    ["NaN origin", (x: any) => x.profiles[0].x = NaN],
    ["duplicate IDs", (x: any) => x.profiles[1].id = "plate"],
    ["missing referenced profile", (x: any) => x.features[1].profileId = "missing"],
    ["cut-first history", (x: any) => x.features[0].operation = "cut"],
    ["negative depth", (x: any) => x.features[0].depth = -8],
    ["unsupported profile", (x: any) => x.profiles[0].kind = "polygon"],
  ])("rejects %s", (_name, mutate) => {
    const doc = copy();
    mutate(doc);
    expect(() => validateDocument(doc)).toThrow("Invalid flatCAD document");
  });
  it("updating profile retains feature IDs and dimension precision", () => {
    const doc = updateProfile(DEMO, { ...DEMO.profiles[0], width: 101.125 } as typeof DEMO.profiles[0]);
    expect(doc.features).toEqual(DEMO.features);
    expect((doc.profiles[0] as any).width).toBe(101.125);
    expect((DEMO.profiles[0] as any).width).toBe(100);
  });
  it("deleting a profile explicitly removes its dependent features", () => {
    const doc = deleteProfile(DEMO, "hole_l");
    expect(doc.profiles).toHaveLength(2);
    expect(doc.features.map(f => f.id)).toEqual(["base", "cut_r"]);
  });
  it("never admits cut-only history", () => {
    const doc = validateDocument({
      ...DEMO, features: []
    });
    expect(() => appendFeature(doc, {
      id: "cut", profileId: "hole_l", operation: "cut", z: 0, depth: 10
    })).toThrow("first feature");
  });
});
