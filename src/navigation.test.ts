import {describe,it,expect} from "vitest";
import {dragAction,validNavigationPreset} from "./navigation";
const normal={shift:false,ctrl:false};
describe("CAD navigation presets",()=>{
  it("defaults to Fusion: MMB pan, Shift+MMB orbit",()=>{
    expect(dragAction("fusion",1,normal)).toBe("pan");
    expect(dragAction("fusion",1,{shift:true,ctrl:false})).toBe("orbit");
    expect(dragAction("fusion",0,normal)).toBe("none");
  });
  it("supports SOLIDWORKS orbit/pan/dolly modifiers",()=>{
    expect(dragAction("solidworks",1,normal)).toBe("orbit");
    expect(dragAction("solidworks",1,{shift:false,ctrl:true})).toBe("pan");
    expect(dragAction("solidworks",1,{shift:true,ctrl:false})).toBe("dolly");
  });
  it("supports Onshape and Blender alternatives",()=>{
    expect(dragAction("onshape",2,normal)).toBe("orbit");
    expect(dragAction("onshape",2,{shift:false,ctrl:true})).toBe("pan");
    expect(dragAction("onshape",1,normal)).toBe("pan");
    expect(dragAction("blender",1,normal)).toBe("orbit");
    expect(dragAction("blender",1,{shift:true,ctrl:false})).toBe("pan");
    expect(validNavigationPreset("fusion")).toBe(true);
    expect(validNavigationPreset("nonsense")).toBe(false);
  });
});
