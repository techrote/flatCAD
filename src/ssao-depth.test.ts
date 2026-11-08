import {describe,it,expect} from "vitest";
import {normalizedAoDepthThresholds} from "./ssao-depth";
describe("orthographic SSAO world-mm to depth-range conversion",()=>{
  it("replaces 500mm raw minimum with <0.1mm at 8mm radius",()=>{
    const x=normalizedAoDepthThresholds(.1,100000,8);
    expect(x.minDistance).toBeGreaterThan(0);
    expect(x.minDistance).toBeLessThan(.000001);
    expect(x.maxDistance).toBeGreaterThan(.0001);
    expect(x.maxDistance).toBeLessThan(.0002);
    expect(x.minDistance*99999.9).toBeCloseTo(.08,3);
    expect(x.maxDistance*99999.9).toBeCloseTo(16,3);
  });
  it("remains finite and proportional for tighter camera clipping",()=>{
    const x=normalizedAoDepthThresholds(.1,500,4);
    expect(x.minDistance).toBeGreaterThan(0);
    expect(x.maxDistance).toBeGreaterThan(x.minDistance);
    expect(x.maxDistance).toBeLessThan(.1);
  });
  it.each([[0,0,8],[.1,0,8],[.1,500,-1],[.1,500,25],[NaN,500,8]])(
    "rejects bad camera range and AO radius %j %j %j",(a,b,c)=>{
      expect(()=>normalizedAoDepthThresholds(a,b,c)).toThrow();
    });
});
