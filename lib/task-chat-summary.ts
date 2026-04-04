import { taskDisplayName } from "@/lib/agent-api/task-title";
import type { TaskResponse } from "@/lib/agent-api/types";

function formatTaskFinishedAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function statusLabelZh(status: string): string {
  const map: Record<string, string> = {
    SUCCESS: "成功",
    FAILED: "失败",
    RUNNING: "进行中",
    BLOCKED_BY_PLAN: "已阻断",
    TIMEOUT: "超时",
    CANCELLED: "已取消",
  };
  return map[status] ?? status;
}

export type TaskOutcomeDisplay = {
  taskName: string;
  statusLabel: string;
  status: string;
  finishedAtFormatted: string | null;
  errorMessage: string | null;
};

export function buildTaskOutcomeDisplay(task: TaskResponse): TaskOutcomeDisplay {
  return {
    taskName: taskDisplayName(task),
    statusLabel: statusLabelZh(task.status),
    status: task.status,
    finishedAtFormatted: task.finished_at ? formatTaskFinishedAt(task.finished_at) : null,
    errorMessage: task.error_message ?? null,
  };
}

export function buildTaskCompletionSummary(task: TaskResponse): string {
  const name = taskDisplayName(task);
  const lines: string[] = [`任务：${name}`];
  if (task.status === "FAILED") {
    lines.push("状态：失败");
    if (task.error_message) lines.push(`原因：${task.error_message}`);
    return lines.join("\n");
  }
  lines.push(`状态：${statusLabelZh(task.status)}`);
  if (task.finished_at) lines.push(`完成时间：${formatTaskFinishedAt(task.finished_at)}`);
  return lines.join("\n");
}
