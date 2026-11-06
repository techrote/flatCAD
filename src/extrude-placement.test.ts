import { describe, expect, it } from "vitest";
import { placeExtrudeMenu } from "./extrude-placement";

describe("major-grid offset and arrow clearance", () => {
  const standard = {
    viewport: { width: 1100, height: 650 },
    selection: { left: 250, right: 440, top: 210, bottom: 350 },
    popup: { width: 260, height: 270 },
    majorGridPixels: 100,
    arrow: { x: 360, y: 180 },
  };
  it("offsets right by exactly a major grid interval when unobstructed", () => {
    const pos = placeExtrudeMenu(standard);
    expect(pos.side).toBe("right");
    expect(pos.x).toBe(540);
  });
  it("moves to left when the right side is occluded by viewport edge", () => {
    const pos = placeExtrudeMenu({ ...standard,
      selection: { left: 650, right: 825, top: 210, bottom: 350 },
      arrow: { x: 755, y: 170 },
    });
    expect(pos.side).toBe("left");
    expect(pos.x).toBe(650 - 100 - 260);
  });
  it("uses configured major grid spacing rather than hardcoded pixels", () => {
    const pos = placeExtrudeMenu({ ...standard, majorGridPixels: 52 });
    expect(pos.x).toBe(492);
  });
  it("returns a finite location on an undersized canvas", () => {
    const pos = placeExtrudeMenu({
      ...standard, viewport: { width: 330, height: 340 },
      selection: { left: 110, top: 100, right: 220, bottom: 230 },
    });
    expect(Number.isFinite(pos.x + pos.y)).toBe(true);
    expect(pos.x).toBeGreaterThanOrEqual(10);
  });
});
