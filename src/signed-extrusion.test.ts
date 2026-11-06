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
