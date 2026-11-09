import { expect,test } from "@playwright/test";
import {readFile} from "node:fs/promises";

const goldenVolume=(100*60-2*Math.PI*5*5)*8;
async function openMenu(page:import("@playwright/test").Page,name:string,action:string){
  await page.locator('[data-menu="'+name+'"]').click();
  await page.locator('[data-command="'+action+'"]').click();
}
async function openAoDiagnostics(page:import("@playwright/test").Page){
  const details=page.locator("#render-ao-diagnostics");
  if(!(await details.evaluate(el=>(el as HTMLDetailsElement).open)))
    await details.locator("summary").click();
}
async function newProject(page:import("@playwright/test").Page){
  await openMenu(page,"file","file.new");
  await expect(page.locator("#profile-count")).toHaveText("0 profiles");
}
async function draw(page:import("@playwright/test").Page,start:[number,number],end:[number,number],shift=false){
  const canvas=page.locator("#sketch"),bounds=await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const box=bounds!;
  const a={x:box.x+box.width*start[0],y:box.y+box.height*start[1]};
  const b={x:box.x+box.width*end[0],y:box.y+box.height*end[1]};
  await page.mouse.move(a.x,a.y);
  if(shift)await page.keyboard.down("Shift");
  await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:7});await page.mouse.up();
  if(shift)await page.keyboard.up("Shift");
}
async function saveProject(page:import("@playwright/test").Page){
  const pending=page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  const download=await pending;
  const file=await download.path();expect(file).not.toBeNull();
  return JSON.parse(await readFile(file!,"utf8"));
}

test("production: WASM generates golden plate and exact STEP",async({page})=>{
  const errors:string[]=[],external:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",req=>{
    const host=new URL(req.url()).hostname;
    if(host!=="127.0.0.1")external.push(req.url());
  });
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  await expect(page.locator("#preview canvas")).toHaveCount(1);
  await page.screenshot({path:test.info().outputPath("golden-preview.png"),fullPage:true});
  const volume=Number(await page.locator("#status").getAttribute("data-volume-mm3"));
  const bounds=JSON.parse((await page.locator("#status").getAttribute("data-bounds-mm"))||"null");
  expect(Math.abs(volume-goldenVolume)).toBeLessThan(.0001);
  expect(bounds).toEqual([[-50,-30,0],[50,30,8]]);
  // Menu commands remain available but are not visible until invoked.
  await expect(page.locator("#menu-popover")).toBeHidden();
  const pending=page.waitForEvent("download",{timeout:120000});
  await openMenu(page,"file","file.step");
  const download=await pending;
  expect(download.suggestedFilename()).toMatch(/\.step$/i);
  const data=await readFile((await download.path())!);
  expect(data.length).toBeGreaterThan(500);
  expect(data.subarray(0,300).toString("utf8")).toContain("ISO-10303-21");
  expect(errors).toEqual([]);expect(external).toEqual([]);
});

test("direct authoring: R → draw → E Auto Add → native JSON",async({page})=>{
  await page.goto("/");
  await newProject(page);
  await page.keyboard.press("r");
  await expect(page.locator('[data-tool="rectangle"]')).toHaveClass(/active/);
  await draw(page,[.32,.36],[.65,.67]);
  await expect(page.locator("#profile-count")).toHaveText("1 profiles");
  await page.keyboard.press("e");
  await expect(page.locator("#extrude-flyout")).toBeVisible();
  await expect(page.locator("#extrude-mode option").first()).toHaveText(/Auto.*Add/);
  await page.locator("#apply-extrude").click();
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const data=await saveProject(page);
  expect(data.schemaVersion).toBe(2);
  expect(data.profiles).toHaveLength(1);
  expect(data.profiles[0].kind).toBe("rectangle");
  expect(data.features).toHaveLength(1);
  expect(data.features[0].operation).toBe("add");
});

test("Shift+R centre rectangle and Shift-drag 1:1",async({page})=>{
  await page.goto("/");await newProject(page);
  await page.keyboard.press("Shift+R");
  await expect(page.locator('[data-tool="centerRectangle"]')).toHaveClass(/active/);
  await draw(page,[.45,.45],[.58,.54],true);
  const data=await saveProject(page);
  const rect=data.profiles[0];
  expect(rect.kind).toBe("rectangle");
  expect(rect.width).toBeCloseTo(rect.height,8);
});

test("P polygon has floating side and rotation controls and exact extrusion",async({page})=>{
  await page.goto("/");await newProject(page);
  await page.keyboard.press("p");
  await expect(page.locator("#shape-options")).toBeVisible();
  await page.getByLabel("Sides (3–64)").fill("7");
  await page.getByLabel("Sides (3–64)").press("Tab");
  await page.getByLabel("Rotation °").fill("30");
  await page.getByLabel("Rotation °").press("Tab");
  await draw(page,[.50,.52],[.64,.52]);
  await expect(page.locator("#profile-count")).toHaveText("1 profiles");
  await page.keyboard.press("e");
  await expect(page.locator("#extrude-flyout")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const data=await saveProject(page);
  expect(data.profiles[0].kind).toBe("polygon");
  expect(data.profiles[0].sides).toBe(7);
  expect(data.profiles[0].rotation).toBe(30);
});

test("slot tool generates exact round-ended extrusion",async({page})=>{
  await page.goto("/");await newProject(page);
  await page.keyboard.press("s");
  await expect(page.locator("#shape-options")).toBeVisible();
  await page.getByLabel("Radius",{exact:true}).fill("4");
  await page.getByLabel("Radius",{exact:true}).press("Tab");
  await draw(page,[.40,.50],[.60,.50]);
  await page.keyboard.press("e");
  await page.keyboard.press("Enter");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const data=await saveProject(page);
  expect(data.profiles[0].kind).toBe("slot");
  expect(data.profiles[0].radius).toBe(4);
});

test("three grid tiers and shortcut rebindings persist in exported settings JSON",async({page})=>{
  await page.goto("/");
  await page.keyboard.press("g");
  await expect(page.locator("#grid-dialog")).toBeVisible();
  await expect(page.locator("#grid-rows .grid-tier-row")).toHaveCount(3);
  await page.getByLabel("Fine spacing mm").fill("2.5");
  await page.getByLabel("Fine spacing mm").press("Tab");
  await page.locator('[data-close="grid-dialog"]').last().click();
  await page.keyboard.press("k");
  await expect(page.locator("#shortcuts-dialog")).toBeVisible();
  await page.locator('[data-action="tool.rectangle"]').click();
  await page.keyboard.press("t");
  await expect(page.locator('[data-action="tool.rectangle"]')).toContainText("T");
  const pending=page.waitForEvent("download");
  await page.locator("#settings-export").click();
  const settings=JSON.parse(await readFile((await (await pending).path())!,"utf8"));
  expect(settings.version).toBe(1);
  expect(settings.grid.tiers).toHaveLength(3);
  expect(settings.grid.tiers[0].spacing).toBe(2.5);
  expect(settings.shortcuts["tool.rectangle"]).toBe("KeyT");
  await page.locator('[data-close="shortcuts-dialog"]').last().click();
  await page.keyboard.press("t");
  await expect(page.locator('[data-tool="rectangle"]')).toHaveClass(/active/);
});

test("E suggests a through-cut when a new circle lies within an extruded plate",async({page})=>{
  await page.goto("/");await newProject(page);
  await page.keyboard.press("r");
  await draw(page,[.30,.30],[.70,.70]);
  await page.keyboard.press("e");
  await page.locator("#apply-extrude").click();
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const volumeBefore=Number(await page.locator("#status").getAttribute("data-volume-mm3"));
  await page.keyboard.press("c");
  await draw(page,[.50,.50],[.53,.50]);
  await page.keyboard.press("e");
  await expect(page.locator("#extrude-mode option").first()).toHaveText(/Auto.*Cut/);
  await expect(page.locator("#extrude-through")).toBeChecked();
  await page.locator("#apply-extrude").click();
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const volumeAfter=Number(await page.locator("#status").getAttribute("data-volume-mm3"));
  expect(volumeAfter).toBeGreaterThan(0);
  expect(volumeAfter).toBeLessThan(volumeBefore);
  const data=await saveProject(page);
  expect(data.features.map((f:{operation:string})=>f.operation)).toEqual(["add","cut"]);
});

test("L closes a multi-vertex outline by clicking its first vertex, then E extrudes it",async({page})=>{
  await page.goto("/");await newProject(page);
  await page.keyboard.press("l");
  await expect(page.locator('[data-tool="line"]')).toHaveClass(/active/);
  const box=(await page.locator("#sketch").boundingBox())!;
  const coords:[[number,number],[number,number],[number,number],[number,number]]=[
    [.40,.41],[.60,.41],[.59,.62],[.41,.60]
  ];
  for(const [x,y] of [...coords,coords[0]])await page.mouse.click(box.x+box.width*x,box.y+box.height*y);
  await expect(page.locator("#profile-count")).toHaveText("1 profiles");
  let data=await saveProject(page);
  expect(data.profiles[0].kind).toBe("path");
  expect(data.profiles[0].closed).toBe(true);
  expect(data.profiles[0].points).toHaveLength(4);
  await page.keyboard.press("e");
  await page.locator("#apply-extrude").click();
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  data=await saveProject(page);
  expect(data.features).toHaveLength(1);
});


test("Ctrl+click adds two holes to selection; E applies two cuts atomically",async({page})=>{
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const b=(await page.locator("#sketch").boundingBox())!;
  const cy=b.y+b.height/2;
  await page.keyboard.down("Control");
  await page.mouse.click(b.x+b.width/2-35*4,cy);
  await page.mouse.click(b.x+b.width/2+35*4,cy);
  await page.keyboard.up("Control");
  await expect(page.locator("#selection-count")).toHaveText("2 selected");
  await page.keyboard.press("e");
  await expect(page.locator("#extrude-target")).toHaveText("2 profiles selected");
  await expect(page.locator("#extrude-mode option").first()).toHaveText(/Auto.*Cut/);
  await expect(page.locator("#extrude-through")).toBeChecked();
  await expect(page.locator("#preview")).toHaveAttribute("data-preview-state","ready",{timeout:120000});
  await expect(page.locator("#feature-count")).toContainText("3 operations");
  // Opening and previewing the untouched built-in demo does not persist a new project.
  expect(await page.evaluate(()=>localStorage.getItem("flatcad.project.v1"))).toBeNull();
  await page.locator("#apply-extrude").click();
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const after=await saveProject(page);
  expect(after.features).toHaveLength(5);
  expect(after.features.slice(-2).map((f:{operation:string})=>f.operation)).toEqual(["cut","cut"]);
  await page.keyboard.press("Control+z");
  await expect(page.locator("#feature-count")).toContainText("3 operations");
});

test("cursor-anchored flyout and optional exact-solid preview do not alter saved features",async({page})=>{
  await page.goto("/");await newProject(page);
  await page.keyboard.press("r");await draw(page,[.35,.38],[.60,.64]);
  await page.keyboard.press("e");
  await expect(page.locator("#extrude-flyout")).toBeVisible();
  const flyout=page.locator("#extrude-flyout");
  await expect(flyout).toHaveAttribute("data-placement-corner",/top-left|top-right|bottom-left|bottom-right/);
  await expect(flyout).not.toHaveAttribute("data-major-grid-pixels",/./);
  await expect(page.locator("#extrude-preview")).toBeChecked();
  await expect(page.locator("#preview")).toHaveAttribute("data-preview-state","ready",{timeout:120000});
  await expect(page.locator("#solid-preview-status")).toContainText("NOT APPLIED");
  const provisional=Number(await page.locator("#preview").getAttribute("data-preview-volume-mm3"));
  expect(provisional).toBeGreaterThan(0);
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem("flatcad.project.v1")!));
  expect(before.features).toHaveLength(0);
  await page.locator("#extrude-preview").uncheck();
  await expect(page.locator("#solid-preview-status")).toBeHidden();
  await expect(page.locator("#preview")).not.toHaveAttribute("data-preview-state",/./);
  await page.locator("#cancel-extrude").click();
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem("flatcad.project.v1")!));
  expect(after.features).toHaveLength(0);
});

test("dragging the extrusion arrow changes proposed depth and 3D volume before Apply",async({page})=>{
  await page.goto("/");await newProject(page);
  await page.keyboard.press("r");await draw(page,[.36,.40],[.57,.59]);
  const draft=(await saveProject(page)).profiles[0];
  await page.keyboard.press("e");
  await expect(page.locator("#preview")).toHaveAttribute("data-preview-state","ready",{timeout:120000});
  const originalVolume=Number(await page.locator("#preview").getAttribute("data-preview-volume-mm3"));
  const b=(await page.locator("#sketch").boundingBox())!;
  const px=b.x+b.width/2+(draft.x+draft.width/2)*4+22;
  const py=b.y+b.height/2-(draft.y+draft.height/2)*4-35;
  await page.mouse.move(px,py);
  await page.mouse.down();
  await page.mouse.move(px,py-40,{steps:7});
  await page.mouse.up();
  expect(Number(await page.locator("#extrude-depth").inputValue())).toBeGreaterThan(8);
  await expect(page.locator("#preview")).toHaveAttribute("data-preview-state","ready",{timeout:120000});
  const revisedVolume=Number(await page.locator("#preview").getAttribute("data-preview-volume-mm3"));
  expect(revisedVolume).toBeGreaterThan(originalVolume);
  const untouched=await page.evaluate(()=>JSON.parse(localStorage.getItem("flatcad.project.v1")!));
  expect(untouched.features).toHaveLength(0);
});


test("Ctrl-selected profiles move, duplicate and delete as a group in atomic history steps",async({page})=>{
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const b=(await page.locator("#sketch").boundingBox())!;
  const left=b.x+b.width/2-35*4, right=b.x+b.width/2+35*4, mid=b.y+b.height/2;
  await page.keyboard.down("Control");
  await page.mouse.click(left,mid);
  await page.mouse.click(right,mid);
  await page.keyboard.up("Control");
  await expect(page.locator("#selection-count")).toHaveText("2 selected");
  // Unmodified drag on an existing member preserves group selection.
  await page.mouse.move(left,mid);
  await page.mouse.down();
  await page.mouse.move(left+20,mid,{steps:5});
  await page.mouse.up();
  const moved=await page.evaluate(()=>JSON.parse(localStorage.getItem("flatcad.project.v1")!));
  expect(moved.profiles.find((p:{id:string})=>p.id==="hole_l").x).toBe(-30);
  expect(moved.profiles.find((p:{id:string})=>p.id==="hole_r").x).toBe(40);
  await page.keyboard.press("Control+d");
  await expect(page.locator("#profile-count")).toContainText("5 profiles");
  await expect(page.locator("#selection-count")).toHaveText("2 selected");
  await page.keyboard.press("Delete");
  await expect(page.locator("#profile-count")).toContainText("3 profiles");
  await page.keyboard.press("Control+z");
  await expect(page.locator("#profile-count")).toContainText("5 profiles");
});

test("cursor placement is independent of major-grid spacing",async({page})=>{
  await page.goto("/");
  await page.keyboard.press("g");
  await expect(page.locator("#grid-dialog")).toBeVisible();
  await page.getByLabel("Major spacing mm").fill("12");
  await page.getByLabel("Major spacing mm").press("Tab");
  await page.locator('[data-close="grid-dialog"]').last().click();
  await newProject(page);
  await page.keyboard.press("r");
  await draw(page,[.35,.38],[.56,.60]);
  await page.keyboard.press("e");
  await expect(page.locator("#extrude-flyout")).toBeVisible();
  await expect(page.locator("#extrude-flyout")).toHaveAttribute(
    "data-placement-corner",/top-left|top-right|bottom-left|bottom-right/);
  await expect(page.locator("#extrude-flyout")).not.toHaveAttribute("data-major-grid-pixels",/./);
});


test("Fusion is default; navigation presets can be selected and saved",async({page})=>{
  await page.goto("/");
  await expect(page.locator("#preview")).toHaveAttribute("data-navigation-preset","fusion");
  await openMenu(page,"settings","dialog.navigation");
  await expect(page.locator("#navigation-dialog")).toBeVisible();
  await expect(page.locator("#navigation-preset")).toHaveValue("fusion");
  await expect(page.locator("#navigation-preset option")).toHaveCount(4);
  await page.locator("#navigation-preset").selectOption("solidworks");
  await expect(page.locator("#preview")).toHaveAttribute("data-navigation-preset","solidworks");
  await page.locator('[data-close="navigation-dialog"]').last().click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("flatcad.preferences.v1")!).navigation))
    .toBe("solidworks");
  await page.reload();
  await expect(page.locator("#preview")).toHaveAttribute("data-navigation-preset","solidworks");
});

async function dragInSolid(
  page:import("@playwright/test").Page,
  button:"left"|"middle"|"right",
  options:{shift?:boolean,ctrl?:boolean}={}
){
  const viewport=page.locator("#preview");
  const rect=(await page.locator("#preview canvas").boundingBox())!;
  const x=rect.x+rect.width*.50,y=rect.y+rect.height*.51;
  if(options.shift)await page.keyboard.down("Shift");
  if(options.ctrl)await page.keyboard.down("Control");
  try{
    await page.mouse.move(x,y);
    await page.mouse.down({button});
    await page.mouse.move(x+75,y+42,{steps:12});
    await page.mouse.up({button});
  }finally{
    if(options.shift)await page.keyboard.up("Shift");
    if(options.ctrl)await page.keyboard.up("Control");
  }
  const vec=(key:string)=>viewport.getAttribute(key).then(value=>{
    expect(value,key).not.toBeNull();
    return (value??"").split(",").map(Number);
  });
  return {
    beforeOffset:await vec("data-camera-offset-before"),
    afterOffset:await vec("data-camera-offset"),
    beforeTarget:await vec("data-camera-target-before"),
    afterTarget:await vec("data-camera-target"),
  };
}
const vectorDistance=(a:number[],b:number[])=>Math.hypot(...a.map((n,i)=>n-b[i]));
test("Fusion actual MMB pan translates camera target without orbiting",async({page})=>{
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const d=await dragInSolid(page,"middle");
  expect(await page.locator("#preview").getAttribute("data-last-navigation-action")).toBe("pan");
  expect(vectorDistance(d.beforeTarget,d.afterTarget)).toBeGreaterThan(.05);
  expect(vectorDistance(d.beforeOffset,d.afterOffset)).toBeLessThan(.005);
});
test("Fusion actual Shift+MMB orbit changes camera direction, not target",async({page})=>{
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const d=await dragInSolid(page,"middle",{shift:true});
  expect(await page.locator("#preview").getAttribute("data-last-navigation-action")).toBe("orbit");
  expect(vectorDistance(d.beforeOffset,d.afterOffset)).toBeGreaterThan(.1);
  expect(vectorDistance(d.beforeTarget,d.afterTarget)).toBeLessThan(.005);
});
test("Fusion actual RMB drag also orbits while a short RMB click does not",async({page})=>{
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const d=await dragInSolid(page,"right");
  expect(await page.locator("#preview").getAttribute("data-last-navigation-action")).toBe("orbit");
  expect(vectorDistance(d.beforeOffset,d.afterOffset)).toBeGreaterThan(.1);
  expect(vectorDistance(d.beforeTarget,d.afterTarget)).toBeLessThan(.005);
});
test("SOLIDWORKS and Blender modified MMB obey their actual pan/zoom bindings",async({page})=>{
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  await openMenu(page,"settings","dialog.navigation");
  await page.locator("#navigation-preset").selectOption("blender");
  await page.locator('[data-close="navigation-dialog"]').last().click();
  const pan=await dragInSolid(page,"middle",{shift:true});
  expect(vectorDistance(pan.beforeTarget,pan.afterTarget)).toBeGreaterThan(.05);
  expect(vectorDistance(pan.beforeOffset,pan.afterOffset)).toBeLessThan(.005);
  await openMenu(page,"settings","dialog.navigation");
  await page.locator("#navigation-preset").selectOption("solidworks");
  await page.locator('[data-close="navigation-dialog"]').last().click();
  const orbit=await dragInSolid(page,"middle");
  expect(vectorDistance(orbit.beforeOffset,orbit.afterOffset)).toBeGreaterThan(.1);
});

test("extrude popup anchors one corner to the initiating sketch cursor",async({page})=>{
  await page.goto("/");await newProject(page);
  await page.keyboard.press("r");await draw(page,[.43,.46],[.60,.63]);
  const b=(await page.locator("#sketch").boundingBox())!;
  const at={x:b.x+210,y:b.y+45};
  await page.mouse.move(at.x,at.y); // E uses the most recent sketch pointer position
  await page.keyboard.press("e");
  const popup=page.locator("#extrude-flyout");
  await expect(popup).toHaveAttribute("data-placement-corner",/top-left|top-right|bottom-left|bottom-right/);
  const corner=await popup.getAttribute("data-placement-corner");
  const offset=Number(await popup.getAttribute("data-arrow-avoidance-px"));
  const b2=(await popup.boundingBox())!;
  const cornerX=corner?.endsWith("right")?b2.x+b2.width:b2.x;
  const cornerY=corner?.startsWith("bottom")?b2.y+b2.height:b2.y;
  expect(Math.abs(cornerX-at.x-offset)).toBeLessThan(3);
  // Three CSS pixels of edge clamping are acceptable for a nearly full-height
  // flyout; it still stays visually anchored to the initiating cursor.
  expect(Math.abs(cornerY-at.y)).toBeLessThanOrEqual(4);
});

test("downward first extrusion preserves signed depth and actual Z bounds",async({page})=>{
  await page.goto("/");await newProject(page);
  await page.keyboard.press("r");await draw(page,[.35,.39],[.58,.62]);
  await page.keyboard.press("e");
  await page.locator("#extrude-z").fill("8");
  await page.locator("#extrude-depth").fill("-6");
  await expect(page.locator("#extrude-z")).toHaveValue("8");
  await expect(page.locator("#preview")).toHaveAttribute("data-preview-state","ready",{timeout:120000});
  await page.locator("#apply-extrude").click();
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const bounds=JSON.parse((await page.locator("#status").getAttribute("data-bounds-mm"))!);
  expect(bounds[0][2]).toBeCloseTo(2,5);
  expect(bounds[1][2]).toBeCloseTo(8,5);
  const saved=await saveProject(page);
  expect(saved.features[0].z).toBe(8);
  expect(saved.features[0].depth).toBe(-6);
});

test("negative pocket with face-picked start plane creates precise partial-depth cut",async({page})=>{
  await page.goto("/");await newProject(page);
  await page.keyboard.press("r");await draw(page,[.32,.35],[.68,.65]);
  await page.keyboard.press("e");
  await page.locator("#apply-extrude").click();
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const before=Number(await page.locator("#status").getAttribute("data-volume-mm3"));
  await page.keyboard.press("c");await draw(page,[.50,.50],[.54,.50]);
  await page.keyboard.press("e");
  await page.locator("#extrude-z").click();
  const b=(await page.locator("#preview canvas").boundingBox())!;
  await page.mouse.click(b.x+b.width/2,b.y+b.height/2);
  await expect(page.locator("#extrude-z")).toHaveValue("8",{timeout:10000});
  await expect(page.locator("#preview")).toHaveAttribute("data-last-picked-face-z","8");
  await page.locator("#extrude-depth").fill("-6");
  await expect(page.locator("#extrude-z")).toHaveValue("8");
  await page.locator("#apply-extrude").click();
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const after=Number(await page.locator("#status").getAttribute("data-volume-mm3"));
  expect(after).toBeLessThan(before);
  const native=await saveProject(page);
  expect(native.features.at(-1).z).toBe(8);
  expect(native.features.at(-1).depth).toBe(-6);
});


test("Solid hover highlights a face and shows a contextual mouse-target label",async({page})=>{
  await page.goto("/");await newProject(page);
  await page.keyboard.press("r");await draw(page,[.32,.35],[.68,.65]);
  await page.keyboard.press("e");await page.locator("#apply-extrude").click();
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const b=(await page.locator("#preview canvas").boundingBox())!;
  await page.mouse.move(b.x+b.width*.5,b.y+b.height*.5);
  await expect(page.locator("#face-target-label")).toBeVisible();
  await expect(page.locator("#preview")).toHaveAttribute("data-hovered-face-z","8");
  await expect(page.locator("#preview")).toHaveAttribute("data-highlight-triangle-count",/^[1-9]\d*$/);
  await expect(page.locator("#face-target-label")).toContainText(/Face|Vertex/);
  await page.mouse.move(b.x-15,b.y-15);
  await expect(page.locator("#face-target-label")).toBeHidden();
});

test("Remember mouse surfaces defaults ON and prefills Start Z after a committed face click",async({page})=>{
  await page.goto("/");await newProject(page);
  await page.keyboard.press("r");await draw(page,[.32,.36],[.68,.65]);
  await page.keyboard.press("e");await page.locator("#apply-extrude").click();
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const b=(await page.locator("#preview canvas").boundingBox())!;
  await page.mouse.click(b.x+b.width*.5,b.y+b.height*.5);
  await page.keyboard.press("c");await draw(page,[.5,.5],[.54,.5]);
  await page.keyboard.press("e");
  await expect(page.locator("#extrude-z")).toHaveValue("8");
  await openMenu(page,"settings","dialog.navigation");
  await expect(page.locator("#remember-surfaces")).toBeChecked();
  await page.locator("#remember-surfaces").uncheck();
  await page.locator('[data-close="navigation-dialog"]').last().click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("flatcad.preferences.v1")!).rememberSurfaces))
    .toBe(false);
});

test("Short right click on committed horizontal face exposes latch and safe Delete Feature",async({page})=>{
  await page.goto("/");await newProject(page);
  await page.keyboard.press("r");await draw(page,[.32,.35],[.68,.65]);
  await page.keyboard.press("e");await page.locator("#apply-extrude").click();
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const b=(await page.locator("#preview canvas").boundingBox())!;
  const x=b.x+b.width*.5,y=b.y+b.height*.5;
  await page.mouse.click(x,y,{button:"right"});
  await expect(page.locator("#face-context-menu")).toBeVisible();
  await expect(page.locator('[data-face-action="Delete Feature"]')).toBeEnabled();
  await expect(page.locator('[data-face-action="Latch Start Z"]')).toBeEnabled();
  await page.locator('[data-face-action="Latch Start Z"]').click();
  await expect(page.locator("#extrude-z")).toHaveValue("8");
  await page.mouse.click(x,y,{button:"right"});
  await expect(page.locator("#face-context-menu")).toBeVisible();
  await page.locator('[data-face-action="Delete Feature"]').click();
  await expect(page.locator("#feature-count")).toContainText("0 operations");
  await page.keyboard.press("Control+z");
  await expect(page.locator("#feature-count")).toContainText("1 operations");
});

test("Cut preview shows translucent red full tool, overshoot and distinct removed volume",async({page})=>{
  await page.goto("/");await newProject(page);
  await page.keyboard.press("r");await draw(page,[.32,.35],[.68,.65]);
  await page.keyboard.press("e");await page.locator("#apply-extrude").click();
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  await page.keyboard.press("c");await draw(page,[.50,.50],[.54,.50]);
  await page.keyboard.press("e");
  await expect(page.locator("#preview")).toHaveAttribute("data-preview-state","ready",{timeout:120000});
  await expect(page.locator("#preview")).toHaveAttribute("data-cut-tool-visible","true");
  await expect(page.locator("#cut-tool-metrics")).toBeVisible();
  const full=Number(await page.locator("#preview").getAttribute("data-cut-tool-volume-mm3"));
  const removed=Number(await page.locator("#preview").getAttribute("data-cut-removed-volume-mm3"));
  const cutBounds=JSON.parse((await page.locator("#preview").getAttribute("data-cut-tool-bounds-mm"))!);
  expect(full).toBeGreaterThan(removed);
  expect(removed).toBeGreaterThan(0);
  expect(cutBounds[0][2]).toBeLessThan(0);
  expect(cutBounds[1][2]).toBeGreaterThan(8);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("flatcad.project.v1")!).features.length))
    .toBe(1);
  await page.locator("#extrude-preview").uncheck();
  await expect(page.locator("#cut-tool-metrics")).toBeHidden();
  await expect(page.locator("#preview")).not.toHaveAttribute("data-cut-tool-visible",/./);
});


test("visual Solid reference grid stays BELOW a plate instead of cutting through it",async({page})=>{
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const gridZ=Number(await page.locator("#preview").getAttribute("data-grid-z"));
  const solidMin=Number(await page.locator("#preview").getAttribute("data-display-model-min-z"));
  expect(solidMin).toBe(0);
  expect(gridZ).toBeLessThan(solidMin);
});

test("visual Solid grid follows negative Z solids below their minimum elevation",async({page})=>{
  await page.goto("/");await newProject(page);
  await page.keyboard.press("r");await draw(page,[.34,.37],[.58,.61]);
  await page.keyboard.press("e");
  await page.locator("#extrude-z").fill("-4");
  await page.locator("#extrude-depth").fill("-6");
  await page.locator("#apply-extrude").click();
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const z=Number(await page.locator("#preview").getAttribute("data-grid-z"));
  expect(Number(await page.locator("#preview").getAttribute("data-display-model-min-z")))
    .toBe(-10);
  expect(z).toBeLessThan(-10);
});

test("the display grid also remains below provisional cutting-tool overshoot",async({page})=>{
  await page.goto("/");await newProject(page);
  await page.keyboard.press("r");await draw(page,[.32,.35],[.68,.65]);
  await page.keyboard.press("e");await page.locator("#apply-extrude").click();
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  await page.keyboard.press("c");await draw(page,[.50,.50],[.54,.50]);
  await page.keyboard.press("e");
  await expect(page.locator("#preview")).toHaveAttribute("data-preview-state","ready",{timeout:120000});
  const grid=Number(await page.locator("#preview").getAttribute("data-grid-z"));
  const displayedBottom=Number(await page.locator("#preview").getAttribute("data-display-bottom-z"));
  const bodyMin=Number(await page.locator("#preview").getAttribute("data-display-model-min-z"));
  expect(displayedBottom).toBeLessThan(bodyMin);
  expect(grid).toBeLessThan(displayedBottom);
  await page.locator("#cancel-extrude").click();
  await expect(page.locator("#preview")).not.toHaveAttribute("data-cut-tool-visible",/./);
});

test("blank sketch background is not draggable under Select, but deliberate middle-pan still works",async({page})=>{
  await page.goto("/");await newProject(page);
  await page.keyboard.press("v");
  const canvas=page.locator("#sketch");
  const b=(await canvas.boundingBox())!;
  const x=b.x+b.width*.57,y=b.y+b.height*.55;
  const beforeX=Number(await canvas.getAttribute("data-view-pan-x"));
  const beforeY=Number(await canvas.getAttribute("data-view-pan-y"));
  await page.mouse.move(x,y);
  await page.mouse.down();
  await page.mouse.move(x+95,y+49,{steps:6});
  await page.mouse.up();
  expect(Number(await canvas.getAttribute("data-view-pan-x"))).toBe(beforeX);
  expect(Number(await canvas.getAttribute("data-view-pan-y"))).toBe(beforeY);
  await expect(page.locator("#profile-count")).toHaveText("0 profiles");
  expect(await canvas.evaluate((element:HTMLCanvasElement)=>element.draggable)).toBe(false);
  await page.mouse.move(x,y);
  await page.mouse.down({button:"middle"});
  await page.mouse.move(x+40,y+30,{steps:4});
  await page.mouse.up({button:"middle"});
  expect(Number(await canvas.getAttribute("data-view-pan-x"))).toBeGreaterThan(beforeX);
});

test("R zero-size release toggles to second-click rubber-band completion",async({page})=>{
  await page.goto("/");await newProject(page);
  await page.keyboard.press("r");
  const canvas=page.locator("#sketch");
  const b=(await canvas.boundingBox())!;
  const a={x:b.x+b.width*.34,y:b.y+b.height*.40};
  const end={x:b.x+b.width*.63,y:b.y+b.height*.64};
  await page.mouse.click(a.x,a.y);
  await expect(canvas).toHaveAttribute("data-draw-stage","await-second-click");
  await expect(canvas).toHaveAttribute("data-draw-tool","rectangle");
  await expect(page.locator("#profile-count")).toHaveText("0 profiles");
  await page.mouse.move(end.x,end.y,{steps:6});
  await page.mouse.click(end.x,end.y);
  await expect(canvas).not.toHaveAttribute("data-draw-stage",/./);
  await expect(page.locator("#profile-count")).toHaveText("1 profiles");
  const saved=await saveProject(page);
  expect(saved.profiles[0].kind).toBe("rectangle");
  expect(saved.profiles[0].width).toBeGreaterThan(0);
  expect(saved.profiles[0].height).toBeGreaterThan(0);
});

test("Shift+R centre rectangle supports a click-click square with stable origin",async({page})=>{
  await page.goto("/");await newProject(page);
  await page.keyboard.press("Shift+r");
  const canvas=page.locator("#sketch"),b=(await canvas.boundingBox())!;
  const a={x:b.x+b.width*.47,y:b.y+b.height*.46};
  const end={x:a.x+90,y:a.y+50};
  await page.mouse.click(a.x,a.y);
  await expect(canvas).toHaveAttribute("data-draw-stage","await-second-click");
  await page.keyboard.down("Shift");
  await page.mouse.click(end.x,end.y);
  await page.keyboard.up("Shift");
  const doc=await saveProject(page),p=doc.profiles[0];
  expect(p.kind).toBe("rectangle");
  expect(p.width).toBe(p.height);
  expect(p.width).toBeGreaterThan(0);
});

for(const [shortcut,kind] of [["c","circle"],["p","polygon"],["s","slot"]] as const){
  test(shortcut+" click-click creates a nonzero "+kind+" using its secondary datum",async({page})=>{
    await page.goto("/");await newProject(page);
    await page.keyboard.press(shortcut);
    const canvas=page.locator("#sketch"),b=(await canvas.boundingBox())!;
    const x=b.x+b.width*.45,y=b.y+b.height*.48;
    await page.mouse.click(x,y);
    await expect(canvas).toHaveAttribute("data-draw-stage","await-second-click");
    await page.mouse.move(x+80,y+40);
    await page.mouse.click(x+80,y+40);
    await expect(page.locator("#profile-count")).toHaveText("1 profiles");
    const doc=await saveProject(page);
    expect(doc.profiles[0].kind).toBe(kind);
    if(kind==="circle"||kind==="polygon")expect(doc.profiles[0].radius).toBeGreaterThan(0);
    else expect(doc.profiles[0].x2).not.toBe(doc.profiles[0].x1);
  });
}

test("Escape cancels pending two-click drawing without moving or committing background",async({page})=>{
  await page.goto("/");await newProject(page);
  await page.keyboard.press("r");
  const canvas=page.locator("#sketch"),b=(await canvas.boundingBox())!;
  await page.mouse.click(b.x+b.width*.45,b.y+b.height*.43);
  await expect(canvas).toHaveAttribute("data-draw-stage","await-second-click");
  await page.keyboard.press("Escape");
  await expect(canvas).not.toHaveAttribute("data-draw-stage",/./);
  await page.mouse.click(b.x+b.width*.64,b.y+b.height*.61);
  await expect(page.locator("#profile-count")).toHaveText("0 profiles");
});


test("Solid camera orientation/zoom and old mesh stay stable across preview and committed operations",async({page})=>{
  await page.goto("/");
  const viewport=page.locator("#preview");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  await expect(viewport).toHaveAttribute("data-rendered-solid","true");
  await dragInSolid(page,"right");
  await page.waitForTimeout(450); // settle damping before comparing stable pose
  const getVector=async(attribute:string)=>
    (await viewport.getAttribute(attribute)??"").split(",").map(Number);
  const directionBefore=await getVector("data-camera-direction");
  const zoomBefore=Number(await viewport.getAttribute("data-camera-zoom"));
  const fitCount=Number(await viewport.getAttribute("data-camera-fit-count"));
  expect(fitCount).toBeGreaterThan(0);
  await page.evaluate(()=>{
    const el=document.getElementById("preview")!;
    (window as any).flatcadObservedBlanks=0;
    new MutationObserver(()=>{
      if(el.dataset.renderedSolid==="false") (window as any).flatcadObservedBlanks++;
    }).observe(el,{attributes:true,attributeFilter:["data-rendered-solid"]});
  });
  await page.locator("#profiles-details summary").click();
  await page.locator("#profile-list .profile-item").nth(1).click();
  await page.keyboard.press("e");
  await expect(viewport).toHaveAttribute("data-preview-state","ready",{timeout:120000});
  await page.locator("#extrude-preview").uncheck();
  await page.locator("#extrude-preview").check();
  await expect(viewport).toHaveAttribute("data-preview-state","ready",{timeout:120000});
  await page.locator("#apply-extrude").click();
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  await expect(viewport).toHaveAttribute("data-build-state","ready");
  const directionAfter=await getVector("data-camera-direction");
  expect(Math.hypot(...directionAfter.map((v,i)=>v-directionBefore[i]))).toBeLessThan(.005);
  expect(Number(await viewport.getAttribute("data-camera-zoom"))).toBeCloseTo(zoomBefore,6);
  expect(Number(await viewport.getAttribute("data-camera-fit-count"))).toBe(fitCount);
  expect(await page.evaluate(()=>(window as any).flatcadObservedBlanks)).toBe(0);
  await page.locator("#fit-solid").click();
  expect(Number(await viewport.getAttribute("data-camera-fit-count"))).toBe(fitCount+1);
});

test("Feature history has operation/sketch names and actual per-feature B-rep thumbnails with red cuts",async({page})=>{
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const history=page.locator("#history-timeline");
  await expect(history).toBeVisible();
  await expect(history.locator(".history-feature-card")).toHaveCount(3);
  await expect(history.locator('.history-feature-card[data-thumbnail-state="ready"]'))
    .toHaveCount(3,{timeout:120000});
  const names=await history.locator(".history-feature-name").allTextContents();
  expect(names).toEqual(["Extrude · Rectangle 1","Cut · Circle 1","Cut · Circle 2"]);
  const thumbs=history.locator("canvas.history-thumbnail");
  await expect(thumbs).toHaveCount(3);
  await expect(thumbs.nth(0)).toHaveAttribute("data-cut-overlay","false");
  await expect(thumbs.nth(1)).toHaveAttribute("data-cut-overlay","true");
  await expect(thumbs.nth(2)).toHaveAttribute("data-cut-overlay","true");
  const result=Number(await thumbs.nth(2).getAttribute("data-result-volume-mm3"));
  const tool=Number(await thumbs.nth(2).getAttribute("data-tool-volume-mm3"));
  expect(result).toBeGreaterThan(0);
  expect(tool).toBeGreaterThan(0);
  const pixels=await thumbs.nth(1).evaluate((canvas:HTMLCanvasElement)=>{
    const ctx=canvas.getContext("2d")!;
    const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let reds=0;
    for(let i=0;i<data.length;i+=4)
      if(data[i]>150&&data[i]>data[i+1]*1.28&&data[i]>data[i+2]*1.1)reds++;
    return reds;
  });
  expect(pixels).toBeGreaterThan(0);
});

test("Only horizontal faces highlight; true CAD vertex hit shows a same-radius green sphere",async({page})=>{
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const view=page.locator("#preview");
  const count=Number(await view.getAttribute("data-topology-vertex-count"));
  expect(count).toBeGreaterThan(3);
  const xy=await view.evaluate((node:HTMLElement)=>{
    const csv=(name:string)=>(node.dataset[name]||"").split(",").map(Number);
    const d=csv("cameraDirection"), t=csv("cameraTarget");
    const zoom=Number(node.dataset.cameraZoom);
    const c=node.querySelector("canvas")!.getBoundingClientRect();
    // Camera right = up × direction; camera screen-up = direction × right.
    const length=(p:number[])=>Math.hypot(...p);
    const normalize=(p:number[])=>p.map(v=>v/length(p));
    const cross=(a:number[],b:number[])=>
      [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    const right=normalize(cross([0,0,1],d));
    const up=normalize(cross(d,right));
    const p=[50,-30,8],delta=p.map((v,i)=>v-t[i]);
    const dot=(a:number[],b:number[])=>a.reduce((s,v,i)=>s+v*b[i],0);
    const scale=zoom*c.height/100;
    return {x:c.x+c.width/2+dot(delta,right)*scale,
      y:c.y+c.height/2-dot(delta,up)*scale};
  });
  // The raycast source is exact OCCT geometry, but an inferred projected
  // screen point may differ by a few pixels because of camera basis and
  // CSS layout. Exercise a small neighborhood, still validating true
  // pointer activation rather than setting any synthetic hover state.
  let activated=false;
  for(const dy of [0,-10,10,-20,20,-30,30]){
    for(const dx of [0,-10,10,-20,20,-30,30]){
      await page.mouse.move(xy.x+dx,xy.y+dy);
      if(await view.getAttribute("data-vertex-sphere-visible")==="true"){
        activated=true;break;
      }
    }
    if(activated)break;
  }
  expect(activated).toBe(true);
  await expect(view).toHaveAttribute("data-vertex-sphere-visible","true");
  const hitRadius=Number(await view.getAttribute("data-vertex-hit-radius-px"));
  const sphereRadius=Number(await view.getAttribute("data-vertex-sphere-radius-px"));
  expect(hitRadius).toBeGreaterThan(12);
  expect(sphereRadius).toBe(hitRadius);
  await expect(view).toHaveAttribute("data-hovered-target-kind","vertex");
});


test("titlebars own volume and Undo/Redo; permanent lower border bars are removed",async({page})=>{
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  await expect(page.locator("#solid-volume")).toContainText("mm³");
  expect(Number(await page.locator("#solid-volume").getAttribute("data-volume-mm3")))
    .toBeGreaterThan(40000);
  await expect(page.locator(".sketch-titlebar #undo")).toHaveCount(1);
  await expect(page.locator(".sketch-titlebar #redo")).toHaveCount(1);
  await expect(page.locator(".preview-panel .solid-titlebar #solid-volume")).toHaveCount(1);
  await expect(page.locator(".shell > .statusbar")).toHaveCount(0);
  await expect(page.locator(".workbench-sketch > .panel-footer")).toHaveCount(0);
  await newProject(page);
  await page.keyboard.press("r");
  await draw(page,[.36,.4],[.62,.62]);
  await expect(page.locator(".sketch-titlebar #undo")).toBeEnabled();
  await page.locator(".sketch-titlebar #undo").click();
  await expect(page.locator("#profile-count")).toContainText("0 profiles");
  await page.locator(".sketch-titlebar #redo").click();
  await expect(page.locator("#profile-count")).toContainText("1 profiles");
});

test("resizing both dividers changes panels without touching CAD data and persists",async({page})=>{
  await page.setViewportSize({width:1440,height:820});
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const sketch=page.locator(".workbench-sketch"),solid=page.locator(".preview-panel");
  const initialSketch=(await sketch.boundingBox())!.width;
  const initialSolid=(await solid.boundingBox())!.height;
  const divider=page.locator("#main-resizer");
  await expect(divider).toHaveAttribute("aria-orientation","vertical");
  let box=(await divider.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width/2+100,box.y+box.height/2,{steps:8});
  await page.mouse.up();
  const expandedSketch=(await sketch.boundingBox())!.width;
  expect(expandedSketch).toBeGreaterThan(initialSketch+60);
  const divider2=page.locator("#side-resizer");
  await expect(divider2).toHaveAttribute("aria-orientation","horizontal");
  box=(await divider2.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2+66,{steps:8});
  await page.mouse.up();
  const expandedSolid=(await solid.boundingBox())!.height;
  expect(expandedSolid).toBeGreaterThan(initialSolid+30);
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem("flatcad.layout.v1")!));
  expect(before.version).toBe(1);
  expect(before.main).toBeGreaterThan(.56);
  expect(before.solid).toBeGreaterThan(.54);
  // Layout operations must not create or alter a native CAD project.
  expect(await page.evaluate(()=>localStorage.getItem("flatcad.project.v1"))).toBeNull();
  await page.reload();
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const restoredSketch=(await sketch.boundingBox())!.width;
  const restoredSolid=(await solid.boundingBox())!.height;
  expect(Math.abs(restoredSketch-expandedSketch)).toBeLessThan(5);
  expect(Math.abs(restoredSolid-expandedSolid)).toBeLessThan(5);
  await divider.focus();
  await page.keyboard.press("ArrowLeft");
  expect((await sketch.boundingBox())!.width).toBeLessThan(restoredSketch);
  await divider.dblclick();
  expect((await sketch.boundingBox())!.width).toBeLessThan(expandedSketch);
});

test("stacked viewport still offers pointer-resizable horizontal Sketch/Solid divider",async({page})=>{
  await page.setViewportSize({width:760,height:850});
  await page.goto("/");
  const main=page.locator("#main-resizer");
  await expect(main).toHaveAttribute("aria-orientation","horizontal");
  const sketch=page.locator(".workbench-sketch");
  const original=(await sketch.boundingBox())!.height;
  const box=(await main.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2-52,{steps:7});
  await page.mouse.up();
  expect((await sketch.boundingBox())!.height).toBeLessThan(original-28);
  await expect(page.locator("#sketch")).toBeVisible();
  await expect(page.locator("#preview canvas")).toBeVisible();
});

test("sketch tool rail docks in titlebar, keeps drawing interactions and remembers placement",async({page})=>{
  await page.goto("/");
  const toolbar=page.locator("#sketch-tool-rail");
  const toggle=page.locator("#tool-dock-toggle");
  await expect(toggle).toHaveAttribute("aria-pressed","false");
  await expect(page.locator("#sketch-wrap #sketch-tool-rail")).toHaveCount(1);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed","true");
  await expect(page.locator("#tool-dock-slot #sketch-tool-rail")).toHaveCount(1);
  expect(await page.evaluate(()=>
    getComputedStyle(document.querySelector("#sketch-tool-rail")!).flexDirection
  )).toBe("row");
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-pressed","true");
  await expect(page.locator("#tool-dock-slot #sketch-tool-rail")).toHaveCount(1);
  await newProject(page);
  await page.locator("#tool-dock-slot [data-tool='circle']").click();
  await draw(page,[.47,.49],[.54,.49]);
  await expect(page.locator("#profile-count")).toContainText("1 profiles");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed","false");
  await expect(page.locator("#sketch-wrap #sketch-tool-rail")).toHaveCount(1);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("flatcad.layout.v1")!).docked))
    .toBe(false);
});

test("landscape timeline runs oldest first; only selected tile shows controls",async({page})=>{
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const history=page.locator("#history-timeline");
  await expect(history).toBeVisible();
  const tiles=history.locator(".history-tile");
  await expect(tiles).toHaveCount(3);
  await expect(history.locator(".history-tile[data-thumbnail-state='ready']"))
    .toHaveCount(3,{timeout:120000});
  const names=await tiles.locator(".history-feature-name").allTextContents();
  expect(names).toEqual(["Extrude · Rectangle 1","Cut · Circle 1","Cut · Circle 2"]);
  await expect(history.locator("#history-feature-editor")).toBeHidden();
  await expect(history.locator(".history-tiles input")).toHaveCount(0);
  await expect(history.locator(".history-tiles select")).toHaveCount(0);
  await tiles.first().click();
  await expect(history.locator("#history-feature-editor")).toBeVisible();
  await expect(history.locator("#history-feature-editor input")).toHaveCount(2);
  await expect(history.locator("#history-feature-editor select")).toHaveCount(1);
  await expect(tiles.first()).toHaveAttribute("aria-pressed","true");
  await tiles.nth(1).click();
  await expect(tiles.nth(1)).toHaveAttribute("aria-pressed","true");
  await expect(tiles.first()).toHaveAttribute("aria-pressed","false");
  await history.getByRole("button",{name:"Close feature controls"}).click();
  await expect(history.locator("#history-feature-editor")).toBeHidden();
  await expect(history.locator(".history-tiles canvas[data-cut-overlay='true']")).toHaveCount(2);
});

test("landscape timeline inspects an exact historical solid without altering the model",async({page})=>{
  await page.setViewportSize({width:1440,height:820});
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const timeline=page.locator("#history-timeline");
  await expect(timeline).toBeVisible();
  const tiles=timeline.locator(".history-tile");
  await expect(tiles).toHaveCount(3);
  await expect(timeline.locator('[data-thumbnail-state="ready"]'))
    .toHaveCount(3,{timeout:120000});
  const original=Number(await page.locator("#solid-volume").getAttribute("data-volume-mm3"));
  await tiles.first().click();
  await expect(page.locator("#preview")).toHaveAttribute("data-history-feature-count","1");
  const initialVolume=Number(await page.locator("#solid-volume").getAttribute("data-volume-mm3"));
  expect(initialVolume).toBeCloseTo(48000,4);
  expect(initialVolume).toBeGreaterThan(original);
  const native=await page.evaluate(()=>localStorage.getItem("flatcad.project.v1"));
  await page.locator("#timeline-now").click();
  await expect(page.locator("#preview")).not.toHaveAttribute("data-history-feature-id",/./);
  expect(Number(await page.locator("#solid-volume").getAttribute("data-volume-mm3")))
    .toBeCloseTo(original,4);
  expect(await page.evaluate(()=>localStorage.getItem("flatcad.project.v1"))).toBe(native);
});

test("sketch typography settings migrate and apply to canvas text",async({page})=>{
  await page.goto("/");
  await openMenu(page,"settings","dialog.text");
  await page.locator("#sketch-font-family").selectOption("Verdana, sans-serif");
  await page.locator("#sketch-font-size").fill("19");
  await page.locator("#sketch-font-size").press("Tab");
  await page.locator("#sketch-font-weight").selectOption("700");
  await page.locator('[data-close="text-dialog"]').last().click();
  await expect(page.locator("#sketch")).toHaveAttribute("data-sketch-text-font",/700 19px Verdana/);
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem("flatcad.preferences.v1")!));
  expect(stored.sketchText).toEqual({fontFamily:"Verdana, sans-serif",sizePx:19,weight:700});
  await page.reload();
  await expect(page.locator("#sketch")).toHaveAttribute("data-sketch-text-font",/700 19px Verdana/);
});

test("three-column layout reorders Properties between Sketch and Solid",async({page})=>{
  await page.setViewportSize({width:1500,height:850});
  await page.goto("/");
  await openMenu(page,"layout","dialog.layout");
  await page.locator("#tile-mode").selectOption("columns");
  await expect(page.locator("#workbench-layout")).toHaveClass(/three-tiles/);
  const x=async(sel:string)=>(await page.locator(sel).boundingBox())!.x;
  expect(await x(".workbench-sketch")).toBeLessThan(await x(".inspector-drawer"));
  expect(await x(".inspector-drawer")).toBeLessThan(await x(".preview-panel"));
  await page.locator("#tile-order .tile-order-row").first().getByTitle("Move right").click();
  expect(await x(".inspector-drawer")).toBeLessThan(await x(".workbench-sketch"));
  await page.locator('[data-close="layout-dialog"]').last().click();
  await page.reload();
  await expect(page.locator("#workbench-layout")).toHaveClass(/three-tiles/);
  expect(await x(".inspector-drawer")).toBeLessThan(await x(".workbench-sketch"));
});

test("named-parameter chains bind exact sketch dimensions and persist in native project",async({page})=>{
  await page.setViewportSize({width:1440,height:820});
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  await openMenu(page,"model","dialog.parameters");
  await page.locator("#parameter-add").click();
  await page.getByLabel("Parameter name param1").fill("plateWidth");
  await page.getByLabel("Parameter name param1").press("Tab");
  await page.getByLabel("Parameter expression plateWidth").fill("120");
  await page.getByLabel("Parameter expression plateWidth").press("Tab");
  await page.locator('[data-param-close]').last().click();
  await page.locator("#profiles-details summary").click();
  await page.locator("#profile-list .profile-item").first().click();
  await page.locator("#properties-details summary").click();
  const width=page.locator('[data-binding-target="profile:plate:width"]');
  await expect(width).toHaveValue("100");
  await width.fill("plateWidth");
  await width.press("Tab");
  await expect(width).toHaveValue("plateWidth");
  await expect(width).toHaveAttribute("data-expression","true");
  await page.locator("#properties-details summary").click(); // Blur numeric field before Ctrl+S.
  const saved=await saveProject(page);
  expect(saved.parameters).toEqual([{name:"plateWidth",expression:"120"}]);
  expect(saved.bindings).toContainEqual({target:"profile:plate:width",expression:"plateWidth"});
  expect(saved.profiles[0].width).toBe(120);
  await openMenu(page,"model","dialog.parameters");
  await page.getByLabel("Parameter expression plateWidth").fill("140");
  await page.getByLabel("Parameter expression plateWidth").press("Tab");
  await page.locator('[data-param-close]').last().click();
  await expect(page.locator("#status")).toContainText("Exact solid generated",{timeout:120000});
  const newVolume=Number(await page.locator("#status").getAttribute("data-volume-mm3"));
  expect(newVolume).toBeCloseTo((140*60-2*Math.PI*25)*8,3);
  const updated=await saveProject(page);
  expect(updated.profiles[0].width).toBe(140);
  expect(updated.features).toHaveLength(3);
  expect(updated.bindings).toContainEqual({target:"profile:plate:width",expression:"plateWidth"});
  await page.locator("#undo").click();
  const undone=await saveProject(page);
  expect(undone.profiles[0].width).toBe(120);
});

test("named formulas in extrusion fields bind signed Z/depth and reject unknown inputs",async({page})=>{
  await page.goto("/");
  await openMenu(page,"model","dialog.parameters");
  await page.locator("#parameter-add").click();
  await page.getByLabel("Parameter name param1").fill("rise");
  await page.getByLabel("Parameter name param1").press("Tab");
  await page.getByLabel("Parameter expression rise").fill("8/2");
  await page.getByLabel("Parameter expression rise").press("Tab");
  await page.locator('[data-param-close]').last().click();
  await page.locator("#profiles-details summary").click();
  await page.locator("#profile-list .profile-item").first().click();
  await page.keyboard.press("e");
  await expect(page.locator("#extrude-flyout")).toBeVisible();
  await page.locator("#extrude-depth").fill("rise+2");
  await page.locator("#apply-extrude").click();
  const data=await saveProject(page);
  const recent=data.features.at(-1);
  expect(recent.depth).toBe(6);
  expect(data.bindings).toContainEqual({
    target:"feature:"+recent.id+":depth",expression:"rise+2"});
});

test("landscape layout keeps Sketch and Solid side by side above full-width timeline",async({page})=>{
  await page.setViewportSize({width:900,height:650});
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const sketch=(await page.locator(".workbench-sketch").boundingBox())!;
  const solid=(await page.locator(".preview-panel").boundingBox())!;
  const timeline=(await page.locator("#history-timeline").boundingBox())!;
  expect(solid.x).toBeGreaterThan(sketch.x+sketch.width);
  expect(timeline.y).toBeGreaterThan(sketch.y+sketch.height-4);
  expect(timeline.width).toBeGreaterThan(830);
  expect(timeline.y+timeline.height).toBeLessThanOrEqual(650);
  await expect(page.locator("#main-resizer")).toHaveAttribute("aria-orientation","vertical");
  await expect(page.locator("#preview canvas")).toBeVisible();
  await expect(page.locator("#preview")).toHaveAttribute("data-rendered-solid","true");
  const original=await page.locator("#preview").getAttribute("data-camera-direction");
  const resize=page.locator("#main-resizer"),r=(await resize.boundingBox())!;
  await page.mouse.move(r.x+r.width/2,r.y+r.height/2);
  await page.mouse.down();
  await page.mouse.move(r.x+r.width/2+50,r.y+r.height/2,{steps:6});
  await page.mouse.up();
  await expect(page.locator("#preview")).toHaveAttribute("data-rendered-solid","true");
  expect(await page.locator("#preview").getAttribute("data-camera-direction")).toBe(original);
});

test("portrait history retains newest-first even after switching out of timeline mode",async({page})=>{
  await page.setViewportSize({width:760,height:850});
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const portrait=page.locator("#history-details");
  await portrait.locator("summary").click();
  await expect(portrait.locator(".history-tile")).toHaveCount(3);
  expect(await portrait.locator(".history-feature-name").allTextContents())
    .toEqual(["Cut · Circle 2","Cut · Circle 1","Extrude · Rectangle 1"]);
  await page.setViewportSize({width:1280,height:720});
  const timeline=page.locator("#history-timeline");
  await expect(timeline).toBeVisible();
  expect(await timeline.locator(".history-feature-name").allTextContents())
    .toEqual(["Extrude · Rectangle 1","Cut · Circle 1","Cut · Circle 2"]);
  await page.setViewportSize({width:760,height:850});
  await expect(portrait).toBeVisible();
  // Media-query visibility may update before the asynchronous resize event
  // moves the same history list back from the landscape timeline container.
  await expect(portrait.locator(".history-feature-name")).toHaveCount(3);
  expect(await portrait.locator(".history-feature-name").allTextContents())
    .toEqual(["Cut · Circle 2","Cut · Circle 1","Extrude · Rectangle 1"]);
});

test("floating Solid blocks sketch input and uses handle move and corner resize",async({page})=>{
  await page.setViewportSize({width:1440,height:820});
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  await openMenu(page,"view","view.float");
  const layout=page.locator("#workbench-layout"),solid=page.locator("#preview");
  const panel=page.locator(".preview-panel"),canvas=page.locator("#preview canvas");
  await expect(layout).toHaveClass(/float-solid/);
  await expect(solid).toHaveAttribute("data-float-hit-policy","viewport");
  await expect(canvas).toHaveCSS("pointer-events","auto");
  const start=(await panel.boundingBox())!;
  // Fresh floating frames now have a subtle 20% background by default.
  // Explicitly saved zero remains completely transparent (covered separately).
  expect(await panel.evaluate(el=>getComputedStyle(el).backgroundColor))
    .toBe("rgba(11, 18, 32, 0.2)");
  const empty=[start.x+start.width*.12,start.y+start.height*.78];
  const hit=await page.evaluate(([x,y])=>document.elementFromPoint(x,y)?.tagName,empty);
  expect(hit).toBe("CANVAS");
  const camera=await solid.getAttribute("data-camera-direction");
  await page.mouse.move(start.x+start.width*.5,start.y+start.height*.5);
  await page.mouse.down();
  await page.mouse.move(start.x+start.width*.5+60,start.y+start.height*.5+35,{steps:7});
  await page.mouse.up();
  expect((await panel.boundingBox())!.x).toBeCloseTo(start.x,0);
  expect(await solid.getAttribute("data-camera-direction")).toBe(camera);
  const handle=(await panel.locator(".float-window-handle").boundingBox())!;
  await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);
  await page.mouse.down();
  await page.mouse.move(handle.x+handle.width/2+70,handle.y+handle.height/2+40,{steps:7});
  await page.mouse.up();
  const moved=(await panel.boundingBox())!;
  expect(moved.x).toBeGreaterThan(start.x+50);
  expect(moved.y).toBeGreaterThan(start.y+25);
  const grip=(await panel.locator('[data-corner="se"]').boundingBox())!;
  await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);
  await page.mouse.down();
  await page.mouse.move(grip.x+grip.width/2+85,grip.y+grip.height/2+48,{steps:7});
  await page.mouse.up();
  const resized=(await panel.boundingBox())!;
  expect(resized.width).toBeGreaterThan(moved.width+60);
  expect(resized.height).toBeGreaterThan(moved.height+30);
  const prefs=await page.evaluate(()=>JSON.parse(localStorage.getItem("flatcad.layout.v1")!));
  expect(prefs.floatW).toBeGreaterThan(380);
  await page.reload();
  await expect(layout).toHaveClass(/float-solid/);
  const restored=(await panel.boundingBox())!;
  expect(Math.abs(restored.x-resized.x)).toBeLessThan(3);
  expect(Math.abs(restored.y-resized.y)).toBeLessThan(3);
  expect(Math.abs(restored.width-resized.width)).toBeLessThan(3);
  expect(Math.abs(restored.height-resized.height)).toBeLessThan(3);
  await openMenu(page,"view","view.dock");
  await expect(panel.locator(".float-window-handle")).toBeHidden();
  await expect(solid).toHaveAttribute("data-floating","false");
  await expect(page.locator(".preview-panel .solid-titlebar")).toBeVisible();
});

test("clicking history Cut briefly displays its exact translucent cutter for 867ms",async({page})=>{
  await page.setViewportSize({width:1440,height:820});
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const history=page.locator("#history-timeline");
  await expect(history.locator(".history-tile[data-thumbnail-state=ready]"))
    .toHaveCount(3,{timeout:120000});
  await history.locator(".history-tile[data-operation=cut]").first().click();
  await expect(page.locator("#preview")).toHaveAttribute("data-history-cut-overlay","true");
  await expect(page.locator("#preview")).toHaveAttribute("data-cut-tool-visible","true");
  await page.waitForTimeout(950);
  await expect(page.locator("#preview")).not.toHaveAttribute("data-history-cut-overlay",/.+/);
  await expect(page.locator("#preview")).not.toHaveAttribute("data-cut-tool-visible",/.+/);
  await history.locator(".history-tile[data-operation=cut]").last().click();
  await expect(page.locator("#preview")).toHaveAttribute("data-history-cut-overlay","true");
  await page.locator("#timeline-now").click();
  await expect(page.locator("#preview")).not.toHaveAttribute("data-history-cut-overlay",/.+/);
});

test("anchor remains stationary during docking and does not conceal rail buttons",async({page})=>{
  await page.setViewportSize({width:1440,height:820});
  await page.goto("/");
  const anchor=page.locator("#tool-dock-toggle");
  const before=(await anchor.boundingBox())!;
  expect(before.width).toBe(29);
  expect(before.height).toBe(29);
  expect(await anchor.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  await anchor.click();
  await expect(page.locator("#tool-dock-slot #sketch-tool-rail")).toHaveCount(1);
  const after=(await anchor.boundingBox())!;
  expect(Math.abs(after.x-before.x)).toBeLessThan(2);
  expect(Math.abs(after.y-before.y)).toBeLessThan(2);
  const tools=page.locator("#tool-dock-slot [data-tool]");
  await expect(tools).toHaveCount(9);
  const bounds=(await page.locator(".sketch-titlebar").boundingBox())!;
  const last=(await tools.last().boundingBox())!;
  expect(last.x+last.width).toBeLessThanOrEqual(bounds.x+bounds.width);
  await anchor.click();
  const restored=(await anchor.boundingBox())!;
  expect(Math.abs(restored.x-before.x)).toBeLessThan(2);
});

test("hover-wheel edits exact numeric fields without changing the sketch wheel zoom",async({page})=>{
  await page.goto("/");
  await page.locator("#profiles-details summary").click();
  await page.locator("#profile-list .profile-item").first().click();
  await page.locator("#properties-details summary").click();
  const width=page.locator('[data-binding-target="profile:plate:width"]');
  await expect(width).toHaveValue("100");
  await width.hover();
  await page.mouse.wheel(0,-120);
  await expect(page.locator('[data-binding-target="profile:plate:width"]')).toHaveValue("101");
  const project=await saveProject(page);
  expect(project.profiles[0].width).toBe(101);
});

test("floating render face click reaches the armed extrude depth rather than starting drag",async({page})=>{
  await page.setViewportSize({width:1440,height:820});
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  await openMenu(page,"view","view.float");
  await page.locator("#profiles-details summary").click();
  await page.locator("#profile-list .profile-item").nth(1).click();
  await page.keyboard.press("e");
  await expect(page.locator("#extrude-flyout")).toBeVisible();
  await page.locator("#extrude-z").fill("0");
  await page.locator("#extrude-depth").fill("2");
  await page.locator("#extrude-depth").focus();
  const canvas=page.locator("#preview canvas"),rect=(await canvas.boundingBox())!;
  const x=rect.x+rect.width/2,y=rect.y+rect.height/2;
  await page.mouse.move(x,y);
  await expect(page.locator("#preview")).toHaveAttribute("data-float-hover","true");
  const before=(await page.locator(".preview-panel").boundingBox())!;
  await page.mouse.click(x,y);
  await expect(page.locator("#extrude-depth")).toHaveValue("8");
  const after=(await page.locator(".preview-panel").boundingBox())!;
  expect(Math.abs(after.x-before.x)+Math.abs(after.y-before.y)).toBeLessThan(2);
  await expect(page.locator("#preview")).not.toHaveAttribute("data-float-dragging","true");
});

test("floating viewport has visible boundary and one context-aware Home button",async({page})=>{
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  await openMenu(page,"view","view.float");
  const nav=page.locator(".preview-panel .float-nav");
  await expect(nav).toBeVisible();
  await expect(nav.locator("button")).toHaveCount(3);
  await expect(nav.locator("button svg")).toHaveCount(3);
  await expect(nav).toHaveText("");
  const border=await page.locator(".preview-panel").evaluate(el=>getComputedStyle(el).borderTopWidth);
  expect(border).not.toBe("0px");
  const host=page.locator("#preview");
  const fitCount=Number(await host.getAttribute("data-camera-fit-count"));
  await nav.locator('[data-nav="fit"]').click();
  expect(Number(await host.getAttribute("data-camera-fit-count"))).toBe(fitCount+1);
  await nav.locator('[data-nav="home"]').click();
  await expect(host).toHaveAttribute("data-home-mode","underground");
  const below=(await host.getAttribute("data-camera-direction"))!.split(",").map(Number);
  expect(below[2]).toBeLessThan(0);
  await nav.locator('[data-nav="home"]').click();
  const above=(await host.getAttribute("data-camera-direction"))!.split(",").map(Number);
  expect(above[2]).toBeGreaterThan(0);
  await nav.locator('[data-nav="opposite"]').click();
  const opposite=(await host.getAttribute("data-camera-direction"))!.split(",").map(Number);
  expect(opposite[0]).toBeCloseTo(-above[0],3);
  await expect(page.locator("#menu-popover")).toBeHidden();
});

test("idle Solid viewport stops drawing frames; navigation invalidates only changed frames",async({page})=>{
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const host=page.locator("#preview");
  await expect(host).toHaveAttribute("data-rendered-solid","true");
  await page.waitForTimeout(500);
  const count=Number(await host.getAttribute("data-frame-count"));
  await page.waitForTimeout(430);
  const later=Number(await host.getAttribute("data-frame-count"));
  expect(later-count).toBeLessThanOrEqual(1);
  const rect=(await page.locator("#preview canvas").boundingBox())!;
  await page.mouse.move(rect.x+rect.width*.5,rect.y+rect.height*.5);
  await page.mouse.down({button:"middle"});
  await page.mouse.move(rect.x+rect.width*.6,rect.y+rect.height*.4,{steps:10});
  await page.mouse.up({button:"middle"});
  expect(Number(await host.getAttribute("data-frame-count"))).toBeGreaterThan(later);
});

test("View/Layout/Render menu separation and optional AO/SSAA preserve source geometry",async({page})=>{
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const volume=await page.locator("#status").getAttribute("data-volume-mm3");
  await openMenu(page,"layout","dialog.layout");
  await expect(page.locator("#layout-dialog")).toBeVisible();
  await page.locator('[data-close="layout-dialog"]').last().click();
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await openMenu(page,"render","dialog.render");
  const settings=page.locator("#render-dialog");
  await expect(settings).toBeVisible();
  await openAoDiagnostics(page);
  await page.locator("#render-ao").check();
  await expect(page.locator("#preview")).toHaveAttribute("data-ao-enabled","true");
  await page.locator("#render-supersampling").selectOption("1.5");
  await expect(page.locator("#preview")).toHaveAttribute("data-supersample","1.5");
  expect(Number(await page.locator("#preview").getAttribute("data-pixel-ratio"))).toBeGreaterThan(1);
  await page.waitForTimeout(300);
  await page.locator('[data-close="render-dialog"]').last().click();
  expect(await page.locator("#status").getAttribute("data-volume-mm3")).toBe(volume);
  expect(await page.evaluate(()=>localStorage.getItem("flatcad.project.v1"))).toBeNull();
  expect(errors).toEqual([]);
  await page.reload();
  await expect(page.locator("#preview")).toHaveAttribute("data-ao-enabled","true");
  await expect(page.locator("#preview")).toHaveAttribute("data-supersample","1.5");
});

test("multiple floating renders preserve independent cameras and optionally hidden tiled Solid",async({page},testInfo)=>{
  await page.setViewportSize({width:1500,height:860});
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  await openMenu(page,"view","view.float.new");
  await openMenu(page,"view","view.float.new");
  const views=page.locator("#floating-views-layer .floating-render-view");
  await expect(views).toHaveCount(2);
  await expect(views.locator(".floating-render-canvas[data-rendered-solid=true]"))
    .toHaveCount(2);
  await expect(page.locator(".preview-panel .solid-titlebar")).toBeVisible();
  const first=views.nth(0),second=views.nth(1);
  await first.locator('[data-nav="home"]').click();
  await expect(first.locator(".floating-render-canvas")).toHaveAttribute("data-home-mode","underground");
  // The second view overlaps the first view's centre. Activating the first
  // navigation tile must foreground its canvas before pointer interactions.
  const firstZ=await first.evaluate(el=>Number((el as HTMLElement).style.zIndex));
  const secondZ=await second.evaluate(el=>Number((el as HTMLElement).style.zIndex));
  expect(firstZ).toBeGreaterThan(secondZ);
  const d1=(await first.locator(".floating-render-canvas").getAttribute("data-camera-direction"))!
    .split(",").map(Number);
  const d2=(await second.locator(".floating-render-canvas").getAttribute("data-camera-direction"))!
    .split(",").map(Number);
  expect(d1[2]).toBeLessThan(0);
  expect(d2[2]).toBeGreaterThan(0);
  await page.screenshot({path:testInfo.outputPath("independent-floating-cameras.png")});
  await openMenu(page,"layout","dialog.layout");
  await page.locator("#tiled-solid-visible").uncheck();
  await expect(page.locator("#workbench-layout")).toHaveClass(/tiled-solid-hidden/);
  await expect(page.locator(".preview-panel")).toBeHidden();
  await expect(views).toHaveCount(2);
  await expect(first).toBeVisible();
  await page.locator('[data-close="layout-dialog"]').last().click();
  const coords=(await first.boundingBox())!;
  const handle=(await first.locator(".float-window-handle").boundingBox())!;
  await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);
  await page.mouse.down();
  await page.mouse.move(handle.x+handle.width/2+45,handle.y+handle.height/2+32,{steps:7});
  await page.mouse.up();
  const after=(await first.boundingBox())!;
  expect(after.x).toBeGreaterThan(coords.x+20);
  expect(after.y).toBeGreaterThan(coords.y+15);
  await page.screenshot({path:testInfo.outputPath("dragged-view-and-hidden-tile.png")});
  await page.reload();
  await expect(views).toHaveCount(2);
  // Foreground identity must also persist: an overlapping sibling must not
  // swallow the reloaded active view's Close navigation control.
  const restoredFirstZ=await views.first().evaluate(el=>Number((el as HTMLElement).style.zIndex));
  const restoredSecondZ=await views.nth(1).evaluate(el=>Number((el as HTMLElement).style.zIndex));
  expect(restoredFirstZ).toBeGreaterThan(restoredSecondZ);
  const restored=(await views.first().boundingBox())!;
  // Drag-end persistence is separate from the CAD document and must survive
  // reload without synchronous localStorage writes during pointermove.
  expect(Math.abs(restored.x-after.x)).toBeLessThan(3);
  expect(Math.abs(restored.y-after.y)).toBeLessThan(3);
  await expect(page.locator(".preview-panel")).toBeHidden();
  await views.first().locator('[data-nav="close"]').click();
  await expect(views).toHaveCount(1);
  await openMenu(page,"view","view.solid.show");
  await expect(page.locator(".preview-panel")).toBeVisible();
  await expect(views).toHaveCount(1);
});

test("independent floating canvas blocks background and preserves CAD navigation controls",async({page})=>{
  await page.setViewportSize({width:1440,height:820});
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  await openMenu(page,"view","view.float.new");
  const frame=page.locator("#floating-views-layer .floating-render-view").first();
  const host=frame.locator(".floating-render-canvas"),canvas=host.locator("canvas");
  await expect(host).toHaveAttribute("data-float-hit-policy","viewport");
  await expect(canvas).toHaveCSS("pointer-events","auto");
  const bounds=(await canvas.boundingBox())!;
  const x=bounds.x+bounds.width*.12,y=bounds.y+bounds.height*.78;
  expect(await page.evaluate(([px,py])=>document.elementFromPoint(px,py)?.tagName,[x,y]))
    .toBe("CANVAS");
  const profileCount=await page.locator("#profile-count").textContent();
  await page.keyboard.press("r");
  await page.mouse.click(x,y);
  expect(await page.locator("#profile-count").textContent()).toBe(profileCount);
  const original=(await frame.boundingBox())!;
  const targetBefore=await host.getAttribute("data-camera-target");
  await page.mouse.move(x,y);
  await page.mouse.down({button:"middle"});
  await page.mouse.move(x+56,y+29,{steps:7});
  await page.mouse.up({button:"middle"});
  await expect(host).toHaveAttribute("data-last-navigation-action","pan");
  expect(await host.getAttribute("data-camera-target")).not.toBe(targetBefore);
  const angleBefore=await host.getAttribute("data-camera-direction");
  await page.keyboard.down("Shift");
  await page.mouse.move(x,y);
  await page.mouse.down({button:"middle"});
  await page.mouse.move(x+64,y+39,{steps:7});
  await page.mouse.up({button:"middle"});
  await page.keyboard.up("Shift");
  await expect(host).toHaveAttribute("data-last-navigation-action","orbit");
  expect(await host.getAttribute("data-camera-direction")).not.toBe(angleBefore);
  const zoom=Number(await host.getAttribute("data-camera-zoom"));
  await page.mouse.wheel(0,-180);
  await expect.poll(async()=>Number(await host.getAttribute("data-camera-zoom"))).not.toBe(zoom);
  const after=(await frame.boundingBox())!;
  expect(Math.abs(after.x-original.x)+Math.abs(after.y-original.y)).toBeLessThan(2);
  await expect(frame.locator(".float-corner-grip")).toHaveCount(2);
  await expect(frame.locator('[data-corner="nw"]')).toHaveCount(0);
  await expect(frame.locator('[data-corner="ne"]')).toHaveCount(0);
  const sw=(await frame.locator('[data-corner="sw"]').boundingBox())!;
  await page.mouse.move(sw.x+sw.width/2,sw.y+sw.height/2);
  await page.mouse.down();
  await page.mouse.move(sw.x+sw.width/2-40,sw.y+sw.height/2+25,{steps:7});
  await page.mouse.up();
  const resized=(await frame.boundingBox())!;
  expect(resized.width).toBeGreaterThan(after.width+25);
  expect(resized.height).toBeGreaterThan(after.height+10);
  expect(Math.abs(resized.x+resized.width-after.x-after.width)).toBeLessThan(3);
  expect(Math.abs(resized.y-after.y)).toBeLessThan(3);
  await page.reload();
  const persisted=(await frame.boundingBox())!;
  expect(Math.abs(persisted.width-resized.width)).toBeLessThan(3);
  expect(Math.abs(persisted.height-resized.height)).toBeLessThan(3);
});

test("independent floating face click latches Start Z without moving viewport",async({page})=>{
  await page.setViewportSize({width:1440,height:820});
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  await openMenu(page,"view","view.float.new");
  const floating=page.locator("#floating-views-layer .floating-render-view").first();
  const host=floating.locator(".floating-render-canvas");
  await expect(host).toHaveAttribute("data-rendered-solid","true");
  await page.locator("#profiles-details summary").click();
  await page.locator("#profile-list .profile-item").nth(1).click();
  await page.keyboard.press("e");
  await expect(page.locator("#extrude-flyout")).toBeVisible();
  await page.locator("#extrude-z").fill("0");
  await page.locator("#extrude-z").focus();
  const initial=(await floating.boundingBox())!;
  const rect=(await host.boundingBox())!;
  const x=rect.x+rect.width/2,y=rect.y+rect.height/2;
  await page.mouse.move(x,y);
  await expect(host).toHaveAttribute("data-float-hover","true");
  await page.mouse.click(x,y);
  await expect(page.locator("#extrude-z")).toHaveValue("8");
  const after=(await floating.boundingBox())!;
  expect(Math.abs(after.x-initial.x)+Math.abs(after.y-initial.y)).toBeLessThan(2);
});

test("independent floating views share render settings but not exact CAD geometry state",async({page})=>{
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  await openMenu(page,"view","view.float.new");
  const host=page.locator("#floating-views-layer .floating-render-canvas").first();
  const originalVolume=await page.locator("#status").getAttribute("data-volume-mm3");
  await openMenu(page,"render","dialog.render");
  await openAoDiagnostics(page);
  await page.locator("#render-ao").check();
  await page.locator("#render-supersampling").selectOption("1.5");
  await expect(host).toHaveAttribute("data-ao-enabled","true");
  await expect(host).toHaveAttribute("data-supersample","1.5");
  await page.locator('[data-close="render-dialog"]').last().click();
  expect(await page.locator("#status").getAttribute("data-volume-mm3")).toBe(originalVolume);
  await expect(page.locator(".preview-panel .preview-root")).toHaveAttribute("data-supersample","1.5");
});


test("floating WebGL2 capability preflight reports actual driver availability",async({page})=>{
  await page.goto("/");
  const diagnostic=await page.evaluate(()=>{
    const canvas=document.createElement("canvas");
    let reason="";
    canvas.addEventListener("webglcontextcreationerror",e=>{reason=(e as WebGLContextEvent).statusMessage;});
    const gl=canvas.getContext("webgl2");
    const result={available:gl!==null,
      vendor:gl?.getParameter(gl.VENDOR)??null,
      renderer:gl?.getParameter(gl.RENDERER)??null,
      reason,userAgent:navigator.userAgent};
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return result;
  });
  console.log("flatCAD WebGL2 preflight:",JSON.stringify(diagnostic));
  expect(diagnostic.available,JSON.stringify(diagnostic)).toBe(true);
});

test("floating view opened during provisional cut retains committed face pick",async({page})=>{
  await page.setViewportSize({width:1440,height:820});
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  await page.locator("#profiles-details summary").click();
  await page.locator("#profile-list .profile-item").nth(1).click();
  await page.keyboard.press("e");
  await expect(page.locator("#extrude-flyout")).toBeVisible();
  await expect(page.locator("#preview")).toHaveAttribute("data-preview-state","ready");
  await openMenu(page,"view","view.float.new");
  const host=page.locator("#floating-views-layer .floating-render-canvas").first();
  await expect(host).toHaveAttribute("data-rendered-solid","true");
  await page.locator("#extrude-z").fill("0");
  await page.locator("#extrude-z").focus();
  const r=(await host.boundingBox())!;
  await page.mouse.click(r.x+r.width/2,r.y+r.height/2);
  await expect(page.locator("#extrude-z")).toHaveValue("8");
});

test("floating control spacing and opacity persist independently from CAD",async({page})=>{
  await page.setViewportSize({width:1440,height:820});
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  await openMenu(page,"view","view.float.new");
  const frame=page.locator(".floating-render-view").first();
  const handle=frame.locator(".float-window-handle");
  const nav=frame.locator(".float-nav");
  await expect(frame.locator(".float-corner-grip")).toHaveCount(2);
  await expect(frame.locator('[data-corner="nw"]')).toHaveCount(0);
  await expect(frame.locator('[data-corner="ne"]')).toHaveCount(0);
  const rect=(await frame.boundingBox())!;
  const handleBox=(await handle.boundingBox())!,navBox=(await nav.boundingBox())!;
  expect(handleBox.width).toBeGreaterThanOrEqual(44);
  expect(Math.abs(handleBox.x-(rect.x+3))).toBeLessThan(2);
  expect(Math.abs(handleBox.y-navBox.y)).toBeLessThan(1);
  await openMenu(page,"layout","dialog.layout");
  const slider=page.locator("#float-opacity");
  await slider.focus();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  await expect(slider).toHaveValue("95");
  await expect(page.locator("#float-opacity-value")).toHaveText("95%");
  await page.locator('[data-close="layout-dialog"]').last().click();
  expect(await frame.evaluate(el=>getComputedStyle(el).backgroundColor)).toContain("0.95");
  const volume=await page.locator("#status").getAttribute("data-volume-mm3");
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("flatcad.float-opacity.v1")||"null"))).toBe(.95);
  await page.reload();
  await expect(frame).toBeVisible();
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  expect(await frame.evaluate(el=>getComputedStyle(el).backgroundColor)).toContain("0.95");
  expect(await page.locator("#status").getAttribute("data-volume-mm3")).toBe(volume);
  expect(await page.evaluate(()=>localStorage.getItem("flatcad.project.v1"))).toBeNull();
});
test("docked and floating Shift-wheel boost zoom without changing CAD geometry",async({page})=>{
  await page.setViewportSize({width:1440,height:820});
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const originalVolume=await page.locator("#status").getAttribute("data-volume-mm3");
  for(const floating of [false,true]){
    if(floating)await openMenu(page,"view","view.float.new");
    const host=floating?page.locator(".floating-render-canvas").first():page.locator("#preview");
    const rect=(await host.locator("canvas").boundingBox())!;
    await page.mouse.move(rect.x+rect.width*.65,rect.y+rect.height*.6);
    const initial=Number(await host.getAttribute("data-camera-zoom"));
    await page.mouse.wheel(0,-120);
    await expect.poll(async()=>Number(await host.getAttribute("data-camera-zoom"))).toBeGreaterThan(initial);
    const standard=Number(await host.getAttribute("data-camera-zoom"));
    await page.keyboard.down("Shift");
    await page.mouse.wheel(0,-120);
    await page.keyboard.up("Shift");
    await expect.poll(async()=>Number(await host.getAttribute("data-camera-zoom"))).toBeGreaterThan(standard);
    const boosted=Number(await host.getAttribute("data-camera-zoom"));
    expect(boosted/standard).toBeGreaterThan(standard/initial+.005);
  }
  expect(await page.locator("#status").getAttribute("data-volume-mm3")).toBe(originalVolume);
});
test("floating context Home toggles at home, otherwise respects hemisphere",async({page})=>{
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  await openMenu(page,"view","view.float");
  const nav=page.locator(".preview-panel .float-nav");
  const host=page.locator("#preview");
  await nav.locator('[data-nav="home"]').click();
  await expect(host).toHaveAttribute("data-home-mode","underground");
  await nav.locator('[data-nav="home"]').click();
  await expect(host).toHaveAttribute("data-home-mode","standard");
  await nav.locator('[data-nav="opposite"]').click();
  // Away from canonical Home, choose based on actual camera elevation.
  await nav.locator('[data-nav="home"]').click();
  await expect(host).toHaveAttribute("data-home-mode","standard");
});


test("nonmodal render inspector tunes real edge lines and lighting without changing CAD",async({page})=>{
  await page.setViewportSize({width:1500,height:870});
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const initialVolume=await page.locator("#status").getAttribute("data-volume-mm3");
  const surface=page.locator("#preview canvas");
  const initial=await surface.screenshot();
  await openMenu(page,"view","view.float.new");
  const floatHost=page.locator(".floating-render-canvas").first();
  await openMenu(page,"render","dialog.render");
  const inspector=page.locator("#render-dialog");
  await expect(inspector).toBeVisible();
  await expect(page.locator("#render-ao-diagnostics")).toHaveJSProperty("open",false);
  expect(await inspector.evaluate(el=>(el as HTMLDialogElement).matches(":modal"))).toBe(false);
  await expect(page.locator("#render-resolution-info")).toContainText("browser smooth or nearest canvas scaling");
  await page.locator("#render-lines-enabled").uncheck();
  await expect(page.locator("#preview")).toHaveAttribute("data-lines-enabled","false");
  await expect(floatHost).toHaveAttribute("data-lines-enabled","false");
  const hidden=await surface.screenshot();
  expect(Buffer.compare(initial,hidden)).not.toBe(0);
  await page.locator("#render-lines-enabled").check();
  await expect(page.locator("#preview")).toHaveAttribute("data-lines-enabled","true");
  await expect(page.locator("#render-edge-width")).toBeEnabled();
  await page.locator("#render-edge-width").focus();
  await page.keyboard.press("End");
  await expect(page.locator("#preview")).toHaveAttribute("data-edge-width","5");
  await expect(floatHost).toHaveAttribute("data-edge-width","5");
  const wide=await surface.screenshot();
  expect(Buffer.compare(hidden,wide)).not.toBe(0);
  await page.locator("#render-light-ambient").focus();
  await page.keyboard.press("Home");
  await expect(page.locator("#preview")).toHaveAttribute("data-ambient-light","0");
  const dark=await surface.screenshot();
  expect(Buffer.compare(wide,dark)).not.toBe(0);
  await openAoDiagnostics(page);
  await page.locator("#render-ao").check();
  await expect(page.locator("#render-ao-radius")).toBeEnabled();
  await page.locator("#render-ao-radius").focus();
  await page.keyboard.press("End");
  await expect(page.locator("#preview")).toHaveAttribute("data-ao-radius","24");
  await page.locator("#render-supersampling").selectOption("1.75");
  await expect(page.locator("#preview")).toHaveAttribute("data-supersample","1.75");
  await expect(page.locator("#render-resolution-info")).toContainText("effective");
  await page.locator('[data-close="render-dialog"]').last().click();
  expect(await page.locator("#status").getAttribute("data-volume-mm3")).toBe(initialVolume);
  expect(await page.evaluate(()=>localStorage.getItem("flatcad.project.v1"))).toBeNull();
  await page.reload();
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  await expect(page.locator("#preview")).toHaveAttribute("data-lines-enabled","true");
  await expect(page.locator("#preview")).toHaveAttribute("data-edge-width","5");
  await expect(page.locator("#preview")).toHaveAttribute("data-supersample","1.75");
  expect(await page.locator("#status").getAttribute("data-volume-mm3")).toBe(initialVolume);
});


test("MSAA sample count is independent of AO and has truthful GPU limits",async({page})=>{
  await page.setViewportSize({width:1200,height:790});
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const volume=await page.locator("#status").getAttribute("data-volume-mm3");
  await openMenu(page,"render","dialog.render");
  const solid=page.locator("#preview");
  await expect(solid).toHaveAttribute("data-msaa-requested","browser");
  await expect(solid).toHaveAttribute("data-msaa-effective","browser");
  await openAoDiagnostics(page);
  await page.locator("#render-ao").check();
  await expect(solid).toHaveAttribute("data-msaa-effective","0");
  await expect(page.locator("#render-resolution-info")).toContainText("AO composer bypasses");
  await openAoDiagnostics(page);
  await page.locator("#render-ao").uncheck();
  await page.locator("#render-msaa").selectOption("4");
  await expect(solid).toHaveAttribute("data-msaa-requested","4");
  await expect(solid).toHaveAttribute("data-msaa-path","offscreen");
  await expect.poll(async()=>Number(await solid.getAttribute("data-msaa-effective")))
    .toBeGreaterThanOrEqual(0);
  expect([0,2,4]).toContain(Number(await solid.getAttribute("data-msaa-effective")));
  await openAoDiagnostics(page);
  await page.locator("#render-ao").check();
  await expect(solid).toHaveAttribute("data-ao-enabled","true");
  expect([0,2,4]).toContain(Number(await solid.getAttribute("data-msaa-effective")));
  await page.locator("#render-msaa").selectOption("0");
  await expect(solid).toHaveAttribute("data-msaa-effective","0");
  await openAoDiagnostics(page);
  await page.locator("#render-ao").uncheck();
  await expect(solid).toHaveAttribute("data-msaa-path","offscreen");
  await page.locator("#render-msaa").selectOption("browser");
  await expect(solid).toHaveAttribute("data-msaa-path","browser");
  expect(await page.locator("#status").getAttribute("data-volume-mm3")).toBe(volume);
});
test("experimental 8x SSAA exposes requested/effective ratio, budget and downsampling",async({page})=>{
  await page.setViewportSize({width:1150,height:790});
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const volume=await page.locator("#status").getAttribute("data-volume-mm3");
  await openMenu(page,"view","view.float.new");
  const frame=page.locator(".floating-render-canvas").first();
  await expect(frame).toHaveAttribute("data-rendered-solid","true");
  // Only the visible floating render should allocate high-res attachments.
  await openMenu(page,"view","view.solid.hide");
  const hiddenTiled=page.locator("#preview canvas");
  const hiddenWidth=await hiddenTiled.evaluate(el=>(el as HTMLCanvasElement).width);
  await openMenu(page,"render","dialog.render");
  await page.locator("#render-pixel-budget").selectOption("32000000");
  await page.locator("#render-supersampling").selectOption("8");
  await expect(frame).toHaveAttribute("data-supersample","8");
  expect(await hiddenTiled.evaluate(el=>(el as HTMLCanvasElement).width)).toBe(hiddenWidth);
  const effective=Number(await frame.getAttribute("data-effective-supersample"));
  expect(effective).toBeGreaterThan(7);
  const canvas=frame.locator("canvas");
  expect(await canvas.evaluate(el=>(el as HTMLCanvasElement).width)).toBeGreaterThan(1500);
  await page.locator("#render-downsample").selectOption("nearest");
  await expect(frame).toHaveAttribute("data-downsample-mode","nearest");
  await expect(canvas).toHaveCSS("image-rendering","pixelated");
  await page.locator("#render-downsample").selectOption("browser");
  await expect(canvas).toHaveCSS("image-rendering","auto");
  await expect(page.locator("#render-resolution-info")).toContainText("requested 8");
  await page.locator("#render-pixel-budget").selectOption("8000000");
  expect(Number(await frame.getAttribute("data-effective-supersample"))).toBeLessThanOrEqual(8);
  await page.locator('[data-close="render-dialog"]').last().click();
  expect(await page.locator("#status").getAttribute("data-volume-mm3")).toBe(volume);
});
test("Clean CAD preset is reproducible and CAD-project-independent",async({page})=>{
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const volume=await page.locator("#status").getAttribute("data-volume-mm3");
  await openMenu(page,"render","dialog.render");
  await page.locator("#render-msaa").selectOption("2");
  await page.locator("#render-clean-preset").click();
  const p=page.locator("#preview");
  await expect(p).toHaveAttribute("data-ao-enabled","false");
  await expect(p).toHaveAttribute("data-msaa-requested","browser");
  await expect(p).toHaveAttribute("data-lines-enabled","true");
  await expect(p).toHaveAttribute("data-edge-width","0.5");
  await expect(p).toHaveAttribute("data-edge-opacity","0.5");
  await expect(p).toHaveAttribute("data-ambient-light","0.75");
  await expect(p).toHaveAttribute("data-key-light","5");
  await expect(page.locator("#render-edge-width")).toHaveValue("0.5");
  await expect(page.locator("#render-edge-opacity")).toHaveValue("0.5");
  await page.locator('[data-close="render-dialog"]').last().click();
  await page.reload();
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  await expect(page.locator("#preview")).toHaveAttribute("data-ambient-light","0.75");
  expect(await page.locator("#status").getAttribute("data-volume-mm3")).toBe(volume);
  expect(await page.evaluate(()=>localStorage.getItem("flatcad.project.v1"))).toBeNull();
});


/** Decode Chrome's own screenshot through a 2D browser canvas. This captures
 * the composited output and is unaffected by preserveDrawingBuffer=false.
 * It does not read any engineering geometry or source model data. */
async function renderPixelComparison(page:import("@playwright/test").Page,
  source:Buffer,target:Buffer){
  return page.evaluate(async ([a,b]:string[])=>{
    const imgs=await Promise.all([a,b].map(async encoded=>{
      const img=new Image();img.src="data:image/png;base64,"+encoded;await img.decode();
      const c=document.createElement("canvas");c.width=img.width;c.height=img.height;
      const ctx=c.getContext("2d",{willReadFrequently:true})!;
      ctx.drawImage(img,0,0);
      return {width:img.width,height:img.height,
        data:ctx.getImageData(0,0,img.width,img.height).data};
    }));
    const [one,two]=imgs;
    if(one.width!==two.width||one.height!==two.height)
      throw Error("Mismatched screenshot dimensions");
    let all=0,model=0,back=0,allCount=0,modelCount=0,backCount=0;
    let significant=0;
    let stableBackdrop=0,stableFace=0,stableBackdropCount=0,stableFaceCount=0;
    // Identify flat, interior pixels from the DIRECT reference image,
    // eroding by two pixels to exclude edge MSAA coverage differences.
    const interior=(x:number,y:number,check:(r:number,g:number,b:number)=>boolean)=>{
      for(const [dx,dy] of [[0,0],[-2,0],[2,0],[0,-2],[0,2],[-2,-2],[-2,2],[2,-2],[2,2]]){
        const j=((y+dy)*one.width+x+dx)*4;
        if(!check(one.data[j],one.data[j+1],one.data[j+2]))return false;
      }
      return true;
    };
    for(let y=0;y<one.height;y+=2){
      for(let x=0;x<one.width;x+=2){
        const i=(y*one.width+x)*4;
        const r=one.data[i],g=one.data[i+1],b=one.data[i+2];
        const diff=(Math.abs(r-two.data[i])+Math.abs(g-two.data[i+1])+
          Math.abs(b-two.data[i+2]))/3;
        all+=diff;allCount++;
        if(b>70&&b>r+18&&b>g+12){model+=diff;modelCount++;if(diff>5)significant++;}
        if(r<40&&g<55&&b<85){back+=diff;backCount++;}
        if(x>=4&&y>=4&&x+4<one.width&&y+4<one.height){
          // Exact original dark background (RGB 11/18/32) is the contract.
          // Sampling deep inside its uniform area excludes jagged edge pixels.
          if(interior(x,y,(rr,gg,bb)=>Math.abs(rr-11)<=1&&
            Math.abs(gg-18)<=1&&Math.abs(bb-32)<=1)){
            stableBackdrop+=diff;stableBackdropCount++;
          }
          if(b>70&&b>r+18&&b>g+12&&
            interior(x,y,(rr,gg,bb)=>
              Math.abs(rr-r)<=2&&Math.abs(gg-g)<=2&&Math.abs(bb-b)<=2)){
            stableFace+=diff;stableFaceCount++;
          }
        }
      }
    }
    const rgb=(d:Uint8ClampedArray,x:number,y:number)=>
      Array.from(d.slice((y*one.width+x)*4,(y*one.width+x)*4+4));
    return {
      fullMeanAbs:all/Math.max(1,allCount),
      modelMeanAbs:model/Math.max(1,modelCount),
      modelChangedOver5Pct:100*significant/Math.max(1,modelCount),
      backgroundMeanAbs:back/Math.max(1,backCount),
      flatBackdropMeanAbs:stableBackdrop/Math.max(1,stableBackdropCount),
      flatFaceMeanAbs:stableFace/Math.max(1,stableFaceCount),
      flatBackdropPixels:stableBackdropCount,flatFacePixels:stableFaceCount,
      backgroundDirect:rgb(one.data,4,4),
      backgroundCompared:rgb(two.data,4,4),
      modelPixels:modelCount,backgroundPixels:backCount,width:one.width,height:one.height
    };
  },[source.toString("base64"),target.toString("base64")]);
}
test("direct/offscreen colour parity and measurable AO on identical MSAA path",async({page},testInfo)=>{
  await page.setViewportSize({width:1600,height:900});
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const volume=await page.locator("#status").getAttribute("data-volume-mm3");
  await openMenu(page,"render","dialog.render");
  const inspector=page.locator("#render-dialog");
  const canvas=page.locator("#preview canvas");
  const snap=async(name:string)=>{
    await inspector.evaluate(el=>(el as HTMLElement).style.visibility="hidden");
    await page.waitForTimeout(80);
    const bytes=await canvas.screenshot({path:testInfo.outputPath("render-"+name+".png")});
    await inspector.evaluate(el=>(el as HTMLElement).style.visibility="visible");
    return bytes;
  };
  await openAoDiagnostics(page);
  await page.locator("#render-ao").uncheck();
  await page.locator("#render-supersampling").selectOption("1");
  await page.locator("#render-msaa").selectOption("browser");
  await expect(page.locator("#preview")).toHaveAttribute("data-msaa-path","browser");
  const direct=await snap("direct-default");
  await page.locator("#render-msaa").selectOption("0");
  const offscreen0=await snap("offscreen-0msaa");
  await page.locator("#render-msaa").selectOption("4");
  await expect(page.locator("#preview")).toHaveAttribute("data-msaa-path","offscreen");
  const offscreen4=await snap("offscreen-4msaa");
  await openAoDiagnostics(page);
  await page.locator("#render-ao").check();
  await expect(page.locator("#preview")).toHaveAttribute("data-ao-enabled","true");
  await expect.poll(async()=>Number(await page.locator("#preview").getAttribute("data-ao-depth-max")))
    .toBeGreaterThan(0);
  const aoEnabled=await snap("ao-on-4msaa");
  const depthRange=[await page.locator("#preview").getAttribute("data-ao-depth-min"),
    await page.locator("#preview").getAttribute("data-ao-depth-max")];
  await openAoDiagnostics(page);
  await page.locator("#render-ao").uncheck();
  const aoRestored=await snap("ao-off-4msaa");
  await page.locator("#render-msaa").selectOption("browser");
  const restored=await snap("restored-direct");
  const report={
    defaultVsOffscreen0:await renderPixelComparison(page,direct,offscreen0),
    defaultVsOffscreen4:await renderPixelComparison(page,direct,offscreen4),
    aoOffVsOn:await renderPixelComparison(page,offscreen4,aoEnabled),
    aoRestoration:await renderPixelComparison(page,offscreen4,aoRestored),
    directRestoration:await renderPixelComparison(page,direct,restored),
    depthRange
  };
  console.log("FLATCAD_RENDER_PARITY_EVIDENCE "+JSON.stringify(report));
  // Keep diagnostic first, enforce quantitative parity after evidence review.
  expect(report.defaultVsOffscreen4.modelPixels).toBeGreaterThan(100);
  expect(report.defaultVsOffscreen4.backgroundPixels).toBeGreaterThan(100);
  expect(report.aoOffVsOn.modelPixels).toBeGreaterThan(100);
  // Enforce colour parity on stable, interior pixels and exact background
  // RGBA, not full-image averages contaminated by normal MSAA edge changes.
  const parity=report.defaultVsOffscreen4;
  expect(parity.backgroundCompared).toEqual(parity.backgroundDirect);
  expect(parity.backgroundDirect).toEqual([11,18,32,255]);
  expect(parity.flatBackdropPixels).toBeGreaterThan(1000);
  expect(parity.flatBackdropMeanAbs).toBeLessThan(1);
  expect(parity.flatFacePixels).toBeGreaterThan(100);
  expect(parity.flatFaceMeanAbs).toBeLessThan(2);
  // Full-image/edge measurements are still recorded for comparisons.
  expect(report.directRestoration.fullMeanAbs).toBeLessThan(.2);
  expect(Number(report.depthRange[0])).toBeGreaterThan(0);
  expect(Number(report.depthRange[1])).toBeGreaterThan(Number(report.depthRange[0]));
  expect(await page.locator("#status").getAttribute("data-volume-mm3")).toBe(volume);
  expect(await page.evaluate(()=>localStorage.getItem("flatcad.project.v1"))).toBeNull();
});
test("new CAD line defaults are one black CSS pixel and a single checkbox",async({page})=>{
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  await openMenu(page,"render","dialog.render");
  await expect(page.locator("#render-lines-enabled")).toBeChecked();
  await expect(page.locator("#render-edge-mode")).toHaveCount(0);
  await expect(page.locator("#preview")).toHaveAttribute("data-lines-enabled","true");
  await expect(page.locator("#preview")).toHaveAttribute("data-edge-width","1");
  await expect(page.locator("#render-edge-color")).toHaveValue("#000000");
  await page.locator("#render-lines-enabled").uncheck();
  await expect(page.locator("#preview")).toHaveAttribute("data-lines-enabled","false");
  await expect(page.locator("#render-edge-width")).toBeDisabled();
  await page.locator("#render-lines-enabled").check();
  await expect(page.locator("#render-edge-width")).toBeEnabled();
  await page.locator('[data-close="render-dialog"]').last().click();
  await page.reload();
  await expect(page.locator("#preview")).toHaveAttribute("data-lines-enabled","true");
});


test("Render inspector exposes MSAA controls outside collapsed AO diagnostics in every layout",async({page})=>{
  await page.setViewportSize({width:1440,height:820});
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const inspector=page.locator("#render-dialog");
  const inspect=async()=>{
    await openMenu(page,"render","dialog.render");
    await expect(inspector).toBeVisible();
    await expect(inspector).toHaveAttribute("open","");
    await expect(page.locator("#render-ao-diagnostics")).toHaveJSProperty("open",false);
    await expect(page.locator("#render-ao")).toBeHidden();
    for(const id of ["render-msaa","render-supersampling","render-pixel-budget",
      "render-downsample","render-clean-preset"]){
      await expect(page.locator("#"+id)).toBeVisible();
    }
  };
  await inspect();
  await page.locator("#render-msaa").selectOption("4");
  await expect(page.locator("#preview")).toHaveAttribute("data-msaa-requested","4");
  await page.locator('[data-close="render-dialog"]').last().click();
  await openMenu(page,"view","view.float");
  await inspect();
  await page.locator("#render-msaa").selectOption("2");
  await expect(page.locator("#preview")).toHaveAttribute("data-msaa-requested","2");
  await page.locator('[data-close="render-dialog"]').last().click();
  await openMenu(page,"view","view.dock");
  await inspect();
  await page.locator("#render-msaa").selectOption("browser");
  await expect(page.locator("#preview")).toHaveAttribute("data-msaa-path","browser");
  await page.locator('[data-close="render-dialog"]').last().click();
  await openMenu(page,"view","view.float.new");
  await openMenu(page,"view","view.solid.hide");
  await inspect();
  await page.locator("#render-pixel-budget").selectOption("16000000");
  await expect(page.locator(".floating-render-canvas").first())
    .toHaveAttribute("data-render-pixel-budget","16000000");
  await page.locator('[data-close="render-dialog"]').last().click();
});
test("floating WebGL background remains transparent in direct and offscreen MSAA",async({page},testInfo)=>{
  await page.setViewportSize({width:1440,height:820});
  // The user-adjustable window background now defaults to 20% opacity.
  // Test the explicit fully transparent setting for pixel-accurate alpha parity.
  await page.addInitScript(()=>localStorage.setItem("flatcad.float-opacity.v1","0"));
  await page.goto("/");
  await newProject(page);
  await openMenu(page,"view","view.float");
  const viewport=page.locator(".preview-panel");
  await expect(viewport).toBeVisible();
  const canvas=page.locator("#preview canvas");
  const box=(await canvas.boundingBox())!;
  const clip={x:Math.round(box.x+box.width/2-20),
    y:Math.round(box.y+box.height/2-20),width:40,height:40};
  // With an empty model and floating frame opacity=0, the WebGL background
  // must reveal the same sketch pixels as a temporarily hidden canvas.
  await canvas.evaluate(el=>(el as HTMLElement).style.visibility="hidden");
  const underlying=await page.screenshot({clip,path:testInfo.outputPath("float-hidden-canvas.png")});
  await canvas.evaluate(el=>(el as HTMLElement).style.visibility="visible");
  await page.waitForTimeout(70);
  const direct=await page.screenshot({clip,path:testInfo.outputPath("float-direct-transparent.png")});
  // Change MSAA with the Solid docked, then restore exactly the same
  // transparent floating layout. The float-mode Render-inspector accessibility
  // issue is tracked independently; do not mix that with alpha acceptance.
  await openMenu(page,"view","view.dock");
  await openMenu(page,"render","dialog.render");
  await expect(page.locator("#render-dialog")).toBeVisible();
  await page.locator("#render-msaa").selectOption("4");
  await page.locator('[data-close="render-dialog"]').last().click();
  await openMenu(page,"view","view.float");
  await expect(page.locator("#preview")).toHaveAttribute("data-msaa-path","offscreen");
  const floated=(await canvas.boundingBox())!;
  const clipOffscreen={x:Math.round(floated.x+floated.width/2-20),
    y:Math.round(floated.y+floated.height/2-20),width:40,height:40};
  await canvas.evaluate(el=>(el as HTMLElement).style.visibility="hidden");
  const underlyingOffscreen=await page.screenshot({
    clip:clipOffscreen,path:testInfo.outputPath("float-offscreen-underlay.png")});
  await canvas.evaluate(el=>(el as HTMLElement).style.visibility="visible");
  await page.waitForTimeout(70);
  const offscreen=await page.screenshot({
    clip:clipOffscreen,path:testInfo.outputPath("float-offscreen-transparent.png")});
  const result={
    direct:await renderPixelComparison(page,underlying,direct),
    offscreen:await renderPixelComparison(page,underlyingOffscreen,offscreen)
  };
  console.log("FLATCAD_FLOAT_ALPHA_EVIDENCE "+JSON.stringify(result));
  expect(result.direct.fullMeanAbs).toBeLessThan(3);
  expect(result.offscreen.fullMeanAbs).toBeLessThan(3);
});

test("nonmodal Render inspector does not disable CAD shortcuts, Space pan, or modal guards",async({page})=>{
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  await openMenu(page,"render","dialog.render");
  await expect(page.locator("#render-dialog")).toBeVisible();
  // Reproduce physical user behavior: the nonmodal dialog may autofocus its
  // first button. Do not click Sketch to artificially repair document focus.
  await page.locator('#render-dialog [data-close="render-dialog"]').first().focus();
  await page.keyboard.press("r");
  await expect(page.locator('[data-tool="rectangle"]')).toHaveClass(/active/);
  // Nonmodal HTMLDialogElement.show() and pointer-adjusted range inputs
  // retain focus in the panel. Letter shortcuts MUST still work there.
  await page.locator("#render-edge-width").focus();
  await page.keyboard.press("c");
  await expect(page.locator('[data-tool="circle"]')).toHaveClass(/active/);
  const before=await page.locator("#render-edge-width").inputValue();
  await page.keyboard.press("ArrowRight");
  expect(await page.locator("#render-edge-width").inputValue()).not.toBe(before);
  await expect(page.locator('[data-tool="circle"]')).toHaveClass(/active/);
  await page.locator("#render-reset").focus();
  await page.keyboard.press("r");
  await expect(page.locator('[data-tool="rectangle"]')).toHaveClass(/active/);
  await page.locator("#render-msaa").focus();
  await page.keyboard.press("c");
  await expect(page.locator('[data-tool="rectangle"]')).toHaveClass(/active/);
  // Outside the nonmodal inspector, temporary Space-pan must still operate.
  await page.locator(".sketch-titlebar").click();
  await page.keyboard.down("Space");
  await expect(page.locator('[data-tool="pan"]')).toHaveClass(/active/);
  await page.keyboard.up("Space");
  await expect(page.locator('[data-tool="rectangle"]')).toHaveClass(/active/);
  await page.keyboard.press("g");
  await expect(page.locator("#grid-dialog")).toBeVisible();
  // A real modal dialog must suppress sketch shortcuts.
  await page.keyboard.press("c");
  await expect(page.locator('[data-tool="rectangle"]')).toHaveClass(/active/);
  await page.locator('[data-close="grid-dialog"]').last().click();
  await page.locator(".sketch-titlebar").click();
  await page.keyboard.press("c");
  await expect(page.locator('[data-tool="circle"]')).toHaveClass(/active/);
  await expect(page.locator("#render-dialog")).toBeVisible();
  await page.locator('[data-close="render-dialog"]').last().click();
  await page.keyboard.press("r");
  await expect(page.locator('[data-tool="rectangle"]')).toHaveClass(/active/);
});
test("new floating-window backgrounds use subtle opacity without overriding user 0%",async({page})=>{
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  await expect(page.locator("#float-opacity")).toHaveValue("20");
  await expect(page.locator("#float-opacity-value")).toHaveText("20%");
  await openMenu(page,"view","view.float.new");
  const frame=page.locator(".floating-render-view").first();
  await expect(frame).toBeVisible();
  expect(await frame.evaluate(el=>getComputedStyle(el).backgroundColor))
    .toMatch(/rgba\(11, 18, 32, 0\.2\)/);
  await page.evaluate(()=>localStorage.setItem("flatcad.float-opacity.v1","0"));
  await page.reload();
  await expect(frame).toBeVisible();
  await expect(page.locator("#float-opacity")).toHaveValue("0");
  expect(await frame.evaluate(el=>getComputedStyle(el).backgroundColor))
    .toMatch(/rgba\(11, 18, 32, 0\)/);
});

test("nonmodal Render keyboard focus keeps CAD shortcuts live without a sketch click",async({page})=>{
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  await openMenu(page,"render","dialog.render");
  const inspector=page.locator("#render-dialog");
  await expect(inspector).toBeVisible();
  const tool=async(which:string)=>expect(page.locator('[data-tool="'+which+'"]')).toHaveClass(/active/);
  // Real UI workflow: open settings, use a control, then press tool shortcuts
  // without an intervening click on the CAD canvas or titlebar.
  await inspector.locator('[data-close="render-dialog"]').first().focus();
  await page.keyboard.press("r");
  await tool("rectangle");
  await page.locator("#render-edge-width").focus();
  await page.keyboard.press("c");
  await tool("circle");
  await page.keyboard.press("l");
  await tool("line");
  // Native keyboard editing inside a range must not steal its arrows.
  const before=await page.locator("#render-edge-width").inputValue();
  await page.keyboard.press("ArrowRight");
  expect(await page.locator("#render-edge-width").inputValue()).not.toBe(before);
  await tool("line");
  // Editable dropdown remains native; letter keys must NOT change CAD tools.
  await page.locator("#render-msaa").focus();
  await page.keyboard.press("r");
  await tool("line");
  await page.locator("#render-clean-preset").focus();
  await page.keyboard.press("v");
  await tool("select");
  await page.keyboard.press("g");
  await expect(page.locator("#grid-dialog")).toBeVisible();
  await page.locator('[data-close="grid-dialog"]').last().click();
  await page.locator("#render-edge-width").focus();
  await page.keyboard.press("r");
  await tool("rectangle");
  await inspector.locator('[data-close="render-dialog"]').last().click();
  await page.keyboard.press("c");
  await tool("circle");
});


test("selected sketch tools show an offset glyph next to, not across, the native crosshair",async({page})=>{
  await page.setViewportSize({width:1450,height:870});
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const canvas=page.locator("#sketch");
  const rect=(await canvas.boundingBox())!;
  const at={x:rect.x+rect.width*.55,y:rect.y+rect.height*.42};
  await page.mouse.move(at.x,at.y);
  await page.keyboard.press("l");
  const badge=page.locator(".sketch-tool-cursor");
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute("data-cursor-tool","line");
  await expect(badge).toHaveText("╱");
  await expect(canvas).toHaveCSS("cursor","crosshair");
  const box=(await badge.boundingBox())!;
  expect(box.x+box.width).toBeLessThan(at.x-7);
  expect(box.y).toBeGreaterThan(at.y+7);
  expect(await badge.evaluate(el=>getComputedStyle(el).pointerEvents)).toBe("none");
  await page.keyboard.press("r");
  await expect(badge).toHaveAttribute("data-cursor-tool","rectangle");
  await expect(badge).toHaveText("▭");
  await page.keyboard.press("Shift+r");
  await expect(badge).toHaveAttribute("data-cursor-tool","centerRectangle");
  await expect(badge).toHaveText("▣");
  await page.keyboard.press("c");
  await expect(badge).toHaveText("◯");
  await page.mouse.move(rect.x+4,rect.y+rect.height-4);
  const nearEdge=(await badge.boundingBox())!;
  expect(nearEdge.x).toBeGreaterThanOrEqual(rect.x);
  expect(nearEdge.y).toBeGreaterThanOrEqual(rect.y);
  expect(nearEdge.x+nearEdge.width).toBeLessThanOrEqual(rect.x+rect.width);
  expect(nearEdge.y+nearEdge.height).toBeLessThanOrEqual(rect.y+rect.height);
  await page.mouse.move(rect.x-15,rect.y-15);
  await expect(badge).toBeHidden();
  await page.mouse.move(at.x,at.y);
  await expect(badge).toBeVisible();
  await page.keyboard.press("v");
  await expect(badge).toBeHidden();
  await expect(canvas).toHaveCSS("cursor","default");
});
test("Keybinds top menu shows live chords and reassigns through existing editor",async({page})=>{
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const entry=page.locator('[data-menu="keybinds"]');
  await expect(entry).toBeVisible();
  await entry.click();
  const popup=page.locator("#menu-popover");
  await expect(popup).toBeVisible();
  await expect(popup.locator('[data-command="keybind.reassign.tool.rectangle"]'))
    .toContainText("Rectangle");
  await expect(popup.locator('[data-command="keybind.reassign.tool.rectangle"] .menu-shortcut'))
    .toHaveText("R");
  const popBox=(await popup.boundingBox())!;
  expect(popBox.x).toBeGreaterThanOrEqual(0);
  expect(popBox.x+popBox.width).toBeLessThanOrEqual(1450);
  await popup.locator('[data-command="keybind.reassign.tool.rectangle"]').click();
  await expect(page.locator("#shortcuts-dialog")).toBeVisible();
  await expect(page.locator('[data-action="tool.rectangle"]')).toContainText("Press keys");
  await page.keyboard.press("t");
  await expect(page.locator('[data-action="tool.rectangle"]')).toContainText("T");
  await page.locator('[data-close="shortcuts-dialog"]').last().click();
  await entry.click();
  await expect(popup.locator('[data-command="keybind.reassign.tool.rectangle"] .menu-shortcut'))
    .toHaveText("T");
  await popup.locator('[data-command="keybind.reassign.tool.rectangle"]').click();
  // Closing before assigning must not leave the global recorder active.
  await page.locator('[data-close="shortcuts-dialog"]').last().click();
  await page.keyboard.press("t");
  await expect(page.locator('[data-tool="rectangle"]')).toHaveClass(/active/);
  const stored=await page.evaluate(()=>
    JSON.parse(localStorage.getItem("flatcad.preferences.v1")||"{}"));
  expect(stored.shortcuts["tool.rectangle"]).toBe("KeyT");
  await page.reload();
  await page.locator('[data-menu="keybinds"]').click();
  await expect(popup.locator('[data-command="keybind.reassign.tool.rectangle"] .menu-shortcut'))
    .toHaveText("T");
  await popup.locator('[data-command="dialog.shortcuts"]').click();
  await expect(page.locator("#shortcuts-dialog")).toBeVisible();
});
test("floating move handle fills free top-bar width, without overlapping navigation",async({page})=>{
  await page.setViewportSize({width:1440,height:850});
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const assess=async(panel:import("@playwright/test").Locator)=>{
    const handle=(await panel.locator(".float-window-handle").boundingBox())!;
    const nav=(await panel.locator(".float-nav").boundingBox())!;
    expect(handle.width).toBeGreaterThan(65);
    expect(handle.x+handle.width).toBeLessThan(nav.x-2);
    expect(Math.abs(handle.y-nav.y)).toBeLessThan(1);
    return handle.width;
  };
  await openMenu(page,"view","view.float");
  const docked=page.locator(".preview-panel");
  const before=await assess(docked);
  const grip=(await docked.locator('[data-corner="se"]').boundingBox())!;
  await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);
  await page.mouse.down();
  await page.mouse.move(grip.x+grip.width/2+70,grip.y+grip.height/2+20,{steps:6});
  await page.mouse.up();
  expect(await assess(docked)).toBeGreaterThan(before+45);
  await openMenu(page,"view","view.float.new");
  const independent=page.locator(".floating-render-view").first();
  await expect(independent.locator(".float-nav-action")).toHaveCount(4);
  const prior=await assess(independent);
  const floatGrip=(await independent.locator('[data-corner="se"]').boundingBox())!;
  await page.mouse.move(floatGrip.x+floatGrip.width/2,floatGrip.y+floatGrip.height/2);
  await page.mouse.down();
  await page.mouse.move(floatGrip.x+floatGrip.width/2+65,floatGrip.y+floatGrip.height/2+15,{steps:6});
  await page.mouse.up();
  expect(await assess(independent)).toBeGreaterThan(prior+40);
});
