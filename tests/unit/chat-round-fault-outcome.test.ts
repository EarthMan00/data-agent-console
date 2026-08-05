import { describe, expect, it } from "vitest";

import {
  classifyDeclaredFaultOutcome,
  type FaultOutcomeStep,
} from "../e2e/chat-round-fault-outcome";

function step(
  stepIndex: number,
  status: string,
  taskId: string | null,
  errorCode: string | null = null,
): FaultOutcomeStep {
  return { stepIndex, status, taskId, errorCode };
}

describe("real chat Round declared Fault outcomes", () => {
  it("accepts an exact injected data boundary after a retained real result", () => {
    expect(
      classifyDeclaredFaultOutcome("fail_boundary:last:data", [
        step(0, "SUCCESS", "00000000-0000-4000-8000-000000000001"),
        step(1, "FAILED", null, "DATA_COLLECTION_FAILED"),
      ]),
    ).toEqual({ kind: "injected" });
  });

  it("rejects an injected boundary without a retained prior result", () => {
    expect(
      classifyDeclaredFaultOutcome("fail_boundary:last:data", [
        step(0, "FAILED", null, "DATA_COLLECTION_FAILED"),
      ]),
    ).toEqual({ kind: "invalid", reason: "prior_result_missing" });
  });

  it("accepts a real external verification failure that preempts a later data Fault", () => {
    expect(
      classifyDeclaredFaultOutcome("fail_boundary:last:data", [
        step(0, "SUCCESS", "00000000-0000-4000-8000-000000000001"),
        step(1, "SUCCESS", "00000000-0000-4000-8000-000000000002"),
        step(
          2,
          "FAILED",
          "00000000-0000-4000-8000-000000000003",
          "DATA_COLLECTION_FAILED",
        ),
        step(3, "SKIPPED", null),
        step(4, "SKIPPED", null),
      ]),
    ).toEqual({ kind: "externally_preempted" });
  });

  it("allows a data failure to preempt an armed report Fault", () => {
    expect(
      classifyDeclaredFaultOutcome("fail_boundary:last:report", [
        step(
          0,
          "FAILED",
          "00000000-0000-4000-8000-000000000001",
          "DATA_COLLECTION_FAILED",
        ),
        step(1, "SKIPPED", null),
      ]),
    ).toEqual({ kind: "externally_preempted" });
  });

  it.each([
    [
      "internal error",
      [
        step(
          0,
          "FAILED",
          "00000000-0000-4000-8000-000000000001",
          "CAPABILITY_NOT_FOUND",
        ),
        step(1, "SKIPPED", null),
      ],
    ],
    [
      "later execution",
      [
        step(
          0,
          "FAILED",
          "00000000-0000-4000-8000-000000000001",
          "DATA_COLLECTION_FAILED",
        ),
        step(1, "SUCCESS", "00000000-0000-4000-8000-000000000002"),
      ],
    ],
    [
      "skipped task",
      [
        step(
          0,
          "FAILED",
          "00000000-0000-4000-8000-000000000001",
          "DATA_COLLECTION_FAILED",
        ),
        step(1, "SKIPPED", "00000000-0000-4000-8000-000000000002"),
      ],
    ],
    [
      "multiple failures",
      [
        step(
          0,
          "FAILED",
          "00000000-0000-4000-8000-000000000001",
          "DATA_COLLECTION_FAILED",
        ),
        step(
          1,
          "FAILED",
          "00000000-0000-4000-8000-000000000002",
          "DATA_COLLECTION_FAILED",
        ),
        step(2, "SKIPPED", null),
      ],
    ],
  ])("rejects an unsafe external-preemption shape: %s", (_name, steps) => {
    expect(
      classifyDeclaredFaultOutcome("fail_boundary:last:data", steps),
    ).toEqual({ kind: "invalid", reason: "not_observed" });
  });

  it("distinguishes absent and malformed Fault declarations", () => {
    expect(classifyDeclaredFaultOutcome(null, [])).toEqual({ kind: "none" });
    expect(
      classifyDeclaredFaultOutcome("fail_boundary:last:unknown", []),
    ).toEqual({ kind: "invalid", reason: "shape" });
  });
});
