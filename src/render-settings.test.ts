import {describe,it,expect} from "vitest";
import {validateRenderSettings,effectivePixelRatio,effectiveMsaaSamples,
  CLEAN_CAD_RENDER_SETTINGS,DEFAULT_RENDER_SETTINGS} from "./render-settings";
describe("render and AA diagnostics",()=>{
  it("keeps legacy render.v1 preferences compatible",()=>{
    expect(validateRenderSettings(DEFAULT_RENDER_SETTINGS)).toEqual(DEFAULT_RENDER_SETTINGS);
    const legacy={version:1,ambientOcclusion:true,supersampling:1.5};
    expect(validateRenderSettings(legacy)).toEqual({
      ...DEFAULT_RENDER_SETTINGS,ambientOcclusion:true,supersampling:1.5
    });
  });
  it("validates 4×/8× SSAA, explicit MSAA and browser downsample modes",()=>{
    const s={...DEFAULT_RENDER_SETTINGS,supersampling:8 as const,
      renderPixelBudget:64_000_000 as const,msaaSamples:8 as const,
      downsampleMode:"nearest" as const};
    expect(validateRenderSettings(s)).toEqual(s);
    expect(validateRenderSettings({...s,msaaSamples:0}).msaaSamples).toBe(0);
    expect(validateRenderSettings({...s,msaaSamples:"browser"}).msaaSamples).toBe("browser");
  });
  it("supports exact owner-approved Clean CAD appearance without changing defaults",()=>{
    expect(CLEAN_CAD_RENDER_SETTINGS).toMatchObject({
      ambientOcclusion:false,supersampling:1,edgeMode:"screen",
      edgeWidthPx:.5,edgeOpacity:.5,ambientLight:.75,keyLight:5
    });
    expect(DEFAULT_RENDER_SETTINGS.edgeMode).toBe("native");
  });
  it("rejects invalid values instead of silently coercing",()=>{
    for(const patch of [{supersampling:6},{renderPixelBudget:128_000_000},
      {msaaSamples:6},{msaaSamples:-1},{downsampleMode:"lanczos"},
      {edgeMode:"bitmap"},{edgeWidthPx:0},{edgeOpacity:-.1},
      {edgeColor:"white"},{ambientLight:NaN},{keyLight:6},{aoRadius:25}])
      expect(()=>validateRenderSettings({...DEFAULT_RENDER_SETTINGS,...patch})).toThrow();
  });
  it("lets 8× SSAA actually run at 800×600 when high budget is explicitly chosen",()=>{
    const large={...DEFAULT_RENDER_SETTINGS,supersampling:8 as const,
      renderPixelBudget:32_000_000 as const};
    expect(effectivePixelRatio(large,1,800,600)).toBe(8);
    expect(effectivePixelRatio(large,1,1800,1200)).toBeLessThan(4);
    expect(effectivePixelRatio({...large,renderPixelBudget:8_000_000},1,800,600))
      .toBeLessThan(5);
    expect(effectivePixelRatio({...large,renderPixelBudget:64_000_000},1,1200,800))
      .toBeGreaterThan(7);
  });
  it("bounds MSAA to GPU capability and a real sample-pixel ceiling",()=>{
    expect(effectiveMsaaSamples("browser",8,1000)).toBeNull();
    expect(effectiveMsaaSamples(8,8,1_000_000)).toBe(8);
    expect(effectiveMsaaSamples(8,4,1_000_000)).toBe(4);
    expect(effectiveMsaaSamples(8,8,12_000_000)).toBe(4);
    expect(effectiveMsaaSamples(8,8,32_000_000)).toBe(2);
    expect(effectiveMsaaSamples(8,8,40_000_000)).toBe(0);
    expect(effectiveMsaaSamples(0,8,1_000_000)).toBe(0);
  });
});
