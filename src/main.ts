import "./styles.css";
import {
  DEMO, appendFeature, appendProfile, deleteProfile, newId, updateProfile, validateDocument,
  type CadDocument, type Feature, type Profile
} from "./model";
import { SketchCanvas, type SketchTool } from "./sketch-canvas";
import { KernelClient } from "./kernel-client";
import { Preview } from "./preview";

const key = "flatcad.project.v1";
const root = document.getElementById("app");
if (!root) throw new Error("Missing #app");
root.innerHTML = [
  '<div class="shell">',
  '  <header class="topbar">',
  '    <div class="brand"><span class="brand-icon">▣</span><div><strong>flat<span>CAD</span></strong><small>Single-plane parametric modelling</small></div></div>',
  '    <div class="document-title"><span class="muted">PROJECT</span><input id="document-name" aria-label="Project name" maxlength="128"></div>',
  '    <div class="top-actions">',
  '      <button id="new" class="button muted-button" title="New empty document">New</button>',
  '      <button id="open" class="button muted-button">Open</button>',
  '      <button id="save" class="button muted-button">Save project</button>',
  '      <button id="export" class="button primary" title="Export exact B-rep to STEP">Export STEP</button>',
  '      <input type="file" id="file-input" accept=".json,.flatcad.json,application/json" hidden>',
  '    </div>',
  '  </header>',
  '  <main class="workspace">',
  '    <section class="panel sketch-section">',
  '      <div class="panel-head sketch-head">',
  '        <div class="header-label"><span class="panel-index">01</span><div><strong>Sketch</strong><small>XY plane · millimetres</small></div></div>',
  '        <div class="tools" role="toolbar" aria-label="Sketch tools">',
  '          <button data-tool="select" class="tool active" title="Select (V)">↖<span>Select</span></button>',
  '          <button data-tool="rectangle" class="tool" title="Rectangle (R)">▭<span>Rect</span></button>',
  '          <button data-tool="circle" class="tool" title="Circle (O)">◯<span>Circle</span></button>',
  '          <button data-tool="pan" class="tool" title="Pan (P)">✥<span>Pan</span></button>',
  '        </div>',
  '      </div>',
  '      <div class="sketch-wrap"><canvas id="sketch" aria-label="2D sketch area">A Canvas 2D browser is required.</canvas>',
  '        <span class="canvas-note">DRAG TO DRAW · WHEEL TO ZOOM · MIDDLE BUTTON TO PAN</span></div>',
  '      <div class="panel-footer"><label class="check"><input type="checkbox" id="snap" checked> Snap to 5 mm grid</label>',
  '        <span class="muted" id="zoom">4 px/mm</span><span class="muted">X → · Y ↑</span></div>',
  '    </section>',
  '    <section class="side-section">',
  '      <section class="panel solid-section">',
  '        <div class="panel-head"><div class="header-label"><span class="panel-index">02</span><div><strong>Solid preview</strong><small>Exact B-rep · triangulated display</small></div></div><span class="chip">Z ↑</span></div>',
  '        <div id="preview" class="preview-root"><span class="placeholder">Initializing 3D renderer…</span></div>',
  '        <div class="panel-footer"><span class="muted">Drag to orbit · wheel to zoom</span><span class="muted">XY → Z</span></div>',
  '      </section>',
  '      <div class="inspector-columns">',
  '        <section class="panel inspector-section">',
  '          <div class="panel-head"><div class="header-label"><span class="panel-index">03</span><div><strong>Profiles</strong><small>Editable 2D geometry</small></div></div><span id="profile-count" class="chip">0</span></div>',
  '          <div class="pane-scroll"><div id="profile-list" class="profile-list"></div><div id="inspector" class="inspector"></div></div>',
  '        </section>',
  '        <section class="panel features-section">',
  '          <div class="panel-head"><div class="header-label"><span class="panel-index">04</span><div><strong>Operations</strong><small>Add / subtract solid material</small></div></div></div>',
  '          <div class="pane-scroll">',
  '            <div class="form-card"><div class="form-heading">New feature <span class="muted">select a profile</span></div>',
  '              <div class="field-row"><label class="field"><span>Start Z (mm)</span><input type="number" step="any" id="feature-z" value="0"></label>',
  '                <label class="field"><span>Depth (mm)</span><input type="number" step="any" id="feature-depth" value="8"></label></div>',
  '              <div class="form-actions"><button class="button primary" id="add-feature">+ Extrude / Add</button><button class="button cut" id="cut-feature">− Cut</button></div>',
  '            </div>',
  '            <div class="form-heading feature-title">History <span class="muted">ordered</span></div><div id="feature-list" class="feature-list"></div>',
  '          </div>',
  '        </section>',
  '      </div>',
  '    </section>',
  '  </main>',
  '  <footer class="statusbar"><span class="live-dot" id="status-dot"></span><span id="status" role="status">Preparing workspace…</span>',
  '    <span class="status-right">M0 PROTOTYPE · NOT FABRICATION QUALIFIED</span>',
  '    <button class="status-action" id="undo" title="Undo (Ctrl+Z)">↶ Undo</button>',
  '    <button class="status-action" id="redo" title="Redo (Ctrl+Y)">↷ Redo</button>',
  '  </footer>',
  '</div>',
].join("\n");

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error("Missing element #" + id);
  return element as T;
}

function loadAutosave(): CadDocument {
  try {
    const data = localStorage.getItem(key);
    return data ? validateDocument(JSON.parse(data)) : DEMO;
  } catch (error) {
    console.warn("Saved project is invalid; loading example", error);
    return DEMO;
  }
}
let cad = loadAutosave();
let history: CadDocument[] = [cad];
let historyIndex = 0;
let selected: string | null = null;
let currentTool: SketchTool = "select";
let buildGeneration = 0;
let buildTimer: ReturnType<typeof setTimeout> | undefined;

const canvas = new SketchCanvas(
  byId<HTMLCanvasElement>("sketch"),
  cad,
  profile => {
    try {
      selected = profile.id;
      change(appendProfile(cad, profile));
      setTool("select");
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error), true); }
  },
  id => { selected = id; render(); }
);
const kernel = new KernelClient();
let preview: Preview | null = null;
try {
  const host = byId<HTMLDivElement>("preview");
  host.replaceChildren();
  preview = new Preview(host);
} catch (error) {
  byId("preview").textContent = "WebGL preview unavailable. Sketch editing and STEP export remain available.";
  setStatus(error instanceof Error ? error.message : String(error), true);
}

function setStatus(message: string, error = false): void {
  byId("status").textContent = message;
  byId("status-dot").classList.toggle("error", error);
}
function persist(): void {
  try { localStorage.setItem(key, JSON.stringify(cad)); }
  catch { setStatus("Local autosave is unavailable; use Save project", true); }
}
function change(next: CadDocument): void {
  cad = validateDocument(next);
  history = [...history.slice(0, historyIndex + 1), cad].slice(-80);
  historyIndex = history.length - 1;
  persist();
  render();
  scheduleBuild();
}
function restore(index: number): void {
  if (index < 0 || index >= history.length) return;
  historyIndex = index;
  cad = history[index];
  persist();
  render();
  scheduleBuild();
}
function setTool(tool: SketchTool): void {
  currentTool = tool;
  canvas.setTool(tool);
  document.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach(button => {
    const active = button.dataset.tool === tool;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}
function getProfile(id: string | null): Profile | undefined {
  return cad.profiles.find(p => p.id === id);
}

function renderProfiles(): void {
  const list = byId("profile-list");
  list.replaceChildren();
  for (const p of cad.profiles) {
    const button = document.createElement("button");
    button.className = "profile-item" + (p.id === selected ? " selected" : "");
    button.type = "button";
    const name = p.kind === "rectangle" ? "▭ Rectangle" : "◯ Circle";
    const dims = p.kind === "rectangle"
      ? p.width.toFixed(2) + " × " + p.height.toFixed(2)
      : "Ø" + (p.radius * 2).toFixed(2);
    button.textContent = name + "  ·  " + dims + " mm";
    button.title = p.id;
    button.addEventListener("click", () => { selected = p.id; render(); });
    list.appendChild(button);
  }
  if (cad.profiles.length === 0) list.textContent = "Draw a rectangle or circle to begin.";
  byId("profile-count").textContent = String(cad.profiles.length);
}

function makeNumberField(profile: Profile, property: "x" | "y" | "width" | "height" | "radius", title: string): HTMLLabelElement {
  const label = document.createElement("label");
  label.className = "field";
  const span = document.createElement("span");
  span.textContent = title;
  const input = document.createElement("input");
  input.type = "number";
  input.step = "any";
  input.value = String(profile[property as keyof typeof profile]);
  input.setAttribute("aria-label", title);
  input.addEventListener("change", () => {
    try {
      const updated = { ...profile, [property]: Number(input.value) } as Profile;
      change(updateProfile(cad, updated));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
      render();
    }
  });
  label.append(span, input);
  return label;
}
function renderInspector(): void {
  const panel = byId("inspector");
  panel.replaceChildren();
  const profile = getProfile(selected);
  if (!profile) {
    const empty = document.createElement("p");
    empty.className = "muted empty-note";
    empty.textContent = "Select a profile for precise dimensions.";
    panel.append(empty);
    return;
  }
  const heading = document.createElement("div");
  heading.className = "form-heading";
  heading.textContent = profile.kind === "rectangle" ? "Rectangle parameters" : "Circle parameters";
  const fields = document.createElement("div");
  fields.className = "field-row field-grid";
  fields.append(makeNumberField(profile, "x", profile.kind === "rectangle" ? "Left X (mm)" : "Centre X (mm)"));
  fields.append(makeNumberField(profile, "y", profile.kind === "rectangle" ? "Bottom Y (mm)" : "Centre Y (mm)"));
  if (profile.kind === "rectangle") {
    fields.append(makeNumberField(profile, "width", "Width (mm)"));
    fields.append(makeNumberField(profile, "height", "Height (mm)"));
  } else fields.append(makeNumberField(profile, "radius", "Radius (mm)"));
  const erase = document.createElement("button");
  erase.className = "button danger";
  erase.textContent = "Delete profile + dependent features";
  erase.onclick = () => {
    change(deleteProfile(cad, profile.id));
    selected = null;
    render();
  };
  panel.append(heading, fields, erase);
}

function renderFeatures(): void {
  const list = byId("feature-list");
  list.replaceChildren();
  cad.features.forEach((feature, index) => {
    const row = document.createElement("div");
    row.className = "feature-item";
    const badge = document.createElement("span");
    badge.className = "feature-icon " + feature.operation;
    badge.textContent = feature.operation === "add" ? "+" : "−";
    const text = document.createElement("div");
    text.className = "feature-copy";
    const label = document.createElement("strong");
    label.textContent = (index + 1) + ". " + (feature.operation === "add" ? "Extrude" : "Cut");
    const description = document.createElement("small");
    description.textContent = feature.profileId + " · Z " + feature.z + " → " + (feature.z + feature.depth) + " mm";
    text.append(label, description);
    const remove = document.createElement("button");
    remove.className = "delete-feature";
    remove.type = "button";
    remove.textContent = "×";
    remove.title = "Remove feature";
    remove.onclick = () => {
      try {
        change(validateDocument({ ...cad, features: cad.features.filter(f => f.id !== feature.id) }));
      } catch (error) { setStatus(error instanceof Error ? error.message : String(error), true); }
    };
    row.append(badge, text, remove);
    list.append(row);
  });
  if (cad.features.length === 0) {
    const note = document.createElement("p");
    note.className = "muted empty-note";
    note.textContent = "No solid operations. Select a profile and extrude.";
    list.append(note);
  }
}
function render(): void {
  if (selected && !getProfile(selected)) selected = null;
  canvas.setDocument(cad);
  canvas.setSelected(selected);
  renderProfiles();
  renderInspector();
  renderFeatures();
  byId<HTMLInputElement>("document-name").value = cad.name;
  byId<HTMLButtonElement>("export").disabled = cad.features.length === 0;
  byId<HTMLButtonElement>("cut-feature").disabled = !selected || cad.features.length === 0;
  byId<HTMLButtonElement>("add-feature").disabled = !selected;
  byId<HTMLButtonElement>("undo").disabled = historyIndex === 0;
  byId<HTMLButtonElement>("redo").disabled = historyIndex >= history.length - 1;
  byId("zoom").textContent = canvas.getZoom().toFixed(2) + " px/mm";
}

function scheduleBuild(): void {
  const generation = ++buildGeneration;
  if (buildTimer !== undefined) clearTimeout(buildTimer);
  setStatus(cad.features.length ? "Regenerating exact solid…" : "Sketch ready · add an extrusion");
  const snapshot = cad;
  buildTimer = setTimeout(async () => {
    try {
      const mesh = await kernel.build(snapshot);
      if (generation !== buildGeneration) return;
      preview?.setMesh(mesh);
      setStatus(mesh
        ? "Exact solid generated · " + (mesh.triangles.length / 3).toLocaleString() + " preview triangles"
        : "Sketch ready · add an extrusion");
    } catch (error) {
      if (generation !== buildGeneration) return;
      preview?.setMesh(null);
      setStatus("CAD build failed: " + (error instanceof Error ? error.message : String(error)), true);
    }
  }, 170);
}
function addOperation(operation: "add" | "cut"): void {
  if (!selected) { setStatus("Select a sketch profile first", true); return; }
  try {
    const feature: Feature = {
      id: newId("feature"), profileId: selected, operation,
      z: Number(byId<HTMLInputElement>("feature-z").value),
      depth: Number(byId<HTMLInputElement>("feature-depth").value)
    };
    change(appendFeature(cad, feature));
  } catch (error) { setStatus(error instanceof Error ? error.message : String(error), true); }
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function filenameBase(doc: CadDocument): string {
  return doc.name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "part";
}

document.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach(button => {
  button.addEventListener("click", () => setTool(button.dataset.tool as SketchTool));
});
byId<HTMLInputElement>("snap").addEventListener("change", event => {
  canvas.setSnap((event.target as HTMLInputElement).checked);
});
byId("add-feature").addEventListener("click", () => addOperation("add"));
byId("cut-feature").addEventListener("click", () => addOperation("cut"));
byId("undo").addEventListener("click", () => restore(historyIndex - 1));
byId("redo").addEventListener("click", () => restore(historyIndex + 1));
byId("new").addEventListener("click", () => {
  const empty: CadDocument = { schemaVersion: 1, name: "Untitled part", units: "mm", profiles: [], features: [] };
  selected = null;
  change(empty);
  setTool("select");
});
byId("save").addEventListener("click", () => {
  download(new Blob([JSON.stringify(cad, null, 2)], { type: "application/json" }), filenameBase(cad) + ".flatcad.json");
  setStatus("Native project downloaded; local autosave also retained");
});
byId("open").addEventListener("click", () => byId<HTMLInputElement>("file-input").click());
byId<HTMLInputElement>("file-input").addEventListener("change", async event => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > 2_000_000) throw new Error("Project exceeds 2 MB maximum");
    const loaded = validateDocument(JSON.parse(await file.text()));
    cad = loaded;
    history = [cad];
    historyIndex = 0;
    selected = null;
    persist(); render(); scheduleBuild();
    setStatus("Project loaded · " + cad.profiles.length + " profiles");
  } catch (error) {
    setStatus("Project load rejected: " + (error instanceof Error ? error.message : String(error)), true);
  } finally { input.value = ""; }
});
byId<HTMLInputElement>("document-name").addEventListener("change", event => {
  try { change(validateDocument({ ...cad, name: (event.target as HTMLInputElement).value.trim() })); }
  catch (error) { setStatus(error instanceof Error ? error.message : String(error), true); render(); }
});
byId("export").addEventListener("click", async () => {
  if (!cad.features.length) return;
  const snapshot = cad;
  const button = byId<HTMLButtonElement>("export");
  button.disabled = true;
  setStatus("Exporting exact B-rep to STEP…");
  try {
    const blob = await kernel.exportSTEP(snapshot);
    if (blob.size === 0) throw new Error("Kernel returned an empty STEP file");
    download(blob, filenameBase(snapshot) + ".step");
    setStatus("STEP generated · independent round-trip qualification still required");
  } catch (error) {
    setStatus("STEP export failed: " + (error instanceof Error ? error.message : String(error)), true);
  } finally {
    button.disabled = cad.features.length === 0;
  }
});
document.addEventListener("keydown", event => {
  const target = event.target as HTMLElement;
  const editing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    restore(historyIndex - 1);
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
    event.preventDefault(); restore(historyIndex + 1);
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault(); byId("save").click();
  } else if (!editing && !event.ctrlKey && !event.metaKey) {
    if (event.key.toLowerCase() === "v") setTool("select");
    if (event.key.toLowerCase() === "r") setTool("rectangle");
    if (event.key.toLowerCase() === "o") setTool("circle");
    if (event.key.toLowerCase() === "p") setTool("pan");
    if ((event.key === "Delete" || event.key === "Backspace") && selected) {
      change(deleteProfile(cad, selected));
      selected = null;
      render();
    }
  }
});
setTool(currentTool);
render();
scheduleBuild();
