/** Named mouse navigation presets. The CAD model is independent of navigation choice. */
export const NAVIGATION_PRESETS = ["fusion","solidworks","onshape","blender"] as const;
export type NavigationPreset = typeof NAVIGATION_PRESETS[number];
export type DragAction = "pan" | "orbit" | "dolly" | "none";
export const NAVIGATION_LABELS: Record<NavigationPreset,string> = {
  fusion:"Fusion",
  solidworks:"SOLIDWORKS",
  onshape:"Onshape",
  blender:"Blender",
};
export const NAVIGATION_HINTS: Record<NavigationPreset,string> = {
  fusion:"MMB pan · Shift+MMB orbit · wheel zoom",
  solidworks:"MMB orbit · Ctrl+MMB pan · Shift+MMB zoom",
  onshape:"RMB orbit · MMB/Ctrl+RMB pan · wheel zoom",
  blender:"MMB orbit · Shift+MMB pan · wheel zoom",
};
export function validNavigationPreset(value:unknown):value is NavigationPreset {
  return typeof value === "string" && NAVIGATION_PRESETS.some(p=>p===value);
}
/** Mouse button numbering follows PointerEvent.button: left=0, middle=1, right=2. */
export function dragAction(
  preset:NavigationPreset, button:number, modifiers:{shift:boolean,ctrl:boolean},
):DragAction {
  if(preset==="fusion"){
    if(button===1)return modifiers.shift?"orbit":"pan";
    return "none";
  }
  if(preset==="solidworks"){
    if(button===1)return modifiers.ctrl?"pan":modifiers.shift?"dolly":"orbit";
    return "none";
  }
  if(preset==="onshape"){
    if(button===1)return "pan";
    if(button===2)return modifiers.ctrl?"pan":"orbit";
    return "none";
  }
  if(button===1)return modifiers.shift?"pan":"orbit"; // Blender
  return "none";
}
