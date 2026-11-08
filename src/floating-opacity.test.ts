import {describe,it,expect,vi} from "vitest";
import {DEFAULT_FLOAT_OPACITY,FLOAT_OPACITY_KEY,loadFloatOpacity,
  saveFloatOpacity,validateFloatOpacity} from "./floating-opacity";
describe("floating-window opacity validation and migration",()=>{
  it("defaults to a subtle visible background but still accepts full transparency",()=>{
    expect(DEFAULT_FLOAT_OPACITY).toBe(.2);
    for(const n of [0,.2,.65,1])expect(validateFloatOpacity(n)).toBe(n);
  });
  it.each([-1,1.01,Infinity,NaN,".65",null,undefined])(
    "rejects invalid opacity %s",value=>{
      expect(()=>validateFloatOpacity(value)).toThrow("Invalid floating-window opacity");
    });
  it("preserves previously saved zero and nonzero values",()=>{
    const data=new Map<string,string>();
    vi.stubGlobal("localStorage",{
      getItem:(key:string)=>data.get(key)??null,
      setItem:(key:string,value:string)=>{data.set(key,value);}
    });
    try{
      expect(loadFloatOpacity()).toBe(.2);
      saveFloatOpacity(0);
      expect(data.get(FLOAT_OPACITY_KEY)).toBe("0");
      expect(loadFloatOpacity()).toBe(0);
      saveFloatOpacity(.95);
      expect(loadFloatOpacity()).toBe(.95);
      data.set(FLOAT_OPACITY_KEY,'"invalid"');
      expect(loadFloatOpacity()).toBe(.2);
    }finally{vi.unstubAllGlobals();}
  });
});
