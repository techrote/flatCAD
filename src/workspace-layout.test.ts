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

describe("rearrangeable UI tiles and legacy layout migration",()=>{
  it("migrates old split-only persisted values without changing native geometry",()=>{
    const legacy={version:1,main:.6,solid:.52,docked:false};
    const out=validateLayout(legacy);
    expect(out.tileMode).toBe("split");
    expect(out.tileOrder).toEqual(["sketch","properties","solid"]);
    expect(out.dockX).toBe(.5);
  });
  it("accepts center Properties panel and alternative tile orders",()=>{
    const out=validateLayout({...DEFAULT_LAYOUT,tileMode:"columns",
      tileOrder:["solid","properties","sketch"],dockX:.85});
    expect(out.tileMode).toBe("columns");
    expect(out.tileOrder[1]).toBe("properties");
  });
  it("refuses duplicate tiles and invalid anchor position",()=>{
    expect(()=>validateLayout({...DEFAULT_LAYOUT,
      tileOrder:["sketch","sketch","solid"]})).toThrow("arrangement");
    expect(()=>validateLayout({...DEFAULT_LAYOUT,dockX:2})).toThrow("arrangement");
  });
});

describe("floating CAD view settings",()=>{
  it("migrates legacy workspace positions to nonintrusive float defaults",()=>{
    const legacy={version:1,main:.56,solid:.54,docked:false};
    const result=validateLayout(legacy);
    expect(result.floatX).toBeGreaterThanOrEqual(0);
    expect(result.floatY).toBeGreaterThanOrEqual(0);
    expect(result.tileMode).toBe("split");
    expect(result.floatW).toBe(380);
    expect(result.floatH).toBe(340);
  });
  it("persists an in-bounds floating mode without changing CAD geometry",()=>{
    expect(validateLayout({...DEFAULT_LAYOUT,tileMode:"float",floatX:0,floatY:1}).tileMode)
      .toBe("float");
    expect(()=>validateLayout({...DEFAULT_LAYOUT,floatX:-.1})).toThrow();
    expect(()=>validateLayout({...DEFAULT_LAYOUT,tileMode:"nonsense"})).toThrow();
    expect(validateLayout({...DEFAULT_LAYOUT,floatW:460,floatH:290}).floatW).toBe(460);
    expect(()=>validateLayout({...DEFAULT_LAYOUT,floatW:Infinity})).toThrow();
    expect(()=>validateLayout({...DEFAULT_LAYOUT,floatH:80})).toThrow();
  });
});
