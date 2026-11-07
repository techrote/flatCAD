import {expect,test,type Page} from "@playwright/test";

/** Measurement, not a universal hardware-performance pass/fail threshold.
 * Sampling rAF pacing while Playwright actually pans each interactive canvas
 * can expose recurrent >90ms stalls; virtualised CI machines cannot certify
 * smoothness on the owner's physical Windows GPU. */
async function panAndSample(page:Page,selector:string){
  const box=(await page.locator(selector).boundingBox())!;
  const x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);
  const recording=page.evaluate(()=>new Promise<number[]>(resolve=>{
    const intervals:number[]=[];
    let beginning=0,last=0;
    function sample(t:number){
      if(!beginning)beginning=t;
      if(last)intervals.push(t-last);
      last=t;
      if(t-beginning<1700)requestAnimationFrame(sample);
      else resolve(intervals);
    }
    requestAnimationFrame(sample);
  }));
  await page.waitForTimeout(60);
  await page.mouse.down({button:"middle"});
  for(let i=1;i<=28;i++){
    await page.mouse.move(x+i*2.8,y-i*1.6);
    await page.waitForTimeout(34);
  }
  await page.mouse.up({button:"middle"});
  const samples=(await recording).sort((a,b)=>a-b);
  expect(samples.length).toBeGreaterThan(15);
  const percentile=(p:number)=>Number(samples[Math.floor((samples.length-1)*p)].toFixed(2));
  return {
    frames:samples.length,medianMs:percentile(.5),p95Ms:percentile(.95),
    p99Ms:percentile(.99),worstMs:percentile(1),
    over50ms:samples.filter(x=>x>50).length,
    over90ms:samples.filter(x=>x>90).length
  };
}

test("record actual Sketch and Solid pan frame pacing and idle renderer demand",async({page},testInfo)=>{
  await page.setViewportSize({width:1440,height:820});
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("Exact solid generated");
  const solid=page.locator("#preview");
  await expect(solid).toHaveAttribute("data-rendered-solid","true");
  await page.waitForTimeout(400);
  const countBefore=Number(await solid.getAttribute("data-frame-count"));
  await page.waitForTimeout(400);
  const countAfter=Number(await solid.getAttribute("data-frame-count"));
  const solidPan=await panAndSample(page,"#preview canvas");
  const sketchPan=await panAndSample(page,"#sketch");
  await page.waitForTimeout(350);
  const afterGesture=Number(await solid.getAttribute("data-frame-count"));
  await page.waitForTimeout(450);
  const afterIdle=Number(await solid.getAttribute("data-frame-count"));
  const report={
    sha:process.env.GITHUB_SHA??"local",
    runner:process.env.RUNNER_OS??"local",
    browser:process.env.FLATCAD_E2E_BROWSER??"chromium",
    browserUserAgent:await page.evaluate(()=>navigator.userAgent),
    initialIdleSolidFrames:countAfter-countBefore,
    postGestureIdleSolidFrames:afterIdle-afterGesture,
    solidPan,sketchPan,
    note:"Headless automated workload; compare only under identical hardware and browser. Manual physical GPU investigation remains required."
  };
  console.log("FRAME_PACING_EVIDENCE "+JSON.stringify(report));
  await testInfo.attach("frame-pacing-evidence.json",{
    body:Buffer.from(JSON.stringify(report,null,2)),
    contentType:"application/json"
  });
  expect(report.initialIdleSolidFrames).toBeLessThanOrEqual(1);
  expect(report.postGestureIdleSolidFrames).toBeLessThanOrEqual(1);
});
