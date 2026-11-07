/** Independent floating Solid viewport collection.
 *
 * Each instance owns its own Three.js camera, zoom, navigation and WebGL
 * resources, but never requests a second exact CAD kernel evaluation.
 * GeometryMesh is an immutable B-rep-derived presentation value shared by
 * reference; the previews create GPU buffers per context.
 */
import type {GeometryMesh} from "./kernel-protocol";
import type {NavigationPreset} from "./navigation";
import type {RenderSettings} from "./render-settings";
import type {SurfaceTarget} from "./surface-interaction";
import {formatSurfaceTarget} from "./surface-interaction";
import {Preview} from "./preview";
import {createRenderNav} from "./render-nav";

const STORAGE_KEY="flatcad.floating-views.v1";
export const MAX_FLOAT_VIEWS=3;
export type FloatDescriptor={id:string;x:number;y:number};
export function validateFloatDescriptors(raw:unknown):FloatDescriptor[]{
  if(!Array.isArray(raw)||raw.length>MAX_FLOAT_VIEWS)throw Error("Invalid floating-view collection");
  const ids=new Set<string>();
  return raw.map((r:unknown)=>{
    if(!r||typeof r!=="object"||Array.isArray(r))throw Error("Invalid floating view");
    const d=r as Record<string,unknown>;
    if(typeof d.id!=="string"||!/^float_[a-z0-9]{6,24}$/.test(d.id)||
      ids.has(d.id)||typeof d.x!=="number"||!Number.isFinite(d.x)||
      typeof d.y!=="number"||!Number.isFinite(d.y)||
      d.x<0||d.x>1||d.y<0||d.y>1)throw Error("Invalid floating view position");
    ids.add(d.id);
    return {id:d.id,x:d.x,y:d.y};
  });
}
function load():FloatDescriptor[]{
  try{const raw=localStorage.getItem(STORAGE_KEY);
    return raw?validateFloatDescriptors(JSON.parse(raw)):[];}
  catch{return [];}
}
type Entry={descriptor:FloatDescriptor;panel:HTMLElement;host:HTMLElement;
  label:HTMLElement;preview:Preview;left:number;top:number};
export class FloatRenderManager{
  readonly layer:HTMLElement;
  private readonly entries=new Map<string,Entry>();
  // The DOM order is stable for persisted view IDs; visual stacking is not.
  private foreground=0;
  private currentMesh:GeometryMesh|null=null;
  private currentOptions:NonNullable<Parameters<Preview["setMesh"]>[1]>={};
  private currentElevations:number[]=[];
  private currentInspection=false;
  constructor(
    private readonly getNavigation:()=>NavigationPreset,
    private readonly getSettings:()=>RenderSettings,
    private readonly onFacePick:(z:number|null)=>void,
    private readonly onError:(message:string)=>void
  ){
    const layer=document.createElement("div");
    layer.id="floating-views-layer";
    layer.className="floating-views-layer";
    document.querySelector(".shell")!.append(layer);
    this.layer=layer;
    for(const descriptor of load())this.insert(descriptor,false);
    window.addEventListener("resize",()=>this.resizeAll());
  }
  get count():number{return this.entries.size;}
  ids():string[]{return [...this.entries.keys()];}
  add():string{
    if(this.entries.size>=MAX_FLOAT_VIEWS)throw Error("Maximum of three independent floating views");
    const id="float_"+crypto.randomUUID().replaceAll("-","").slice(0,12);
    const descriptor={id,x:Math.min(.85,.48+this.entries.size*.08),
      y:Math.min(.85,.22+this.entries.size*.11)};
    this.insert(descriptor,true);
    return id;
  }
  remove(id:string):void{
    const e=this.entries.get(id);
    if(!e)return;
    this.entries.delete(id);
    e.preview.dispose();
    e.panel.remove();
    this.persist();
  }
  removeAll():void{for(const id of this.ids())this.remove(id);}
  setMesh(mesh:GeometryMesh|null,options:Parameters<Preview["setMesh"]>[1]={}):void{
    this.currentMesh=mesh;
    this.currentOptions=options??{};
    for(const e of this.entries.values()){
      e.preview.setMesh(mesh,options);
    }
  }
  setCommittedPickMesh(mesh:GeometryMesh|null):void{
    for(const e of this.entries.values())e.preview.setCommittedPickMesh(mesh);
  }
  setFaceElevations(values:readonly number[]):void{
    this.currentElevations=[...values];
    for(const e of this.entries.values())e.preview.setFaceElevations(values);
  }
  setHistoryInspection(active:boolean):void{
    this.currentInspection=active;
    for(const e of this.entries.values())e.preview.setHistoryInspection(active);
  }
  setNavigationPreset(preset:NavigationPreset):void{
    for(const e of this.entries.values())e.preview.setNavigationPreset(preset);
  }
  setRenderSettings(settings:RenderSettings):void{
    for(const e of this.entries.values())e.preview.setRenderSettings(settings);
  }
  /** Independent render cameras are interactive; model state is not copied
   * into native CAD documents and no worker/kernel is constructed here. */
  private insert(descriptor:FloatDescriptor,save:boolean):void{
    const panel=document.createElement("div");
    panel.className="floating-render-view";
    panel.dataset.floatId=descriptor.id;
    panel.setAttribute("aria-label","Floating CAD Solid view");
    const host=document.createElement("div");
    host.className="preview-root floating-render-canvas";
    host.setAttribute("aria-label","Independent floating CAD render");
    panel.append(host);
    const label=document.createElement("span");
    label.className="float-face-label";label.hidden=true;
    panel.append(label);
    this.layer.append(panel);
    let preview:Preview;
    try{
      preview=new Preview(host);
      preview.setNavigationPreset(this.getNavigation());
      preview.setFloating(true);
      preview.setRenderSettings(this.getSettings());
      preview.setFacePickHandler(this.onFacePick);
    }catch(error){
      panel.remove();
      this.onError("Floating render unavailable: "+String(error));
      return;
    }
    const entry:Entry={descriptor:{...descriptor},panel,host,label,preview,left:0,top:0};
    this.entries.set(descriptor.id,entry);
    // Navigation controls must foreground the selected view, otherwise a
    // newer overlapping canvas can intercept an intended object drag.
    // Keep DOM order stable so persisted descriptor identity is unchanged.
    panel.addEventListener("pointerdown",()=>this.activate(entry),{capture:true});
    panel.addEventListener("focusin",()=>this.activate(entry));
    this.activate(entry);
    preview.setFloatDragHandler((dx,dy)=>this.drag(entry,dx,dy));
    preview.setFloatDragEndHandler(()=>this.persist());
    preview.setSurfaceHoverHandler((target,pointer)=>this.onHover(entry,target,pointer));
    panel.append(createRenderNav(preview,()=>this.remove(descriptor.id)));
    this.position(entry);
    preview.setFaceElevations(this.currentElevations);
    if(this.currentMesh){
      preview.setMesh(this.currentMesh,{...this.currentOptions,preserveCamera:false});
      preview.fitView();
    }
    preview.setHistoryInspection(this.currentInspection);
    if(save)this.persist();
  }
  private activate(entry:Entry):void{
    entry.panel.style.zIndex=String(++this.foreground);
  }
  private onHover(e:Entry,target:SurfaceTarget|null,pointer:{x:number;y:number}):void{
    const label=e.label;
    const description=target?formatSurfaceTarget(target,null,0):null;
    if(!description){label.hidden=true;return;}
    label.textContent=description;
    const rect=e.panel.getBoundingClientRect();
    label.style.left=Math.max(6,Math.min(rect.width-194,pointer.x-rect.x+12))+"px";
    label.style.top=Math.max(40,Math.min(rect.height-35,pointer.y-rect.y+12))+"px";
    label.hidden=false;
  }
  private maxPos(e:Entry):{minY:number;maxX:number;maxY:number}{
    const minY=Math.min(65,Math.max(0,innerHeight-e.panel.offsetHeight));
    return {minY,maxX:Math.max(0,innerWidth-e.panel.offsetWidth),
      maxY:Math.max(minY,innerHeight-e.panel.offsetHeight)};
  }
  private position(e:Entry):void{
    const {minY,maxX,maxY}=this.maxPos(e);
    e.left=Math.round(e.descriptor.x*maxX);
    e.top=Math.round(minY+e.descriptor.y*(maxY-minY));
    e.panel.style.left=e.left+"px";
    e.panel.style.top=e.top+"px";
  }
  private drag(e:Entry,dx:number,dy:number):void{
    const {minY,maxX,maxY}=this.maxPos(e);
    e.left=Math.max(0,Math.min(maxX,e.left+dx));
    e.top=Math.max(minY,Math.min(maxY,e.top+dy));
    e.panel.style.left=Math.round(e.left)+"px";
    e.panel.style.top=Math.round(e.top)+"px";
    e.descriptor.x=maxX?e.left/maxX:0;
    e.descriptor.y=maxY>minY?(e.top-minY)/(maxY-minY):0;
    // Intentionally no synchronous localStorage writes on pointermove.
  }
  private resizeAll():void{
    for(const e of this.entries.values())this.position(e);
  }
  private persist():void{
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(
      validateFloatDescriptors([...this.entries.values()].map(e=>e.descriptor))));
    }catch(thisError){this.onError("Floating-view layout persistence unavailable: "+String(thisError));}
  }
}
