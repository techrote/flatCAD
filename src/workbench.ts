import "./styles.css";
import "./workbench.css";
import {
  DEMO, appendFeature, appendProfile, deleteProfile, newId, updateProfile, validateDocument,
  type CadDocument, type Feature, type Profile, type Point2
} from "./model";
import { isClosed, translate } from "./geometry";
import { nextSelection, selectedProfiles, suggestGroupOperation, documentWithExtrusions, documentWithMovedProfiles } from "./selection";
import { placeExtrudeMenu } from "./extrude-placement";
import { depthToFace } from "./signed-extrusion";
import { NAVIGATION_HINTS, NAVIGATION_LABELS, NAVIGATION_PRESETS, type NavigationPreset } from "./navigation";
import type { KernelBuild, KernelHistoryFrame } from "./kernel-protocol";
import { FeatureHistoryPanel } from "./history-panel";
import { featureForSurface, formatSurfaceTarget, type SurfaceTarget } from "./surface-interaction";
import { SketchCanvas, type SketchTool } from "./sketch-canvas-v2";
import { KernelClient } from "./kernel-client";
import { Preview } from "./preview";
import {
  ACTION_LABELS, PREFS_KEY, chordFromEvent, defaultPreferences, displayShortcut,
  loadPreferences, savePreferences, validatePreferences, validateShortcut,
  type Preferences, type ShortcutAction
} from "./preferences";

const PROJECT_KEY="flatcad.project.v1";
const root=document.getElementById("app");
if(!root)throw new Error("Missing #app");
root.innerHTML=[
  '<div class="shell workbench">',
  '  <header class="topbar workbench-header">',
  '    <div class="brand"><span class="brand-icon">▣</span><div><strong>flat<span>CAD</span></strong><small>XY · 2.5D</small></div></div>',
  '    <input id="document-name" aria-label="Project name" maxlength="128" title="Project name">',
  '    <nav id="menus" class="menu-triggers" aria-label="Application menus">',
  '      <button data-menu="file" class="menu-trigger">File</button>',
  '      <button data-menu="sketch" class="menu-trigger">Sketch</button>',
  '      <button data-menu="model" class="menu-trigger">Model</button>',
  '      <button data-menu="view" class="menu-trigger">View</button>',
  '      <button data-menu="settings" class="menu-trigger">Settings</button>',
  '      <div id="menu-popover" class="menu-popover" hidden role="menu"></div>',
  '    </nav>',
  '    <button id="quick-extrude" class="button primary" title="Extrude or cut selected profile (E)">Extrude <kbd>E</kbd></button>',
  '    <input type="file" id="project-input" accept=".json,.flatcad.json,application/json" hidden>',
  '    <input type="file" id="settings-input" accept=".json,application/json" hidden>',
  '  </header>',
  '  <main class="workspace workbench-layout">',
  '    <section class="panel sketch-section workbench-sketch">',
  '      <div class="panel-head compact-head"><div class="header-label"><span class="panel-index">01</span><div><strong>Sketch</strong><small>Draw directly · XY plane</small></div></div>',
  '        <span id="sketch-context" class="chip">Select <kbd>V</kbd></span></div>',
  '      <div id="sketch-wrap" class="sketch-wrap">',
  '        <canvas id="sketch" aria-label="2D CAD sketch canvas">Canvas 2D is required</canvas>',
  '        <div class="tool-rail" role="toolbar" aria-label="Sketching tools">',
  '          <button data-tool="select" title="Select (V)" class="rail-tool active" aria-label="Select">↖</button>',
  '          <button data-tool="line" title="Line or polyline (L)" class="rail-tool" aria-label="Line">╱</button>',
  '          <button data-tool="rectangle" title="Corner rectangle (R)" class="rail-tool" aria-label="Rectangle">▭</button>',
  '          <button data-tool="centerRectangle" title="Centre rectangle (Shift+R)" class="rail-tool" aria-label="Centre rectangle">▣</button>',
  '          <button data-tool="circle" title="Circle (C)" class="rail-tool" aria-label="Circle">◯</button>',
  '          <button data-tool="polygon" title="Regular polygon (P)" class="rail-tool" aria-label="Polygon">⬡</button>',
  '          <button data-tool="slot" title="Slot (S)" class="rail-tool" aria-label="Slot">⬭</button>',
  '          <button data-tool="pan" title="Pan (M or middle mouse)" class="rail-tool" aria-label="Pan">✥</button>',
  '          <span class="rail-divider"></span>',
  '          <button data-tool="extrude" title="Extrude / Cut (E)" class="rail-tool" aria-label="Extrude or cut">↥</button>',
  '        </div>',
  '        <div id="shape-options" class="floating-tool-options" hidden></div>',
  '        <div id="selection-bar" class="selection-bar" hidden>',
  '          <span id="selection-count" class="selection-count" hidden>0 selected</span>',
  '          <button id="selection-extrude" title="Extrude or cut selection (E)">↥ Extrude</button>',
  '          <button id="selection-duplicate" title="Duplicate (Ctrl+D)">⧉</button>',
  '          <button id="selection-properties" title="Exact dimensions">▤</button>',
  '          <button id="selection-delete" title="Delete selected">×</button>',
  '        </div>',
  '        <section id="extrude-flyout" class="extrude-flyout" aria-label="Extrude or cut" hidden>',
  '          <div class="flyout-head"><strong>Extrude</strong><button id="cancel-extrude" aria-label="Cancel extrusion">×</button></div>',
  '          <div id="extrude-target" class="flyout-subtitle"></div>',
  '          <label class="field"><span>Operation</span><select id="extrude-mode"><option value="auto">Auto</option><option value="add">Add / Join</option><option value="cut">Cut</option></select></label>',
  '          <div class="field-row"><label class="field"><span>Start Z · mm</span><input type="number" step="any" id="extrude-z" value="0" title="Click a horizontal face in Solid view to fill Start Z"></label>',
  '            <label class="field"><span>Depth · mm</span><input type="number" step="any" id="extrude-depth" value="8" title="Signed depth: negative extrudes down; click a horizontal face for a target elevation"></label></div>',
  '          <label class="check through-all"><input type="checkbox" id="extrude-through"> Through all (cut)</label>',
  '          <label class="check live-preview"><input type="checkbox" id="extrude-preview" checked> Preview in solid view</label>',
  '          <div class="flyout-face-hint">ⓘ Click a horizontal face in Solid view to fill the last-focused <strong>Start Z</strong> or <strong>Depth</strong> field.</div>',
  '          <span id="extrude-preview-error" class="preview-error" role="status" hidden></span>',
  '          <div class="form-actions"><button id="apply-extrude" class="button primary">Apply <kbd>Enter</kbd></button><button id="dismiss-extrude" class="button muted-button">Cancel</button></div>',
  '          <small class="flyout-hint">Drag the amber arrow to set positive or negative depth</small>',
  '          <small id="extrude-nav-hint" class="flyout-nav-hint">MMB pan · Shift+MMB orbit</small>',
  '        </section>',
  '        <div id="canvas-hint" class="canvas-hint">Select a shape or press a drawing shortcut</div>',
  '      </div>',
  '      <div class="panel-footer"><button id="grid-quick" class="text-button">⊞ Grid <kbd>G</kbd></button>',
  '        <span id="zoom" class="muted">4 px/mm</span><span id="profile-count" class="chip">3</span></div>',
  '    </section>',
  '    <aside class="workbench-side">',
  '      <section class="panel preview-panel">',
  '        <div class="panel-head compact-head"><div class="header-label"><span class="panel-index">02</span><div><strong>Solid</strong><small>Orbit · zoom · inspect</small></div></div><div class="solid-view-actions"><button id="fit-solid" class="text-button" title="Fit solid (F)">⊞ Fit <kbd>F</kbd></button><span class="chip">Z ↑</span></div></div>',
  '        <div id="preview" class="preview-root"><span class="placeholder">Loading 3D preview…</span></div>',
  '        <span id="face-target-label" class="face-target-label" hidden></span>',
  '        <div id="face-context-menu" class="face-context-menu" role="menu" hidden></div>',
  '        <span id="solid-preview-status" class="solid-preview-status" hidden>PREVIEW · NOT APPLIED</span>',
  '        <span id="cut-tool-metrics" class="cut-tool-metrics" hidden></span>',
  '      </section>',
  '      <div class="inspector-drawer">',
  '        <details id="properties-details" class="drawer"><summary>Properties <span id="selection-name" class="muted">Nothing selected</span></summary>',
  '          <div id="inspector" class="drawer-content"></div></details>',
  '        <details id="history-details" class="drawer"><summary>Feature history <span id="feature-count" class="muted">0 operations</span></summary>',
  '          <div id="feature-list" class="drawer-content"></div></details>',
  '        <details id="profiles-details" class="drawer"><summary>Profiles <span class="muted">Open list</span></summary>',
  '          <div id="profile-list" class="drawer-content"></div></details>',
  '      </div>',
  '    </aside>',
  '  </main>',
  '  <footer class="statusbar"><span id="status-dot" class="live-dot"></span><span id="status" role="status">Preparing workspace…</span>',
  '    <span class="status-right">PROTOTYPE · NOT FABRICATION QUALIFIED</span>',
  '    <button id="undo" class="status-action" aria-label="Undo" title="Undo">↶</button>',
  '    <button id="redo" class="status-action" aria-label="Redo" title="Redo">↷</button></footer>',
  '</div>',
  '<dialog id="shortcuts-dialog" class="settings-dialog"><div class="dialog-head"><div><strong>Keyboard shortcuts</strong><small>Click a key to rebind it. Empty means unassigned.</small></div><button data-close="shortcuts-dialog">×</button></div>',
  '  <div id="shortcut-rows" class="dialog-scroll"></div><div id="shortcut-error" role="alert" class="validation-error"></div>',
  '  <footer><button id="shortcut-reset" class="button">Reset defaults</button><button id="settings-export" class="button">Export settings JSON</button><button id="settings-import" class="button">Import JSON</button><button data-close="shortcuts-dialog" class="button primary">Done</button></footer></dialog>',
  '<dialog id="grid-dialog" class="settings-dialog"><div class="dialog-head"><div><strong>Grid and snapping</strong><small>Three independent scales · millimetres</small></div><button data-close="grid-dialog">×</button></div>',
  '  <div id="grid-rows" class="dialog-scroll"></div><div id="grid-error" role="alert" class="validation-error"></div>',
  '  <footer><button id="grid-reset" class="button">Reset defaults</button><button data-close="grid-dialog" class="button primary">Done</button></footer></dialog>',
  '<dialog id="navigation-dialog" class="settings-dialog"><div class="dialog-head"><div><strong>CAD navigation controls</strong><small>Choose the mouse behavior familiar from your CAD application.</small></div><button data-close="navigation-dialog">×</button></div>',
  '  <div class="dialog-scroll"><label class="field"><span>Control scheme</span><select id="navigation-preset" aria-label="Navigation control scheme"></select></label><p id="navigation-hint" class="navigation-hint"></p>',
  '  <label class="check remember-surface-setting"><input id="remember-surfaces" type="checkbox" checked> Remember mouse interaction surfaces</label>',
  '  <small class="navigation-hint">When enabled, a new extrusion starts at the last clicked horizontal face elevation.</small></div>',
  '  <footer><button data-close="navigation-dialog" class="button primary">Done</button></footer></dialog>'
].join("\n");

function byId<T extends HTMLElement=HTMLElement>(id:string):T{
  const element=document.getElementById(id);
  if(!element)throw new Error("Element not found: "+id);
  return element as T;
}
function button(id:string):HTMLButtonElement{return byId<HTMLButtonElement>(id);}
function input(id:string):HTMLInputElement{return byId<HTMLInputElement>(id);}
function select(id:string):HTMLSelectElement{return byId<HTMLSelectElement>(id);}
function status(message:string,error=false):void {
  byId("status").textContent=message;
  byId("status-dot").classList.toggle("error",error);
}
function initialDocument():CadDocument{
  try{
    const saved=localStorage.getItem(PROJECT_KEY);
    return saved?validateDocument(JSON.parse(saved)):DEMO;
  }catch{return DEMO;}
}
let doc=initialDocument();
let prefs=loadPreferences();
let history:CadDocument[]=[doc],historyIndex=0;
let selectedId:string|null=null,selectedIds:string[]=[],activeTool:SketchTool="select";
let activeMenu:string|null=null;
let extrudeTarget:string|null=null,extrudeTargets:string[]=[];
let extrudeCursor:{x:number,y:number}|null=null;
let facePickField:"z"|"depth"="depth";
let lastSurfaceZ:number|null=null;
let contextSurface:SurfaceTarget|null=null;
let contextFeatureId:string|null=null;
let previewEnabled=true,previewToken=0,previewInFlight=false;
let previewTimer:ReturnType<typeof setTimeout>|undefined;
let committedBuild:KernelBuild|null=null;
let historySnapshotDoc:CadDocument|null=null;
let historyFrames:KernelHistoryFrame[]|null=null;
let thumbnailsRequestedFor:CadDocument|null=null;
let thumbnailToken=0;
let shortcutRecording:ShortcutAction|null=null;
let lastStats:{volumeMm3:number,boundsMm:[[number,number,number],[number,number,number]]}|null=null;
let generation=0,buildTimer:ReturnType<typeof setTimeout>|undefined;
let slotRadius=3;

const kernel=new KernelClient();
const historyPanel=new FeatureHistoryPanel(
  byId("feature-list"),
  feature=>safe(()=>updateFeature(feature)),
  feature=>safe(()=>change(validateDocument({
    ...doc,features:doc.features.filter(f=>f.id!==feature.id)
  })))
);
const canvas=new SketchCanvas(inputCanvas(),doc,prefs,{
  onCreate:p=>safe(()=>{selectedId=p.id;selectedIds=[p.id];change(appendProfile(doc,p));setTool("select");}),
  onCreateMany:profiles=>safe(()=>{
    selectedIds=profiles.map(p=>p.id);selectedId=selectedIds.at(-1)??null;
    change(validateDocument({...doc,profiles:[...doc.profiles,...profiles]}));
  }),
  onEdit:p=>safe(()=>change(updateProfile(doc,p))),
  onEditMany:profiles=>safe(()=>change(documentWithMovedProfiles(doc,profiles))),
  onSelect:(id,additive=false)=>selectProfile(id,additive),
  onExtrude:(id,at)=>openExtrude(id,undefined,at),
  onExtrudeDepth:depth=>{
    const wasThrough=input("extrude-through").checked;
    input("extrude-depth").value=String(depth);
    input("extrude-through").checked=false;
    if(wasThrough&&resolveMode()==="cut"&&lastStats){
      const top=lastStats.boundsMm[1][2];
      input("extrude-z").value=String(depth<0?top:top-depth);
    }
    positionExtrudeMenu();
    scheduleOperationPreview();
  },
  onViewChange:zoom=>{
    byId("zoom").textContent=zoom.toFixed(2)+" px/mm";
    if(extrudeTarget)positionExtrudeMenu();
  },
  onStatus:message=>status(message)
});
function inputCanvas():HTMLCanvasElement{return byId<HTMLCanvasElement>("sketch");}
let preview:Preview|null=null;
try{
  const host=byId("preview");host.replaceChildren();preview=new Preview(host);
  preview.setNavigationPreset(prefs.navigation);
  preview.setFacePickHandler(z=>{
    if(z!==null)lastSurfaceZ=z;
    fillFocusedFieldFromFace(z);
  });
  preview.setSurfaceHoverHandler((target,pointer)=>updateSurfaceLabel(target,pointer));
  preview.setSurfaceMenuHandler((target,pointer)=>showSurfaceContext(target,pointer));
}catch(error){
  byId("preview").textContent="3D preview unavailable; sketching and STEP export remain available";
  status(String(error),true);
}
function safe(run:()=>void):void{
  try{run();}
  catch(error){status(error instanceof Error?error.message:String(error),true);render();}
}
function persistDocument():void{
  try{localStorage.setItem(PROJECT_KEY,JSON.stringify(doc));}
  catch{status("Autosave unavailable; use File → Save project",true);}
}
function persistPreferences():void{
  try{
    prefs=validatePreferences(prefs);savePreferences(prefs);canvas.setPreferences(prefs);
    preview?.setNavigationPreset(prefs.navigation);
    byId("extrude-nav-hint").textContent=NAVIGATION_HINTS[prefs.navigation];
    input("remember-surfaces").checked=prefs.rememberSurfaces;
    if(extrudeTarget)positionExtrudeMenu();
  }catch(error){status("Settings invalid: "+String(error),true);}
}
function change(next:CadDocument):void{
  doc=validateDocument(next);
  history=[...history.slice(0,historyIndex+1),doc].slice(-100);
  historyIndex=history.length-1;
  persistDocument();render();rebuild();
}
function undoRedo(next:number):void{
  if(next<0||next>=history.length)return;
  historyIndex=next;doc=history[next];persistDocument();render();rebuild();
}
function setTool(tool:SketchTool):void{
  closeExtrude();
  activeTool=tool;canvas.setTool(tool);
  document.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach(element=>{
    const active=element.dataset.tool===tool;
    element.classList.toggle("active",active);
    element.setAttribute("aria-pressed",String(active));
  });
  byId("sketch-context").textContent=tool==="centerRectangle"?"Centre rectangle":
    tool==="extrude"?"Extrude / Cut":tool==="line"?"Line / Polyline":
    tool.charAt(0).toUpperCase()+tool.slice(1);
  const hint:Record<SketchTool,string>={
    select:"Click to select · Ctrl+click to add/remove · drag to move · E to extrude",
    line:"Click vertices · click first point to close · Enter for open line",
    rectangle:"Drag corner to corner · hold Shift for a square",
    centerRectangle:"Drag outward from centre · hold Shift for a square",
    circle:"Click centre and drag for radius",
    polygon:"Click centre and drag · adjust sides and rotation above",
    slot:"Drag between end centres · set radius above",
    pan:"Drag to pan · wheel zooms at pointer",
    extrude:"Click a closed profile to extrude or cut"
  };
  byId("canvas-hint").textContent=hint[tool];
  renderToolOptions();closeMenu();
}
function getProfile(id:string|null):Profile|undefined{return doc.profiles.find(p=>p.id===id);}
function selectProfile(id:string|null,additive=false):void{
  selectedIds=nextSelection(selectedIds,id,additive);
  selectedId=selectedIds.at(-1)??null;
  if(extrudeTargets.length&&(
    extrudeTargets.length!==selectedIds.length||
    extrudeTargets.some(value=>!selectedIds.includes(value))))closeExtrude();
  render();
}
function render():void{
  selectedIds=selectedIds.filter(id=>Boolean(getProfile(id)));
  selectedId=selectedIds.at(-1)??null;
  canvas.setDocument(doc);canvas.setSelected(selectedId,selectedIds);
  byId("profile-count").textContent=String(doc.profiles.length)+" profiles";
  byId("feature-count").textContent=String(doc.features.length)+" operations";
  byId("selection-name").textContent=selectedIds.length>1?
    selectedIds.length+" profiles selected":getProfile(selectedId)?.kind||"Nothing selected";
  byId("selection-count").hidden=selectedIds.length<2;
  byId("selection-count").textContent=selectedIds.length+" selected";
  input("document-name").value=doc.name;
  button("undo").disabled=historyIndex===0;
  button("redo").disabled=historyIndex===history.length-1;
  byId("selection-bar").hidden=selectedIds.length===0;
  renderProfileList();renderProperties();renderHistory();
}
function numField(label:string,value:number,onChange:(x:number)=>void):HTMLLabelElement{
  const wrap=document.createElement("label");wrap.className="field";
  const caption=document.createElement("span");caption.textContent=label;
  const box=document.createElement("input");box.type="number";box.step="any";box.value=String(value);
  box.setAttribute("aria-label",label);
  box.addEventListener("change",()=>{
    const number=Number(box.value);
    if(!Number.isFinite(number)){status("Enter a finite numerical value",true);render();return;}
    safe(()=>onChange(number));
  });
  wrap.append(caption,box);return wrap;
}
function editProperty(profile:Profile,key:string,value:number):void{
  const updated={...profile,[key]:value} as Profile;
  change(updateProfile(doc,updated));
}
function renderProperties():void{
  const target=byId("inspector");target.replaceChildren();
  const p=getProfile(selectedId);
  if(!p){target.textContent="Select a sketch element to edit its exact parameters.";return;}
  if(selectedIds.length>1){
    target.textContent=selectedIds.length+
      " profiles selected · drag to move as a group, Ctrl+D to duplicate, Delete to remove, or E to extrude/cut together.";
    return;
  }
  const heading=document.createElement("strong");heading.textContent=p.kind+" · "+p.id;
  target.append(heading);
  const fields=document.createElement("div");fields.className="property-fields";
  const add=(key:string,value:number,label=key)=>{
    fields.append(numField(label,value,n=>editProperty(p,key,n)));
  };
  switch(p.kind){
    case "rectangle":add("x",p.x,"Left X");add("y",p.y,"Bottom Y");add("width",p.width);add("height",p.height);break;
    case "circle":add("x",p.x,"Centre X");add("y",p.y,"Centre Y");add("radius",p.radius);break;
    case "polygon":add("x",p.x,"Centre X");add("y",p.y,"Centre Y");add("radius",p.radius);
      add("sides",p.sides);add("rotation",p.rotation,"Rotation °");break;
    case "slot":add("x1",p.x1,"Start X");add("y1",p.y1,"Start Y");add("x2",p.x2,"End X");
      add("y2",p.y2,"End Y");add("radius",p.radius);break;
    case "path":{
      p.points.forEach((v,i)=>{
        fields.append(numField("P"+(i+1)+" X",v.x,n=>{
          const points=p.points.map((a,k)=>k===i?{...a,x:n}:a);change(updateProfile(doc,{...p,points}));
        }));
        fields.append(numField("P"+(i+1)+" Y",v.y,n=>{
          const points=p.points.map((a,k)=>k===i?{...a,y:n}:a);change(updateProfile(doc,{...p,points}));
        }));
      });
      const toggle=document.createElement("button");toggle.className="button";
      toggle.textContent=p.closed?"Open polyline":"Close polyline";
      toggle.onclick=()=>safe(()=>change(updateProfile(doc,{...p,closed:!p.closed})));
      target.append(toggle);break;
    }
  }
  target.append(fields);
  const actions=document.createElement("div");actions.className="form-actions";
  for(const [name,fn] of [
    ["Extrude / Cut",()=>openExtrude(p.id)],
    ["Duplicate",()=>duplicateSelected()],
    ["Delete",()=>removeSelected()]
  ] as [string,()=>void][]){
    const b=document.createElement("button");b.className="button";b.textContent=name;b.onclick=fn;actions.append(b);
  }
  target.append(actions);
}
function renderProfileList():void{
  const target=byId("profile-list");target.replaceChildren();
  for(const p of doc.profiles){
    const row=document.createElement("button");
    row.className="profile-item"+(selectedIds.includes(p.id)?" selected":"");
    row.setAttribute("aria-pressed",String(selectedIds.includes(p.id)));
    row.textContent=(p.kind==="path"&&!p.closed?"╱ ":"▭ ")+p.kind+" · "+p.id.slice(0,15);
    row.onclick=event=>selectProfile(p.id,event.ctrlKey||event.metaKey);target.append(row);
  }
  if(!doc.profiles.length)target.textContent="Empty sketch — draw a profile.";
}
function renderHistory():void{
  historyPanel.render(doc,historySnapshotDoc===doc?historyFrames:null);
}
/** Generate the exact post-feature B-rep thumbnails on demand, separately
 * from the primary Solid build. A blocked thumbnail request cannot blank
 * the main canvas or reset the camera. */
function ensureHistoryThumbnails():void{
  if(!byId<HTMLDetailsElement>("history-details").open||
    !doc.features.length||historySnapshotDoc===doc||
    thumbnailsRequestedFor===doc)return;
  const snapshot=doc,token=++thumbnailToken;
  thumbnailsRequestedFor=snapshot;
  void kernel.build(snapshot,{includeHistory:true}).then(result=>{
    if(token!==thumbnailToken||doc!==snapshot)return;
    historyFrames=result.historyFrames;
    historySnapshotDoc=snapshot;
    renderHistory();
  }).catch(error=>{
    if(token!==thumbnailToken||doc!==snapshot)return;
    status("Feature thumbnail rendering failed: "+String(error),true);
  }).finally(()=>{
    if(thumbnailsRequestedFor===snapshot)thumbnailsRequestedFor=null;
  });
}
function updateFeature(feature:Feature):void{
  change(validateDocument({...doc,features:doc.features.map(f=>f.id===feature.id?feature:f)}));
}
function removeSelected():void {
  if(selectedIds.length===0)return;
  const removing=new Set(selectedIds);
  const next=validateDocument({
    ...doc,
    profiles:doc.profiles.filter(p=>!removing.has(p.id)),
    features:doc.features.filter(f=>!removing.has(f.profileId))
  });
  selectedIds=[];selectedId=null;change(next);
}
function duplicateSelected():void {
  const profiles=selectedProfiles(doc,selectedIds);
  if(!profiles.length)return;
  const copies=profiles.map(p=>({...translate(p,5,5),id:newId("copy")}));
  const next=validateDocument({...doc,profiles:[...doc.profiles,...copies]});
  selectedIds=copies.map(p=>p.id);selectedId=selectedIds.at(-1)??null;
  change(next);
}
function rebuild():void {
  const n=++generation;
  ++previewToken;
  ++thumbnailToken;
  clearTimeout(previewTimer);
  clearTimeout(buildTimer);
  // Keep the last valid B-rep on screen during asynchronous regeneration.
  // Clearing committedBuild before a new result caused the empty flashes.
  const snapshot=doc;
  byId("preview").dataset.buildState="rebuilding";
  byId("preview").dataset.lastValidVisible=committedBuild?.mesh?"true":"false";
  status(snapshot.features.length?"Regenerating exact solid…":"Sketch ready · press E on a closed shape");
  buildTimer=setTimeout(async()=>{
    try{
      const result=await kernel.build(snapshot);
      if(n!==generation)return;
      lastStats=result.statistics;
      committedBuild=result;
      preview?.setFaceElevations(snapshot.features.flatMap(f=>[f.z,f.z+f.depth]));
      if(extrudeTargets.length&&input("extrude-preview").checked){
        preview?.setCommittedPickMesh(result.mesh);
        scheduleOperationPreview();
      }else preview?.setMesh(result.mesh);
      byId("preview").dataset.buildState="ready";
      if(byId<HTMLDetailsElement>("history-details").open)
        ensureHistoryThumbnails();
      if(result.statistics){
        byId("status").dataset.volumeMm3=String(result.statistics.volumeMm3);
        byId("status").dataset.boundsMm=JSON.stringify(result.statistics.boundsMm);
      }else{
        delete byId("status").dataset.volumeMm3;
        delete byId("status").dataset.boundsMm;
      }
      status(result.mesh?"Exact solid generated · "+result.statistics?.volumeMm3.toFixed(3)+" mm³":
        "Sketch ready · press E on a closed shape");
    }catch(error){
      if(n!==generation)return;
      // An invalid edit does not erase the last successfully rendered solid.
      byId("preview").dataset.buildState="stale";
      byId("preview").dataset.lastValidVisible=committedBuild?.mesh?"true":"false";
      status("CAD rebuild failed · showing last valid solid: "+String(error),true);
    }
  },180);
}
function renderToolOptions():void {
  const panel=byId("shape-options");panel.replaceChildren();
  if(activeTool!=="polygon"&&activeTool!=="slot"&&activeTool!=="line"){panel.hidden=true;return;}
  panel.hidden=false;
  if(activeTool==="line"){
    panel.append(textNode("Line / polyline"));
    const finish=document.createElement("button");finish.textContent="Finish open";
    finish.onclick=()=>canvas.finishLine(false);
    const close=document.createElement("button");close.textContent="Close outline";
    close.onclick=()=>canvas.finishLine(true);
    panel.append(finish,close);return;
  }
  if(activeTool==="slot"){
    panel.append(textNode("Slot radius (mm)"));
    panel.append(numField("Radius",slotRadius,n=>{
      if(!(n>0))throw new Error("Radius must be positive");
      slotRadius=n;canvas.setSlotRadius(n);
    }));
  }
  if(activeTool==="polygon"){
    panel.append(textNode("Polygon"));
    panel.append(numField("Sides (3–64)",prefs.polygon.sides,n=>{
      prefs=validatePreferences({...prefs,polygon:{...prefs.polygon,sides:n}});
      persistPreferences();renderToolOptions();
    }));
    panel.append(numField("Rotation °",prefs.polygon.rotation,n=>{
      prefs=validatePreferences({...prefs,polygon:{...prefs.polygon,rotation:n}});
      persistPreferences();
    }));
  }
}
function textNode(text:string):HTMLElement{
  const el=document.createElement("strong");el.textContent=text;return el;
}
function restoreCommittedPreview():void {
  const host=byId("preview");
  delete host.dataset.cutToolVolumeMm3;
  delete host.dataset.cutRemovedVolumeMm3;
  delete host.dataset.cutToolBoundsMm;
  byId("cut-tool-metrics").hidden=true;
  delete host.dataset.previewState;
  delete host.dataset.previewVolumeMm3;
  delete host.dataset.previewOperation;
  byId("solid-preview-status").hidden=true;
  if(committedBuild)
    preview?.setMesh(committedBuild.mesh,{preserveCamera:true});
  // If a rebuild has not returned, keep displaying the previous valid mesh.
}
function closeExtrude():void {
  extrudeCursor=null;
  ++previewToken;
  clearTimeout(previewTimer);
  extrudeTarget=null;
  extrudeTargets=[];
  byId("extrude-flyout").hidden=true;
  hideSurfaceContext();
  canvas.setExtrudeHandle(null);
  restoreCommittedPreview();
}
function throughAllBounds():[number,number] {
  if(lastStats)return [lastStats.boundsMm[0][2]-1,lastStats.boundsMm[1][2]+1];
  if(doc.features.length){
    const ends=doc.features.flatMap(f=>[f.z,f.z+f.depth]);
    return [Math.min(...ends)-1,Math.max(...ends)+1];
  }
  return [-1,9];
}
function resolveMode(): "add" | "cut" {
  const manual=select("extrude-mode").value;
  if(manual==="add"||manual==="cut")return manual;
  return suggestGroupOperation(doc,extrudeTargets);
}
function positionExtrudeMenu():void {
  if(!extrudeTargets.length)return;
  const flyout=byId("extrude-flyout");
  if(flyout.hidden)return;
  const viewport=canvas.getViewport();
  const cursor=extrudeCursor??canvas.getSelectedPoint()??{x:viewport.width/2,y:viewport.height/2};
  const result=placeExtrudeMenu({
    viewport,cursor,
    popup:{width:flyout.offsetWidth||258,height:flyout.offsetHeight||315},
    arrow:canvas.getExtrudeArrowScreen()
  });
  flyout.style.left=result.x+"px";
  flyout.style.top=result.y+"px";
  flyout.dataset.placementCorner=result.corner;
  flyout.dataset.arrowAvoidancePx=String(result.arrowAvoidancePx);
  delete flyout.dataset.majorGridPixels;
  delete flyout.dataset.placementSide;
}
/** A face pick references the committed solid, not any pending preview mesh. */
function fillFocusedFieldFromFace(z:number|null):void {
  if(!extrudeTargets.length||byId("extrude-flyout").hidden)return;
  if(z===null){
    status("Click a flat horizontal face of the committed solid to pick its Z elevation",true);
    return;
  }
  const field=input(facePickField==="z"?"extrude-z":"extrude-depth");
  if(facePickField==="z"){
    field.value=String(z);
  }else{
    const start=Number(input("extrude-z").value);
    if(!Number.isFinite(start)){
      status("Enter a valid Start Z before picking target Depth",true);return;
    }
    const signed=depthToFace(start,z);
    if(signed===0){
      status("Target face is level with Start Z: depth cannot be zero",true);return;
    }
    field.value=String(signed);
  }
  input("extrude-through").checked=false;
  const depth=Number(input("extrude-depth").value);
  if(extrudeTarget&&Number.isFinite(depth)&&depth!==0)
    canvas.setExtrudeHandle({id:extrudeTarget,depth});
  const host=byId("preview");
  host.dataset.lastPickedFaceZ=String(z);
  host.dataset.lastPickedField=facePickField;
  status(facePickField==="z"?"Start Z set to "+z+" mm":
    "Depth set to "+field.value+" mm (relative to Start Z)");
  positionExtrudeMenu();
  scheduleOperationPreview();
  field.focus({preventScroll:true});
}
/** Cursor-adjacent label for the committed Solid face/vertex target. */
function updateSurfaceLabel(target:SurfaceTarget|null,pointer:{x:number,y:number}):void{
  const tag=byId("face-target-label");
  if(!target){
    tag.hidden=true;
    delete byId("preview").dataset.hoverLabel;
    return;
  }
  const armed=extrudeTargets.length?facePickField:null;
  const start=Number(input("extrude-z").value);
  const label=formatSurfaceTarget(target,armed,Number.isFinite(start)?start:0);
  if(!label){tag.hidden=true;return;}
  tag.textContent=label;
  tag.hidden=false;
  byId("preview").dataset.hoverLabel=label;
  const parent=byId("preview").parentElement!.getBoundingClientRect();
  const x=pointer.x-parent.left+13,y=pointer.y-parent.top+14;
  tag.style.left=Math.max(7,Math.min(parent.width-195,x))+"px";
  tag.style.top=Math.max(47,Math.min(parent.height-35,y))+"px";
}
function hideSurfaceContext():void{
  byId("face-context-menu").hidden=true;
  contextSurface=null;contextFeatureId=null;
}
function showSurfaceContext(target:SurfaceTarget|null,pointer:{x:number,y:number}):void{
  hideSurfaceContext();
  if(!target)return;
  if(target.z!==null)lastSurfaceZ=target.z;
  contextSurface=target;
  const panel=byId("face-context-menu");
  panel.replaceChildren();
  const title=document.createElement("div");
  title.className="face-context-title";
  title.textContent=formatSurfaceTarget(target,null,0);
  panel.append(title);
  const hasProfile=extrudeTargets.length>0||selectedIds.length>0;
  const action=(name:string,enabled:boolean,run:()=>void)=>{
    const btn=document.createElement("button");
    btn.type="button";btn.role="menuitem";btn.textContent=name;
    btn.disabled=!enabled;btn.dataset.faceAction=name;
    btn.onclick=()=>{hideSurfaceContext();run();};
    panel.append(btn);
  };
  action("Latch Start Z",target.z!==null&&hasProfile,()=>{
    if(!extrudeTargets.length)openExtrude();
    facePickField="z";
    fillFocusedFieldFromFace(target.z);
  });
  action("Latch Depth",target.z!==null&&hasProfile,()=>{
    if(!extrudeTargets.length)openExtrude();
    facePickField="depth";
    fillFocusedFieldFromFace(target.z);
  });
  const feature=featureForSurface(doc,target);
  let deletable=false;
  if(feature){
    try{
      validateDocument({...doc,features:doc.features.filter(f=>f.id!==feature.id)});
      deletable=true;
    }catch{deletable=false;}
  }
  contextFeatureId=deletable&&feature?feature.id:null;
  action("Delete Feature",deletable&&feature!==null,()=>{
    if(!feature)return;
    safe(()=>{
      const next=validateDocument({...doc,features:doc.features.filter(f=>f.id!==feature.id)});
      closeExtrude();
      change(next);
      status("Deleted feature "+feature.id+" · Undo restores it");
    });
  });
  if(!feature){
    const note=document.createElement("small");
    note.className="face-context-note";
    note.textContent="Delete unavailable: no uniquely identified source feature";
    panel.append(note);
  }
  const rect=byId("preview").parentElement!.getBoundingClientRect();
  panel.style.left=Math.max(8,Math.min(rect.width-230,pointer.x-rect.left))+"px";
  panel.style.top=Math.max(48,Math.min(rect.height-176,pointer.y-rect.top))+"px";
  panel.hidden=false;
  byId("preview").dataset.contextTargetKind=target.kind;
  if(contextFeatureId)byId("preview").dataset.contextFeatureId=contextFeatureId;
  else delete byId("preview").dataset.contextFeatureId;
}
function previewError(error:unknown):void {
  const label=byId("extrude-preview-error");
  label.hidden=false;
  label.textContent=error instanceof Error?error.message:String(error);
}
function scheduleOperationPreview():void {
  const token=++previewToken;
  clearTimeout(previewTimer);
  const error=byId("extrude-preview-error");
  error.hidden=true;error.textContent="";
  if(!extrudeTargets.length||!input("extrude-preview").checked){
    restoreCommittedPreview();
    return;
  }
  const host=byId("preview");
  const label=byId("solid-preview-status");
  label.hidden=false;label.textContent="CALCULATING PREVIEW…";
  host.dataset.previewState="loading";
  delete host.dataset.previewVolumeMm3;
  delete host.dataset.previewOperation;
  const source=doc,ids=[...extrudeTargets],mode=resolveMode();
  const z=Number(input("extrude-z").value),depth=Number(input("extrude-depth").value);
  previewTimer=setTimeout(async()=>{
    if(token!==previewToken)return;
    let candidate:CadDocument;
    try{
      candidate=documentWithExtrusions(source,ids,mode,z,depth);
    }catch(e){
      if(token===previewToken){restoreCommittedPreview();previewError(e);}
      return;
    }
    // A single in-flight preview plus debouncing prevents unbounded worker queues
    // during continuous dragging. Only the newest request is ever displayed.
    if(previewInFlight)return;
    previewInFlight=true;
    try{
      const pendingIds=candidate.features.slice(source.features.length).map(f=>f.id);
      const result=await kernel.build(candidate,{cutToolFeatureIds:mode==="cut"?pendingIds:[]});
      if(token!==previewToken||doc!==source||!extrudeTargets.length||!input("extrude-preview").checked)return;
      preview?.setMesh(result.mesh,{pending:mode,preserveCamera:true,
        cutTool:result.cutTool?.mesh});
      host.dataset.previewState="ready";
      host.dataset.previewOperation=mode;
      if(result.statistics)host.dataset.previewVolumeMm3=String(result.statistics.volumeMm3);
      const metrics=byId("cut-tool-metrics");
      if(mode==="cut"&&result.cutTool&&result.statistics&&lastStats){
        const full=result.cutTool.statistics.volumeMm3;
        const removed=Math.max(0,lastStats.volumeMm3-result.statistics.volumeMm3);
        host.dataset.cutToolVolumeMm3=String(full);
        host.dataset.cutRemovedVolumeMm3=String(removed);
        host.dataset.cutToolBoundsMm=JSON.stringify(result.cutTool.statistics.boundsMm);
        metrics.textContent="Red tool: "+full.toFixed(2)+" mm³ · Material removed: "+
          removed.toFixed(2)+" mm³ · Overshoot shown";
        metrics.hidden=false;
      }else{
        delete host.dataset.cutToolVolumeMm3;
        delete host.dataset.cutRemovedVolumeMm3;
        delete host.dataset.cutToolBoundsMm;
        metrics.hidden=true;
      }
      label.hidden=false;
      label.textContent="PREVIEW · "+mode.toUpperCase()+" · NOT APPLIED";
    }catch(e){
      if(token===previewToken){
        restoreCommittedPreview();
        previewError("Preview failed: "+String(e));
      }
    }finally{
      previewInFlight=false;
      if(token!==previewToken&&extrudeTargets.length&&input("extrude-preview").checked){
        scheduleOperationPreview();
      }
    }
  },250);
}
function updateExtrudeMode():void {
  if(!extrudeTarget)return;
  const mode=resolveMode();
  const autoOption=select("extrude-mode").options[0];
  autoOption.textContent="Auto → "+(mode==="cut"?"Cut":"Add");
  const thru=input("extrude-through");
  const hadThrough=thru.checked;
  thru.disabled=mode!=="cut"||doc.features.length===0;
  if(thru.disabled){
    thru.checked=false;
    if(hadThrough){
      input("extrude-z").value="0";
      input("extrude-depth").value="8";
    }
  }
  if(mode==="cut"&&doc.features.length&&!thru.checked){
    const [lo,hi]=throughAllBounds();
    const remembered=prefs.rememberSurfaces?lastSurfaceZ:null;
    if(remembered!==null&&remembered>=lo&&remembered<=hi){
      input("extrude-z").value=String(remembered);
      input("extrude-depth").value=String(
        remembered>lo?lo-remembered:hi-remembered);
    }else{
      input("extrude-z").value=String(lo);
      input("extrude-depth").value=String(hi-lo);
    }
    thru.checked=true;
  }
  canvas.setExtrudeHandle({id:extrudeTarget,depth:Number(input("extrude-depth").value)||8});
  positionExtrudeMenu();
  scheduleOperationPreview();
}
function openExtrude(id?:string,operation?:"add"|"cut",at?:Point2):void {
  const ids = id ? (selectedIds.includes(id) ? [...selectedIds] : [id]) : [...selectedIds];
  if(!ids.length){
    setTool("extrude");status("Click a closed shape to extrude or cut");
    return;
  }
  const targets=selectedProfiles(doc,ids);
  if(targets.length!==ids.length||targets.some(p=>!isClosed(p))){
    status("Only closed, valid sketch profiles can be extruded. Close any open lines first.",true);
    return;
  }
  closeMenu();
  // Close a prior flyout to cancel any pending preview and restore the base mesh.
  closeExtrude();
  selectedIds=ids;selectedId=id??ids.at(-1)??null;
  activeTool="extrude";
  canvas.setTool("extrude");
  document.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach(el=>
    el.classList.toggle("active",el.dataset.tool==="extrude"));
  extrudeTargets=ids;
  extrudeTarget=selectedId;
  // Snapshot the cursor when E opens. Later Solid clicks never move the popup.
  extrudeCursor=at??canvas.getLastPointerScreen()??canvas.getSelectedPoint();
  canvas.setSelected(selectedId,selectedIds);
  const flyout=byId("extrude-flyout");
  flyout.hidden=false;
  byId("extrude-target").textContent=ids.length>1?
    ids.length+" profiles selected":targets[0].kind+" · "+ids[0].slice(0,12);
  select("extrude-mode").value=operation||"auto";
  const remembered=prefs.rememberSurfaces&&lastSurfaceZ!==null&&
    doc.features.some(f=>Math.abs(f.z-lastSurfaceZ!)<.001||
      Math.abs(f.z+f.depth-lastSurfaceZ!)<.001)?lastSurfaceZ:0;
  input("extrude-z").value=String(remembered);
  input("extrude-depth").value="8";
  input("extrude-through").checked=false;
  input("extrude-preview").checked=previewEnabled;
  updateExtrudeMode();
  render();
  facePickField="depth";
  input("extrude-depth").focus();
}
function applyExtrude():void {
  if(!extrudeTargets.length)return;
  const mode=resolveMode();
  const z=Number(input("extrude-z").value),depth=Number(input("extrude-depth").value);
  const ids=[...extrudeTargets];
  safe(()=>{
    // One atomic document-history step for an arbitrary Ctrl-selected group.
    const result=documentWithExtrusions(doc,ids,mode,z,depth);
    closeExtrude();
    change(result);
    setTool("select");
  });
}
function toggleDetails(id:string):void{byId<HTMLDetailsElement>(id).open=true;closeMenu();}
function download(blob:Blob,filename:string):void {
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=filename;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
function filename():string{return doc.name.toLowerCase().replace(/[^a-z0-9_-]+/g,"-").replace(/^-|-$/g,"")||"part";}
function saveProject():void{
  download(new Blob([JSON.stringify(doc,null,2)],{type:"application/json"}),filename()+".flatcad.json");
  status("Editable native project downloaded");
}
function newProject():void {
  lastSurfaceZ=null;
  selectedId=null;closeExtrude();
  change({schemaVersion:2,name:"Untitled part",units:"mm",profiles:[],features:[]});
  setTool("select");
}
async function openProject(file:File):Promise<void>{
  if(file.size>2_000_000)throw new Error("Project exceeds 2 MB");
  const loaded=validateDocument(JSON.parse(await file.text()));
  doc=loaded;history=[doc];historyIndex=0;selectedId=null;lastSurfaceZ=null;
  persistDocument();closeExtrude();render();rebuild();
  status("Project loaded · "+doc.profiles.length+" profiles");
}
async function exportStep():Promise<void>{
  if(!doc.features.length){status("Extrude at least one profile first",true);return;}
  const snapshot=doc;status("Exporting exact STEP geometry…");
  try{
    const blob=await kernel.exportSTEP(snapshot);
    if(blob.size<100)throw new Error("STEP export returned an empty or invalid file");
    download(blob,filename()+".step");status("STEP exported · independent reader qualification remains required");
  }catch(error){status("STEP export failed: "+String(error),true);}
}
const MENU:Record<string,[string,string][]> = {
 file:[["New project","file.new"],["Open project…","file.open"],["Save native project","file.save"],["Export STEP","file.step"]],
 sketch:[["Select","tool.select"],["Line / polyline","tool.line"],["Rectangle","tool.rectangle"],
   ["Centre rectangle","tool.centerRectangle"],["Circle","tool.circle"],["Regular polygon","tool.polygon"],
   ["Slot","tool.slot"],["Finish open line","line.finish"],["Close line outline","line.close"],
   ["Duplicate selected","edit.duplicate"],["Delete selected","edit.delete"],["Exact properties","view.properties"]],
 model:[["Extrude / Cut (Auto)","feature.extrude"],["Add extrusion","model.add"],
   ["Subtract extrusion","model.cut"],["Feature history","view.history"]],
 view:[["Pan","tool.pan"],["Fit Solid View","view.fit"],["Grid and snapping…","dialog.grid"],["Profile list","view.profiles"],
   ["Properties","view.properties"],["History","view.history"]],
 settings:[["Keyboard shortcuts…","dialog.shortcuts"],["Grid and snapping…","dialog.grid"],
   ["CAD navigation controls…","dialog.navigation"],
   ["Toggle remember mouse surfaces","prefs.remember"],
   ["Export settings JSON","prefs.export"],["Import settings JSON","prefs.import"],["Reset settings","prefs.reset"]]
};
function closeMenu():void{activeMenu=null;byId("menu-popover").hidden=true;}
function openMenu(name:string):void{
  if(activeMenu===name){closeMenu();return;}
  activeMenu=name;const panel=byId("menu-popover");panel.replaceChildren();
  const anchor=document.querySelector<HTMLElement>('[data-menu="'+name+'"]');
  if(anchor){panel.style.left=Math.max(0,anchor.offsetLeft)+"px";}
  for(const [label,action] of MENU[name]||[]){
    const b=document.createElement("button");
    b.dataset.command=action;b.setAttribute("role","menuitem");
    b.textContent=label;
    const chord=prefs.shortcuts[action as ShortcutAction];
    if(chord){
      const hint=document.createElement("span");hint.textContent=displayShortcut(chord);hint.className="menu-shortcut";b.append(hint);
    }
    b.onclick=()=>{closeMenu();command(action);};
    panel.append(b);
  }
  panel.hidden=false;
}
function command(action:string):void{
  if(action.startsWith("tool.")){setTool(action.slice(5) as SketchTool);return;}
  switch(action){
    case "feature.extrude":openExtrude();break;
    case "model.add":openExtrude(undefined,"add");break;
    case "model.cut":openExtrude(undefined,"cut");break;
    case "edit.delete":safe(removeSelected);break;
    case "edit.duplicate":safe(duplicateSelected);break;
    case "edit.undo":undoRedo(historyIndex-1);break;
    case "edit.redo":undoRedo(historyIndex+1);break;
    case "line.finish":canvas.finishLine(false);break;
    case "line.close":canvas.finishLine(true);break;
    case "view.properties":toggleDetails("properties-details");break;
    case "view.profiles":toggleDetails("profiles-details");break;
    case "view.history":toggleDetails("history-details");break;
    case "view.fit":preview?.fitView();break;
    case "file.new":newProject();break;
    case "file.open":input("project-input").click();break;
    case "file.save":saveProject();break;
    case "file.step":void exportStep();break;
    case "dialog.shortcuts":showShortcuts();break;
    case "dialog.grid":showGrid();break;
    case "dialog.navigation":showNavigation();break;
    case "prefs.export":exportSettings();break;
    case "prefs.import":input("settings-input").click();break;
    case "prefs.remember":
      prefs=validatePreferences({...prefs,rememberSurfaces:!prefs.rememberSurfaces});
      persistPreferences();
      status("Remember mouse surfaces "+(prefs.rememberSurfaces?"enabled":"disabled"));
      break;
    case "prefs.reset":prefs=defaultPreferences();persistPreferences();status("Settings reset to defaults");break;
  }
}
function dialog(id:string):HTMLDialogElement{return byId<HTMLDialogElement>(id);}
function showShortcuts():void{
  closeMenu();renderShortcuts();dialog("shortcuts-dialog").showModal();
}
function renderShortcuts():void {
  const area=byId("shortcut-rows");area.replaceChildren();
  for(const [action,label] of Object.entries(ACTION_LABELS) as [ShortcutAction,string][]){
    const row=document.createElement("div");row.className="shortcut-row";
    const title=document.createElement("span");title.textContent=label;
    const key=document.createElement("button");key.className="button shortcut-key";
    key.textContent=shortcutRecording===action?"Press keys…":displayShortcut(prefs.shortcuts[action])||"Unassigned";
    key.dataset.action=action;
    key.onclick=()=>{
      shortcutRecording=action;byId("shortcut-error").textContent="Press a key combination · Esc to cancel";
      renderShortcuts();
    };
    const clear=document.createElement("button");clear.className="text-button";clear.textContent="Clear";
    clear.onclick=()=>{
      shortcutRecording=null;
      prefs=validatePreferences({...prefs,shortcuts:{...prefs.shortcuts,[action]:""}});
      persistPreferences();renderShortcuts();
    };
    row.append(title,key,clear);area.append(row);
  }
}
function showNavigation():void{
  closeMenu();
  const control=select("navigation-preset");
  control.replaceChildren();
  for(const preset of NAVIGATION_PRESETS){
    const option=document.createElement("option");option.value=preset;
    option.textContent=NAVIGATION_LABELS[preset];control.append(option);
  }
  control.value=prefs.navigation;
  input("remember-surfaces").checked=prefs.rememberSurfaces;
  byId("navigation-hint").textContent=NAVIGATION_HINTS[prefs.navigation];
  dialog("navigation-dialog").showModal();
}
function showGrid():void{
  closeMenu();renderGrid();dialog("grid-dialog").showModal();
}
function renderGrid():void{
  const area=byId("grid-rows");area.replaceChildren();
  prefs.grid.tiers.forEach((tier,i)=>{
    const row=document.createElement("div");row.className="grid-tier-row";
    const label=document.createElement("strong");label.textContent=tier.label;
    const enabled=document.createElement("input");enabled.type="checkbox";enabled.checked=tier.enabled;enabled.title="Display "+tier.label;
    const spacing=document.createElement("input");spacing.type="number";spacing.step="any";spacing.min="0.001";
    spacing.value=String(tier.spacing);spacing.setAttribute("aria-label",tier.label+" spacing mm");
    const color=document.createElement("input");color.type="color";color.value=tier.color;
    color.setAttribute("aria-label",tier.label+" grid colour");
    const snap=document.createElement("input");snap.type="checkbox";snap.checked=tier.snap;snap.title="Snap "+tier.label;
    const update=()=>{
      try{
        const layers=prefs.grid.tiers.map((x,k)=>k===i?{...x,enabled:enabled.checked,
          spacing:Number(spacing.value),color:color.value,snap:snap.checked}:x) as Preferences["grid"]["tiers"];
        prefs=validatePreferences({...prefs,grid:{...prefs.grid,tiers:layers}});
        persistPreferences();byId("grid-error").textContent="";
      }catch(error){byId("grid-error").textContent=String(error);}
    };
    for(const el of [enabled,spacing,color,snap])el.addEventListener("change",update);
    const spacingLabel=document.createElement("span");spacingLabel.textContent="Spacing mm";
    const snapLabel=document.createElement("span");snapLabel.textContent="Snap";
    row.append(label,enabled,spacingLabel,spacing,color,snapLabel,snap);
    area.append(row);
  });
  const geometryRow=document.createElement("label");geometryRow.className="check geom-snap";
  const tick=document.createElement("input");tick.type="checkbox";tick.checked=prefs.grid.snapGeometry;
  tick.onchange=()=>{
    prefs=validatePreferences({...prefs,grid:{...prefs.grid,snapGeometry:tick.checked}});
    persistPreferences();
  };
  geometryRow.append(tick,document.createTextNode("Snap to existing geometry (vertices, centres, midpoints)"));
  area.append(geometryRow);
}
function exportSettings():void {
  download(new Blob([JSON.stringify(prefs,null,2)],{type:"application/json"}),"flatcad-settings.json");
  status("Keyboard, grid, polygon and mouse navigation settings exported");
}
async function importSettings(file:File):Promise<void>{
  if(file.size>100000)throw new Error("Settings JSON exceeds 100 KB");
  const replacement=validatePreferences(JSON.parse(await file.text()));
  prefs=replacement;persistPreferences();
  renderToolOptions();
  if(dialog("shortcuts-dialog").open)renderShortcuts();
  if(dialog("grid-dialog").open)renderGrid();
  if(dialog("navigation-dialog").open){
    select("navigation-preset").value=prefs.navigation;
    input("remember-surfaces").checked=prefs.rememberSurfaces;
    byId("navigation-hint").textContent=NAVIGATION_HINTS[prefs.navigation];
  }
  status("Settings imported and applied");
}

// UI events. All menu commands reuse the exact same implementations as direct controls.
input("remember-surfaces").onchange=()=>{
  prefs=validatePreferences({...prefs,rememberSurfaces:input("remember-surfaces").checked});
  persistPreferences();
};
select("navigation-preset").onchange=()=>{
  prefs=validatePreferences({...prefs,navigation:select("navigation-preset").value as NavigationPreset});
  persistPreferences();
  byId("navigation-hint").textContent=NAVIGATION_HINTS[prefs.navigation];
};
document.querySelectorAll<HTMLButtonElement>("[data-menu]").forEach(el=>{
  el.onclick=()=>openMenu(el.dataset.menu!);
});
document.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach(el=>{
  el.onclick=()=>setTool(el.dataset.tool as SketchTool);
});
byId("sketch-wrap").addEventListener("pointerdown",event=>{
  if(!(event.target as HTMLElement).closest(".menu-popover"))closeMenu();
});
document.addEventListener("pointerdown",event=>{
  if(!(event.target as HTMLElement).closest("#menus"))closeMenu();
  if(!(event.target as HTMLElement).closest("#face-context-menu"))hideSurfaceContext();
});
button("quick-extrude").onclick=()=>openExtrude();
button("selection-extrude").onclick=()=>openExtrude();
button("selection-delete").onclick=()=>safe(removeSelected);
button("selection-duplicate").onclick=()=>safe(duplicateSelected);
button("selection-properties").onclick=()=>toggleDetails("properties-details");
button("grid-quick").onclick=showGrid;
button("fit-solid").onclick=()=>preview?.fitView();
byId<HTMLDetailsElement>("history-details").addEventListener("toggle",()=>{
  if(byId<HTMLDetailsElement>("history-details").open)
    ensureHistoryThumbnails();
});
button("cancel-extrude").onclick=closeExtrude;
button("dismiss-extrude").onclick=closeExtrude;
button("apply-extrude").onclick=applyExtrude;
select("extrude-mode").addEventListener("change",updateExtrudeMode);
input("extrude-preview").onchange=()=>{
  previewEnabled=input("extrude-preview").checked;
  scheduleOperationPreview();
};
input("extrude-through").onchange=()=>{
  if(input("extrude-through").checked){
    const [min,max]=throughAllBounds();
    input("extrude-z").value=String(min);input("extrude-depth").value=String(max-min);
  }
  canvas.setExtrudeHandle({id:extrudeTarget||"",depth:Number(input("extrude-depth").value)||8});
  scheduleOperationPreview();
};
input("extrude-depth").oninput=()=>{
  if(!extrudeTarget)return;
  const depth=Number(input("extrude-depth").value);
  input("extrude-through").checked=false;
  // Never silently rewrite an explicit/face-picked start plane.
  if(Number.isFinite(depth)&&depth!==0)
    canvas.setExtrudeHandle({id:extrudeTarget,depth});
  positionExtrudeMenu();
  scheduleOperationPreview();
};
input("extrude-z").oninput=()=>{
  input("extrude-through").checked=false;
  scheduleOperationPreview();
};
input("extrude-z").addEventListener("focus",()=>{facePickField="z";});
input("extrude-depth").addEventListener("focus",()=>{facePickField="depth";});
button("undo").onclick=()=>undoRedo(historyIndex-1);
button("redo").onclick=()=>undoRedo(historyIndex+1);
input("document-name").onchange=()=>safe(()=>change(validateDocument({...doc,name:input("document-name").value.trim()})));
input("project-input").onchange=async event=>{
  const el=event.target as HTMLInputElement;
  if(el.files?.[0]){
    try{await openProject(el.files[0]);}
    catch(error){status("Project import rejected: "+String(error),true);}
  }
  el.value="";
};
input("settings-input").onchange=async event=>{
  const el=event.target as HTMLInputElement;
  if(el.files?.[0]){
    try{await importSettings(el.files[0]);}
    catch(error){status("Settings import rejected: "+String(error),true);}
  }
  el.value="";
};
document.querySelectorAll<HTMLButtonElement>("[data-close]").forEach(el=>{
  el.onclick=()=>dialog(el.dataset.close!).close();
});
button("shortcut-reset").onclick=()=>{
  prefs=validatePreferences({...prefs,shortcuts:{...defaultPreferences().shortcuts}});
  persistPreferences();shortcutRecording=null;renderShortcuts();
};
button("grid-reset").onclick=()=>{
  prefs=validatePreferences({...prefs,grid:defaultPreferences().grid});
  persistPreferences();renderGrid();
};
button("settings-export").onclick=exportSettings;
button("settings-import").onclick=()=>input("settings-input").click();

document.addEventListener("keydown",event=>{
  if(shortcutRecording){
    event.preventDefault();event.stopPropagation();
    if(event.code==="Escape"){shortcutRecording=null;renderShortcuts();return;}
    const action=shortcutRecording;
    try{
      const chord=validateShortcut(chordFromEvent(event));
      prefs=validatePreferences({...prefs,shortcuts:{...prefs.shortcuts,[action]:chord}});
      shortcutRecording=null;persistPreferences();byId("shortcut-error").textContent="";renderShortcuts();
    }catch(error){byId("shortcut-error").textContent=String(error);}
    return;
  }
  if(dialog("shortcuts-dialog").open||dialog("grid-dialog").open||dialog("navigation-dialog").open)return;
  if(!byId("extrude-flyout").hidden){
    if(event.code==="Escape"){event.preventDefault();closeExtrude();setTool("select");return;}
    if(event.code==="Enter"){event.preventDefault();applyExtrude();return;}
  }
  if(activeTool==="line"){
    if(event.code==="Escape"){event.preventDefault();canvas.cancelLine();return;}
    if(event.code==="Enter"){event.preventDefault();canvas.finishLine(false);return;}
    if(event.code==="Backspace"){event.preventDefault();canvas.removeLastLinePoint();return;}
  }
  const target=event.target as HTMLElement;
  if(target.closest("input,textarea,select,[contenteditable]"))return;
  let chord=chordFromEvent(event);
  // Ctrl/Command shortcuts map to one user-facing preference unless rebound.
  if(event.metaKey&&!event.ctrlKey)chord=chord.replace("Meta+","Control+");
  const selectedShortcut=Object.entries(prefs.shortcuts).find(([,value])=>value===chord)?.[0];
  if(selectedShortcut){event.preventDefault();command(selectedShortcut);return;}
  if(chord==="Control+KeyY"){event.preventDefault();undoRedo(historyIndex+1);return;}
  if(chord==="KeyF"){event.preventDefault();preview?.fitView();return;}
  if(chord==="Escape"){
    if(!byId("face-context-menu").hidden)hideSurfaceContext();
    else if(activeMenu)closeMenu();else setTool("select");return;
  }
});
document.addEventListener("keydown",event=>{
  if(event.code==="Space"&&!event.repeat&&!(event.target as HTMLElement).closest("input,textarea,select")&&
    !dialog("shortcuts-dialog").open&&!dialog("grid-dialog").open&&!dialog("navigation-dialog").open){
    if(activeTool!=="pan"){event.preventDefault();priorTool=activeTool;setTool("pan");}
  }
});
let priorTool:SketchTool|null=null;
document.addEventListener("keyup",event=>{
  if(event.code==="Space"&&priorTool){setTool(priorTool);priorTool=null;}
});
window.addEventListener("storage",event=>{
  if(event.key===PREFS_KEY){
    prefs=loadPreferences();canvas.setPreferences(prefs);
    preview?.setNavigationPreset(prefs.navigation);
    byId("extrude-nav-hint").textContent=NAVIGATION_HINTS[prefs.navigation];
    input("remember-surfaces").checked=prefs.rememberSurfaces;
  }
});
byId("extrude-nav-hint").textContent=NAVIGATION_HINTS[prefs.navigation];
window.addEventListener("resize",()=>positionExtrudeMenu());
setTool(activeTool);render();rebuild();
