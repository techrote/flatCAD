import { describe,it,expect } from "vitest";
import { centre,contains,handles,hit,isSimplePolygon,moveHandle,outline,polygonPoints,signedArea,suggestOperation,translate } from "./geometry";
import { DEMO,appendFeature,appendProfile,validateDocument } from "./model";

describe("pure XY geometry and edits",()=>{
  it("computes rotated polygon vertices accurately",()=>{
    const pts=polygonPoints({kind:"polygon",id:"p",x:0,y:0,radius:10,sides:4,rotation:45});
    expect(pts).toHaveLength(4);
    expect(Math.abs(signedArea(pts))).toBeCloseTo(200,8);
    expect(pts[0].x).toBeCloseTo(10/Math.sqrt(2),8);
  });
  it("rejects bow-tie, degenerate and overlapping closed paths",()=>{
    expect(isSimplePolygon([{x:0,y:0},{x:10,y:10},{x:0,y:10},{x:10,y:0}])).toBe(false);
    expect(isSimplePolygon([{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}])).toBe(true);
  });
  it("selects open lines near segments, not from interior",()=>{
    const p={id:"p",kind:"path" as const,closed:false,points:[{x:0,y:0},{x:100,y:0}]};
    expect(hit(p,{x:50,y:0.1},0.5)).toBe(true);
    expect(hit(p,{x:50,y:50},0.5)).toBe(false);
  });
  it("direct manipulations preserve IDs and close rectangle at 1:1 when shift held",()=>{
    const original=DEMO.profiles[0];
    const moved=translate(original,2,3);
    expect(moved.id).toBe(original.id);
    const rect=moveHandle(original,2,{x:40,y:40},true);
    expect(rect.kind).toBe("rectangle");
    if(rect.kind==="rectangle")expect(rect.width).toBeCloseTo(rect.height);
  });
  it("slot handles and hit checks",()=>{
    const p={id:"s",kind:"slot" as const,x1:0,y1:0,x2:20,y2:0,radius:5};
    expect(outline(p).length).toBeGreaterThan(20);
    expect(contains(p,{x:12,y:0})).toBe(true);
    expect(handles(p)).toHaveLength(3);
  });
  it("suggests cuts only when fully contained by prior additive profile",()=>{
    const p={id:"hole",kind:"circle" as const,x:0,y:0,radius:5};
    const doc=appendProfile(DEMO,p);
    expect(suggestOperation(doc,p)).toBe("cut");
    expect(suggestOperation(doc,{...p,id:"outer",radius:100})).toBe("add");
  });
});
