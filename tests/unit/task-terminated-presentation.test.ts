import { describe, expect, it } from "vitest";

import { buildPlatformStepTimeline } from "@/components/execution-steps-monitor";
import type { TaskExecutionStep } from "@/lib/agent-events";
import {
  isUserTerminatedTaskState,
  sessionHasTaskTerminatedForTask,
  taskExecutionTitleForSteps,
} from "@/lib/task-terminated-presentation";

describe("buildPlatformStepTimeline terminated steps", () => {
  it("keeps error step terminal when backend task is still running", () => {
    const steps: TaskExecutionStep[] = [
      { id: "s1", label: "步骤一", order: 1, status: "error", roundId: "r1" },
    ];
    const items = buildPlatformStepTimeline(steps, [
      {
        stepIndex: 0,
        stepId: "s1",
        label: "步骤一",
        taskId: "task-1",
        outcome: "failed",
        taskStatus: "RUNNING",
        artifacts: [],
        zipDownloadApi: null,
      },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe("result");
    if (items[0]?.kind === "result") {
      expect(items[0].snap.outcome).toBe("failed");
    }
  });
});

describe("isUserTerminatedTaskState", () => {
  const errorSteps: TaskExecutionStep[] = [
    { id: "s1", label: "步骤一", order: 1, status: "error", roundId: "r1" },
  ];

  it("detects cancelled backend status", () => {
    expect(
      isUserTerminatedTaskState({
        steps: errorSteps,
        task: { status: "CANCELLED" } as never,
      }),
    ).toBe(true);
  });

  it("detects user stop when steps are error but task still running without error_message", () => {
    expect(
      isUserTerminatedTaskState({
        steps: errorSteps,
        task: { status: "RUNNING", error_message: null } as never,
      }),
    ).toBe(true);
  });

  it("treats failed task with error_message as failure not termination", () => {
    expect(
      isUserTerminatedTaskState({
        steps: errorSteps,
        task: { status: "FAILED", error_message: "积分不足" } as never,
      }),
    ).toBe(false);
  });
});

describe("taskExecutionTitleForSteps", () => {
  it("uses terminated title when flagged", () => {
    const steps: TaskExecutionStep[] = [
      { id: "s1", label: "步骤一", order: 1, status: "error", roundId: "r1" },
    ];
    expect(taskExecutionTitleForSteps(steps, { terminated: true })).toBe("任务已终止");
    expect(taskExecutionTitleForSteps(steps)).toBe("任务执行失败");
  });
});

describe("sessionHasTaskTerminatedForTask", () => {
  it("matches task_terminated message for the same task_id", () => {
    const messages = [
      {
        id: "t1",
        role: "assistant" as const,
        content: "任务已终止",
        created_at: "2026-06-23T00:00:00.000Z",
        message_index: 1,
        meta: { kind: "task_terminated", task_id: "task-a" },
      },
      {
        id: "f1",
        role: "assistant" as const,
        content: "任务执行失败",
        created_at: "2026-06-23T00:00:01.000Z",
        message_index: 2,
        meta: { task_id: "task-a", task_status: "FAILED", error_message: "timeout" },
      },
    ];
    expect(sessionHasTaskTerminatedForTask(messages, "task-a")).toBe(true);
    expect(sessionHasTaskTerminatedForTask(messages, "task-b")).toBe(false);
  });
});
