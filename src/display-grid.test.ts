import {describe,expect,it} from "vitest";
import {presentationGridZ} from "./display-grid";
describe("the visual grid never intersects model/cut-tool geometry",()=>{
  it("is below a positive plate even when its bottom face is at Z 0",()=>{
    expect(presentationGridZ(0,8)).toBeLessThan(0);
  });
  it("follows a below-zero solid rather than cutting through it",()=>{
    expect(presentationGridZ(-20,8)).toBeLessThan(-20);
  });
  it("is below a cutting tool's overshoot",()=>{
    expect(presentationGridZ(0,8,-3)).toBeLessThan(-3);
  });
  it("rejects non-finite bounds",()=>{
    expect(()=>presentationGridZ(NaN,5)).toThrow();
  });
});
