/** Local UI-only floating-window opacity; no CAD or render-setting migration. */
export const FLOAT_OPACITY_KEY="flatcad.float-opacity.v1";
export const DEFAULT_FLOAT_OPACITY=.2; // subtle boundary; saved 0% stays transparent
export function validateFloatOpacity(value:unknown):number{
  if(typeof value!=="number"||!Number.isFinite(value)||value<0||value>1)
    throw Error("Invalid floating-window opacity");
  return value;
}
export function loadFloatOpacity():number{
  try{
    const raw=localStorage.getItem(FLOAT_OPACITY_KEY);
    return raw===null?DEFAULT_FLOAT_OPACITY:validateFloatOpacity(JSON.parse(raw));
  }catch{return DEFAULT_FLOAT_OPACITY;}
}
export function saveFloatOpacity(value:number):void{
  localStorage.setItem(FLOAT_OPACITY_KEY,JSON.stringify(validateFloatOpacity(value)));
}
