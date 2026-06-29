import { taskDisplayName } from "@/lib/agent-api/task-title";
import type { TaskResponse } from "@/lib/agent-api/types";
import { humanizeTaskErrorMessage } from "@/lib/platform-task-error-copy";
import { stripModelThinkingForUi } from "@/lib/strip-model-thinking";

function formatTaskFinishedAt(iso: string | null | undefined): string {
  if (!iso) return "...";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function statusLabelZh(status: string): string {
  const map: Record<string, string> = {
    SUCCESS: "成功",
    FAILED: "失败",
    RUNNING: "进行中",
    BLOCKED_BY_PLAN: "已阻塞",
    TIMEOUT: "超时",
    CANCELLED: "已取消",
  };
  return map[status] ?? status;
}

function responseSummaryRecord(task: TaskResponse): Record<string, unknown> | null {
  const summary = task.response_summary;
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return null;
  return summary as Record<string, unknown>;
}

function outputFiles(task: TaskResponse): string[] {
  const summary = responseSummaryRecord(task);
  const files = summary?.tool_output_files;
  if (!Array.isArray(files)) return [];
  return files.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function buildSuccessTail(task: TaskResponse): string {
  const files = outputFiles(task).map((item) => item.toLowerCase());
  const hasHtmlReport = files.some((item) => item.endsWith(".html") || item.endsWith(".htm"));
  const hasTabularData = files.some((item) =>
    item.endsWith(".csv") || item.endsWith(".xlsx") || item.endsWith(".xls") || item.endsWith(".json"),
  );
  const hasArtifacts = task.artifacts.length > 0 || files.length > 0;

  if (hasHtmlReport && hasTabularData) {
    return "结果数据和分析报告都已整理好，右侧可以直接查看。";
  }
  if (hasHtmlReport) {
    return "分析报告已经生成，右侧可以直接查看。";
  }
  if (hasTabularData || hasArtifacts) {
    return "结果数据已整理好，右侧可以直接查看。";
  }
  return "结果已经返回，可以继续下一步。";
}

function buildFailureTail(task: TaskResponse): string {
  const reason = humanizeTaskErrorMessage(task.error_message?.trim() ?? "");

  switch ((task.status || "").toUpperCase()) {
    case "FAILED":
      return reason ? `执行失败。原因：${reason}` : "执行失败，建议检查输入或稍后重试。";
    case "TIMEOUT":
      return "执行超时，建议缩小范围后再试一次。";
    case "CANCELLED":
      return "当前执行已停止。";
    case "BLOCKED_BY_PLAN":
      return "还需要补充关键信息后才能继续。";
    default:
      return reason ? `处理未完成。原因：${reason}` : "处理未完成，请稍后重试。";
  }
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

export function extractPostTaskGuidance(task: TaskResponse): string | null {
  const summary = responseSummaryRecord(task);
  const guidance = summary?.post_task_guidance;
  if (typeof guidance !== "string" || !guidance.trim()) return null;
  const cleaned = stripModelThinkingForUi(guidance.trim());
  if (!cleaned || cleaned === "（无回复）") return null;
  return cleaned;
}

export function buildTaskCompletionSummary(task: TaskResponse): string {
  const taskName = taskDisplayName(task, 120);
  const status = (task.status || "").toUpperCase();

  if (status === "SUCCESS") {
    return `这轮已经完成“${taskName}”。${buildSuccessTail(task)}`;
  }

  if (status === "FAILED" || status === "TIMEOUT" || status === "CANCELLED" || status === "BLOCKED_BY_PLAN") {
    return `这轮没有完成“${taskName}”。${buildFailureTail(task)}`;
  }

  const finishedAt = task.finished_at ? `完成时间：${formatTaskFinishedAt(task.finished_at)}。` : "";
  return `“${taskName}”当前状态为${statusLabelZh(task.status)}。${finishedAt}`.trim();
}

export function buildTaskCompletionSummaryWithGuidance(task: TaskResponse): string {
  const base = buildTaskCompletionSummary(task);
  const guidance = extractPostTaskGuidance(task);
  if (!guidance) return base;
  return `${base}\n\n【接下来您可以试试】\n${guidance}`;
}
