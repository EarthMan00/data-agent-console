import { describe, expect, it } from "vitest";

import { applyRoundEvent } from "@/lib/agent-api/round-events";
import {
  RoundEventGapError,
  type ChatRoundEvent,
  type ChatRoundSnapshot,
} from "@/lib/agent-api/types";

const ROUND_ID = "22222222-2222-4222-8222-222222222222";

function currentSnapshot(): ChatRoundSnapshot {
  return {
    round_id: ROUND_ID,
    session_id: "11111111-1111-4111-8111-111111111111",
    status: "EXECUTING",
    assistant_message_id: "33333333-3333-4333-8333-333333333333",
    content: "old content",
    last_event_seq: 4,
    steps: [
      {
        step_id: "step-1",
        step_index: 0,
        label: "Public step",
        status: "PENDING",
        task_id: null,
        artifacts: [],
        evidence: null,
        error_code: null,
        error_message: null,
      },
    ],
    error_code: null,
    error_message: null,
  };
}

function event(
  seq: number,
  eventType: string,
  payload: Record<string, unknown> = {},
): ChatRoundEvent {
  return {
    round_id: ROUND_ID,
    seq,
    event_type: eventType,
    payload,
    created_at: "2026-07-27T00:00:00Z",
  };
}

describe("ordered Round event reducer", () => {
  it("ignores already-applied and older events without changing identity", () => {
    const snapshot = currentSnapshot();

    expect(applyRoundEvent(snapshot, event(4, "assistant.delta", { content: "stale" }))).toBe(
      snapshot,
    );
    expect(applyRoundEvent(snapshot, event(2, "round.failed", { status: "FAILED" }))).toBe(
      snapshot,
    );
  });

  it("throws a typed gap error so callers reload the authoritative snapshot", () => {
    const snapshot = currentSnapshot();

    expect(() => applyRoundEvent(snapshot, event(7, "round.update"))).toThrowError(
      new RoundEventGapError(5, 7),
    );
    try {
      applyRoundEvent(snapshot, event(7, "round.update"));
    } catch (error) {
      expect(error).toMatchObject({ expectedSeq: 5, actualSeq: 7 });
    }
  });

  it("replaces assistant content with the persisted snapshot instead of appending", () => {
    const next = applyRoundEvent(
      currentSnapshot(),
      event(5, "assistant.delta", { content: "complete current snapshot" }),
    );

    expect(next.content).toBe("complete current snapshot");
    expect(next.last_event_seq).toBe(5);
  });

  it.each([
    {
      priorStatus: "GENERATING" as const,
      finalStatus: "SUCCEEDED" as const,
      content: "Direct answer complete.",
    },
    {
      priorStatus: "EXECUTING" as const,
      finalStatus: "PARTIAL_SUCCESS" as const,
      content: "Data completed; report unavailable.",
    },
  ])(
    "atomically applies assistant.final content and $finalStatus terminal status",
    ({ priorStatus, finalStatus, content }) => {
      const snapshot = { ...currentSnapshot(), status: priorStatus };

      const next = applyRoundEvent(
        snapshot,
        event(5, "assistant.final", {
          status: finalStatus,
          content,
          capability: "private.route",
          raw_provider_output: "private",
        }),
      );

      expect(next).toMatchObject({
        status: finalStatus,
        content,
        last_event_seq: 5,
      });
      expect(JSON.stringify(next)).not.toContain("private.route");
      expect(JSON.stringify(next)).not.toContain("raw_provider_output");
    },
  );

  it("rejects unknown assistant.final statuses while still applying formal public content", () => {
    const snapshot = { ...currentSnapshot(), status: "GENERATING" as const };

    const next = applyRoundEvent(
      snapshot,
      event(5, "assistant.final", {
        status: "INTERNAL_COMPLETED",
        content: "Safe final content.",
        internal_status_reason: "private",
      }),
    );

    expect(next).toEqual({
      ...snapshot,
      content: "Safe final content.",
      last_event_seq: 5,
    });
    expect(JSON.stringify(next)).not.toContain("INTERNAL_COMPLETED");
    expect(JSON.stringify(next)).not.toContain("internal_status_reason");
  });

  it("clears content on assistant.reset", () => {
    const next = applyRoundEvent(currentSnapshot(), event(5, "assistant.reset", { content: "" }));

    expect(next.content).toBe("");
    expect(next.last_event_seq).toBe(5);
  });

  it("constructs planned steps from public fields only", () => {
    const next = applyRoundEvent(
      currentSnapshot(),
      event(5, "plan.ready", {
        step_count: 1,
        execution_mode: "tool_orchestration",
        capability: "commerce_data.collect",
        raw_args: { secret: true },
        steps: [
          {
            step_id: "public-step",
            label: "Collect public data",
            status: "PENDING",
            capability: "commerce_data.collect",
            operation: "run_linkfox_task",
          },
        ],
      }),
    );

    expect(next.steps).toEqual([
      {
        step_id: "public-step",
        step_index: 0,
        label: "Collect public data",
        status: "PENDING",
        task_id: null,
        artifacts: [],
        evidence: null,
        error_code: null,
        error_message: null,
      },
    ]);
    expect(JSON.stringify(next)).not.toContain("commerce_data.collect");
    expect(JSON.stringify(next)).not.toContain("run_linkfox_task");
    expect(JSON.stringify(next)).not.toContain("secret");
  });

  it("updates step progress and terminal state from allowlisted public fields only", () => {
    const progressed = applyRoundEvent(
      currentSnapshot(),
      event(5, "step.completed", {
        step_id: "step-1",
        label: "Finished public step",
        status: "SUCCESS",
        evidence: { rows: 3 },
        artifacts: [
          {
            artifact_id: "55555555-5555-4555-8555-555555555555",
            artifact_type: "table",
            original_name: "result.csv",
            download_api: `/api/chat/rounds/${ROUND_ID}/artifacts/55555555-5555-4555-8555-555555555555`,
            managed_path: "C:/private/result.csv",
          },
        ],
        capability: "commerce_data.collect",
      }),
    );
    const terminal = applyRoundEvent(
      progressed,
      event(6, "round.completed", {
        status: "PARTIAL_SUCCESS",
        error_code: "REPORT_FAILED",
        message: "The data is available, but the report failed.",
        raw_provider_output: "private",
      }),
    );

    expect(progressed.steps[0]).toEqual({
      step_id: "step-1",
      step_index: 0,
      label: "Finished public step",
      status: "SUCCESS",
      task_id: null,
      artifacts: [
        {
          artifact_id: "55555555-5555-4555-8555-555555555555",
          artifact_type: "table",
          original_name: "result.csv",
          download_api: `/api/chat/rounds/${ROUND_ID}/artifacts/55555555-5555-4555-8555-555555555555`,
        },
      ],
      evidence: { rows: 3 },
      error_code: null,
      error_message: null,
    });
    expect(terminal).toMatchObject({
      status: "PARTIAL_SUCCESS",
      error_code: "REPORT_FAILED",
      error_message: "The data is available, but the report failed.",
      last_event_seq: 6,
    });
    expect(JSON.stringify(terminal)).not.toContain("private");
    expect(JSON.stringify(terminal)).not.toContain("commerce_data.collect");
    expect(JSON.stringify(terminal)).not.toContain("managed_path");
  });

  it("advances seq for unknown public events without copying payload data", () => {
    const next = applyRoundEvent(
      currentSnapshot(),
      event(5, "round.update", { capability: "private", content: "do not copy" }),
    );

    expect(next).toEqual({ ...currentSnapshot(), last_event_seq: 5 });
  });
});
