import { defineConfig, devices } from "@playwright/test";

import { e2eConfig } from "./tests/e2e/config";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: e2eConfig.baseUrl,
    trace: "on-first-retry",
  },
  webServer: {
    command: e2eConfig.webServerCommand,
    port: e2eConfig.port,
    reuseExistingServer: true,
    timeout: 120000,
  },
});
