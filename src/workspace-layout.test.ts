import {describe,it,expect} from "vitest";
import {clampSplit,DEFAULT_LAYOUT,validateLayout} from "./workspace-layout";
describe("persistable workspace panel layout",()=>{
  it("starts with a canvas-first split and floating rail",()=>{
    expect(DEFAULT_LAYOUT.main).toBeGreaterThan(.5);
    expect(DEFAULT_LAYOUT.docked).toBe(false);
    expect(validateLayout({...DEFAULT_LAYOUT})).toEqual(DEFAULT_LAYOUT);
  });
  it("clamps at valid panel minimum sizes for desktop",()=>{
    expect(clampSplit(.01,1200,300,300)).toBeGreaterThan(.20);
    expect(clampSplit(.99,1200,300,300)).toBeLessThan(.80);
    expect(clampSplit(.63,1200,300,300)).toBeCloseTo(.63,8);
  });
  it("uses vertical limits for split Solid and inspector",()=>{
    expect(clampSplit(.01,600,155,115)).toBeGreaterThan(.2);
    expect(clampSplit(.99,600,155,115)).toBeLessThan(.85);
  });
  it("rejects malformed and impossible saved layouts",()=>{
    expect(()=>validateLayout({version:2,main:.5,solid:.5,docked:false})).toThrow();
    expect(()=>validateLayout({version:1,main:NaN,solid:.5,docked:false})).toThrow();
    expect(()=>validateLayout({version:1,main:.5,solid:1.5,docked:false})).toThrow();
  });
});
