import { describe, expect, it } from "vitest";

import type { TaskExecutionStep } from "@/lib/agent-events";
import {
  enrichStepsRuntimeFromBundles,
  enrichTaskExecutionStepsRuntime,
  resolveStaleTaskExecutionSteps,
} from "@/lib/session-task-execution-step-resolver";

const steps: TaskExecutionStep[] = [
  { id: "s1", label: "步骤一", order: 1, status: "running", roundId: "round-1" },
  { id: "s2", label: "步骤二", order: 2, status: "pending", roundId: "round-1" },
];

describe("resolveStaleTaskExecutionSteps", () => {
  it("uses orchestration statuses instead of marking all steps done from the first task", () => {
    const resolved = resolveStaleTaskExecutionSteps(steps, {
      taskStatus: "SUCCESS",
      orchestrationStatuses: ["SUCCESS", "RUNNING"],
    });

    expect(resolved).toEqual([
      { ...steps[0], status: "done" },
      { ...steps[1], status: "running" },
    ]);
  });

  it("keeps single-task fallback behavior when no orchestration status exists", () => {
    const singleStep = [steps[0]!];
    const resolved = resolveStaleTaskExecutionSteps(singleStep, {
      taskStatus: "SUCCESS",
      orchestrationStatuses: null,
    });

    expect(resolved?.map((step) => step.status)).toEqual(["done"]);
  });

  it("does not mark an entire multi-step run done from a single task status", () => {
    const resolved = resolveStaleTaskExecutionSteps(steps, {
      taskStatus: "SUCCESS",
      orchestrationStatuses: null,
    });

    expect(resolved?.map((step) => step.status)).toEqual(["done", "pending"]);
  });

  it("reopens an incorrectly completed single step when the task is still running", () => {
    const resolved = resolveStaleTaskExecutionSteps([{ ...steps[0]!, status: "done" }], {
      taskStatus: "RUNNING",
      orchestrationStatuses: null,
    });

    expect(resolved?.map((step) => step.status)).toEqual(["running"]);
  });

  it("marks steps error when task is cancelled", () => {
    const resolved = resolveStaleTaskExecutionSteps([steps[0]!], {
      taskStatus: "CANCELLED",
      orchestrationStatuses: null,
    });

    expect(resolved?.map((step) => step.status)).toEqual(["error"]);
  });
});

describe("enrichTaskExecutionStepsRuntime", () => {
  it("adds runtimeStartedAt from in-flight task started_at for the first running step", () => {
    const steps: TaskExecutionStep[] = [
      { id: "s1", label: "步骤一", order: 1, status: "running", roundId: "round-1" },
    ];
    const enriched = enrichTaskExecutionStepsRuntime(steps, {
      task: {
        id: "task-1",
        status: "RUNNING",
        started_at: "2026-06-20T00:00:00.000Z",
      } as never,
    });

    expect(enriched[0]?.runtimeStartedAt).toBe("2026-06-20T00:00:00.000Z");
  });

  it("merges orchestration runtime_hint and task_started_at into running steps", () => {
    const steps: TaskExecutionStep[] = [
      { id: "s1", label: "步骤一", order: 1, status: "running", roundId: "round-1" },
      { id: "s2", label: "步骤二", order: 2, status: "pending", roundId: "round-1" },
    ];
    const enriched = enrichTaskExecutionStepsRuntime(steps, {
      orchestrationSteps: [
        {
          status: "RUNNING",
          runtime_hint: "正在搜索亚马逊",
          task_started_at: "2026-06-20T00:01:00.000Z",
        } as never,
        { status: "PENDING" } as never,
      ],
    });

    expect(enriched[0]?.runtimeHint).toBe("正在搜索亚马逊");
    expect(enriched[0]?.runtimeStartedAt).toBe("2026-06-20T00:01:00.000Z");
    expect(enriched[1]?.runtimeHint).toBeUndefined();
  });
});

describe("enrichStepsRuntimeFromBundles", () => {
  it("adds runtimeStartedAt from in-flight bundle startedAt for running steps", () => {
    const steps: TaskExecutionStep[] = [
      { id: "s1", label: "步骤一", order: 1, status: "running", roundId: "round-1" },
    ];
    const enriched = enrichStepsRuntimeFromBundles(steps, [
      {
        taskId: "task-1",
        stepIndex: 0,
        label: "步骤一",
        artifacts: [],
        taskStatus: "RUNNING",
        startedAt: "2026-06-20T00:00:00.000Z",
      },
    ]);

    expect(enriched[0]?.runtimeStartedAt).toBe("2026-06-20T00:00:00.000Z");
  });

  it("does not overwrite existing runtimeStartedAt", () => {
    const steps: TaskExecutionStep[] = [
      {
        id: "s1",
        label: "步骤一",
        order: 1,
        status: "running",
        roundId: "round-1",
        runtimeStartedAt: "2026-06-20T00:05:00.000Z",
      },
    ];
    const enriched = enrichStepsRuntimeFromBundles(steps, [
      {
        taskId: "task-1",
        stepIndex: 0,
        label: "步骤一",
        artifacts: [],
        taskStatus: "RUNNING",
        startedAt: "2026-06-20T00:00:00.000Z",
      },
    ]);

    expect(enriched[0]?.runtimeStartedAt).toBe("2026-06-20T00:05:00.000Z");
  });
});
