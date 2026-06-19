import type { TaskExecutionStep, TaskExecutionStepStatus } from "@/lib/agent-events";
import { mapServerOrchestrationStepStatus } from "@/lib/agent-runtime/task-mapping";

function taskStatusToResolvedStepStatus(status: string | null | undefined): TaskExecutionStepStatus | null {
  const s = (status || "").toUpperCase();
  if (s === "SUCCESS" || s === "SUCCEEDED") return "done";
  if (s === "FAILED" || s === "CANCELLED" || s === "CANCEL" || s === "TIMEOUT" || s === "ERROR") {
    return "error";
  }
  if (s === "RUNNING" || s === "PENDING" || s === "QUEUED" || s.includes("RUNN")) {
    return "running";
  }
  return null;
}

export function resolveStaleTaskExecutionSteps(
  steps: TaskExecutionStep[],
  options: {
    taskStatus?: string | null;
    orchestrationStatuses?: string[] | null;
  },
): TaskExecutionStep[] | null {
  if (options.orchestrationStatuses?.length) {
    const statuses = options.orchestrationStatuses.map((status) => mapServerOrchestrationStepStatus(status));
    return steps.map((step, index) => {
      const status = statuses[index];
      return status ? { ...step, status } : step;
    });
  }

  const taskStatus = taskStatusToResolvedStepStatus(options.taskStatus);
  if (!taskStatus) return null;
  if (taskStatus === "running") {
    return steps.map((step, index) =>
      index === 0 && step.status === "pending" ? { ...step, status: "running" } : step,
    );
  }
  return steps.map((step) => ({ ...step, status: taskStatus }));
}
