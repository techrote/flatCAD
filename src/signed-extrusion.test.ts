import {describe,it,expect} from "vitest";
import {signedInterval,depthToFace,exactFaceElevation} from "./signed-extrusion";
describe("signed extrusion semantics",()=>{
  it("maps Start Z=8 and Depth=-6 to exact height [2,8]",()=>{
    expect(signedInterval(8,-6)).toEqual({lower:2,upper:8,height:6});
    expect(depthToFace(8,2)).toBe(-6);
  });
  it("does not change the meaning of existing positive-depth documents",()=>{
    expect(signedInterval(-1,10)).toEqual({lower:-1,upper:9,height:10});
    expect(signedInterval(0,8)).toEqual({lower:0,upper:8,height:8});
  });
  it("rejects zero and invalid values",()=>{
    expect(()=>signedInterval(0,0)).toThrow();
    expect(()=>signedInterval(0,Infinity)).toThrow();
    expect(()=>depthToFace(NaN,8)).toThrow();
  });
  it("snaps a picked display face to its exact source plane",()=>{
    expect(exactFaceElevation(7.9999999,[0,2,8])).toBe(8);
    expect(exactFaceElevation(2.0000001,[0,2,8])).toBe(2);
    expect(exactFaceElevation(4.5,[0,2,8])).toBeNull();
  });
});

import {validateDocument,DEMO} from "./model";
describe("angled and twisted feature schema",()=>{
  it("retains directional metadata and signed depths",()=>{
    const doc=validateDocument({...DEMO,features:DEMO.features.map((f,i)=>
      i===0?{...f,tiltX:12,tiltY:-8}:i===1?{...f,twist:45}:f)});
    expect(doc.features[0]).toMatchObject({tiltX:12,tiltY:-8,depth:8});
    expect(doc.features[1]).toMatchObject({twist:45,operation:"cut"});
    expect(validateDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });
  it("rejects non-finite, extreme or mixed direction types",()=>{
    const changed=(mod:Record<string,unknown>)=>({...DEMO,features:DEMO.features.map((f,i)=>
      i===0?{...f,...mod}:f)});
    expect(()=>validateDocument(changed({tiltX:NaN}))).toThrow("tiltX");
    expect(()=>validateDocument(changed({tiltY:90}))).toThrow("tiltY");
    expect(()=>validateDocument(changed({twist:900}))).toThrow("twist");
    expect(()=>validateDocument(changed({tiltX:10,twist:45}))).toThrow("combined");
  });
});
