/** Presentation-only render diagnostics; never embedded in a CAD project. */
export const RENDER_SETTINGS_KEY="flatcad.render.v1";
export const SUPER_SAMPLING=[1,1.25,1.5,1.75,2,2.5,3] as const;
export type Supersampling=typeof SUPER_SAMPLING[number];
export type EdgeMode="native"|"screen"|"hidden";
export type RenderSettings={
  version:1;ambientOcclusion:boolean;supersampling:Supersampling;
  edgeMode:EdgeMode;edgeWidthPx:number;edgeOpacity:number;edgeColor:string;
  ambientLight:number;keyLight:number;aoRadius:number;
};
export const DEFAULT_RENDER_SETTINGS:RenderSettings={
  version:1,ambientOcclusion:false,supersampling:1,
  edgeMode:"native",edgeWidthPx:1.5,edgeOpacity:1,edgeColor:"#152a45",
  ambientLight:2,keyLight:3,aoRadius:8
};
const finiteRange=(v:unknown,min:number,max:number):v is number=>
  typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max;
const fallback=<T>(v:T|undefined,defaultValue:T):T=>v===undefined?defaultValue:v;
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
  if((edgeMode!=="native"&&edgeMode!=="screen"&&edgeMode!=="hidden")||
    !finiteRange(edgeWidthPx,.5,5)||
    !finiteRange(edgeOpacity,0,1)||
    typeof edgeColor!=="string"||!/^#[0-9a-fA-F]{6}$/.test(edgeColor)||
    !finiteRange(ambientLight,0,4)||!finiteRange(keyLight,0,5)||
    !finiteRange(aoRadius,0,24))
    throw Error("Invalid render diagnostic parameter");
  return {version:1,ambientOcclusion:s.ambientOcclusion,
    supersampling:s.supersampling as Supersampling,edgeMode,edgeWidthPx,
    edgeOpacity,edgeColor,ambientLight,keyLight,aoRadius};
}
export function effectivePixelRatio(s:RenderSettings,dpr:number,width:number,height:number):number{
  const requested=Math.min(3,Math.max(.5,dpr)*s.supersampling);
  // Unchanged framebuffer budget: 4096 per axis and 8 million pixels/view.
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
