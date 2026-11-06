import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const goldenVolume = (100 * 60 - 2 * Math.PI * 5 * 5) * 8;

test("golden plate regenerates with B-rep volume and produces a STEP file", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const volume = Number(await page.locator("#status").getAttribute("data-volume-mm3"));
  const bounds = JSON.parse((await page.locator("#status").getAttribute("data-bounds-mm")) || "null");
  expect(Math.abs(volume - goldenVolume)).toBeLessThan(0.0001);
  expect(bounds).toEqual([[-50, -30, 0], [50, 30, 8]]);
  const downloadPending = page.waitForEvent("download", { timeout: 120_000 });
  await page.locator("#export").click();
  const download = await downloadPending;
  expect(download.suggestedFilename()).toMatch(/\.step$/i);
  const path = await download.path();
  expect(path).not.toBeNull();
  const data = await readFile(path!);
  expect(data.length).toBeGreaterThan(500);
  expect(data.subarray(0, 300).toString("utf8")).toContain("ISO-10303-21");
  expect(pageErrors).toEqual([]);
});

test("draw a profile and add an editable extrusion", async ({ page }) => {
  await page.goto("/");
  await page.locator("#new").click();
  await expect(page.locator("#profile-count")).toHaveText("0");
  await page.locator('[data-tool="rectangle"]').click();
  const canvas = page.locator("#sketch");
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const box = bounds!;
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.40);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.60, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator("#profile-count")).toHaveText("1");
  await page.locator("#add-feature").click();
  await expect(page.locator("#feature-list .feature-item")).toHaveCount(1);
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const downloadPending = page.waitForEvent("download");
  await page.locator("#save").click();
  const saved = await downloadPending;
  expect(saved.suggestedFilename()).toMatch(/\.flatcad\.json$/);
  const path = await saved.path();
  expect(path).not.toBeNull();
  const project = JSON.parse(await readFile(path!, "utf8"));
  expect(project.schemaVersion).toBe(1);
  expect(project.profiles).toHaveLength(1);
  expect(project.features).toHaveLength(1);
  expect(project.features[0].operation).toBe("add");
});
