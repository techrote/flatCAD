import { newId, type CadDocument, type Point2, type Profile } from "./model";
import { centre, distance, handles, hit, isClosed, moveHandle, outline, snapPoints, translate } from "./geometry";
import type { Preferences } from "./preferences";

export type SketchTool =
  | "select" | "line" | "rectangle" | "centerRectangle" | "circle" | "polygon" | "slot" | "pan" | "extrude";
type DrawTool = "rectangle" | "centerRectangle" | "circle" | "polygon" | "slot";
type Gesture =
  | { kind:"draw"; tool:DrawTool; from:Point2; to:Point2; shift:boolean }
  | { kind:"pan"; from:Point2; origin:Point2 }
  | { kind:"move"; original:Profile; from:Point2; preview:Profile; duplicate:boolean }
  | { kind:"handle"; original:Profile; index:number; preview:Profile }
  | { kind:"depth"; startY:number; startDepth:number };
export type SketchEvents = {
  onCreate(profile:Profile):void;
  onEdit(profile:Profile):void;
  onSelect(id:string|null):void;
  onExtrude(id:string,at:Point2):void;
  onExtrudeDepth(depth:number):void;
  onViewChange(zoom:number):void;
  onStatus(text:string):void;
};

/** CAD values are persisted only after a completed pointer gesture. */
export class SketchCanvas {
  private readonly ctx:CanvasRenderingContext2D;
  private readonly observer:ResizeObserver;
  private doc:CadDocument;
  private prefs:Preferences;
  private selected:string|null=null;
  private hover:string|null=null;
  private tool:SketchTool="select";
  private zoom=4;
  private panX=0;
  private panY=0;
  private width=1;
  private height=1;
  private mounted=false;
  private gesture:Gesture|null=null;
  private linePoints:Point2[]=[];
  private lineCursor:Point2|null=null;
  private highlightedSnap:Point2|null=null;
  private extrude:{id:string,depth:number}|null=null;
  private slotRadius=3;

  constructor(
    private readonly canvas:HTMLCanvasElement,
    initial:CadDocument,
    prefs:Preferences,
    private readonly events:SketchEvents
  ){
    const ctx=canvas.getContext("2d");
    if(!ctx)throw new Error("Canvas 2D is not supported");
    this.ctx=ctx;
    this.doc=initial;this.prefs=prefs;
    this.observer=new ResizeObserver(()=>this.resize());
    this.observer.observe(canvas);this.resize();
    canvas.addEventListener("pointerdown",e=>this.pointerDown(e));
    canvas.addEventListener("pointermove",e=>this.pointerMove(e));
    canvas.addEventListener("pointerup",e=>this.pointerUp(e));
    canvas.addEventListener("pointercancel",()=>{this.gesture=null;this.draw();});
    canvas.addEventListener("wheel",e=>this.wheel(e),{passive:false});
    canvas.addEventListener("contextmenu",e=>e.preventDefault());
  }
  setDocument(doc:CadDocument):void {this.doc=doc;this.draw();}
  setPreferences(prefs:Preferences):void {this.prefs=prefs;this.draw();}
  setSelected(id:string|null):void {this.selected=id;this.draw();}
  setTool(tool:SketchTool):void {
    if(this.tool==="line"&&tool!=="line")this.finishLine(false);
    this.tool=tool;this.gesture=null;
    this.canvas.style.cursor=tool==="pan"?"grab":tool==="select"?"default":"crosshair";
    this.draw();
  }
  setSlotRadius(r:number):void {if(Number.isFinite(r)&&r>0)this.slotRadius=r;}
  setExtrudeHandle(handle:{id:string,depth:number}|null):void {this.extrude=handle;this.draw();}
  getZoom():number{return this.zoom;}
  getSelectedPoint():Point2|null{
    const profile=this.doc.profiles.find(p=>p.id===this.selected);
    return profile?this.toScreen(centre(profile)):null;
  }
  dispose():void {this.observer.disconnect();}
  hasPendingLine():boolean{return this.linePoints.length>0;}
  cancelLine():void {this.linePoints=[];this.lineCursor=null;this.draw();}
  removeLastLinePoint():void {this.linePoints.pop();this.draw();}
  finishLine(close:boolean):boolean {
    if(this.linePoints.length<2){this.cancelLine();return false;}
    if(close&&this.linePoints.length<3){this.events.onStatus("Closed outlines need three or more points");return false;}
    const points=this.linePoints;
    this.linePoints=[];this.lineCursor=null;
    try{this.events.onCreate({id:newId("path"),kind:"path",points,closed:close});}
    finally{this.draw();}
    return true;
  }
  private resize():void {
    const rect=this.canvas.getBoundingClientRect();
    this.width=Math.max(1,rect.width);this.height=Math.max(1,rect.height);
    const dpi=Math.min(3,devicePixelRatio||1);
    this.canvas.width=Math.round(this.width*dpi);this.canvas.height=Math.round(this.height*dpi);
    this.ctx.setTransform(dpi,0,0,dpi,0,0);
    if(!this.mounted){this.panX=this.width/2;this.panY=this.height/2;this.mounted=true;}
    this.draw();
  }
  private screen(event:PointerEvent|WheelEvent):Point2 {
    const rect=this.canvas.getBoundingClientRect();
    return {x:event.clientX-rect.left,y:event.clientY-rect.top};
  }
  private world(point:Point2):Point2 {
    return {x:(point.x-this.panX)/this.zoom,y:(this.panY-point.y)/this.zoom};
  }
  private toScreen(p:Point2):Point2 {
    return {x:this.panX+p.x*this.zoom,y:this.panY-p.y*this.zoom};
  }
  private maybeSnap(raw:Point2,event:{altKey?:boolean}):Point2 {
    this.highlightedSnap=null;
    if(event.altKey)return raw;
    const maxDist=10/this.zoom;
    if(this.prefs.grid.snapGeometry){
      let target:Point2|null=null,minimum=maxDist;
      for(const profile of this.doc.profiles){
        for(const point of snapPoints(profile)){
          const d=distance(raw,point);
          if(d<minimum){minimum=d;target=point;}
        }
      }
      if(target){this.highlightedSnap=target;return {...target};}
    }
    let best=raw,nearest=Infinity;
    for(const tier of this.prefs.grid.tiers){
      if(!tier.enabled||!tier.snap)continue;
      const p={x:Math.round(raw.x/tier.spacing)*tier.spacing,
        y:Math.round(raw.y/tier.spacing)*tier.spacing};
      const d=distance(raw,p);
      if(d<nearest){best=p;nearest=d;}
    }
    if(nearest<Infinity)this.highlightedSnap=best;
    return best;
  }
  private hitProfile(world:Point2):string|null {
    for(let i=this.doc.profiles.length-1;i>=0;i--)
      if(hit(this.doc.profiles[i],world,7/this.zoom))return this.doc.profiles[i].id;
    return null;
  }
  private hitHandle(screen:Point2):number|null {
    const selected=this.doc.profiles.find(p=>p.id===this.selected);
    if(!selected)return null;
    const points=handles(selected);
    for(let i=0;i<points.length;i++){
      if(distance(this.toScreen(points[i].point),screen)<=11)return i;
    }
    return null;
  }
  private arrowScreen():Point2|null {
    if(!this.extrude||this.selected!==this.extrude.id)return null;
    const anchor=this.getSelectedPoint();
    return anchor?{x:anchor.x+22,y:anchor.y-Math.max(35,Math.min(130,this.extrude.depth*this.zoom))}:null;
  }
  private pointerDown(event:PointerEvent):void {
    if(event.button!==0&&event.button!==1)return;
    const point=this.screen(event);
    if(this.tool==="pan"||event.button===1){
      this.gesture={kind:"pan",from:point,origin:{x:this.panX,y:this.panY}};
    }else if(this.extrude&&this.arrowScreen()&&distance(point,this.arrowScreen()!)<=16){
      this.gesture={kind:"depth",startY:point.y,startDepth:this.extrude.depth};
    }else if(this.tool==="line"){
      const w=this.maybeSnap(this.world(point),event);
      if(this.linePoints.length>=3&&distance(this.toScreen(this.linePoints[0]),point)<12){
        this.finishLine(true);
      }else if(event.detail>=2&&this.linePoints.length>=2){
        this.finishLine(false);
      }else if(!this.linePoints.length||distance(w,this.linePoints.at(-1)!)>1e-8){
        this.linePoints.push(w);this.lineCursor=w;
        this.events.onStatus("Click vertices · click start to close · Enter finish open · Esc cancel");
      }
      this.draw();return;
    }else if(this.tool==="extrude"){
      const id=this.hitProfile(this.world(point));
      this.events.onSelect(id);
      if(id)this.events.onExtrude(id,point);
      else this.events.onStatus("Click a closed profile to extrude or cut");
      this.draw();return;
    }else if(this.tool==="select"){
      const index=this.hitHandle(point);
      const profile=this.doc.profiles.find(p=>p.id===this.selected);
      if(index!==null&&profile){
        this.gesture={kind:"handle",original:profile,index,preview:profile};
      }else{
        const id=this.hitProfile(this.world(point));
        this.events.onSelect(id);
        const found=this.doc.profiles.find(p=>p.id===id);
        if(found)this.gesture={kind:"move",original:found,from:this.world(point),preview:found,duplicate:event.altKey};
      }
    }else{
      const from=this.maybeSnap(this.world(point),event);
      this.gesture={kind:"draw",tool:this.tool,from,to:from,shift:event.shiftKey};
    }
    if(this.gesture)this.canvas.setPointerCapture(event.pointerId);
    this.draw();
  }
  private pointerMove(event:PointerEvent):void {
    const screen=this.screen(event);
    if(this.tool==="line"&&this.linePoints.length)
      this.lineCursor=this.maybeSnap(this.world(screen),event);
    if(!this.gesture){
      const hovered=this.hitProfile(this.world(screen));
      if(hovered!==this.hover||this.tool==="line"){this.hover=hovered;this.draw();}
      return;
    }
    const g=this.gesture;
    if(g.kind==="pan"){
      this.panX=g.origin.x+screen.x-g.from.x;this.panY=g.origin.y+screen.y-g.from.y;
    }else if(g.kind==="depth"){
      const delta=(g.startY-screen.y)/this.zoom;
      const depth=Math.max(.1,Math.round((g.startDepth+delta)*10)/10);
      if(this.extrude)this.extrude={...this.extrude,depth};
      this.events.onExtrudeDepth(depth);
    }else{
      const world=this.maybeSnap(this.world(screen),event);
      if(g.kind==="draw"){g.to=world;g.shift=event.shiftKey;}
      else if(g.kind==="move"){
        let dx=world.x-g.from.x,dy=world.y-g.from.y;
        if(event.shiftKey){if(Math.abs(dx)>=Math.abs(dy))dy=0;else dx=0;}
        g.preview=translate(g.original,dx,dy);
      }else if(g.kind==="handle")g.preview=moveHandle(g.original,g.index,world,event.shiftKey);
    }
    this.draw();
  }
  private pointerUp(event:PointerEvent):void {
    const g=this.gesture;
    if(!g)return;
    if(this.canvas.hasPointerCapture(event.pointerId))this.canvas.releasePointerCapture(event.pointerId);
    this.gesture=null;
    try{
      if(g.kind==="draw"){
        const to=this.maybeSnap(this.world(this.screen(event)),event);
        const dx=to.x-g.from.x,dy=to.y-g.from.y;
        if(g.tool==="rectangle"||g.tool==="centerRectangle"){
          let width=Math.abs(dx),height=Math.abs(dy);
          if(g.shift||event.shiftKey){const s=Math.max(width,height);width=s;height=s;}
          if(width>1e-6&&height>1e-6){
            const centred=g.tool==="centerRectangle";
            this.events.onCreate({id:newId("rect"),kind:"rectangle",
              x:centred?g.from.x-width:Math.min(g.from.x,g.from.x+Math.sign(dx||1)*width),
              y:centred?g.from.y-height:Math.min(g.from.y,g.from.y+Math.sign(dy||1)*height),
              width:centred?width*2:width,height:centred?height*2:height});
          }
        }else if(g.tool==="circle"){
          const radius=distance(g.from,to);
          if(radius>1e-6)this.events.onCreate({id:newId("circle"),kind:"circle",x:g.from.x,y:g.from.y,radius});
        }else if(g.tool==="polygon"){
          const radius=distance(g.from,to);
          if(radius>1e-6)this.events.onCreate({id:newId("polygon"),kind:"polygon",
            x:g.from.x,y:g.from.y,radius,sides:this.prefs.polygon.sides,rotation:this.prefs.polygon.rotation});
        }else if(g.tool==="slot"){
          if(distance(g.from,to)>1e-6)this.events.onCreate({
            id:newId("slot"),kind:"slot",x1:g.from.x,y1:g.from.y,x2:to.x,y2:to.y,radius:this.slotRadius});
        }
      }else if(g.kind==="move"||g.kind==="handle"){
        if(JSON.stringify(g.preview)!==JSON.stringify(g.original)){
          if(g.kind==="move"&&g.duplicate)this.events.onCreate({...g.preview,id:newId("copy")});
          else this.events.onEdit(g.preview);
        }
      }
    }finally{this.draw();}
  }
  private wheel(event:WheelEvent):void {
    event.preventDefault();
    const point=this.screen(event);
    const next=Math.max(.15,Math.min(200,this.zoom*Math.exp(-event.deltaY*.001)));
    const scale=next/this.zoom;
    this.panX=point.x-(point.x-this.panX)*scale;
    this.panY=point.y-(point.y-this.panY)*scale;
    this.zoom=next;
    this.events.onViewChange(this.zoom);this.draw();
  }
  private drawGrid():void {
    const ctx=this.ctx;
    const min=this.world({x:0,y:this.height}),max=this.world({x:this.width,y:0});
    for(const tier of this.prefs.grid.tiers){
      if(!tier.enabled||tier.spacing*this.zoom<8)continue;
      const nx=(max.x-min.x)/tier.spacing,ny=(max.y-min.y)/tier.spacing;
      if(nx>500||ny>500)continue;
      ctx.beginPath();ctx.lineWidth=1;ctx.strokeStyle=tier.color;
      for(let k=Math.ceil(min.x/tier.spacing);k*tier.spacing<=max.x;k++){
        const x=Math.round(this.toScreen({x:k*tier.spacing,y:0}).x)+.5;
        ctx.moveTo(x,0);ctx.lineTo(x,this.height);
      }
      for(let k=Math.ceil(min.y/tier.spacing);k*tier.spacing<=max.y;k++){
        const y=Math.round(this.toScreen({x:0,y:k*tier.spacing}).y)+.5;
        ctx.moveTo(0,y);ctx.lineTo(this.width,y);
      }
      ctx.stroke();
    }
    ctx.lineWidth=1.4;ctx.strokeStyle="#466782";ctx.beginPath();
    ctx.moveTo(this.panX,0);ctx.lineTo(this.panX,this.height);
    ctx.moveTo(0,this.panY);ctx.lineTo(this.width,this.panY);ctx.stroke();
  }
  private paintShape(p:Profile,selected=false,hovered=false,draft=false):void {
    const ctx=this.ctx,pts=outline(p);
    if(!pts.length)return;
    const first=this.toScreen(pts[0]);
    ctx.beginPath();ctx.moveTo(first.x,first.y);
    for(const pt of pts.slice(1)){const v=this.toScreen(pt);ctx.lineTo(v.x,v.y);}
    if(isClosed(p))ctx.closePath();
    ctx.fillStyle=selected?"#f0af5e20":hovered?"#76baf52b":"#64aaf519";
    ctx.strokeStyle=draft?"#e1ad67":selected?"#eeb76c":hovered?"#b7dcff":"#6caaf1";
    ctx.lineWidth=selected?2.3:1.6;
    ctx.setLineDash(draft?[5,4]:p.kind==="path"&&!p.closed?[8,4]:[]);
    if(isClosed(p))ctx.fill();
    ctx.stroke();ctx.setLineDash([]);
    if(selected&&!draft){
      for(const h of handles(p)){
        const v=this.toScreen(h.point);
        ctx.fillStyle="#f9c889";ctx.strokeStyle="#61411e";ctx.lineWidth=1;
        ctx.fillRect(v.x-4,v.y-4,8,8);ctx.strokeRect(v.x-4,v.y-4,8,8);
      }
    }
    if(p.kind!=="path"){
      const c=this.toScreen(centre(p));
      const label=p.kind==="rectangle"?fmt(p.width)+" × "+fmt(p.height)
        :p.kind==="circle"?"Ø "+fmt(2*p.radius)
        :p.kind==="polygon"?p.sides+" sides · R"+fmt(p.radius)
        :"Slot · R"+fmt(p.radius);
      ctx.font="11px ui-monospace, monospace";ctx.textAlign="center";
      ctx.fillStyle=selected?"#ffd6a2":"#bddaf5";ctx.fillText(label,c.x,c.y+4);
    }
  }
  private paintDraft(g:Extract<Gesture,{kind:"draw"}>):void {
    const dx=g.to.x-g.from.x,dy=g.to.y-g.from.y;
    let p:Profile|null=null;
    if(g.tool==="rectangle"||g.tool==="centerRectangle"){
      let w=Math.abs(dx),h=Math.abs(dy);
      if(g.shift){const s=Math.max(w,h);w=s;h=s;}
      const centered=g.tool==="centerRectangle";
      p={id:"draft",kind:"rectangle",
        x:centered?g.from.x-w:Math.min(g.from.x,g.from.x+Math.sign(dx||1)*w),
        y:centered?g.from.y-h:Math.min(g.from.y,g.from.y+Math.sign(dy||1)*h),
        width:centered?2*w:w,height:centered?2*h:h};
    }else if(g.tool==="circle")p={id:"draft",kind:"circle",x:g.from.x,y:g.from.y,radius:distance(g.from,g.to)};
    else if(g.tool==="polygon")p={id:"draft",kind:"polygon",x:g.from.x,y:g.from.y,radius:distance(g.from,g.to),
      sides:this.prefs.polygon.sides,rotation:this.prefs.polygon.rotation};
    else if(distance(g.from,g.to)>1e-7)p={id:"draft",kind:"slot",x1:g.from.x,y1:g.from.y,
      x2:g.to.x,y2:g.to.y,radius:this.slotRadius};
    if(p&&outline(p).every(pt=>Number.isFinite(pt.x)&&Number.isFinite(pt.y)))this.paintShape(p,false,false,true);
    const screen=this.toScreen(g.to);
    this.ctx.font="12px ui-monospace,monospace";this.ctx.textAlign="left";this.ctx.fillStyle="#ffc786";
    this.ctx.fillText((g.tool==="rectangle"||g.tool==="centerRectangle"
      ?fmt(Math.abs(dx))+" × "+fmt(Math.abs(dy))+" mm"
      :fmt(distance(g.from,g.to))+" mm"),screen.x+12,screen.y-12);
  }
  private paintLine():void {
    if(!this.linePoints.length)return;
    const ctx=this.ctx,first=this.toScreen(this.linePoints[0]);
    ctx.beginPath();ctx.moveTo(first.x,first.y);
    for(const point of this.linePoints.slice(1)){
      const v=this.toScreen(point);ctx.lineTo(v.x,v.y);
    }
    if(this.lineCursor){const v=this.toScreen(this.lineCursor);ctx.lineTo(v.x,v.y);}
    ctx.strokeStyle="#e8af68";ctx.lineWidth=2;ctx.setLineDash([5,3]);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle="#ffcd90";
    for(const point of this.linePoints){const v=this.toScreen(point);ctx.beginPath();ctx.arc(v.x,v.y,4,0,Math.PI*2);ctx.fill();}
    if(this.linePoints.length>=3){
      ctx.strokeStyle="#ffb76b";ctx.lineWidth=2;ctx.beginPath();ctx.arc(first.x,first.y,9,0,Math.PI*2);ctx.stroke();
    }
  }
  private paintExtrude():void {
    const end=this.arrowScreen(),anchor=this.getSelectedPoint();
    if(!end||!anchor||!this.extrude)return;
    const ctx=this.ctx;
    ctx.strokeStyle="#f6ba66";ctx.lineWidth=3;ctx.beginPath();
    ctx.moveTo(anchor.x+22,anchor.y);ctx.lineTo(end.x,end.y);ctx.stroke();
    ctx.beginPath();ctx.moveTo(end.x-6,end.y+8);ctx.lineTo(end.x,end.y-5);ctx.lineTo(end.x+6,end.y+8);ctx.stroke();
    ctx.fillStyle="#f6ba66";ctx.beginPath();ctx.arc(end.x,end.y,9,0,Math.PI*2);ctx.fill();
    ctx.textAlign="left";ctx.fillStyle="#ffd6a1";ctx.font="12px ui-monospace,monospace";
    ctx.fillText("↕ "+fmt(this.extrude.depth)+" mm",end.x+16,end.y+4);
  }
  draw():void {
    const ctx=this.ctx;
    ctx.clearRect(0,0,this.width,this.height);
    ctx.fillStyle="#0b1422";ctx.fillRect(0,0,this.width,this.height);
    this.drawGrid();
    const preview=this.gesture?.kind==="move"||this.gesture?.kind==="handle"?this.gesture.preview:null;
    for(const p of this.doc.profiles){
      const item=preview?.id===p.id?preview:p;
      this.paintShape(item,item.id===this.selected,item.id===this.hover,preview?.id===p.id);
    }
    if(this.gesture?.kind==="draw")this.paintDraft(this.gesture);
    this.paintLine();this.paintExtrude();
    if(this.highlightedSnap){
      const pt=this.toScreen(this.highlightedSnap);
      ctx.strokeStyle="#6bdda9";ctx.lineWidth=1.5;
      ctx.beginPath();ctx.arc(pt.x,pt.y,5,0,Math.PI*2);ctx.stroke();
    }
    ctx.textAlign="left";ctx.fillStyle="#7490a9";ctx.font="11px ui-monospace,monospace";
    ctx.fillText("XY · "+fmt(this.zoom)+" px/mm",12,this.height-14);
  }
}
function fmt(n:number):string{return Number.isFinite(n)?Number(n.toFixed(2)).toString():"—";}
