import {describe,it,expect} from "vitest";
import {isHighlightableSurface,VERTEX_HOVER_RADIUS_PX,worldRadiusForScreenPixels} from "./hover-policy";
import type {SurfaceTarget} from "./surface-interaction";
const base:SurfaceTarget={kind:"face",point:[0,0,8],z:8,normal:[0,0,1]};
describe("face/vertex targeting presentation policy",()=>{
 it("highlights only horizontal eligible faces, not vertical/oblique sides",()=>{
   expect(isHighlightableSurface(base)).toBe(true);
   expect(isHighlightableSurface({...base,normal:[1,0,0],z:null})).toBe(false);
   expect(isHighlightableSurface({...base,normal:[.7,0,.7],z:null})).toBe(false);
   expect(isHighlightableSurface({...base,z:null})).toBe(false);
 });
 it("always displays true topological vertices with a matching green sphere",()=>{
   expect(isHighlightableSurface({...base,kind:"vertex",normal:[0,0,0]})).toBe(true);
   expect(VERTEX_HOVER_RADIUS_PX).toBeGreaterThanOrEqual(14);
   const radius=worldRadiusForScreenPixels(VERTEX_HOVER_RADIUS_PX,100,2,500);
   const projected=radius*2*500/(100/2);
   expect(projected).toBeCloseTo(2*VERTEX_HOVER_RADIUS_PX,8);
 });
});
