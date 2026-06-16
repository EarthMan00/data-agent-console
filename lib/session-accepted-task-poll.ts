import {
  getTask,
  getToolOrchestration,
  patchTaskExecutionSteps,
  postTaskExecutionSteps,
} from "@/lib/agent-api/client";
import type { ChatSendResult, TaskResponse } from "@/lib/agent-api/types";
import type { TaskExecutionStepStatus } from "@/lib/agent-events";
import { mapServerOrchestrationStepStatus } from "@/lib/agent-runtime/task-mapping";
import { humanizeStepLabelForUi } from "@/lib/humanize-step-label";
import { pollPlatformTaskUntilSettled } from "@/lib/poll-task-until-settled";
import {
  createPollScheduler,
  ORCHESTRATION_STATUS_POLL_INTERVAL_MS,
  PollTimeoutError,
  SCHEDULE_TRIAL_SESSION_RELOAD_INTERVAL_MS,
  TASK_STATUS_POLL_INTERVAL_MS,
  isTaskInFlight,
} from "@/lib/task-status-poll";

function taskStatusToStepStatus(task: TaskResponse): TaskExecutionStepStatus {
  const s = (task.status || "").toUpperCase();
  if (s === "SUCCESS" || s === "SUCCEEDED") return "done";
  if (s === "FAILED" || s === "CANCELLED" || s === "CANCEL" || s === "TIMEOUT" || s === "ERROR") {
    return "error";
  }
  if (isTaskInFlight(task)) return "running";
  return "pending";
}

export type SessionAcceptedTaskPollResult = {
  lastTask: TaskResponse | null;
};

/**
 * 历史会话 send 路径：任务受理后持久化 task_execution_steps，轮询期间更新步骤状态并周期性 reload。
 */
export async function pollAcceptedPlatformTaskInSession(
  accessToken: string,
  sessionId: string,
  roundId: string,
  accepted: Extract<ChatSendResult, { kind: "accepted" }>,
  options?: {
    shouldAbort?: () => boolean;
    onReload?: () => void | Promise<void>;
    onTaskUpdate?: (task: TaskResponse | null) => void;
  },
): Promise<SessionAcceptedTaskPollResult> {
  const executionSteps = accepted.execution_steps ?? [];
  const stepLabels = executionSteps.map((label) => humanizeStepLabelForUi(label));
  const stepDefs = stepLabels.map((label, i) => ({
    id: `${roundId}-step-${i + 1}`,
    label,
  }));

  if (stepDefs.length === 0) {
    await pollPlatformTaskUntilSettled(
      async (fn) => fn(accessToken),
      accepted,
      options?.shouldAbort,
    );
    return { lastTask: null };
  }

  const initialStatuses: TaskExecutionStepStatus[] = stepDefs.map((_, i) =>
    i === 0 ? "running" : "pending",
  );

  let stepsMessageId: string | null = null;
  try {
    stepsMessageId = await postTaskExecutionSteps(accessToken, sessionId, {
      round_id: roundId,
      task_id: accepted.task_id,
      steps: stepDefs.map((s, i) => ({
        id: s.id,
        label: s.label,
        status: initialStatuses[i]!,
      })),
      orchestration_id: accepted.orchestration_id,
    });
  } catch {
    /* 步骤落库失败仍继续轮询，完成后 reload 可展示任务结果卡 */
  }

  await options?.onReload?.();

  const persistRows = async (statuses: TaskExecutionStepStatus[], taskId?: string) => {
    if (!stepsMessageId) return;
    try {
      await patchTaskExecutionSteps(accessToken, sessionId, stepsMessageId, {
        round_id: roundId,
        task_id: taskId ?? accepted.task_id,
        steps: stepDefs.map((s, i) => ({
          id: s.id,
          label: s.label,
          status: statuses[i] ?? "pending",
        })),
        orchestration_id: accepted.orchestration_id,
      });
    } catch {
      /* 忽略单次 patch 失败 */
    }
  };

  const taskId = accepted.task_id;
  const orchId = accepted.orchestration_id;
  let lastTask: TaskResponse | null = null;
  let lastReloadAt = Date.now();

  const scheduler = createPollScheduler({
    maxDurationMs: orchId ? 30 * 60 * 1000 : 15 * 60 * 1000,
    initialDelayMs: orchId ? ORCHESTRATION_STATUS_POLL_INTERVAL_MS : TASK_STATUS_POLL_INTERVAL_MS,
    maxDelayMs: 30_000,
  });

  while (true) {
    if (options?.shouldAbort?.()) return { lastTask };

    try {
      await scheduler.nextDelay();
    } catch (e) {
      if (e instanceof PollTimeoutError) return { lastTask };
      throw e;
    }

    if (Date.now() - lastReloadAt >= SCHEDULE_TRIAL_SESSION_RELOAD_INTERVAL_MS) {
      lastReloadAt = Date.now();
      await options?.onReload?.();
    }

    let done = false;

    if (orchId) {
      const orch = await getToolOrchestration(accessToken, orchId);
      const rowStatuses = orch.steps.map((st) => mapServerOrchestrationStepStatus(st.status));
      if (rowStatuses.length === stepDefs.length) {
        await persistRows(rowStatuses);
      } else if (rowStatuses.length > 0) {
        const padded = stepDefs.map((_, i) => rowStatuses[i] ?? ("pending" as TaskExecutionStepStatus));
        await persistRows(padded);
      }
      if (orch.finished || orch.awaiting_clarification) done = true;
      const lastWithId = [...orch.steps].reverse().find((s) => s.task_id);
      if (lastWithId?.task_id) {
        lastTask = await getTask(accessToken, lastWithId.task_id);
        options?.onTaskUpdate?.(lastTask);
      }
    } else if (taskId) {
      lastTask = await getTask(accessToken, taskId);
      options?.onTaskUpdate?.(lastTask);
      const st = taskStatusToStepStatus(lastTask);
      await persistRows(stepDefs.map((_, i) => (i === 0 ? st : "pending")));
      if (!isTaskInFlight(lastTask)) done = true;
    }

    if (done) {
      await options?.onReload?.();
      return { lastTask };
    }
  }
}
