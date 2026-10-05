import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3100",
    // Use a preinstalled Chromium when the bundled one is unavailable (e.g. sandboxes).
    ...(process.env["PW_CHROMIUM_PATH"]
      ? { launchOptions: { executablePath: process.env["PW_CHROMIUM_PATH"] } }
      : {}),
  },
  webServer: {
    command: "pnpm exec next start -p 3100",
    port: 3100,
    reuseExistingServer: true,
  },
  projects: [
    { name: "iphone", use: { ...devices["iPhone 15"], browserName: "chromium" } },
    { name: "android", use: { ...devices["Pixel 7"] } },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
});
