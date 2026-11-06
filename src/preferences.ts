/** User preferences are intentionally separate from the engineering CAD document. */
import { validNavigationPreset, type NavigationPreset } from "./navigation";
export type ShortcutAction =
  | "tool.select" | "tool.line" | "tool.rectangle" | "tool.centerRectangle"
  | "tool.circle" | "tool.polygon" | "tool.slot" | "tool.pan"
  | "feature.extrude" | "edit.delete" | "edit.duplicate"
  | "edit.undo" | "edit.redo" | "file.save" | "dialog.shortcuts" | "dialog.grid";
export const ACTION_LABELS:Record<ShortcutAction,string>={
  "tool.select":"Select", "tool.line":"Line / polyline", "tool.rectangle":"Rectangle",
  "tool.centerRectangle":"Centre rectangle", "tool.circle":"Circle",
  "tool.polygon":"Regular polygon", "tool.slot":"Slot", "tool.pan":"Pan",
  "feature.extrude":"Extrude / Cut", "edit.delete":"Delete selected",
  "edit.duplicate":"Duplicate selected", "edit.undo":"Undo", "edit.redo":"Redo",
  "file.save":"Save project", "dialog.shortcuts":"Keyboard shortcuts",
  "dialog.grid":"Grid settings"
};
export const DEFAULT_SHORTCUTS:Record<ShortcutAction,string>={
  "tool.select":"KeyV", "tool.line":"KeyL", "tool.rectangle":"KeyR",
  "tool.centerRectangle":"Shift+KeyR", "tool.circle":"KeyC",
  "tool.polygon":"KeyP", "tool.slot":"KeyS", "tool.pan":"KeyM",
  "feature.extrude":"KeyE", "edit.delete":"Delete", "edit.duplicate":"Control+KeyD",
  "edit.undo":"Control+KeyZ", "edit.redo":"Control+Shift+KeyZ",
  "file.save":"Control+KeyS", "dialog.shortcuts":"KeyK", "dialog.grid":"KeyG"
};
export type GridTier={label:string,enabled:boolean,spacing:number,color:string,snap:boolean};
export type Preferences={
  version:1;
  shortcuts:Record<ShortcutAction,string>;
  grid:{tiers:[GridTier,GridTier,GridTier],snapGeometry:boolean};
  polygon:{sides:number,rotation:number};
  navigation: NavigationPreset;
  rememberSurfaces:boolean;
};
const defaultLayers: [GridTier,GridTier,GridTier]=[
  {label:"Fine",enabled:true,spacing:1,color:"#1b3045",snap:false},
  {label:"Working",enabled:true,spacing:5,color:"#254764",snap:true},
  {label:"Major",enabled:true,spacing:25,color:"#355d81",snap:false}
];
export function defaultPreferences():Preferences {
  return {version:1,shortcuts:{...DEFAULT_SHORTCUTS},
    grid:{tiers:defaultLayers.map(x=>({...x})) as [GridTier,GridTier,GridTier],snapGeometry:true},
    polygon:{sides:6,rotation:-90},navigation:"fusion",rememberSurfaces:true};
}
const codes=/^(?:(?:Control|Alt|Shift|Meta)\+)*(?:Key[A-Z]|Digit[0-9]|Arrow(?:Up|Down|Left|Right)|Space|Escape|Delete|Backspace|Enter|Tab|F(?:[1-9]|1[0-2]))$/;
const allowedActions=Object.keys(ACTION_LABELS) as ShortcutAction[];
export function validateShortcut(chord:string):string {
  if(!codes.test(chord))throw new Error("Invalid shortcut: "+chord);
  const parts=chord.split("+");
  const modifiers=parts.slice(0,-1);
  if(new Set(modifiers).size!==modifiers.length)throw new Error("Duplicate shortcut modifiers");
  const order=["Control","Alt","Shift","Meta"];
  return [...order.filter(x=>modifiers.includes(x)),parts.at(-1)!].join("+");
}
export function chordFromEvent(e:Pick<KeyboardEvent,"code"|"ctrlKey"|"altKey"|"shiftKey"|"metaKey">):string {
  const base=e.code;
  return [e.ctrlKey?"Control":null,e.altKey?"Alt":null,e.shiftKey?"Shift":null,e.metaKey?"Meta":null,base]
    .filter((x):x is string=>Boolean(x)).join("+");
}
export function displayShortcut(chord:string):string {
  return chord.replaceAll("Control","Ctrl").replaceAll("Key","").replaceAll("Digit","").replaceAll("Space","Space");
}
function isRecord(x:unknown):x is Record<string,unknown>{
  return typeof x==="object"&&x!==null&&!Array.isArray(x);
}
export function validatePreferences(source:unknown):Preferences {
  if(!isRecord(source)||source.version!==1)throw new Error("Unsupported settings JSON version");
  if(!isRecord(source.shortcuts))throw new Error("Shortcuts object missing");
  const shortcuts={} as Record<ShortcutAction,string>;
  const used=new Set<string>();
  const names=Object.keys(source.shortcuts);
  if(names.some(x=>!allowedActions.includes(x as ShortcutAction)))throw new Error("Unknown shortcut action");
  for(const action of allowedActions){
    const input=source.shortcuts[action];
    if(typeof input!=="string")throw new Error("Shortcut missing for "+action);
    const chord=input===""?"":validateShortcut(input);
    if(chord&&used.has(chord))throw new Error("Duplicate shortcut: "+chord);
    if(chord)used.add(chord);
    shortcuts[action]=chord;
  }
  if(!isRecord(source.grid)||!Array.isArray(source.grid.tiers)||source.grid.tiers.length!==3||
    typeof source.grid.snapGeometry!=="boolean")throw new Error("Settings require three grid tiers");
  const tiers=source.grid.tiers.map((t:unknown,i:number)=>{
    if(!isRecord(t)||typeof t.enabled!=="boolean"||typeof t.snap!=="boolean"||
      typeof t.spacing!=="number"||!Number.isFinite(t.spacing)||t.spacing<0.001||t.spacing>100000||
      typeof t.color!=="string"||!/^#[0-9a-fA-F]{6}$/.test(t.color))throw new Error("Invalid grid tier "+(i+1));
    return {label:defaultLayers[i].label,enabled:t.enabled,spacing:t.spacing,color:t.color.toLowerCase(),snap:t.snap};
  }) as [GridTier,GridTier,GridTier];
  if(!isRecord(source.polygon)||!Number.isInteger(source.polygon.sides)||
    (source.polygon.sides as number)<3||(source.polygon.sides as number)>64||
    typeof source.polygon.rotation!=="number"||!Number.isFinite(source.polygon.rotation)||
    Math.abs(source.polygon.rotation)>36000)throw new Error("Invalid polygon defaults");
  const navigation=source.navigation===undefined?"fusion":source.navigation;
  if(!validNavigationPreset(navigation))throw new Error("Unknown CAD navigation preset");
  const rememberSurfaces=source.rememberSurfaces===undefined?true:source.rememberSurfaces;
  if(typeof rememberSurfaces!=="boolean")throw new Error("Invalid remember-surfaces preference");
  return {version:1,shortcuts,grid:{tiers,snapGeometry:source.grid.snapGeometry},
    polygon:{sides:source.polygon.sides as number,rotation:source.polygon.rotation},
    navigation,rememberSurfaces};
}
export const PREFS_KEY="flatcad.preferences.v1";
export function loadPreferences():Preferences {
  try {const s=localStorage.getItem(PREFS_KEY);return s?validatePreferences(JSON.parse(s)):defaultPreferences();}
  catch{return defaultPreferences();}
}
export function savePreferences(p:Preferences):void {
  localStorage.setItem(PREFS_KEY,JSON.stringify(validatePreferences(p)));
}
