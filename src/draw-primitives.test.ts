import {describe,expect,it} from "vitest";
import {draftProfile,type DrawTool} from "./draw-primitives";
const from={x:10,y:20};
const polygon={sides:7,rotation:30};
describe("shared click-drag and click-click geometry",()=>{
  it.each(["rectangle","centerRectangle","circle","polygon","slot"] as DrawTool[])(
    "%s remains pending at zero span",tool=>{
      expect(draftProfile("p",tool,from,from,false,polygon,3)).toBeNull();
    }
  );
  it("constrains corner rectangle to a square on final Shift",()=>{
    const r=draftProfile("r","rectangle",from,{x:30,y:25},true,polygon,3);
    expect(r?.kind).toBe("rectangle");
    if(r?.kind==="rectangle"){
      expect(r.width).toBe(20);expect(r.height).toBe(20);
      expect(r.x).toBe(10);expect(r.y).toBe(20);
    }
  });
  it("builds centered rectangle from stable first datum",()=>{
    const r=draftProfile("r","centerRectangle",from,{x:20,y:25},false,polygon,3);
    expect(r).toEqual({id:"r",kind:"rectangle",x:0,y:15,width:20,height:10});
  });
  it("circle, polygon and slot capture exact secondary datum",()=>{
    const p={x:20,y:25};
    const c=draftProfile("c","circle",from,p,false,polygon,3);
    expect(c?.kind).toBe("circle");
    const n=draftProfile("p","polygon",from,p,false,polygon,3);
    if(n?.kind==="polygon"){expect(n.sides).toBe(7);expect(n.rotation).toBe(30);}
    const s=draftProfile("s","slot",from,p,false,polygon,3);
    expect(s).toEqual({id:"s",kind:"slot",x1:10,y1:20,x2:20,y2:25,radius:3});
  });
  it("rejects a rectangle with one zero axis unless Shift makes it square",()=>{
    expect(draftProfile("p","rectangle",from,{x:10,y:30},false,polygon,3)).toBeNull();
    expect(draftProfile("p","rectangle",from,{x:10,y:30},true,polygon,3)).toMatchObject({
      kind:"rectangle",width:10,height:10
    });
  });
});
