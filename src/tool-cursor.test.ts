import {describe,it,expect} from "vitest";
import {SKETCH_TOOL_GLYPHS,toolBadgePosition} from "./tool-cursor";
describe("Sketch tool glyph position",()=>{
  it("matches all authoring rail icons without obscuring select/pan",()=>{
    expect(SKETCH_TOOL_GLYPHS).toMatchObject({
      select:null,line:"╱",rectangle:"▭",centerRectangle:"▣",
      circle:"◯",polygon:"⬡",slot:"⬭",pan:null,extrude:"↥"
    });
  });
  it("places cue below-left while keeping a clear crosshair hotspot",()=>{
    const at=toolBadgePosition({x:200,y:100},{width:500,height:300});
    expect(at).toEqual({x:165,y:111});
    expect(at.x+24).toBeLessThan(200);
    expect(at.y).toBeGreaterThan(100);
  });
  it("flips away from sketch edges and remains inside",()=>{
    for(const p of [{x:2,y:2},{x:490,y:290},{x:120,y:299},{x:0,y:140}]){
      const at=toolBadgePosition(p,{width:500,height:300});
      expect(at.x).toBeGreaterThanOrEqual(3);
      expect(at.y).toBeGreaterThanOrEqual(3);
      expect(at.x+24).toBeLessThanOrEqual(497);
      expect(at.y+24).toBeLessThanOrEqual(297);
    }
  });
});
