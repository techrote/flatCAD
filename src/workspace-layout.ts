/** UI-only panel geometry and ordering, independent of exact CAD state.
 *  Legacy layout v1 JSON migrates transparently to the expanded contract.
 */
export type LayoutAxis="horizontal"|"vertical";
export type TileId="sketch"|"solid"|"properties";
export type TileMode="split"|"columns"|"float";
export type LayoutState={
  version:1;main:number;solid:number;docked:boolean;
  tileMode:TileMode;tileOrder:[TileId,TileId,TileId];dockX:number;
  floatX:number;floatY:number;
};
export const LAYOUT_KEY="flatcad.layout.v1";
export const DEFAULT_LAYOUT:LayoutState={
  version:1,main:.56,solid:.54,docked:false,tileMode:"split",
  tileOrder:["sketch","properties","solid"],dockX:.5,floatX:.58,floatY:.17
};
const TILE_IDS:TileId[]=["sketch","solid","properties"];
const finite=(n:unknown):n is number=>typeof n==="number"&&Number.isFinite(n);
export function validTileOrder(items:unknown):items is [TileId,TileId,TileId]{
  return Array.isArray(items)&&items.length===3&&
    TILE_IDS.every(id=>items.includes(id))&&new Set(items).size===3;
}
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
  const tileMode=value.tileMode===undefined?"split":value.tileMode;
  const tileOrder=value.tileOrder===undefined?DEFAULT_LAYOUT.tileOrder:value.tileOrder;
  const dockX=value.dockX===undefined?DEFAULT_LAYOUT.dockX:value.dockX;
  const floatX=value.floatX===undefined?DEFAULT_LAYOUT.floatX:value.floatX;
  const floatY=value.floatY===undefined?DEFAULT_LAYOUT.floatY:value.floatY;
  if((tileMode!=="split"&&tileMode!=="columns"&&tileMode!=="float")||!validTileOrder(tileOrder)||
    !finite(dockX)||dockX<0||dockX>1||
    !finite(floatX)||floatX<0||floatX>1||!finite(floatY)||floatY<0||floatY>1)
    throw new Error("Invalid workspace panel arrangement");
  return {version:1,main:value.main,solid:value.solid,
    docked:value.docked,tileMode,tileOrder:[...tileOrder],dockX,floatX,floatY};
}
export function loadLayout():LayoutState{
  try{
    const data=localStorage.getItem(LAYOUT_KEY);
    return data?validateLayout(JSON.parse(data)):{...DEFAULT_LAYOUT,tileOrder:[...DEFAULT_LAYOUT.tileOrder]};
  }catch{return {...DEFAULT_LAYOUT,tileOrder:[...DEFAULT_LAYOUT.tileOrder]};}
}
export function saveLayout(layout:LayoutState):void{
  try{localStorage.setItem(LAYOUT_KEY,JSON.stringify(validateLayout(layout)));}
  catch{/* Settings remain usable for this browser session. */}
}
export class WorkspaceLayoutController{
  private state:LayoutState;
  constructor(
    private readonly outer:HTMLElement,
    private readonly side:HTMLElement,
    private readonly mainDivider:HTMLElement,
    private readonly sideDivider:HTMLElement,
    private readonly dockChange:(docked:boolean)=>void,
    private readonly onLayoutChange:()=>void=()=>{}
  ){
    this.state=loadLayout();
    this.attach(mainDivider,"main");
    this.attach(sideDivider,"solid");
    this.apply();
    this.dockChange(this.state.docked);
    window.addEventListener("resize",()=>this.apply());
  }
  get docked():boolean{return this.state.docked;}
  get dockX():number{return this.state.dockX;}
  get tileMode():TileMode{return this.state.tileMode;}
  get floatingPosition():{x:number;y:number}{return {x:this.state.floatX,y:this.state.floatY};}
  get tileOrder():[TileId,TileId,TileId]{return [...this.state.tileOrder];}
  setDocked(docked:boolean):void{
    if(this.state.docked===docked)return;
    this.commit({...this.state,docked});
    this.dockChange(docked);
    this.apply();
  }
  setDockX(position:number):void{
    if(!Number.isFinite(position))return;
    this.commit({...this.state,dockX:Math.max(0,Math.min(1,position))});
  }
  setTileMode(mode:TileMode):void{
    if(mode!==this.state.tileMode)this.commit({...this.state,tileMode:mode});
  }
  setFloatPosition(x:number,y:number):void{
    if(!Number.isFinite(x)||!Number.isFinite(y))return;
    const floatX=Math.max(0,Math.min(1,x)),floatY=Math.max(0,Math.min(1,y));
    if(Math.abs(this.state.floatX-floatX)+Math.abs(this.state.floatY-floatY)<1e-5)return;
    this.commit({...this.state,floatX,floatY});
  }
  setTileOrder(order:TileId[]):void{
    if(!validTileOrder(order))throw new Error("Invalid tile order");
    this.commit({...this.state,tileOrder:[...order]});
  }
  resetArrangement():void{
    this.commit({...this.state,tileMode:DEFAULT_LAYOUT.tileMode,
      tileOrder:[...DEFAULT_LAYOUT.tileOrder],main:DEFAULT_LAYOUT.main,
      solid:DEFAULT_LAYOUT.solid,dockX:DEFAULT_LAYOUT.dockX,
      floatX:DEFAULT_LAYOUT.floatX,floatY:DEFAULT_LAYOUT.floatY});
  }
  private commit(next:LayoutState):void{
    this.state=validateLayout(next);
    saveLayout(this.state);
    this.apply();
    this.onLayoutChange();
  }
  /** Landscape workbenches favour side-by-side authoring and dedicate the
   *  full lower edge to history; narrow portrait stays vertically stacked. */
  private isStacked():boolean{
    return window.matchMedia(
      "(max-width:779px), (max-width:1100px) and (orientation:portrait)"
    ).matches;
  }
  private isThree():boolean{return this.state.tileMode==="columns"&&!this.isStacked();}
  private axes(which:"main"|"solid"):{element:HTMLElement,axis:LayoutAxis,divider:HTMLElement}{
    if(this.isThree())return {element:this.outer,axis:"horizontal",
      divider:which==="main"?this.mainDivider:this.sideDivider};
    return which==="main"?
      {element:this.outer,axis:this.isStacked()?"vertical":"horizontal",divider:this.mainDivider}:
      {element:this.side,axis:"vertical",divider:this.sideDivider};
  }
  private limits(which:"main"|"solid",axis:LayoutAxis):[number,number]{
    if(this.isThree())return which==="main"?[220,380]:[180,220];
    if(which==="solid")return [155,115];
    return axis==="horizontal"?[300,300]:[230,230];
  }
  private apply():void{
    const three=this.isThree();
    this.outer.classList.toggle("three-tiles",three);
    this.outer.classList.toggle("float-solid",this.state.tileMode==="float");
    this.outer.dataset.tileMode=three?"columns":this.state.tileMode;
    this.outer.dataset.tileOrder=this.state.tileOrder.join(",");
    for(const [i,id] of this.state.tileOrder.entries())
      this.outer.style.setProperty("--tile-"+id+"-col",String(i*2+1));
    if(three){
      const extent=Math.max(1,this.outer.clientWidth-16);
      const first=clampSplit(this.state.main,extent,220,400);
      const available=extent*(1-first);
      const second=clampSplit(this.state.solid,available,180,220);
      this.outer.style.setProperty("--three-first",String(first*100)+"%");
      this.outer.style.setProperty("--three-second",String((1-first)*second*100)+"%");
    }
    for(const which of ["main","solid"] as const){
      const {element,axis,divider}=this.axes(which);
      const extent=axis==="horizontal"?element.clientWidth:element.clientHeight;
      const [low,high]=this.limits(which,axis);
      const ratio=clampSplit(this.state[which],extent,low,high);
      if(!three)
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
    let ratio=next;
    if(this.isThree()&&which==="solid"){
      const available=Math.max(1,extent-16);
      const first=clampSplit(this.state.main,available,220,400);
      ratio=(next-first)/Math.max(.01,1-first);
    }
    const clamped=clampSplit(ratio,extent,minFirst,minSecond);
    this.commit({...this.state,[which]:clamped});
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
