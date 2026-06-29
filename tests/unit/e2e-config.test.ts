import { describe, expect, it } from "vitest";

import { resolveE2EConfig } from "../e2e/config";

describe("resolveE2EConfig", () => {
  it("uses stable defaults when no env overrides are provided", () => {
    expect(resolveE2EConfig({})).toEqual({
      adminUsername: "admin",
      adminPassword: "admin123",
      fixturePrefix: "E2E",
      feedbackResolvedStatus: "archived",
      feedbackAdminNote: "playwright e2e fixture",
      host: "127.0.0.1",
      port: 3000,
      baseUrl: "http://127.0.0.1:3000",
      webServerCommand: "npm run dev -- --hostname 127.0.0.1 --port 3000",
      preflightTimeoutMs: 15000,
    });
  });

  it("prefers explicit env overrides after trimming whitespace", () => {
    expect(
      resolveE2EConfig({
        PLAYWRIGHT_ADMIN_USERNAME: "  qa-admin  ",
        PLAYWRIGHT_ADMIN_PASSWORD: "  secret-pass  ",
        PLAYWRIGHT_FIXTURE_PREFIX: "  smoke  ",
        PLAYWRIGHT_FEEDBACK_STATUS: "  archived  ",
        PLAYWRIGHT_FEEDBACK_NOTE: "  seeded by ci  ",
        PLAYWRIGHT_HOST: "  0.0.0.0  ",
        PLAYWRIGHT_PORT: "  4100  ",
        PLAYWRIGHT_PREFLIGHT_TIMEOUT_MS: "  20000  ",
      }),
    ).toEqual({
      adminUsername: "qa-admin",
      adminPassword: "secret-pass",
      fixturePrefix: "smoke",
      feedbackResolvedStatus: "archived",
      feedbackAdminNote: "seeded by ci",
      host: "0.0.0.0",
      port: 4100,
      baseUrl: "http://0.0.0.0:4100",
      webServerCommand: "npm run dev -- --hostname 0.0.0.0 --port 4100",
      preflightTimeoutMs: 20000,
    });
  });

  it("falls back when env values are blank after trimming", () => {
    expect(
      resolveE2EConfig({
        PLAYWRIGHT_ADMIN_USERNAME: "   ",
        PLAYWRIGHT_ADMIN_PASSWORD: "",
        PLAYWRIGHT_FIXTURE_PREFIX: " ",
        PLAYWRIGHT_FEEDBACK_STATUS: "   ",
        PLAYWRIGHT_FEEDBACK_NOTE: "\n",
        PLAYWRIGHT_HOST: "\n",
        PLAYWRIGHT_PORT: "  ",
        PLAYWRIGHT_PREFLIGHT_TIMEOUT_MS: " ",
      }),
    ).toEqual({
      adminUsername: "admin",
      adminPassword: "admin123",
      fixturePrefix: "E2E",
      feedbackResolvedStatus: "archived",
      feedbackAdminNote: "playwright e2e fixture",
      host: "127.0.0.1",
      port: 3000,
      baseUrl: "http://127.0.0.1:3000",
      webServerCommand: "npm run dev -- --hostname 127.0.0.1 --port 3000",
      preflightTimeoutMs: 15000,
    });
  });

  it("falls back when numeric env values are not positive integers", () => {
    expect(
      resolveE2EConfig({
        PLAYWRIGHT_HOST: "localhost",
        PLAYWRIGHT_PORT: "invalid",
        PLAYWRIGHT_PREFLIGHT_TIMEOUT_MS: "-1",
      }),
    ).toEqual({
      adminUsername: "admin",
      adminPassword: "admin123",
      fixturePrefix: "E2E",
      feedbackResolvedStatus: "archived",
      feedbackAdminNote: "playwright e2e fixture",
      host: "localhost",
      port: 3000,
      baseUrl: "http://localhost:3000",
      webServerCommand: "npm run dev -- --hostname localhost --port 3000",
      preflightTimeoutMs: 15000,
    });
  });
});
