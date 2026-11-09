import {describe,it,expect} from "vitest";
import {toolbarSnap,validToolbarPose} from "./floating-toolbar";
describe("Sketch toolbar free drag and edge snapping",()=>{
  const rect={left:100,top:85,width:700,height:600};
  it("snaps near left and right Sketch viewport edges",()=>{
    expect(toolbarSnap(117,200,46,420,rect)).toEqual({x:108,y:200,side:"left"});
    expect(toolbarSnap(755,200,46,420,rect)).toEqual({x:746,y:200,side:"right"});
  });
  it("leaves the edge when dragged away and clamps docking vertically",()=>{
    expect(toolbarSnap(360,200,46,420,rect).side).toBeNull();
    expect(toolbarSnap(117,-500,46,420,rect).side).toBeNull();
    expect(toolbarSnap(117,640,46,420,rect).y).toBeLessThanOrEqual(265);
  });
  it("validates persisted UI pose independently of CAD documents",()=>{
    expect(validToolbarPose({x:120,y:210,side:"left"})).toEqual({x:120,y:210,side:"left"});
    for(const value of [{x:1,y:2,side:"top"},{x:NaN,y:2,side:null},
      {x:-1,y:2,side:"left"},[],null])
      expect(()=>validToolbarPose(value)).toThrow();
  });
});
