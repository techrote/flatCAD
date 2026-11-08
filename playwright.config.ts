import { defineConfig } from "@playwright/test";

// Optional cross-browser acceptance; ordinary CI remains pinned to Chromium.
const browserName=process.env.FLATCAD_E2E_BROWSER==="firefox"?"firefox":"chromium";

export default defineConfig({
  testDir: "e2e",
  timeout: 150_000,
  expect: { timeout: 120_000 },
  retries: 0,
  workers: 1,
  reporter: [["line"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName,
    // Linux Firefox's software WebGL path is qualified in headed Xvfb mode.
    headless: process.env.FLATCAD_E2E_HEADED !== "1",
    launchOptions: browserName==="chromium"
      ? { args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] }
      : { firefoxUserPrefs: {
          // CI VMs are GPU-less; Firefox otherwise disables WebGL2 outright.
          // These apply ONLY to the controlled Playwright test profile.
          "webgl.force-enabled": true,
          "webgl.disabled": false,
          "gfx.webrender.software": true
        } },
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: {
    command: "npm run preview",
    url: "http://127.0.0.1:4173",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI
  }
});
