import type { SessionMessageItem, TaskResponse, ToolOrchestrationStepApi } from "@/lib/agent-api/types";
import type { TaskExecutionStep, TaskExecutionStepStatus } from "@/lib/agent-events";
import { mapServerOrchestrationStepStatus } from "@/lib/agent-runtime/task-mapping";
import type { TaskOrchestrationBundleRow } from "@/lib/merge-orchestration-task-artifacts";
import { parseTaskExecutionStepsFromMeta } from "@/lib/task-execution-steps-meta";
import { isTaskInFlight } from "@/lib/task-status-poll";

function bundleTaskInFlight(status: string | undefined): boolean {
  const s = (status || "").toUpperCase();
  return s === "RUNNING" || s === "PENDING" || s === "QUEUED";
}

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
      index === 0 && step.status !== "error" ? { ...step, status: "running" } : step,
    );
  }
  if (steps.length > 1) {
    return steps.map((step, index) => (index === 0 ? { ...step, status: taskStatus } : step));
  }
  return steps.map((step) => ({ ...step, status: taskStatus }));
}

/** 为运行中步骤补上 runtime 字段，供 ExecutionRuntimeTag 在会话重进后继续计时。 */
export function enrichTaskExecutionStepsRuntime(
  steps: TaskExecutionStep[],
  options?: {
    task?: TaskResponse | null;
    orchestrationSteps?: ToolOrchestrationStepApi[] | null;
  },
): TaskExecutionStep[] {
  if (!options) return steps;
  const { task, orchestrationSteps } = options;
  return steps.map((step, index) => {
    const orchStep = orchestrationSteps?.[index];
    const orchStatus = (orchStep?.status || "").toUpperCase();
    const orchActive = orchStatus === "RUNNING" || orchStatus === "AWAITING_INPUT";
    if (orchStep && (orchActive || step.status === "running")) {
      const runtimeStartedAt = orchStep.task_started_at ?? step.runtimeStartedAt;
      const runtimeHint = orchStep.runtime_hint ?? step.runtimeHint;
      if (runtimeStartedAt || runtimeHint) {
        return { ...step, runtimeStartedAt, runtimeHint };
      }
    }
    if (
      index === 0 &&
      task &&
      isTaskInFlight(task) &&
      (step.status === "running" || step.status === "pending")
    ) {
      return {
        ...step,
        runtimeStartedAt: step.runtimeStartedAt ?? task.started_at,
      };
    }
    return step;
  });
}

/** 历史会话重进：从已拉取的 bundle 子任务 started_at 补运行中步骤的计时起点。 */
export function enrichStepsRuntimeFromBundles(
  steps: TaskExecutionStep[],
  bundles: TaskOrchestrationBundleRow[],
): TaskExecutionStep[] {
  if (!bundles.length) return steps;
  const bundleByIdx = new Map<number, TaskOrchestrationBundleRow>();
  for (const bundle of bundles) {
    bundleByIdx.set(bundle.stepIndex, bundle);
  }
  const ordered = [...steps].sort((a, b) => a.order - b.order);
  return ordered.map((step, index) => {
    if (step.status !== "running" && step.status !== "awaiting_input") return step;
    if (step.runtimeStartedAt) return step;
    const bundle = bundleByIdx.get(index);
    if (!bundle?.startedAt || !bundleTaskInFlight(bundle.taskStatus)) return step;
    return { ...step, runtimeStartedAt: bundle.startedAt };
  });
}

function stepsEqual(a: TaskExecutionStep[], b: TaskExecutionStep[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i]!;
    const right = b[i]!;
    if (
      left.id !== right.id ||
      left.label !== right.label ||
      left.status !== right.status ||
      left.runtimeStartedAt !== right.runtimeStartedAt ||
      left.runtimeHint !== right.runtimeHint
    ) {
      return false;
    }
  }
  return true;
}

function serializeStepsForMeta(steps: TaskExecutionStep[]): Array<Record<string, unknown>> {
  return steps.map((step) => {
    const out: Record<string, unknown> = {
      id: step.id,
      label: step.label,
      status: step.status,
    };
    if (step.runtimeStartedAt) out.runtime_started_at = step.runtimeStartedAt;
    if (step.runtimeHint) out.runtime_hint = step.runtimeHint;
    return out;
  });
}

export function hydrateTaskExecutionMessagesFromLiveState(
  messages: SessionMessageItem[],
  options?: {
    task?: TaskResponse | null;
    orchestrationSteps?: ToolOrchestrationStepApi[] | null;
  },
): SessionMessageItem[] {
  if (!messages.length) return messages;
  const task = options?.task ?? null;
  const orchestrationSteps = options?.orchestrationSteps ?? null;
  let changed = false;

  const next = messages.map((message) => {
    if (message.role !== "assistant") return message;
    const meta =
      message.meta && typeof message.meta === "object" && !Array.isArray(message.meta)
        ? (message.meta as Record<string, unknown>)
        : undefined;
    const steps = parseTaskExecutionStepsFromMeta(meta);
    if (!meta || !steps?.length) return message;

    const taskId = typeof meta.task_id === "string" ? meta.task_id.trim() : "";
    const orchestrationId = typeof meta.orchestration_id === "string" ? meta.orchestration_id.trim() : "";

    let resolved =
      orchestrationId && orchestrationSteps?.length
        ? resolveStaleTaskExecutionSteps(steps, {
            orchestrationStatuses: orchestrationSteps.map((step) => step.status),
          })
        : task && taskId && task.task_id === taskId
          ? resolveStaleTaskExecutionSteps(steps, {
              taskStatus: task.status,
            })
          : null;

    if (!resolved) return message;

    resolved = enrichTaskExecutionStepsRuntime(resolved, {
      task: task && taskId && task.task_id === taskId ? task : null,
      orchestrationSteps: orchestrationId ? orchestrationSteps : null,
    });

    if (stepsEqual(steps, resolved)) return message;
    changed = true;
    return {
      ...message,
      meta: {
        ...meta,
        steps: serializeStepsForMeta(resolved),
      },
    };
  });

  return changed ? next : messages;
}
