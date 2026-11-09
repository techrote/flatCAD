import {describe,it,expect} from "vitest";
import {validateRenderSettings,effectivePixelRatio,effectiveMsaaSamples,
  CLEAN_CAD_RENDER_SETTINGS,DEFAULT_RENDER_SETTINGS} from "./render-settings";
describe("render settings, explicit MSAA and simplified CAD lines",()=>{
  it("has black 1 CSS-pixel screen-space edges by default",()=>{
    expect(DEFAULT_RENDER_SETTINGS).toMatchObject({
      ambientOcclusion:false,linesEnabled:true,edgeWidthPx:1,
      edgeOpacity:1,edgeColor:"#000000"
    });
    expect(validateRenderSettings(DEFAULT_RENDER_SETTINGS)).toEqual(DEFAULT_RENDER_SETTINGS);
  });
  it("migrates old render.v1 settings including hidden lines",()=>{
    const prior={version:1,ambientOcclusion:true,supersampling:1.5};
    expect(validateRenderSettings(prior)).toEqual({
      ...DEFAULT_RENDER_SETTINGS,ambientOcclusion:true,supersampling:1.5
    });
    const old={...DEFAULT_RENDER_SETTINGS,linesEnabled:undefined,
      edgeMode:"hidden",edgeWidthPx:2,edgeOpacity:.4,edgeColor:"#123456"};
    const converted=validateRenderSettings(old);
    expect(converted).toMatchObject({
      linesEnabled:false,edgeWidthPx:2,edgeOpacity:.4,edgeColor:"#123456"
    });
    expect(converted).not.toHaveProperty("edgeMode");
    expect(validateRenderSettings({...old,edgeMode:"screen"}).linesEnabled).toBe(true);
    expect(validateRenderSettings({...old,edgeMode:"native"}).linesEnabled).toBe(true);
  });
  it("preserves explicit new visibility over any stale legacy field",()=>{
    expect(validateRenderSettings({...DEFAULT_RENDER_SETTINGS,
      edgeMode:"hidden",linesEnabled:true}).linesEnabled).toBe(true);
    expect(validateRenderSettings({...DEFAULT_RENDER_SETTINGS,
      edgeMode:"screen",linesEnabled:false}).linesEnabled).toBe(false);
  });
  it("retains the owner Clean CAD preset without changing the general default",()=>{
    expect(CLEAN_CAD_RENDER_SETTINGS).toMatchObject({
      ambientOcclusion:false,supersampling:1,linesEnabled:true,
      edgeWidthPx:.5,edgeOpacity:.5,ambientLight:.75,keyLight:5
    });
  });
  it("allows 4×/8× SSAA and bounded 0/2/4/8 MSAA",()=>{
    const s={...DEFAULT_RENDER_SETTINGS,supersampling:8 as const,
      renderPixelBudget:64_000_000 as const,msaaSamples:8 as const,
      downsampleMode:"nearest" as const};
    expect(validateRenderSettings(s)).toEqual(s);
    expect(validateRenderSettings({...s,msaaSamples:0}).msaaSamples).toBe(0);
    expect(validateRenderSettings({...s,msaaSamples:"browser"}).msaaSamples).toBe("browser");
    expect(effectiveMsaaSamples("browser",8,1e6)).toBeNull();
    expect(effectiveMsaaSamples(8,4,1e6)).toBe(4);
    expect(effectiveMsaaSamples(8,8,32e6)).toBe(2);
    expect(effectiveMsaaSamples(8,8,40e6)).toBe(0);
  });
  it("rejects invalid values without weakening schema checks",()=>{
    for(const patch of [
      {supersampling:6},{renderPixelBudget:128e6},{msaaSamples:6},
      {msaaSamples:-1},{downsampleMode:"lanczos"},
      {linesEnabled:0},{linesEnabled:"yes"},{edgeMode:"bitmap"},
      {edgeWidthPx:0},{edgeOpacity:-.1},{edgeColor:"white"},
      {ambientLight:NaN},{keyLight:6},{aoRadius:25}
    ])expect(()=>validateRenderSettings({...DEFAULT_RENDER_SETTINGS,...patch})).toThrow();
  });
  it("reports actual SSAA ratio under framebuffer and dimension clamps",()=>{
    const high={...DEFAULT_RENDER_SETTINGS,supersampling:8 as const,
      renderPixelBudget:32_000_000 as const};
    expect(effectivePixelRatio(high,1,800,600)).toBe(8);
    expect(effectivePixelRatio(high,1,1800,1200)).toBeLessThan(4);
    expect(effectivePixelRatio({...high,renderPixelBudget:8_000_000},1,800,600))
      .toBeLessThan(5);
    const capped=effectivePixelRatio({...high,renderPixelBudget:64_000_000},1,1200,800);
    expect(capped).toBeGreaterThan(6.8);
    expect(capped).toBeLessThan(8);
  });
});