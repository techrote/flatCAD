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
import {installFloatingFrame,positionedFloatRect,normalizedFloatRect,type FloatRect} from "./floating-frame";

const STORAGE_KEY="flatcad.floating-views.v1";
const ACTIVE_KEY="flatcad.floating-active.v1";
export const MAX_FLOAT_VIEWS=3;
export type FloatDescriptor={id:string;x:number;y:number;w:number;h:number};
export function validateFloatDescriptors(raw:unknown):FloatDescriptor[]{
  if(!Array.isArray(raw)||raw.length>MAX_FLOAT_VIEWS)throw Error("Invalid floating-view collection");
  const ids=new Set<string>();
  return raw.map((r:unknown)=>{
    if(!r||typeof r!=="object"||Array.isArray(r))throw Error("Invalid floating view");
    const d=r as Record<string,unknown>;
    // The original preferences had only positions; migrate their sizes safely.
    const w=d.w===undefined?380:d.w,h=d.h===undefined?340:d.h;
    if(typeof d.id!=="string"||!/^float_[a-z0-9]{6,24}$/.test(d.id)||
      ids.has(d.id)||typeof d.x!=="number"||!Number.isFinite(d.x)||
      typeof d.y!=="number"||!Number.isFinite(d.y)||
      d.x<0||d.x>1||d.y<0||d.y>1||typeof w!=="number"||!Number.isFinite(w)||
      typeof h!=="number"||!Number.isFinite(h)||w<220||w>3000||h<180||h>3000)
      throw Error("Invalid floating view position or size");
    ids.add(d.id);
    return {id:d.id,x:d.x,y:d.y,w,h};
  });
}
function load():FloatDescriptor[]{
  try{const raw=localStorage.getItem(STORAGE_KEY);
    return raw?validateFloatDescriptors(JSON.parse(raw)):[];}
  catch{return [];}
}
type Entry={descriptor:FloatDescriptor;panel:HTMLElement;host:HTMLElement;
  label:HTMLElement;preview:Preview;disposeControls:()=>void};
export class FloatRenderManager{
  readonly layer:HTMLElement;
  private readonly entries=new Map<string,Entry>();
  // The DOM order is stable for persisted view IDs; visual stacking is not.
  private foreground=0;
  private activeId:string|null=null;
  private currentMesh:GeometryMesh|null=null;
  // Preserve committed face targets when a view is created during an uncommitted preview.
  private currentCommittedPickMesh:GeometryMesh|null=null;
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
    // Restore last active stacking separately from the persisted positions.
    // Otherwise another floating view can cover its navigation/Close controls
    // following a reload, even after a user deliberately foregrounded it.
    let lastActive:string|null=null;
    try{lastActive=localStorage.getItem(ACTIVE_KEY);}catch{/* optional UI state */}
    for(const descriptor of load())this.insert(descriptor,false);
    const active=lastActive?this.entries.get(lastActive):undefined;
    if(active)this.activate(active,false);
    window.addEventListener("resize",()=>this.resizeAll());
  }
  get count():number{return this.entries.size;}
  ids():string[]{return [...this.entries.keys()];}
  add():string{
    if(this.entries.size>=MAX_FLOAT_VIEWS)throw Error("Maximum of three independent floating views");
    const id="float_"+crypto.randomUUID().replaceAll("-","").slice(0,12);
    const descriptor={id,x:Math.min(.85,.48+this.entries.size*.08),
      y:Math.min(.85,.22+this.entries.size*.11),w:380,h:340};
    this.insert(descriptor,true);
    return id;
  }
  remove(id:string):void{
    const e=this.entries.get(id);
    if(!e)return;
    this.entries.delete(id);
    e.disposeControls();
    e.preview.dispose();
    e.panel.remove();
    this.persist();
    if(this.activeId===id){
      this.activeId=null;
      const top=[...this.entries.values()].sort((a,b)=>
        Number(b.panel.style.zIndex)-Number(a.panel.style.zIndex))[0];
      if(top)this.activate(top);
      else try{localStorage.removeItem(ACTIVE_KEY);}catch{/* optional */}
    }
  }
  removeAll():void{for(const id of this.ids())this.remove(id);}
  setMesh(mesh:GeometryMesh|null,options:Parameters<Preview["setMesh"]>[1]={}):void{
    this.currentMesh=mesh;
    if(!options?.pending)this.currentCommittedPickMesh=mesh;
    this.currentOptions=options??{};
    for(const e of this.entries.values()){
      e.preview.setMesh(mesh,options);
    }
  }
  setCommittedPickMesh(mesh:GeometryMesh|null):void{
    this.currentCommittedPickMesh=mesh;
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
    const entry:Entry={descriptor:{...descriptor},panel,host,label,preview,disposeControls:()=>{}};
    this.entries.set(descriptor.id,entry);
    // Full viewport input ownership follows visual z-order, not raycast hits.
    // Keep DOM order stable so persisted view identities never change.
    panel.addEventListener("pointerdown",()=>this.activate(entry),{capture:true});
    panel.addEventListener("focusin",()=>this.activate(entry));
    this.activate(entry,save);
    entry.disposeControls=installFloatingFrame(panel,{
      onChange:rect=>this.setRect(entry,rect),onEnd:()=>this.persist(),
      onActivate:()=>this.activate(entry)
    });
    preview.setSurfaceHoverHandler((target,pointer)=>this.onHover(entry,target,pointer));
    panel.append(createRenderNav(preview,()=>this.remove(descriptor.id)));
    this.position(entry);
    preview.setFaceElevations(this.currentElevations);
    if(this.currentMesh){
      preview.setMesh(this.currentMesh,{...this.currentOptions,preserveCamera:false});
      preview.fitView();
    }
    // setMesh(pending) intentionally leaves the committed pick target unset.
    if(this.currentCommittedPickMesh)preview.setCommittedPickMesh(this.currentCommittedPickMesh);
    preview.setHistoryInspection(this.currentInspection);
    if(save)this.persist();
  }
  private activate(entry:Entry,save=true):void{
    if(this.activeId===entry.descriptor.id)return;
    this.activeId=entry.descriptor.id;
    entry.panel.style.zIndex=String(++this.foreground);
    if(save)try{localStorage.setItem(ACTIVE_KEY,entry.descriptor.id);}
    catch{/* optional UI preference; never block CAD interaction */}
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
  private position(e:Entry):void{
    const rect=positionedFloatRect(e.descriptor.x,e.descriptor.y,
      e.descriptor.w,e.descriptor.h,{width:innerWidth,height:innerHeight});
    e.panel.style.left=rect.left+"px";
    e.panel.style.top=rect.top+"px";
    e.panel.style.width=rect.width+"px";
    e.panel.style.height=rect.height+"px";
  }
  private setRect(e:Entry,rect:FloatRect):void{
    const coords=normalizedFloatRect(rect,{width:innerWidth,height:innerHeight});
    e.descriptor={...e.descriptor,x:coords.x,y:coords.y,w:rect.width,h:rect.height};
    // Do not write localStorage until pointerup or a keyboard resize step.
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
