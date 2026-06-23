import { describe, expect, it } from "vitest";

import { sessionExecutionCanStop } from "@/lib/session-execution-stop";

describe("sessionExecutionCanStop", () => {
  it("returns true while sending or streaming", () => {
    expect(
      sessionExecutionCanStop({
        sending: true,
        streamActive: false,
        awaitingUserInput: false,
        executionSteps: null,
        orchestrationBundles: [],
        lastTaskSnapshot: null,
      }),
    ).toBe(true);
  });

  it("returns false when awaiting user clarification", () => {
    expect(
      sessionExecutionCanStop({
        sending: false,
        streamActive: false,
        awaitingUserInput: true,
        executionSteps: [{ id: "s1", label: "步骤", order: 1, status: "running", roundId: "r1" }],
        orchestrationBundles: [],
        lastTaskSnapshot: null,
      }),
    ).toBe(false);
  });

  it("returns true when persisted steps are still running", () => {
    expect(
      sessionExecutionCanStop({
        sending: false,
        streamActive: false,
        awaitingUserInput: false,
        executionSteps: [{ id: "s1", label: "步骤", order: 1, status: "running", roundId: "r1" }],
        orchestrationBundles: [],
        lastTaskSnapshot: null,
      }),
    ).toBe(true);
  });

  it("returns false when steps already failed", () => {
    expect(
      sessionExecutionCanStop({
        sending: false,
        streamActive: false,
        awaitingUserInput: false,
        executionSteps: [{ id: "s1", label: "步骤", order: 1, status: "error", roundId: "r1" }],
        orchestrationBundles: [],
        lastTaskSnapshot: { status: "RUNNING" } as never,
      }),
    ).toBe(false);
  });
});
