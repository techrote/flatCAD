import {describe,it,expect} from "vitest";
import {DEMO,validateDocument} from "./model";
import {featureLabel,featureExtentLabel} from "./feature-labels";
describe("operation-derived feature history captions",()=>{
 it("names exact operation and selected sketch kind/ordinal",()=>{
   expect(featureLabel(DEMO,DEMO.features[0])).toBe("Extrude · Rectangle 1");
   expect(featureLabel(DEMO,DEMO.features[1])).toBe("Cut · Circle 1");
   expect(featureLabel(DEMO,DEMO.features[2])).toBe("Cut · Circle 2");
 });
 it("distinguishes repeated cuts of a single sketch profile",()=>{
   const d=validateDocument({...DEMO,features:[...DEMO.features,
     {id:"reCut",profileId:"hole_l",operation:"cut",z:8,depth:-2}]});
   expect(featureLabel(d,d.features[3])).toBe("Cut · Circle 1 (2)");
   expect(featureExtentLabel(d.features[3])).toContain("Δ-2");
 });
});
