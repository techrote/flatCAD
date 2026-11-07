/** Optional Fusion-style named scalar manager. No automatic onboarding. */
import type {CadDocument,Profile} from "./model";
import {validateDocument} from "./model";
import {renameParameterReferences,resolveNamedParameters} from "./parameters";

export class ParameterManager{
  readonly dialog:HTMLDialogElement;
  private readonly rows:HTMLElement;
  private readonly summary:HTMLElement;
  private readonly count:HTMLElement;
  private doc:CadDocument|null=null;
  constructor(inspector:HTMLElement,
    private readonly onChange:(doc:CadDocument)=>void,
    private readonly onError:(message:string)=>void
  ){
    const detail=document.createElement("details");
    detail.id="parameters-details";detail.className="drawer";
    detail.innerHTML='<summary>Parameters <span id="parameter-count" class="muted">0 named</span></summary>'+
      '<div class="drawer-content"><div id="parameters-summary" class="parameters-summary"></div>'+
      '<button id="parameters-edit" type="button" class="button">Manage parameters</button></div>';
    const profiles=inspector.querySelector("#profiles-details");
    inspector.insertBefore(detail,profiles);
    this.count=detail.querySelector("#parameter-count")!;
    this.summary=detail.querySelector("#parameters-summary")!;
    detail.querySelector<HTMLButtonElement>("#parameters-edit")!.onclick=()=>this.open();
    this.dialog=document.createElement("dialog");
    this.dialog.id="parameters-dialog";
    this.dialog.className="settings-dialog";
    this.dialog.innerHTML=
      '<div class="dialog-head"><div><strong>Named parameters</strong>'+
      '<small>Reusable exact values and chained expressions</small></div>'+
      '<button data-param-close type="button" aria-label="Close parameters">×</button></div>'+
      '<div id="parameter-rows" class="dialog-scroll parameter-rows"></div>'+
      '<footer><button id="parameter-add" type="button" class="button">+ Parameter</button>'+
      '<button data-param-close type="button" class="button primary">Done</button></footer>';
    document.body.append(this.dialog);
    this.rows=this.dialog.querySelector("#parameter-rows")!;
    this.dialog.querySelectorAll<HTMLButtonElement>("[data-param-close]").forEach(
      b=>b.onclick=()=>this.dialog.close());
    this.dialog.querySelector<HTMLButtonElement>("#parameter-add")!.onclick=()=>{
      if(!this.doc)return;
      let n=1;
      while(this.doc.parameters?.some(p=>p.name==="param"+n))n++;
      this.submit({...this.doc,parameters:[...(this.doc.parameters??[]),
        {name:"param"+n,expression:"10"}]});
    };
  }
  get isOpen():boolean{return this.dialog.open;}
  open():void{
    if(!this.doc)return;
    this.renderRows();this.dialog.showModal();
  }
  render(doc:CadDocument):void{
    this.doc=doc;
    const defs=doc.parameters??[];
    this.count.textContent=defs.length+" named";
    this.summary.replaceChildren();
    if(!defs.length)this.summary.textContent="No named values";
    else{
      const values=resolveNamedParameters(defs);
      for(const p of defs){
        const row=document.createElement("div");row.className="parameter-summary-row";
        const key=document.createElement("strong");key.textContent=p.name;
        const value=document.createElement("span");
        value.textContent=String(values.get(p.name))+" mm";
        row.append(key,value);this.summary.append(row);
      }
    }
    if(this.isOpen)this.renderRows();
  }
  private submit(next:CadDocument):void{
    try{this.onChange(validateDocument(next));}
    catch(error){
      this.onError(error instanceof Error?error.message:String(error));
      if(this.doc)this.renderRows();
    }
  }
  private renderRows():void{
    if(!this.doc)return;
    this.rows.replaceChildren();
    const doc=this.doc;
    const definitions=doc.parameters??[];
    const values=resolveNamedParameters(definitions);
    for(const p of definitions){
      const row=document.createElement("div");row.className="parameter-row";
      const name=document.createElement("input");name.type="text";name.spellcheck=false;
      name.value=p.name;name.setAttribute("aria-label","Parameter name "+p.name);
      name.onchange=()=>{
        const nextName=name.value.trim();
        const params=definitions.map(d=>({
          name:d.name===p.name?nextName:d.name,
          expression:renameParameterReferences(d.expression,p.name,nextName)
        }));
        const bindings=(doc.bindings??[]).map(b=>({
          ...b,expression:renameParameterReferences(b.expression,p.name,nextName)
        }));
        this.submit({...doc,parameters:params,bindings});
      };
      const expr=document.createElement("input");expr.type="text";expr.spellcheck=false;
      expr.value=p.expression;expr.setAttribute("aria-label","Parameter expression "+p.name);
      expr.onchange=()=>this.submit({...doc,parameters:definitions.map(d=>
        d.name===p.name?{...d,expression:expr.value.trim()}:d)});
      const result=document.createElement("output");
      result.textContent=String(values.get(p.name))+" mm";
      const remove=document.createElement("button");remove.type="button";
      remove.className="titlebar-action";remove.title="Delete parameter "+p.name;
      remove.textContent="×";
      remove.onclick=()=>this.submit({...doc,
        parameters:definitions.filter(d=>d.name!==p.name)});
      row.append(name,expr,result,remove);this.rows.append(row);
    }
  }
}
