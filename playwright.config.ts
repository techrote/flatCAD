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
    headless: true,
    launchOptions: browserName==="chromium"
      ? { args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] }
      : {},
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
