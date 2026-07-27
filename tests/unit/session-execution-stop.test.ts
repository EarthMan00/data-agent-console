import { describe, expect, it } from "vitest";

import { roundCanStop } from "@/lib/session-execution-stop";

describe("roundCanStop", () => {
  it.each(["QUEUED", "PLANNING", "GENERATING", "EXECUTING", "WAITING_INPUT"] as const)(
    "allows explicit stop for %s",
    (status) => {
      expect(roundCanStop(status)).toBe(true);
    },
  );

  it.each(["CANCEL_REQUESTED", "SUCCEEDED", "PARTIAL_SUCCESS", "FAILED", "CANCELLED"] as const)(
    "does not issue another cancel for %s",
    (status) => {
      expect(roundCanStop(status)).toBe(false);
    },
  );

  it("returns false without a current Round", () => {
    expect(roundCanStop(null)).toBe(false);
  });
});
