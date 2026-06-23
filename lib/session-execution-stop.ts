import type { SessionMessageItem } from "@/lib/agent-api/types";
import type { TaskExecutionStep } from "@/lib/agent-events";
import { isExecutionStepActivelyBusy } from "@/components/agent-workspace-view-models";
import { parseTaskExecutionStepsFromMeta } from "@/lib/task-execution-steps-meta";
import { isTaskInFlight } from "@/lib/task-status-poll";
import type { TaskOrchestrationBundleRow } from "@/lib/merge-orchestration-task-artifacts";
import type { TaskResponse } from "@/lib/agent-api/types";

/** 会话内是否存在可停止的执行中任务（历史会话重进、轮询、发送中均适用）。 */
export function sessionExecutionCanStop(options: {
  sending: boolean;
  streamActive: boolean;
  awaitingUserInput: boolean;
  executionSteps: TaskExecutionStep[] | null;
  orchestrationBundles: TaskOrchestrationBundleRow[];
  lastTaskSnapshot: TaskResponse | null;
}): boolean {
  if (options.awaitingUserInput) return false;
  if (options.sending || options.streamActive) return true;

  const steps = options.executionSteps ?? [];
  if (steps.some((s) => s.status === "error")) return false;
  if (steps.some((s) => isExecutionStepActivelyBusy(s.status))) return true;

  if (options.lastTaskSnapshot && isTaskInFlight(options.lastTaskSnapshot)) {
    return true;
  }

  return options.orchestrationBundles.some((b) => {
    const s = (b.taskStatus ?? "").toUpperCase();
    return s === "RUNNING" || s === "PENDING" || s === "QUEUED";
  });
}

export function findLatestTaskExecutionStepsMessage(
  messages: SessionMessageItem[],
): { message: SessionMessageItem; meta: Record<string, unknown> } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role !== "assistant") continue;
    const meta =
      m.meta && typeof m.meta === "object" && !Array.isArray(m.meta)
        ? (m.meta as Record<string, unknown>)
        : undefined;
    const steps = parseTaskExecutionStepsFromMeta(meta);
    if (steps?.length && meta) {
      return { message: m, meta };
    }
  }
  return null;
}
