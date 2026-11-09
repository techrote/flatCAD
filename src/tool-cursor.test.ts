import {describe,it,expect} from "vitest";
import {SKETCH_TOOL_GLYPHS,toolBadgePosition,cursorOrbitPush,
  cursorOrbitSettle,INITIAL_ORBIT,CURSOR_RADIUS} from "./tool-cursor";
describe("Sketch cursor orbital glyph",()=>{
  it("matches tool pictograms while preserving native select/pan",()=>{
    expect(SKETCH_TOOL_GLYPHS).toMatchObject({
      select:null,line:"╱",rectangle:"▭",centerRectangle:"▣",
      circle:"◯",polygon:"⬡",slot:"⬭",pan:null,extrude:"↥"
    });
  });
  it("starts right of the crosshair at a fixed radial distance",()=>{
    const pt={x:200,y:100};
    const at=toolBadgePosition(pt,{width:500,height:300});
    expect(at.x).toBeGreaterThan(pt.x+12);
    expect(at.y).toBeGreaterThan(pt.y);
    const distance=Math.hypot(at.x+12-pt.x,at.y+12-pt.y);
    expect(distance).toBeCloseTo(CURSOR_RADIUS,0);
  });
  it("gets pushed sideways when cursor approaches the current glyph",()=>{
    const before=INITIAL_ORBIT;
    const toward={x:Math.cos(before.angle)*20,y:Math.sin(before.angle)*20};
    const moved=cursorOrbitPush(before,toward);
    expect(moved.angle).toBeGreaterThan(before.angle+.05);
    expect(Math.abs(moved.velocity)).toBeLessThan(.36);
    const away=cursorOrbitPush(before,{x:-toward.x,y:-toward.y});
    expect(Math.abs(away.angle-before.angle)).toBeLessThan(.01);
  });
  it("keeps angular momentum bounded and settles without a perpetual animation",()=>{
    let state=INITIAL_ORBIT;
    for(let i=0;i<100;i++){
      state=cursorOrbitPush(state,{x:40,y:25});
      expect(Math.abs(state.velocity)).toBeLessThanOrEqual(.35);
    }
    for(let i=0;i<100;i++)state=cursorOrbitSettle(state);
    expect(state.velocity).toBe(0);
    expect(Number.isFinite(state.angle)).toBe(true);
  });
  it("flips via clipping near edges and stays inside",()=>{
    for(const pt of [{x:1,y:2},{x:490,y:291},{x:122,y:299},{x:0,y:140}]){
      const at=toolBadgePosition(pt,{width:500,height:300},.55);
      expect(at.x).toBeGreaterThanOrEqual(3);
      expect(at.y).toBeGreaterThanOrEqual(3);
      expect(at.x+24).toBeLessThanOrEqual(497);
      expect(at.y+24).toBeLessThanOrEqual(297);
    }
  });
});
