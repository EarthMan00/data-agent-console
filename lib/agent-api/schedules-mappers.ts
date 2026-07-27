import type { ScheduledTaskRunItemApi, UserScheduledTaskItemApi } from "@/lib/agent-api/types";

/** 已启用且未完结的排程在列表中展示为「生效中」，避免与「正在执行一次」混淆 */
export type TaskUiStatus = "生效中" | "已暂停" | "已完结";

/** 与列表筛选「已定时」Tab 的三种状态一致 */
export function deriveTaskUiStatus(t: UserScheduledTaskItemApi): TaskUiStatus {
  if (!t.enabled) return "已暂停";
  if (t.recurrence === "once" && t.last_run_at && !t.next_run_at) return "已完结";
  return "生效中";
}

export function formatHhmm(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`无效时间: ${iso}`);
  }
  return d.toLocaleString();
}

export function nextRunLabel(t: UserScheduledTaskItemApi) {
  if (t.next_run_at) return formatHhmm(t.next_run_at);
  if (t.recurrence === "once" && t.run_once_date) return `一次性 ${t.run_once_date} ${t.time_hhmm}`;
  return `${recurrenceLabel(t)} ${t.time_hhmm}`;
}

export function recurrenceLabel(t: UserScheduledTaskItemApi) {
  const r = t.recurrence;
  if (r === "daily") return "每天";
  if (r === "weekly" && t.weekday != null) {
    const map = ["一", "二", "三", "四", "五", "六", "日"];
    return `每周${map[Math.min(6, Math.max(0, t.weekday))] ?? "?"}`;
  }
  if (r === "monthly" && t.day_of_month) return `每月 ${t.day_of_month} 日`;
  if (r === "once" && t.run_once_date) return "一次性";
  return r;
}

export function runStatusToApi(
  v: "全部状态" | "运行成功" | "运行失败" | "运行超时",
): "success" | "failed" | "timeout" | undefined {
  if (v === "运行成功") return "success";
  if (v === "运行失败") return "failed";
  if (v === "运行超时") return "timeout";
  return undefined;
}

const STATUS_NORM = (s: string) => s.trim().toLowerCase().replace(/-/g, "_");

/**
 * 运行记录终态/中间态的本地展示与配色（与后端 `PlanStatus` / 数据库 status 大写形式兼容）。
 */
export function runStatusDisplay(status: string) {
  const k = STATUS_NORM(status);
  if (k === "success")
    return { text: "运行成功", className: "bg-success-bg text-success border border-success-border/90" };
  if (k === "running" || k === "pending")
    return { text: "运行中", className: "bg-sky-50 text-sky-800 border border-sky-200/80" };
  if (k === "failed" || k === "blocked_by_plan")
    return { text: "运行异常", className: "bg-rose-50 text-danger border border-rose-100" };
  if (k === "timeout" || k === "time_out")
    return { text: "运行超时", className: "bg-warning-bg text-warning border border-warning-border" };
  if (k === "cancelled")
    return { text: "已取消", className: "bg-bg-subtle text-text-tertiary border border-border-subtle" };
  return { text: status, className: "bg-bg-subtle text-text-secondary border border-border-subtle" };
}

/** 是否存在 durable Round 结果产物；不从旧 Task 标识推断。 */
export function scheduledRunHasResultArtifacts(r: ScheduledTaskRunItemApi): boolean {
  const count = r.meta?.result_artifact_count;
  return typeof count === "number" && Number.isFinite(count) && count > 0;
}

export function formatRunRecordFinishedAtLocal(iso: string | null | undefined): string {
  if (iso == null || String(iso).trim() === "") {
    return "—";
  }
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) {
    return String(iso);
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
