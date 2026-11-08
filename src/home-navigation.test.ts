import {describe,it,expect} from "vitest";
import {nextHomeSide} from "./home-navigation";
describe("context-aware combined camera Home",()=>{
  it("returns the hemisphere Home when off the canonical pose",()=>{
    expect(nextHomeSide({x:300,y:0,z:100})).toBe("standard");
    expect(nextHomeSide({x:-300,y:0,z:-100})).toBe("underground");
  });
  it("toggles only at actual Home and tolerates tiny orbit drift",()=>{
    expect(nextHomeSide({x:130,y:-125,z:115})).toBe("underground");
    expect(nextHomeSide({x:130,y:-125,z:-115})).toBe("standard");
    expect(nextHomeSide({x:130.01,y:-125.01,z:115})).toBe("underground");
  });
  it("does not require persisted last-click state",()=>{
    expect(nextHomeSide({x:260,y:-250,z:230})).toBe("underground");
    expect(nextHomeSide({x:0,y:0,z:0})).toBe("standard");
    expect(nextHomeSide({x:Infinity,y:0,z:1})).toBe("standard");
  });
});
