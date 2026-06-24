import { describe, expect, it } from "vitest";

import type { SessionMessageItem } from "@/lib/agent-api/types";
import {
  buildLatestStepsMessageIdByTaskId,
  buildTaskResultHintsByTaskId,
  isSupersededTaskExecutionStepsMessage,
  messageIdsEligibleForTaskResultCard,
} from "@/lib/session-task-result-card-visibility";

function assistant(
  id: string,
  partial: Partial<SessionMessageItem> & { meta?: Record<string, unknown>; content?: string },
): SessionMessageItem {
  return {
    id,
    role: "assistant",
    content: partial.content ?? "",
    created_at: "2026-05-22T10:00:00Z",
    message_index: 0,
    meta: partial.meta ?? {},
    ...partial,
  };
}

describe("messageIdsEligibleForTaskResultCard", () => {
  it("prefers latest task_execution_steps over earlier completion summary", () => {
    const messages: SessionMessageItem[] = [
      assistant("completion", {
        content: "多步任务已全部完成，可以在右侧查看最后一步任务结果与数据。",
        meta: { task_id: "task-1", orchestration_step_task_ids: ["t1", "t2"] },
      }),
      assistant("steps", {
        content: "（以下为该轮任务的执行步骤记录）",
        meta: {
          kind: "task_execution_steps",
          task_id: "task-1",
          steps: [
            { id: "s1", label: "步骤一", status: "done" },
            { id: "s2", label: "步骤二", status: "done" },
          ],
        },
      }),
    ];
    const ids = messageIdsEligibleForTaskResultCard(messages);
    expect(ids.has("completion")).toBe(false);
    expect(ids.has("steps")).toBe(true);
  });

  it("excludes task_execution_steps messages whose steps are not all terminal", () => {
    const messages: SessionMessageItem[] = [
      assistant("steps-partial", {
        content: "（以下为该轮任务的执行步骤记录）",
        meta: {
          kind: "task_execution_steps",
          task_id: "task-2",
          steps: [
            { id: "s1", label: "步骤一", status: "done" },
            { id: "s2", label: "步骤二", status: "pending" },
          ],
        },
      }),
    ];
    const ids = messageIdsEligibleForTaskResultCard(messages);
    expect(ids.has("steps-partial")).toBe(false);
  });

  it("includes task_execution_steps with all-error steps as eligible", () => {
    const messages: SessionMessageItem[] = [
      assistant("steps-failed", {
        content: "（以下为该轮任务的执行步骤记录）",
        meta: {
          kind: "task_execution_steps",
          task_id: "task-3",
          steps: [
            { id: "s1", label: "步骤一", status: "error" },
            { id: "s2", label: "步骤二", status: "done" },
          ],
        },
      }),
    ];
    const ids = messageIdsEligibleForTaskResultCard(messages);
    expect(ids.has("steps-failed")).toBe(true);
  });

  it("excludes task_terminated in the same segment when steps message exists", () => {
    const messages: SessionMessageItem[] = [
      {
        id: "u1",
        role: "user",
        content: "分析 cup",
        created_at: "2026-05-22T09:00:00Z",
        message_index: 0,
      },
      assistant("steps", {
        content: "（以下为该轮任务的执行步骤记录）",
        meta: {
          kind: "task_execution_steps",
          task_id: "task-1",
          steps: [{ id: "s1", label: "搜索", status: "error" }],
        },
      }),
      assistant("terminated", {
        content: "任务已终止，当前执行已停止。",
        meta: { kind: "task_terminated", task_id: "task-1" },
      }),
    ];
    const ids = messageIdsEligibleForTaskResultCard(messages);
    expect(ids.has("steps")).toBe(true);
    expect(ids.has("terminated")).toBe(false);
  });
});

describe("buildTaskResultHintsByTaskId", () => {
  it("resolves has_artifacts and task_status from completion summary onto steps message task_id", () => {
    const messages: SessionMessageItem[] = [
      assistant("completion", {
        content: "多步任务已全部完成，可以在右侧查看最后一步任务结果与数据。",
        meta: {
          task_id: "task-1",
          has_artifacts: true,
          task_status: "SUCCESS",
        },
      }),
      assistant("steps", {
        content: "（以下为该轮任务的执行步骤记录）",
        meta: {
          kind: "task_execution_steps",
          task_id: "task-1",
          steps: [
            { id: "s1", label: "步骤一", status: "done" },
            { id: "s2", label: "步骤二", status: "done" },
          ],
        },
      }),
    ];
    const hints = buildTaskResultHintsByTaskId(messages);
    expect(hints.get("task-1")).toEqual({
      hasArtifacts: true,
      taskStatus: "SUCCESS",
    });
  });

  it("prefers orchestration failure message for error fields", () => {
    const messages: SessionMessageItem[] = [
      assistant("steps", {
        meta: {
          kind: "task_execution_steps",
          task_id: "task-2",
          steps: [{ id: "s1", label: "步骤一", status: "error" }],
        },
      }),
      assistant("failure", {
        meta: {
          kind: "orchestration_failure",
          task_id: "task-2",
          task_status: "FAILED",
          error_message: "数据源超时",
          has_artifacts: false,
        },
      }),
    ];
    const hints = buildTaskResultHintsByTaskId(messages);
    expect(hints.get("task-2")).toEqual({
      hasArtifacts: false,
      taskStatus: "FAILED",
      errorMessage: "数据源超时",
    });
  });
});

describe("isSupersededTaskExecutionStepsMessage", () => {
  const steps = [{ id: "s1", label: "a", order: 1, status: "done" as const, roundId: "r" }];

  it("marks older steps messages as superseded within same task", () => {
    const byTaskId = { __global__: "new" };
    expect(
      isSupersededTaskExecutionStepsMessage(assistant("old", { meta: { kind: "task_execution_steps" } }), byTaskId, steps),
    ).toBe(true);
    expect(
      isSupersededTaskExecutionStepsMessage(assistant("new", { meta: { kind: "task_execution_steps" } }), byTaskId, steps),
    ).toBe(false);
  });

  it("does not supersede steps from different task_ids", () => {
    const byTaskId = { "task-1": "msg-a", "task-2": "msg-b" };
    expect(
      isSupersededTaskExecutionStepsMessage(
        assistant("msg-a", { meta: { kind: "task_execution_steps", task_id: "task-1" } }),
        byTaskId,
        steps,
      ),
    ).toBe(false);
    expect(
      isSupersededTaskExecutionStepsMessage(
        assistant("old-task-1", { meta: { kind: "task_execution_steps", task_id: "task-1" } }),
        byTaskId,
        steps,
      ),
    ).toBe(true);
  });

  it("buildLatestStepsMessageIdByTaskId groups by task_id", () => {
    const messages: SessionMessageItem[] = [
      assistant("r1-steps", {
        meta: { kind: "task_execution_steps", task_id: "task-1", steps: [{ id: "s1", label: "a", status: "done" }] },
      }),
      assistant("r2-steps", {
        meta: { kind: "task_execution_steps", task_id: "task-2", steps: [{ id: "s2", label: "b", status: "done" }] },
      }),
    ];
    const map = buildLatestStepsMessageIdByTaskId(messages);
    expect(map["task-1"]).toBe("r1-steps");
    expect(map["task-2"]).toBe("r2-steps");
  });

  it("buildLatestStepsMessageIdByTaskId picks latest per task_id", () => {
    const messages: SessionMessageItem[] = [
      assistant("r1-progress", {
        meta: { kind: "task_execution_steps", task_id: "task-1", steps: [{ id: "s1", label: "a", status: "running" }] },
      }),
      assistant("r1-final", {
        meta: { kind: "task_execution_steps", task_id: "task-1", steps: [{ id: "s1", label: "a", status: "done" }] },
      }),
    ];
    const map = buildLatestStepsMessageIdByTaskId(messages);
    expect(map["task-1"]).toBe("r1-final");
  });

  it("returns false when latestStepsByTaskId is null or empty", () => {
    expect(isSupersededTaskExecutionStepsMessage(assistant("any", { meta: { kind: "task_execution_steps" } }), null, steps)).toBe(false);
    expect(isSupersededTaskExecutionStepsMessage(assistant("any", { meta: { kind: "task_execution_steps" } }), {}, steps)).toBe(false);
  });
});
