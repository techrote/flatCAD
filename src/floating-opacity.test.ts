import {describe,it,expect} from "vitest";
import {validateFloatOpacity} from "./floating-opacity";
describe("floating-window opacity validation",()=>{
  it("accepts transparent, intermediate and opaque",()=>{
    for(const n of [0,.65,1])expect(validateFloatOpacity(n)).toBe(n);
  });
  it.each([-1,1.01,Infinity,NaN,".65",null,undefined])(
    "rejects invalid opacity %s",value=>{
      expect(()=>validateFloatOpacity(value)).toThrow("Invalid floating-window opacity");
    });
});
