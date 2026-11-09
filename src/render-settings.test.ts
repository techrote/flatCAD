import {describe,it,expect} from "vitest";
import {validateRenderSettings,effectivePixelRatio,DEFAULT_RENDER_SETTINGS} from "./render-settings";
describe("render effects preferences",()=>{
  it("validates AO and supersampling, rejects invalid JSON",()=>{
    expect(validateRenderSettings(DEFAULT_RENDER_SETTINGS)).toEqual(DEFAULT_RENDER_SETTINGS);
    expect(validateRenderSettings({...DEFAULT_RENDER_SETTINGS,ambientOcclusion:true,
      supersampling:1.5}).supersampling).toBe(1.5);
    expect(()=>validateRenderSettings({...DEFAULT_RENDER_SETTINGS,supersampling:8})).toThrow();
  });
  it("caps framebuffer size and permits modest supersampling",()=>{
    expect(effectivePixelRatio(DEFAULT_RENDER_SETTINGS,1,800,500)).toBe(1);
    expect(effectivePixelRatio({...DEFAULT_RENDER_SETTINGS,supersampling:2},1,800,500)).toBe(2);
    expect(effectivePixelRatio({...DEFAULT_RENDER_SETTINGS,supersampling:2},2,3840,2160))
      .toBeLessThan(1.1);
  });
});
