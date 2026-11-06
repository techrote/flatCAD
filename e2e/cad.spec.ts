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
