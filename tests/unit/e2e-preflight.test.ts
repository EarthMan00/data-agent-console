import { describe, expect, it } from "vitest";

import { AgentPlatformRequestError } from "../e2e/http";
import { formatPreflightFailure } from "../e2e/preflight";

describe("formatPreflightFailure", () => {
  it("explains baseURL timeout failures with the configured timeout and host", () => {
    const error = Object.assign(new Error("The operation was aborted due to timeout"), {
      name: "TimeoutError",
    });

    expect(
      formatPreflightFailure("baseUrlReachability", error, {
        baseURL: "http://127.0.0.1:3000",
        preflightTimeoutMs: 15000,
      }),
    ).toContain("timed out after 15000ms while reaching http://127.0.0.1:3000");
  });

  it("explains admin login failures as credential or seed issues", () => {
    const error = new AgentPlatformRequestError("/api/auth/login", 401, "invalid username or password");

    const message = formatPreflightFailure("adminLogin", error, {
      baseURL: "http://127.0.0.1:3000",
      preflightTimeoutMs: 15000,
    });

    expect(message).toContain("backend rejected the configured admin credentials");
    expect(message).toContain("PLAYWRIGHT_ADMIN_USERNAME / PLAYWRIGHT_ADMIN_PASSWORD");
    expect(message).toContain("HTTP 401");
  });

  it("explains fixture API failures as backend or database issues", () => {
    const error = new AgentPlatformRequestError("/admin/prompts/categories", 503, "database not configured");

    const message = formatPreflightFailure("promptCategoryRoundTrip", error, {
      baseURL: "http://127.0.0.1:3000",
      preflightTimeoutMs: 15000,
    });

    expect(message).toContain("authenticated admin could not create and delete prompt categories");
    expect(message).toContain("database connectivity, migrations, and admin prompt APIs");
    expect(message).toContain("database not configured");
  });

  it("falls back to the raw error message when no specialized mapping applies", () => {
    const message = formatPreflightFailure("favoriteFoldersApi", new Error("socket hang up"), {
      baseURL: "http://127.0.0.1:3000",
      preflightTimeoutMs: 15000,
    });

    expect(message).toContain("[playwright preflight] favorite folders API failed");
    expect(message).toContain("socket hang up");
  });
});
