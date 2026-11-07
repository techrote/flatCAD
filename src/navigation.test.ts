import {describe,it,expect} from "vitest";
import {dragAction,orbitControlsBinding,validNavigationPreset} from "./navigation";
const normal={shift:false,ctrl:false};
describe("CAD navigation presets",()=>{
  it("defaults to Fusion: MMB pan, Shift+MMB orbit",()=>{
    expect(dragAction("fusion",1,normal)).toBe("pan");
    expect(dragAction("fusion",1,{shift:true,ctrl:false})).toBe("orbit");
    expect(dragAction("fusion",0,normal)).toBe("none");
    expect(dragAction("fusion",2,normal)).toBe("orbit");
    expect(dragAction("fusion",2,{shift:true,ctrl:false})).toBe("orbit");
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

describe("OrbitControls r180 modifier compensation",()=>{
  it("sets actual modifier bindings inverse to internally swapped actions",()=>{
    expect(orbitControlsBinding("orbit",true)).toBe("pan");
    expect(orbitControlsBinding("pan",true)).toBe("orbit");
    expect(orbitControlsBinding("orbit",false)).toBe("orbit");
    expect(orbitControlsBinding("pan",false)).toBe("pan");
  });
  it("does not affect zoom, unused controls or requested preset semantics",()=>{
    expect(orbitControlsBinding("dolly",true)).toBe("dolly");
    expect(orbitControlsBinding("none",true)).toBe("none");
    expect(dragAction("solidworks",1,{shift:true,ctrl:false})).toBe("dolly");
    expect(dragAction("blender",1,{shift:true,ctrl:false})).toBe("pan");
  });
});
