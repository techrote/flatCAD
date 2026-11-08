/** Render-only settings, backwards-compatible with earlier flatcad.render.v1 data. */
export const RENDER_SETTINGS_KEY="flatcad.render.v1";
export const SUPER_SAMPLING=[1,1.25,1.5,1.75,2,2.5,3,4,8] as const;
export type Supersampling=typeof SUPER_SAMPLING[number];
export const RENDER_PIXEL_BUDGETS=[8_000_000,16_000_000,32_000_000,64_000_000] as const;
export type RenderPixelBudget=typeof RENDER_PIXEL_BUDGETS[number];
export type MsaaSamples="browser"|0|2|4|8;
export type DownsampleMode="browser"|"nearest";
export type EdgeMode="native"|"screen"|"hidden";
export type RenderSettings={
  version:1;ambientOcclusion:boolean;supersampling:Supersampling;
  edgeMode:EdgeMode;edgeWidthPx:number;edgeOpacity:number;edgeColor:string;
  ambientLight:number;keyLight:number;aoRadius:number;
  msaaSamples:MsaaSamples;renderPixelBudget:RenderPixelBudget;
  downsampleMode:DownsampleMode;
};
export const DEFAULT_RENDER_SETTINGS:RenderSettings={
  version:1,ambientOcclusion:false,supersampling:1,
  edgeMode:"native",edgeWidthPx:1.5,edgeOpacity:1,edgeColor:"#152a45",
  ambientLight:2,keyLight:3,aoRadius:8,
  msaaSamples:"browser",renderPixelBudget:8_000_000,downsampleMode:"browser"
};
export const CLEAN_CAD_RENDER_SETTINGS:RenderSettings={
  ...DEFAULT_RENDER_SETTINGS,ambientOcclusion:false,supersampling:1,
  edgeMode:"screen",edgeWidthPx:.5,edgeOpacity:.5,
  ambientLight:.75,keyLight:5
};
const finiteRange=(v:unknown,min:number,max:number):v is number=>
  typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max;
const fallback=<T>(v:T|undefined,d:T):T=>v===undefined?d:v;
export function validateRenderSettings(value:unknown):RenderSettings{
  if(!value||typeof value!=="object"||Array.isArray(value))throw Error("Invalid render settings");
  const s=value as Record<string,unknown>,d=DEFAULT_RENDER_SETTINGS;
  if(s.version!==1||typeof s.ambientOcclusion!=="boolean"||
    !SUPER_SAMPLING.includes(s.supersampling as Supersampling))
    throw Error("Invalid AO/supersampling configuration");
  const edgeMode=fallback(s.edgeMode,d.edgeMode);
  const edgeWidthPx=fallback(s.edgeWidthPx,d.edgeWidthPx);
  const edgeOpacity=fallback(s.edgeOpacity,d.edgeOpacity);
  const edgeColor=fallback(s.edgeColor,d.edgeColor);
  const ambientLight=fallback(s.ambientLight,d.ambientLight);
  const keyLight=fallback(s.keyLight,d.keyLight);
  const aoRadius=fallback(s.aoRadius,d.aoRadius);
  const msaaSamples=fallback(s.msaaSamples,d.msaaSamples);
  const renderPixelBudget=fallback(s.renderPixelBudget,d.renderPixelBudget);
  const downsampleMode=fallback(s.downsampleMode,d.downsampleMode);
  if((edgeMode!=="native"&&edgeMode!=="screen"&&edgeMode!=="hidden")||
    !finiteRange(edgeWidthPx,.5,5)||!finiteRange(edgeOpacity,0,1)||
    typeof edgeColor!=="string"||!/^#[0-9a-fA-F]{6}$/.test(edgeColor)||
    !finiteRange(ambientLight,0,4)||!finiteRange(keyLight,0,5)||
    !finiteRange(aoRadius,0,24)||
    ![ "browser",0,2,4,8 ].includes(msaaSamples as MsaaSamples)||
    !RENDER_PIXEL_BUDGETS.includes(renderPixelBudget as RenderPixelBudget)||
    (downsampleMode!=="browser"&&downsampleMode!=="nearest"))
    throw Error("Invalid render diagnostic parameter");
  return {version:1,ambientOcclusion:s.ambientOcclusion,
    supersampling:s.supersampling as Supersampling,edgeMode,edgeWidthPx,edgeOpacity,
    edgeColor,ambientLight,keyLight,aoRadius,msaaSamples:msaaSamples as MsaaSamples,
    renderPixelBudget:renderPixelBudget as RenderPixelBudget,
    downsampleMode:downsampleMode as DownsampleMode};
}
/** Requested linear backing ratio, clamped by a per-view pixel budget,
 * browser texture cap and 4096px (safe) / 8192px (explicit high-budget) dimension cap. */
export function effectivePixelRatio(s:RenderSettings,dpr:number,width:number,height:number,
  maxTextureSize=8192):number{
  const w=Math.max(1,width),h=Math.max(1,height);
  const requested=Math.max(.5,dpr)*s.supersampling;
  const maxDim=Math.min(s.renderPixelBudget<=8_000_000?4096:8192,maxTextureSize);
  const limit=Math.min(maxDim/w,maxDim/h,
    Math.sqrt(s.renderPixelBudget/(w*h)));
  return Math.max(.125,Math.min(requested,limit));
}
/** Multisampled render targets can be very expensive at SSAA 4–8×.
 * Bound MSAA * backing-pixel product to 64M samples per viewport. */
export const MAX_MSAA_SAMPLE_PIXELS=64_000_000;
export function effectiveMsaaSamples(requested:MsaaSamples,deviceLimit:number,
  backingPixels:number):number|null{
  if(requested==="browser")return null;
  if(requested===0)return 0;
  for(const n of [8,4,2] as const)
    if(n<=requested&&n<=deviceLimit&&backingPixels*n<=MAX_MSAA_SAMPLE_PIXELS)
      return n;
  return 0;
}
export function loadRenderSettings():RenderSettings{
  try{const raw=localStorage.getItem(RENDER_SETTINGS_KEY);
    return raw?validateRenderSettings(JSON.parse(raw)):{...DEFAULT_RENDER_SETTINGS};
  }catch{return {...DEFAULT_RENDER_SETTINGS};}
}
export function saveRenderSettings(value:RenderSettings):void{
  localStorage.setItem(RENDER_SETTINGS_KEY,JSON.stringify(validateRenderSettings(value)));
}
