import type { TaskResponse } from "@/lib/agent-api/types";
import type { TaskExecutionStep, TaskExecutionStepStatus } from "@/lib/agent-events";

function isTaskDoneStatus(status: string): boolean {
  const s = (status || "").toUpperCase();
  return s === "SUCCESS" || s === "SUCCEEDED";
}

function isTaskFailedStatus(status: string): boolean {
  const s = (status || "").toUpperCase();
  return s === "FAILED" || s === "CANCELLED" || s === "CANCEL" || s === "TIMEOUT" || s === "ERROR";
}

/**
 * 用 202 返回的 execution_steps 文案在会话内尚未有 task_execution_steps 元数据时
 * 合成与首页「任务执行」区一致的时间线行。
 */
export function buildTaskStepsFromDecompositionLabels(
  labels: string[],
  roundId: string,
  taskInFlight: boolean,
  lastTask: TaskResponse | null,
): TaskExecutionStep[] {
  const n = labels.length;
  if (n === 0) return [];
  const t = lastTask;
  const s = t ? (t.status || "") : "";
  const allDone = t != null && !taskInFlight && isTaskDoneStatus(s);
  const anyFailed = t != null && !taskInFlight && isTaskFailedStatus(s);

  return labels.map((label, i) => {
    let status: TaskExecutionStepStatus = "pending";
    if (allDone) {
      status = "done";
    } else if (anyFailed) {
      status = i === 0 ? "error" : "pending";
    } else if (taskInFlight) {
      status = i === 0 ? "running" : "pending";
    } else {
      status = "pending";
    }
    return {
      id: `decomp-label-${i}-${roundId.slice(0, 8)}`,
      label: label.replace(/^\d+[）.、]\s*/, "").trim() || label,
      order: i + 1,
      status,
      roundId,
    };
  });
}
