import type { CadDocument, Feature } from "./model";
import type { KernelHistoryFrame } from "./kernel-protocol";
import { featureExtentLabel, featureLabel } from "./feature-labels";
import { drawHistoryThumbnail } from "./history-thumbnails";

/** Dense newest-first thumbnail grid. Only one selected tile exposes editing
 * controls, saving vertical space while retaining complete feature history.
 * Selection is a UI state; it never changes the order of CAD evaluation.
 */
export class FeatureHistoryPanel {
  private lastDocument:CadDocument|null=null;
  private lastFrames:KernelHistoryFrame[]|null=null;
  private currentDocument:CadDocument|null=null;
  private lastTimeline=false;
  private activeFeatureId:string|null=null;
  private readonly buttons=new Map<string,HTMLButtonElement>();
  private editor:HTMLElement|null=null;

  constructor(
    private readonly host:HTMLElement,
    private readonly onUpdate:(feature:Feature)=>void,
    private readonly onDelete:(feature:Feature)=>void,
    private readonly onInspect:(id:string|null,frame:KernelHistoryFrame|null)=>void=()=>{},
  ){}
  /** Clear historical inspection without mutating the editable CAD feature list. */
  clearSelection():void{
    this.activeFeatureId=null;
    for(const button of this.buttons.values()){
      button.dataset.selected="false";
      button.setAttribute("aria-pressed","false");
    }
    if(this.editor)this.editor.hidden=true;
    this.onInspect(null,null);
  }
  private inspect():void{
    const id=this.activeFeatureId;
    this.onInspect(id,id?this.lastFrames?.find(f=>f.featureId===id)??null:null);
  }

  render(doc:CadDocument,frames:KernelHistoryFrame[]|null):void{
    const timeline=Boolean(this.host.closest("#history-timeline"));
    if(this.lastDocument===doc&&this.lastFrames===frames&&
      this.lastTimeline===timeline)return;
    this.lastTimeline=timeline;
    this.lastDocument=doc;
    this.lastFrames=frames;
    this.currentDocument=doc;
    if(this.activeFeatureId&&!doc.features.some(f=>f.id===this.activeFeatureId)){
      this.activeFeatureId=null;
    }
    const oldScroll=this.host.scrollTop;
    this.host.replaceChildren();
    this.buttons.clear();
    if(!doc.features.length){
      this.host.textContent="No solid features yet. Select a shape and press E.";
      this.editor=null;
      return;
    }
    const byId=new Map(frames?.map(frame=>[frame.featureId,frame]));
    const editor=document.createElement("section");
    editor.id="history-feature-editor";
    editor.className="history-feature-editor";
    editor.setAttribute("aria-label","Selected feature controls");
    editor.hidden=true;
    this.editor=editor;
    this.host.append(editor);
    const grid=document.createElement("div");
    grid.className="history-tiles";
    grid.setAttribute("aria-label",timeline?
      "Feature timeline, oldest first":"Feature history, newest first");
    // Horizontal timelines run oldest → newest towards the "Now" endpoint.
    // The compact portrait history drawer retains newest-first. Neither view
    // mutates the authoritative document's oldest-first evaluation sequence.
    for(const feature of (timeline?doc.features:[...doc.features].reverse())){
      const name=featureLabel(doc,feature);
      const card=document.createElement("button");
      card.type="button";
      card.className="history-row history-feature-card history-tile";
      card.dataset.featureId=feature.id;
      card.dataset.operation=feature.operation;
      card.dataset.selected=String(feature.id===this.activeFeatureId);
      card.setAttribute("aria-pressed",String(feature.id===this.activeFeatureId));
      card.setAttribute("aria-label","Edit "+name);
      card.title=name+" · "+featureExtentLabel(feature);
      const thumb=document.createElement("canvas");
      thumb.className="history-thumbnail";
      thumb.width=176;thumb.height=96;
      thumb.setAttribute("role","img");
      thumb.setAttribute("aria-label","Solid after "+name+
        (feature.operation==="cut"?" including red cut-tool overlay":""));
      const frame=byId.get(feature.id);
      if(frame&&frame.operation===feature.operation){
        drawHistoryThumbnail(thumb,frame);
        card.dataset.thumbnailState="ready";
      }else{
        card.dataset.thumbnailState="pending";
        const ctx=thumb.getContext("2d");
        if(ctx){
          ctx.fillStyle="#0b1928";ctx.fillRect(0,0,176,96);
          ctx.fillStyle="#7898b6";ctx.font="11px monospace";
          ctx.fillText("Rendering…",20,51);
        }
      }
      const summary=document.createElement("span");
      summary.className="history-summary";
      const title=document.createElement("strong");
      title.className="history-feature-name";
      title.textContent=name;
      const extent=document.createElement("small");
      extent.className="history-feature-extent";
      extent.textContent=featureExtentLabel(feature);
      summary.append(title,extent);
      card.append(thumb,summary);
      card.onclick=()=>this.activate(feature.id);
      this.buttons.set(feature.id,card);
      grid.append(card);
    }
    this.host.append(grid);
    if(this.activeFeatureId){
      this.showEditor(this.activeFeatureId);
      this.inspect();
    }
    // Avoid jumping the drawer back to the beginning when only B-rep
    // thumbnail frames finish rendering.
    this.host.scrollTop=oldScroll;
  }

  private activate(id:string):void{
    this.activeFeatureId=this.activeFeatureId===id?null:id;
    for(const [featureId,button] of this.buttons){
      const selected=featureId===this.activeFeatureId;
      button.dataset.selected=String(selected);
      button.setAttribute("aria-pressed",String(selected));
    }
    if(!this.activeFeatureId){
      if(this.editor)this.editor.hidden=true;
      this.inspect();
      return;
    }
    this.showEditor(this.activeFeatureId);
    this.inspect();
  }

  private showEditor(id:string):void{
    const feature=this.currentDocument?.features.find(f=>f.id===id);
    const doc=this.currentDocument;
    const panel=this.editor;
    if(!feature||!doc||!panel)return;
    panel.replaceChildren();
    panel.hidden=false;
    panel.dataset.featureId=id;
    const header=document.createElement("div");
    header.className="history-editor-heading";
    const label=document.createElement("strong");
    label.textContent=featureLabel(doc,feature);
    const close=document.createElement("button");
    close.type="button";close.className="text-button";
    close.setAttribute("aria-label","Close feature controls");
    close.textContent="×";
    close.onclick=()=>this.activate(id);
    header.append(label,close);
    const fields=document.createElement("div");
    fields.className="field-row";
    const mode=document.createElement("select");
    mode.setAttribute("aria-label",featureLabel(doc,feature)+" operation");
    for(const operation of ["add","cut"] as const){
      const option=document.createElement("option");
      option.value=operation;
      option.textContent=operation==="add"?"Add":"Cut";
      option.selected=operation===feature.operation;
      mode.add(option);
    }
    mode.onchange=()=>this.onUpdate({...feature,operation:mode.value as "add"|"cut"});
    fields.append(mode);
    fields.append(this.numberField("Start Z",feature.z,value=>
      this.onUpdate({...feature,z:value})));
    fields.append(this.numberField("Depth",feature.depth,value=>
      this.onUpdate({...feature,depth:value})));
    const actions=document.createElement("div");
    actions.className="history-editor-actions";
    const volume=this.lastFrames?.find(frame=>frame.featureId===id);
    if(volume){
      const amount=document.createElement("small");
      amount.className="history-feature-volume";
      amount.textContent="Solid "+volume.statistics.volumeMm3.toFixed(2)+" mm³"+
        (volume.cutTool?" · Red cutter "+volume.cutTool.statistics.volumeMm3.toFixed(2)+" mm³":"");
      actions.append(amount);
    }
    const remove=document.createElement("button");
    remove.type="button";
    remove.className="button danger history-feature-delete";
    remove.title="Delete "+featureLabel(doc,feature);
    remove.textContent="Delete feature";
    remove.onclick=()=>this.onDelete(feature);
    actions.append(remove);
    panel.append(header,fields,actions);
  }

  private numberField(label:string,value:number,onChange:(next:number)=>void):HTMLLabelElement{
    const wrap=document.createElement("label");wrap.className="field";
    const caption=document.createElement("span");caption.textContent=label;
    const input=document.createElement("input");
    input.type="number";input.step="any";input.value=String(value);
    input.setAttribute("aria-label",label);
    input.onchange=()=>{
      const next=Number(input.value);
      if(!input.value.trim()||!Number.isFinite(next)){
        input.value=String(value);return;
      }
      onChange(next);
    };
    wrap.append(caption,input);
    return wrap;
  }
}
