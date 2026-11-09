/** UI-only floating Sketch toolbar layer, drag grip and magnetic edge docking.
 * No CAD geometry, camera or render-target ownership lives here.
 */
export const FLOAT_TOOLBAR_KEY="flatcad.tool-rail.v1";
export type ToolbarSide="left"|"right"|null;
export type ToolbarPose={x:number;y:number;side:ToolbarSide};
export type ToolbarRect={left:number;top:number;width:number;height:number};
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export function validToolbarPose(raw:unknown):ToolbarPose{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("Invalid toolbar pose");
  const r=raw as Record<string,unknown>;
  if(typeof r.x!=="number"||!Number.isFinite(r.x)||
    typeof r.y!=="number"||!Number.isFinite(r.y)||
    r.x<0||r.x>10000||r.y<0||r.y>10000||
    (r.side!==null&&r.side!=="left"&&r.side!=="right"))
    throw Error("Invalid toolbar pose");
  return {x:r.x,y:r.y,side:r.side};
}
export function toolbarSnap(x:number,y:number,width:number,height:number,
  sketch:ToolbarRect,threshold=30):ToolbarPose{
  const left=sketch.left+8,right=sketch.left+sketch.width-width-8;
  const inside= y+height>sketch.top-25&&y<sketch.top+sketch.height+25;
  const side:ToolbarSide=!inside?null:
    Math.abs(x-left)<=threshold?"left":
      Math.abs(x-right)<=threshold?"right":null;
  if(!side)return {x,y,side:null};
  const maxY=sketch.top+sketch.height-height-4;
  return {x:side==="left"?left:right,
    y:clamp(y,sketch.top+4,Math.max(sketch.top+4,maxY)),side};
}
function loadPose():ToolbarPose|null{
  try{const s=localStorage.getItem(FLOAT_TOOLBAR_KEY);
    return s?validToolbarPose(JSON.parse(s)):null;}
  catch{return null;}
}
export class FloatingSketchToolbar{
  private readonly railLayer:HTMLDivElement;
  private readonly gripLayer:HTMLDivElement;
  private readonly slot:HTMLSpanElement;
  private readonly savedGrip:HTMLButtonElement;
  private pose:ToolbarPose|null=loadPose();
  private docked=true;
  private raf:number|null=null;
  private dragged=false;
  constructor(private readonly rail:HTMLElement,
    private readonly grip:HTMLButtonElement,
    private readonly sketch:HTMLElement,
    private readonly dockSlot:HTMLElement,
    private readonly onTitlebarDock:()=>void){
    const shell=document.querySelector<HTMLElement>(".shell");
    if(!shell)throw Error("Floating toolbar requires workspace shell");
    const layer=document.createElement("div");
    layer.className="floating-toolbar-overlay";
    const gripLayer=document.createElement("div");
    gripLayer.className="floating-toolbar-grip-layer";
    shell.append(layer,gripLayer);
    this.railLayer=layer;this.gripLayer=gripLayer;
    const slot=document.createElement("span");
    slot.className="tool-rail-grip-slot";slot.setAttribute("aria-hidden","true");
    rail.prepend(slot);this.slot=slot;
    gripLayer.append(grip);
    grip.dataset.toolbarDragHandle="";
    grip.setAttribute("aria-label","Drag Sketch toolbar; click to anchor in titlebar");
    grip.title="Drag Sketch tools · snap near left/right Sketch edge · click to anchor in titlebar";
    this.savedGrip=grip;
    grip.addEventListener("pointerdown",event=>this.startDrag(event));
    grip.addEventListener("keydown",event=>{
      const delta:Record<string,[number,number]>={
        ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
      const d=delta[event.key];
      if(!d||this.docked)return;
      event.preventDefault();event.stopPropagation();
      const p=this.position();
      this.setPosition(p.x+d[0]*(event.shiftKey?1:10),
        p.y+d[1]*(event.shiftKey?1:10),true);
    });
    grip.addEventListener("click",event=>{
      if(this.dragged){this.dragged=false;event.preventDefault();event.stopPropagation();return;}
      if(!this.docked)this.onTitlebarDock();
    });
    const refresh=()=>this.requestPosition();
    window.addEventListener("resize",refresh);
    new ResizeObserver(refresh).observe(sketch);
  }
  setDocked(docked:boolean):void{
    this.docked=docked;
    if(docked){
      this.dockSlot.append(this.rail);
      this.savedGrip.hidden=true;
      this.slot.hidden=true;
    }else{
      this.railLayer.append(this.rail);
      this.savedGrip.hidden=false;
      this.slot.hidden=false;
      this.requestPosition();
    }
  }
  onLayout():void{this.requestPosition();}
  private requestPosition():void{
    if(this.raf!==null||this.docked)return;
    this.raf=requestAnimationFrame(()=>{this.raf=null;if(!this.docked)this.position();});
  }
  private available(){return {
    width:Math.max(30,this.rail.offsetWidth),height:Math.max(30,this.rail.offsetHeight)
  };}
  private clip(x:number,y:number):{x:number;y:number}{
    const size=this.available();
    return {x:clamp(x,4,Math.max(4,innerWidth-size.width-4)),
      y:clamp(y,64,Math.max(64,innerHeight-size.height-4))};
  }
  private position():ToolbarPose{
    if(!this.pose){
      const rect=this.sketch.getBoundingClientRect(),size=this.available();
      this.pose={x:rect.left+8,y:rect.top+(rect.height-size.height)/2,side:"left"};
    }
    const size=this.available();
    if(this.pose.side){
      const r=this.sketch.getBoundingClientRect();
      const sideX=this.pose.side==="left"?r.left+8:r.right-size.width-8;
      const snap=toolbarSnap(sideX,this.pose.y,size.width,size.height,
        {left:r.left,top:r.top,width:r.width,height:r.height},1);
      this.pose={...snap,side:this.pose.side};
    }
    const p=this.clip(this.pose.x,this.pose.y);
    this.pose={...this.pose,...p};
    this.rail.style.left=p.x+"px";this.rail.style.top=p.y+"px";
    this.rail.dataset.snapSide=this.pose.side??"free";
    this.savedGrip.style.left=p.x+5+"px";this.savedGrip.style.top=p.y+5+"px";
    return this.pose;
  }
  private setPosition(x:number,y:number,persist:boolean):void{
    const size=this.available(),rect=this.sketch.getBoundingClientRect();
    const clipped=this.clip(x,y);
    this.pose=toolbarSnap(clipped.x,clipped.y,size.width,size.height,
      {left:rect.left,top:rect.top,width:rect.width,height:rect.height});
    this.position();
    if(persist)this.save();
  }
  private save():void{
    if(!this.pose)return;
    try{localStorage.setItem(FLOAT_TOOLBAR_KEY,JSON.stringify(
      validToolbarPose(this.pose)));}
    catch{/* UI positioning must never block CAD work */ }
  }
  private startDrag(event:PointerEvent):void{
    if(this.docked||event.button!==0)return;
    const initial=this.position(),sx=event.clientX,sy=event.clientY;
    const id=event.pointerId;
    let moved=false;
    this.grip.setPointerCapture(id);
    const move=(e:PointerEvent)=>{
      if(e.pointerId!==id)return;
      if(Math.hypot(e.clientX-sx,e.clientY-sy)>4)moved=true;
      if(!moved)return;
      this.setPosition(initial.x+e.clientX-sx,initial.y+e.clientY-sy,false);
      e.preventDefault();e.stopPropagation();
    };
    const finish=(e:PointerEvent)=>{
      if(e.pointerId!==id)return;
      this.grip.removeEventListener("pointermove",move);
      this.grip.removeEventListener("pointerup",finish);
      this.grip.removeEventListener("pointercancel",finish);
      if(this.grip.hasPointerCapture(id))this.grip.releasePointerCapture(id);
      if(moved)this.save();
      this.dragged=moved;
      requestAnimationFrame(()=>{this.dragged=false;});
      e.preventDefault();e.stopPropagation();
    };
    this.grip.addEventListener("pointermove",move);
    this.grip.addEventListener("pointerup",finish);
    this.grip.addEventListener("pointercancel",finish);
    event.preventDefault();event.stopPropagation();
  }
}
