import { expect,test } from "@playwright/test";
import {readFile} from "node:fs/promises";

const goldenVolume=(100*60-2*Math.PI*5*5)*8;
async function openMenu(page:import("@playwright/test").Page,name:string,action:string){
  await page.locator('[data-menu="'+name+'"]').click();
  await page.locator('[data-command="'+action+'"]').click();
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
  await page.getByLabel("Radius").fill("4");
  await page.getByLabel("Radius").press("Tab");
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
  const history=page.locator("#history-details");
  await history.locator("summary").click();
  await expect(history.locator(".history-feature-card")).toHaveCount(3);
  await expect(history.locator('.history-feature-card[data-thumbnail-state="ready"]'))
    .toHaveCount(3,{timeout:120000});
  const names=await history.locator(".history-feature-name").allTextContents();
  expect(names).toEqual(["Cut · Circle 2","Cut · Circle 1","Extrude · Rectangle 1"]);
  const thumbs=history.locator("canvas.history-thumbnail");
  await expect(thumbs).toHaveCount(3);
  await expect(thumbs.nth(0)).toHaveAttribute("data-cut-overlay","true");
  await expect(thumbs.nth(1)).toHaveAttribute("data-cut-overlay","true");
  await expect(thumbs.nth(2)).toHaveAttribute("data-cut-overlay","false");
  const result=Number(await thumbs.nth(0).getAttribute("data-result-volume-mm3"));
  const tool=Number(await thumbs.nth(0).getAttribute("data-tool-volume-mm3"));
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
  await page.setViewportSize({width:900,height:850});
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

test("feature history uses newest-first compact tiles; only selected tile shows controls",async({page})=>{
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  await page.locator("#history-details summary").click();
  const history=page.locator("#history-details");
  const tiles=history.locator(".history-tile");
  await expect(tiles).toHaveCount(3);
  await expect(history.locator(".history-tile[data-thumbnail-state='ready']"))
    .toHaveCount(3,{timeout:120000});
  const names=await tiles.locator(".history-feature-name").allTextContents();
  expect(names).toEqual(["Cut · Circle 2","Cut · Circle 1","Extrude · Rectangle 1"]);
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
