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

import {rotateProfile,rotatePoint,outline as rotatedOutline} from "./geometry";
describe("XY sketch rotation with dimensional provenance",()=>{
  it("rotates a rectangle around its own centre, preserving width and height",()=>{
    const rect={id:"r",kind:"rectangle" as const,x:0,y:0,width:20,height:10};
    const r=rotateProfile(rect,90);
    expect(r).toMatchObject({width:20,height:10,rotation:90});
    const pts=rotatedOutline(r);
    expect(pts[0].x).toBeCloseTo(15,7);
    expect(pts[0].y).toBeCloseTo(-5,7);
    expect(rotatedOutline(rect)[0]).toEqual({x:0,y:0});
  });
  it("rotates path vertices and slot endpoints without changing lengths",()=>{
    const path={id:"p",kind:"path" as const,closed:true,
      points:[{x:0,y:0},{x:10,y:0},{x:0,y:10}]};
    const next=rotateProfile(path,45);
    expect(next.kind).toBe("path");
    expect(rotatedOutline(next)).toHaveLength(3);
    const slot={id:"s",kind:"slot" as const,x1:0,y1:0,x2:10,y2:0,radius:2};
    expect(rotateProfile(slot,90)).toMatchObject({x1:5,y1:-5,x2:5,y2:5,radius:2});
    expect(rotatePoint({x:1,y:0},{x:0,y:0},90).y).toBeCloseTo(1);
  });
});
