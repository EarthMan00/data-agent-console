import { defineConfig, devices } from "@playwright/test";

import {
  e2eConfig,
  realRoundE2E,
  roundTimeoutMs,
} from "./tests/e2e/config";

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: realRoundE2E ? [] : ["**/chat-round-durability.spec.ts"],
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: realRoundE2E ? roundTimeoutMs : undefined,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: e2eConfig.baseUrl,
    trace: realRoundE2E ? "off" : "on-first-retry",
  },
  webServer: {
    command: e2eConfig.webServerCommand,
    port: e2eConfig.port,
    reuseExistingServer: true,
    timeout: 120000,
  },
});
