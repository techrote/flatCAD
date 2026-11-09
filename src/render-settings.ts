/** Optional presentation effects, never part of an engineering document. */
export const RENDER_SETTINGS_KEY="flatcad.render.v1";
export type Supersampling=1|1.5|2;
export type RenderSettings={version:1;ambientOcclusion:boolean;supersampling:Supersampling};
export const DEFAULT_RENDER_SETTINGS:RenderSettings={
  version:1,ambientOcclusion:false,supersampling:1
};
export function validateRenderSettings(value:unknown):RenderSettings{
  if(!value||typeof value!=="object"||Array.isArray(value))throw Error("Invalid render settings");
  const s=value as Record<string,unknown>;
  if(s.version!==1||typeof s.ambientOcclusion!=="boolean"||
    (s.supersampling!==1&&s.supersampling!==1.5&&s.supersampling!==2))
    throw Error("Invalid AO/supersampling configuration");
  return {version:1,ambientOcclusion:s.ambientOcclusion,supersampling:s.supersampling};
}
export function effectivePixelRatio(s:RenderSettings,dpr:number,width:number,height:number):number{
  const requested=Math.min(3,Math.max(.5,dpr)*s.supersampling);
  // Cap backing buffer area and dimensions for integrated GPUs.
  const limit=Math.min(4096/Math.max(1,width),4096/Math.max(1,height),
    Math.sqrt(8_000_000/Math.max(1,width*height)));
  return Math.max(.5,Math.min(requested,limit));
}
export function loadRenderSettings():RenderSettings{
  try{const raw=localStorage.getItem(RENDER_SETTINGS_KEY);
    return raw?validateRenderSettings(JSON.parse(raw)):{...DEFAULT_RENDER_SETTINGS};
  }catch{return {...DEFAULT_RENDER_SETTINGS};}
}
export function saveRenderSettings(value:RenderSettings):void{
  localStorage.setItem(RENDER_SETTINGS_KEY,JSON.stringify(validateRenderSettings(value)));
}
