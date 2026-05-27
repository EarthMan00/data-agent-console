import { describe, expect, it } from "vitest";

import { formatAgentApiErrorForUser } from "@/lib/agent-api/client";

describe("formatAgentApiErrorForUser", () => {
  it("maps Failed to fetch to actionable hint", () => {
    const msg = formatAgentApiErrorForUser(new TypeError("Failed to fetch"));
    expect(msg).toContain("npm run dev");
    expect(msg).not.toBe("Failed to fetch");
  });
});
