import type { CadDocument, Feature } from "./model";
import type { KernelHistoryFrame } from "./kernel-protocol";
import { featureExtentLabel, featureLabel } from "./feature-labels";
import { drawHistoryThumbnail } from "./history-thumbnails";

/** Collapsed-by-default feature tree with real B-rep-derived snapshots.
 * Rendering a selection does not recreate canvases or flash the thumbnails.
 */
export class FeatureHistoryPanel {
  private lastDocument:CadDocument|null=null;
  private lastFrames:KernelHistoryFrame[]|null=null;
  constructor(
    private readonly host:HTMLElement,
    private readonly onUpdate:(feature:Feature)=>void,
    private readonly onDelete:(feature:Feature)=>void,
  ){}
  render(doc:CadDocument,frames:KernelHistoryFrame[]|null):void{
    if(this.lastDocument===doc&&this.lastFrames===frames)return;
    this.lastDocument=doc;
    this.lastFrames=frames;
    this.host.replaceChildren();
    if(!doc.features.length){
      this.host.textContent="No solid features yet. Select a shape and press E.";
      return;
    }
    const byId=new Map(frames?.map(frame=>[frame.featureId,frame]));
    for(const feature of doc.features){
      const label=featureLabel(doc,feature);
      const row=document.createElement("div");
      row.className="history-row history-feature-card";
      row.dataset.featureId=feature.id;
      row.dataset.operation=feature.operation;
      const top=document.createElement("div");
      top.className="history-card-heading";
      const thumb=document.createElement("canvas");
      thumb.className="history-thumbnail";
      thumb.width=176;thumb.height=96;
      thumb.setAttribute("role","img");
      thumb.setAttribute("aria-label","Solid after "+label+
        (feature.operation==="cut"?" including red cut-tool overlay":""));
      const frame=byId.get(feature.id);
      if(frame&&frame.operation===feature.operation){
        drawHistoryThumbnail(thumb,frame);
        row.dataset.thumbnailState="ready";
      }else{
        row.dataset.thumbnailState="pending";
        const context=thumb.getContext("2d");
        if(context){
          context.fillStyle="#0b1928";context.fillRect(0,0,176,96);
          context.fillStyle="#7e9eba";context.font="11px monospace";
          context.fillText("Rendering solid…",16,51);
        }
      }
      const summary=document.createElement("div");
      summary.className="history-summary";
      const name=document.createElement("strong");
      name.className="history-feature-name";
      name.textContent=label;
      const extent=document.createElement("small");
      extent.className="history-feature-extent";
      extent.textContent=featureExtentLabel(feature);
      summary.append(name,extent);
      if(frame){
        const volume=document.createElement("small");
        volume.className="history-feature-volume";
        volume.textContent="Solid "+frame.statistics.volumeMm3.toFixed(2)+" mm³"+
          (frame.operation==="cut"&&frame.cutTool
            ?" · Red cutter "+frame.cutTool.statistics.volumeMm3.toFixed(2)+" mm³":"");
        summary.append(volume);
      }
      top.append(thumb,summary);
      row.append(top);
      const fields=document.createElement("div");
      fields.className="field-row";
      const mode=document.createElement("select");
      mode.setAttribute("aria-label",label+" operation");
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
      const remove=document.createElement("button");
      remove.className="delete-feature";
      remove.title="Delete "+label;
      remove.textContent="×";
      remove.onclick=()=>this.onDelete(feature);
      row.append(fields,remove);
      this.host.append(row);
    }
  }
  private numberField(
    label:string,value:number,onChange:(next:number)=>void
  ):HTMLLabelElement{
    const wrap=document.createElement("label");wrap.className="field";
    const caption=document.createElement("span");caption.textContent=label;
    const box=document.createElement("input");
    box.type="number";box.step="any";box.value=String(value);
    box.setAttribute("aria-label",label);
    box.onchange=()=>{
      const next=Number(box.value);
      if(!Number.isFinite(next)||(!box.value.trim())){
        box.value=String(value);return;
      }
      onChange(next);
    };
    wrap.append(caption,box);
    return wrap;
  }
}
