import {describe,it,expect} from "vitest";
import {validateRenderSettings,effectivePixelRatio,DEFAULT_RENDER_SETTINGS} from "./render-settings";
describe("render effects and diagnostic preferences",()=>{
  it("validates defaults and migrates existing v1 settings",()=>{
    expect(validateRenderSettings(DEFAULT_RENDER_SETTINGS)).toEqual(DEFAULT_RENDER_SETTINGS);
    const old={version:1,ambientOcclusion:true,supersampling:1.5};
    expect(validateRenderSettings(old)).toEqual({
      ...DEFAULT_RENDER_SETTINGS,ambientOcclusion:true,supersampling:1.5
    });
  });
  it("accepts independent edge, light and AO diagnostics",()=>{
    const updated={...DEFAULT_RENDER_SETTINGS,
      supersampling:1.75,edgeMode:"screen",edgeWidthPx:2.5,
      edgeOpacity:.4,edgeColor:"#f0aaff",ambientLight:.5,keyLight:4,aoRadius:20};
    expect(validateRenderSettings(updated)).toEqual(updated);
    expect(validateRenderSettings({...updated,edgeMode:"hidden"}).edgeMode).toBe("hidden");
  });
  it("rejects invalid settings instead of silently rewriting them",()=>{
    const invalid=[
      {supersampling:8},{edgeMode:"bitmap"},{edgeWidthPx:0},
      {edgeWidthPx:Infinity},{edgeOpacity:-.1},{edgeOpacity:1.1},
      {edgeColor:"white"},{edgeColor:"#abcd"},{ambientLight:-1},
      {ambientLight:NaN},{keyLight:6},{aoRadius:25}
    ];
    for(const patch of invalid)
      expect(()=>validateRenderSettings({...DEFAULT_RENDER_SETTINGS,...patch})).toThrow();
  });
  it("keeps current pixel-budget cap, including intermediate supersampling",()=>{
    expect(effectivePixelRatio(DEFAULT_RENDER_SETTINGS,1,800,500)).toBe(1);
    expect(effectivePixelRatio({...DEFAULT_RENDER_SETTINGS,supersampling:1.25},1,800,500)).toBe(1.25);
    expect(effectivePixelRatio({...DEFAULT_RENDER_SETTINGS,supersampling:2},1,800,500)).toBe(2);
    expect(effectivePixelRatio({...DEFAULT_RENDER_SETTINGS,supersampling:3},2,3840,2160))
      .toBeLessThan(1.1);
  });
});
