import {describe,it,expect} from "vitest";
import {wheelEditedValue} from "./wheel-fields";
describe("pointer-hover numeric wheel editing",()=>{
  it("increments regular and fractional numbers without drift",()=>{
    expect(wheelEditedValue("10",-80,1)).toBe("11");
    expect(wheelEditedValue("0.1",-80,.1)).toBe("0.2");
    expect(wheelEditedValue("3",80,1,true)).toBe("2.9");
    expect(wheelEditedValue("3",-20,1,false,true)).toBe("13");
  });
  it("preserves references in linked formulas, including repeated steps",()=>{
    expect(wheelEditedValue("thickness",-100,1)).toBe("(thickness)+1");
    expect(wheelEditedValue("(thickness)+1",-100,1)).toBe("(thickness)+2");
    expect(wheelEditedValue("(thickness)+1",100,1)).toBe("thickness");
  });
  it("refuses missing, invalid, and overly long expressions",()=>{
    expect(wheelEditedValue("",-100,1)).toBeNull();
    expect(wheelEditedValue("5",0,1)).toBeNull();
    expect(wheelEditedValue("bad".repeat(70),-100,1)).toBeNull();
  });
});
