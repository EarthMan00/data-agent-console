import { describe, expect, it } from "vitest";

import type { TaskExecutionStep } from "@/lib/agent-events";
import { resolveStaleTaskExecutionSteps } from "@/lib/session-task-execution-step-resolver";

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
    const resolved = resolveStaleTaskExecutionSteps(steps, {
      taskStatus: "SUCCESS",
      orchestrationStatuses: null,
    });

    expect(resolved?.map((step) => step.status)).toEqual(["done", "done"]);
  });
});
