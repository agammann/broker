import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90000,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:14310",
    headless: true,
    timezoneId: "America/Los_Angeles",
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  webServer: {
    command: "node --import tsx tests/e2e/harness.ts",
    url: "http://127.0.0.1:14310/health",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
