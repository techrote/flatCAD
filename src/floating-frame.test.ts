import {describe,it,expect} from "vitest";
import {moveResizeFloatRect,positionedFloatRect,normalizedFloatRect} from "./floating-frame";
const view={width:1440,height:900};
const start={left:300,top:160,width:380,height:340};
describe("shared floating CAD window geometry",()=>{
  it("moves the frame, leaving the camera viewport dimensions unchanged",()=>{
    expect(moveResizeFloatRect(start,"move",65,40,view))
      .toEqual({...start,left:365,top:200});
  });
  it("resizes southeast with opposite corner fixed",()=>{
    expect(moveResizeFloatRect(start,"se",70,45,view))
      .toEqual({...start,width:450,height:385});
  });
  it("resizes northwest with the right/bottom fixed",()=>{
    expect(moveResizeFloatRect(start,"nw",-50,-30,view))
      .toEqual({left:250,top:130,width:430,height:370});
  });
  it("clamps every resize corner and movement to viewport boundaries",()=>{
    for(const corner of ["nw","ne","sw","se"] as const){
      for(const delta of [-2000,2000]){
        const r=moveResizeFloatRect(start,corner,delta,delta,view);
        expect(r.left).toBeGreaterThanOrEqual(0);
        expect(r.top).toBeGreaterThanOrEqual(0);
        expect(r.width).toBeGreaterThanOrEqual(220);
        expect(r.height).toBeGreaterThanOrEqual(180);
        expect(r.left+r.width).toBeLessThanOrEqual(view.width);
        expect(r.top+r.height).toBeLessThanOrEqual(view.height);
      }
    }
    expect(moveResizeFloatRect(start,"move",-900,-900,view).left).toBe(0);
  });
  it("roundtrips positions and dimensions after persistence",()=>{
    const coords=normalizedFloatRect(start,view);
    const restored=positionedFloatRect(coords.x,coords.y,start.width,start.height,view);
    expect(restored.left).toBe(start.left);
    expect(restored.top).toBe(start.top);
    expect(restored.width).toBe(start.width);
    expect(restored.height).toBe(start.height);
  });
});
