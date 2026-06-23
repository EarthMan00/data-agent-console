import type { TaskResponse } from "@/lib/agent-api/types";
import type { SessionMessageItem } from "@/lib/agent-api/types";
import type { TaskExecutionStep } from "@/lib/agent-events";
import type { TaskOrchestrationBundleRow } from "@/lib/merge-orchestration-task-artifacts";
import { parsePostTaskGuidanceSuggestions } from "@/lib/parse-post-task-guidance";

/** Alice 终止说明正文（不含可点击引导块）。 */
export const TASK_TERMINATED_LEADING = "任务已终止，当前执行已停止。";

/** 与 post_task_guidance 相同格式，供 PostTaskGuidanceBubble 解析。 */
export const TASK_TERMINATED_GUIDANCE_BLOCK = `【接下来您可以】
1. 重新发送完整需求，从头开始执行
2. 调整关键词或筛选条件后再试
3. 说明希望从哪一步继续，我会按你的补充重新规划`;

export const TASK_TERMINATED_FULL_CONTENT = `${TASK_TERMINATED_LEADING}\n\n${TASK_TERMINATED_GUIDANCE_BLOCK}`;

export function isTaskTerminatedErrorMessage(message: string | null | undefined): boolean {
  const t = (message || "").trim();
  return t === "任务已终止。" || t === "任务已终止" || t.startsWith("任务已终止");
}

export function sessionHasTaskTerminatedMessage(messages: SessionMessageItem[]): boolean {
  return messages.some((m) => {
    if (m.role !== "assistant") return false;
    const meta = m.meta && typeof m.meta === "object" ? (m.meta as Record<string, unknown>) : undefined;
    if (meta?.kind === "task_terminated") return true;
    return isTaskTerminatedErrorMessage(m.content);
  });
}

/** 该 task 是否已有用户终止消息（用于隐藏晚到的失败摘要气泡）。 */
export function sessionHasTaskTerminatedForTask(
  messages: SessionMessageItem[],
  taskId: string,
): boolean {
  const tid = taskId.trim();
  if (!tid) return false;
  return messages.some((m) => {
    if (m.role !== "assistant") return false;
    const meta = m.meta && typeof m.meta === "object" ? (m.meta as Record<string, unknown>) : undefined;
    return meta?.kind === "task_terminated" && String(meta.task_id ?? "").trim() === tid;
  });
}

/** 用户手动终止：步骤已标 error，但后端任务仍在跑或未写入失败原因。 */
export function isUserTerminatedTaskState(options: {
  steps: TaskExecutionStep[];
  task?: TaskResponse | null;
  bundle?: TaskOrchestrationBundleRow | null;
}): boolean {
  const { steps, task, bundle } = options;
  if (!steps.some((s) => s.status === "error")) return false;

  const taskStatus = (task?.status ?? bundle?.taskStatus ?? "").toUpperCase();
  if (taskStatus === "CANCELLED" || taskStatus === "CANCEL") return true;

  const inFlight = taskStatus === "RUNNING" || taskStatus === "PENDING" || taskStatus === "QUEUED";
  if (inFlight) {
    const err = (task?.error_message ?? "").trim();
    return !err;
  }
  return false;
}

export function taskExecutionTitleForSteps(
  steps: TaskExecutionStep[],
  options?: { terminated?: boolean },
): string {
  if (options?.terminated) return "任务已终止";
  if (steps.some((step) => step.status === "error")) return "任务执行失败";
  if (steps.length > 0 && steps.every((step) => step.status === "done")) return "任务已完成";
  return "任务执行";
}

export function taskTerminatedGuidanceSuggestions(): string[] {
  return parsePostTaskGuidanceSuggestions(TASK_TERMINATED_GUIDANCE_BLOCK);
}
