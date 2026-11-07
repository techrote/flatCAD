import {describe,it,expect} from "vitest";
import {MAX_FLOAT_VIEWS,validateFloatDescriptors} from "./floating-views";
describe("multi floating renderer state",()=>{
  it("bounds count, positions, and unique identifiers",()=>{
    expect(MAX_FLOAT_VIEWS).toBe(3);
    const sample=[{id:"float_abcdef",x:0,y:1},{id:"float_ghijkl",x:.5,y:.5}];
    expect(validateFloatDescriptors(sample)).toEqual(sample);
    expect(()=>validateFloatDescriptors([...sample,...sample])).toThrow();
    expect(()=>validateFloatDescriptors([{id:"float_abcd12",x:-1,y:.5}])).toThrow();
    expect(()=>validateFloatDescriptors([{id:"<script>",x:.3,y:.2}])).toThrow();
  });
});
