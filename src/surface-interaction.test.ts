import {describe,it,expect} from "vitest";
import {DEMO,validateDocument} from "./model";
import {featureForSurface,formatSurfaceTarget,type SurfaceTarget} from "./surface-interaction";
const top:SurfaceTarget={kind:"face",point:[0,10,8],z:8,normal:[0,0,1]};
describe("surface targeting and conservative feature deletion",()=>{
 it("locates a unique plate face but not a hole void",()=>{
   expect(featureForSurface(DEMO,top)?.id).toBe("base");
   expect(featureForSurface(DEMO,{...top,point:[-35,0,8]})).toBeNull();
 });
 it("pocket bottom resolves the cut feature from its exact source plane",()=>{
   const doc=validateDocument({...DEMO,features:[...DEMO.features,{
     id:"pocket",profileId:"hole_l",operation:"cut",z:8,depth:-6
   }]});
   expect(featureForSurface(doc,{kind:"face",point:[-35,0,2],z:2,normal:[0,0,1]})?.id).toBe("pocket");
 });
 it("refuses ambiguous overlapping feature attribution",()=>{
   const doc=validateDocument({...DEMO,features:[...DEMO.features,{
     id:"topBoss",profileId:"plate",operation:"add",z:8,depth:2
   }]});
   expect(featureForSurface(doc,top)).toBeNull();
 });
 it("formats focused surface labels without applying changes",()=>{
   expect(formatSurfaceTarget(top,"z",0)).toContain("Start Z");
   expect(formatSurfaceTarget({...top,z:2},"depth",8)).toContain("-6");
   expect(formatSurfaceTarget({...top,z:null},"depth",8)).toContain("nonhorizontal");
 });
});
