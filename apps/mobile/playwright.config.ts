import { defineConfig, devices } from "@playwright/test";

const chromium = process.env["PW_CHROMIUM_PATH"];

/** Drives the app's web build (preview mode, no backend) through the MVP flow. */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  use: {
    baseURL: "http://localhost:8099",
    screenshot: "only-on-failure",
    ...(chromium ? { launchOptions: { executablePath: chromium } } : {}),
  },
  webServer: {
    command: "node scripts/serve-web.mjs dist 8099",
    port: 8099,
    reuseExistingServer: true,
  },
  projects: [{ name: "iphone", use: { ...devices["iPhone 15"], browserName: "chromium" } }],
});
