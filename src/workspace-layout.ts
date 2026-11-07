/** Local UI-only split positions, independent of the exact CAD document. */
export type LayoutAxis="horizontal"|"vertical";
export type LayoutState={version:1;main:number;solid:number;docked:boolean};
export const LAYOUT_KEY="flatcad.layout.v1";
export const DEFAULT_LAYOUT:LayoutState={version:1,main:.56,solid:.54,docked:false};
const finite=(n:unknown):n is number=>typeof n==="number"&&Number.isFinite(n);
export function clampSplit(desired:number,extent:number,minimumFirst:number,minimumSecond:number):number{
  if(!Number.isFinite(extent)||extent<=0||!Number.isFinite(desired))
    return .5;
  const available=Math.max(1,extent-8);
  const min=Math.min(.9,minimumFirst/available);
  const max=Math.max(min,Math.min(.9,1-minimumSecond/available));
  return Math.max(min,Math.min(max,desired));
}
export function validateLayout(input:unknown):LayoutState{
  if(!input||typeof input!=="object"||Array.isArray(input))
    throw new Error("Invalid workspace layout");
  const value=input as Record<string,unknown>;
  if(value.version!==1||!finite(value.main)||!finite(value.solid)||
    typeof value.docked!=="boolean"||value.main<=0||value.main>=1||
    value.solid<=0||value.solid>=1)
    throw new Error("Invalid workspace split settings");
  return {version:1,main:value.main,solid:value.solid,docked:value.docked};
}
export function loadLayout():LayoutState{
  try{
    const data=localStorage.getItem(LAYOUT_KEY);
    return data?validateLayout(JSON.parse(data)):{...DEFAULT_LAYOUT};
  }catch{return {...DEFAULT_LAYOUT};}
}
export function saveLayout(layout:LayoutState):void{
  try{localStorage.setItem(LAYOUT_KEY,JSON.stringify(validateLayout(layout)));}
  catch{/* Local storage may be disabled; layout remains usable for this session. */}
}
/** A pointer/keyboard-accessible separator can resize both desktop columns
 * and the equivalent stacked-mobile rows; CSS grid and ResizeObserver perform
 * downstream canvas resizing without recreating camera or sketch state.
 */
export class WorkspaceLayoutController{
  private state:LayoutState;
  private readonly outer:HTMLElement;
  private readonly side:HTMLElement;
  private readonly mainDivider:HTMLElement;
  private readonly sideDivider:HTMLElement;
  constructor(
    outer:HTMLElement,side:HTMLElement,mainDivider:HTMLElement,sideDivider:HTMLElement,
    private readonly dockChange:(docked:boolean)=>void
  ){
    this.outer=outer;this.side=side;this.mainDivider=mainDivider;this.sideDivider=sideDivider;
    this.state=loadLayout();
    this.attach(mainDivider,"main");
    this.attach(sideDivider,"solid");
    this.apply();
    this.dockChange(this.state.docked);
    window.addEventListener("resize",()=>this.apply());
  }
  get docked():boolean{return this.state.docked;}
  setDocked(docked:boolean):void{
    if(this.state.docked===docked)return;
    this.state={...this.state,docked};
    saveLayout(this.state);
    this.dockChange(docked);
    this.apply();
  }
  private isStacked():boolean{return window.matchMedia("(max-width:1100px)").matches;}
  private axes(which:"main"|"solid"):{element:HTMLElement,axis:LayoutAxis,divider:HTMLElement}{
    return which==="main"?
      {element:this.outer,axis:this.isStacked()?"vertical":"horizontal",divider:this.mainDivider}:
      {element:this.side,axis:"vertical",divider:this.sideDivider};
  }
  private limits(which:"main"|"solid",axis:LayoutAxis):[number,number]{
    if(which==="solid")return [155,115];
    return axis==="horizontal"?[300,300]:[230,230];
  }
  private apply():void{
    for(const which of ["main","solid"] as const){
      const {element,axis,divider}=this.axes(which);
      const extent=axis==="horizontal"?element.clientWidth:element.clientHeight;
      const [low,high]=this.limits(which,axis);
      const ratio=clampSplit(this.state[which],extent,low,high);
      element.style.setProperty(which==="main"?"--main-split":"--solid-split",
        (ratio*100).toFixed(5)+"%");
      divider.setAttribute("aria-orientation",axis==="horizontal"?"vertical":"horizontal");
      divider.setAttribute("aria-valuenow",String(Math.round(ratio*100)));
      divider.dataset.axis=axis;
      divider.dataset.ratio=String(ratio);
    }
  }
  private update(which:"main"|"solid",next:number):void{
    const {element,axis}=this.axes(which);
    const extent=axis==="horizontal"?element.clientWidth:element.clientHeight;
    const [minFirst,minSecond]=this.limits(which,axis);
    const clamped=clampSplit(next,extent,minFirst,minSecond);
    this.state={...this.state,[which]:clamped};
    this.apply();
    saveLayout(this.state);
  }
  private attach(divider:HTMLElement,which:"main"|"solid"):void{
    divider.addEventListener("pointerdown",event=>{
      if(event.button!==0)return;
      event.preventDefault();
      divider.setPointerCapture(event.pointerId);
      const {element,axis}=this.axes(which);
      const box=element.getBoundingClientRect();
      const position=(e:PointerEvent)=>axis==="horizontal"?e.clientX-box.left:e.clientY-box.top;
      const available=axis==="horizontal"?box.width:box.height;
      const onMove=(e:PointerEvent)=>{
        if(e.pointerId!==event.pointerId)return;
        this.update(which,(position(e)-4)/Math.max(1,available-8));
      };
      const finish=(e:PointerEvent)=>{
        if(e.pointerId!==event.pointerId)return;
        divider.removeEventListener("pointermove",onMove);
        divider.removeEventListener("pointerup",finish);
        divider.removeEventListener("pointercancel",finish);
        if(divider.hasPointerCapture(e.pointerId))divider.releasePointerCapture(e.pointerId);
      };
      divider.addEventListener("pointermove",onMove);
      divider.addEventListener("pointerup",finish);
      divider.addEventListener("pointercancel",finish);
    });
    divider.addEventListener("keydown",event=>{
      if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End"].includes(event.key))return;
      event.preventDefault();
      const {axis}=this.axes(which);
      const minus=axis==="horizontal"?"ArrowLeft":"ArrowUp";
      const plus=axis==="horizontal"?"ArrowRight":"ArrowDown";
      const previous=this.state[which];
      const ratio=event.key==="Home"?.1:event.key==="End"?.9:
        event.key===minus?previous-.035:event.key===plus?previous+.035:previous;
      this.update(which,ratio);
    });
    divider.addEventListener("dblclick",()=>this.update(which,DEFAULT_LAYOUT[which]));
  }
}
