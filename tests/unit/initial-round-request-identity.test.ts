import { describe, expect, it } from "vitest";

import {
  matchesInitialRoundAttempt,
  rememberInitialRoundAttempt,
} from "@/lib/initial-round-request-identity";

describe("initial Round in-memory retry identity", () => {
  it("matches only the same message and ordered File object references", () => {
    const first = new File(["alpha"], "same.csv", { type: "text/csv", lastModified: 10 });
    const second = new File(["bravo"], "second.csv", { type: "text/csv", lastModified: 20 });
    const attempt = rememberInitialRoundAttempt("analyse", [first, second], "client-id");

    expect(matchesInitialRoundAttempt(attempt, "analyse", [first, second])).toBe(true);
    expect(matchesInitialRoundAttempt(attempt, "analyse changed", [first, second])).toBe(false);
    expect(matchesInitialRoundAttempt(attempt, "analyse", [second, first])).toBe(false);
  });

  it("rejects a new File object even when all public metadata is identical", () => {
    const first = new File(["alpha"], "same.csv", { type: "text/csv", lastModified: 10 });
    const changed = new File(["omega"], "same.csv", { type: "text/csv", lastModified: 10 });
    expect([changed.name, changed.size, changed.type, changed.lastModified]).toEqual([
      first.name,
      first.size,
      first.type,
      first.lastModified,
    ]);
    const attempt = rememberInitialRoundAttempt("analyse", [first], "client-id");

    expect(matchesInitialRoundAttempt(attempt, "analyse", [changed])).toBe(false);
  });
});
