import type { ScheduledTaskRunItemApi, UserScheduledTaskItemApi } from "@/lib/agent-api/types";

/** 已启用且未完结的排程在列表中展示为「生效中」，避免与「正在执行一次」混淆 */
export type TaskUiStatus = "生效中" | "已暂停" | "已完结";

/** 与列表筛选「已定时」Tab 的三种状态一致 */
export function deriveTaskUiStatus(t: UserScheduledTaskItemApi): TaskUiStatus {
  if (!t.enabled) return "已暂停";
  if (t.recurrence === "once" && t.last_run_at && !t.next_run_at) return "已完结";
  return "生效中";
}

export function formatHhmm(iso: string | null | undefined, fallback: string) {
  if (!iso) return fallback;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return fallback;
    return d.toLocaleString();
  } catch {
    return fallback;
  }
}

export function nextRunLabel(t: UserScheduledTaskItemApi) {
  if (t.next_run_at) return formatHhmm(t.next_run_at, t.time_hhmm);
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
    return { text: "运行成功", className: "bg-[#e8f5e9] text-[#1b5e20] border border-[#c8e6c9]/90" };
  if (k === "running" || k === "pending")
    return { text: "运行中", className: "bg-sky-50 text-sky-800 border border-sky-200/80" };
  if (k === "failed" || k === "blocked_by_plan")
    return { text: "运行异常", className: "bg-rose-50 text-red-600 border border-rose-100" };
  if (k === "timeout" || k === "time_out")
    return { text: "运行超时", className: "bg-amber-50 text-amber-800 border border-amber-100" };
  if (k === "cancelled")
    return { text: "已取消", className: "bg-zinc-100 text-zinc-600 border border-zinc-200/80" };
  return { text: status, className: "bg-slate-100 text-slate-600 border border-slate-200/60" };
}

/** 将 ISO-8601（UTC）显示为当前环境的本地时间（如中国为东八区）。 */
/**
 * 是否展示「下载所有报告」：以后端 `meta.result_artifact_count` 为准（>0 才有可下载产物）。
 * 无该字段的老数据：若成功且带 `task_id`，仍显示入口，由点击时拉取产物列表决定。
 */
export function scheduledRunShowsDownloadAllReports(r: ScheduledTaskRunItemApi): boolean {
  const m = r.meta;
  const n = m && typeof m === "object" && "result_artifact_count" in m ? Number((m as { result_artifact_count?: unknown }).result_artifact_count) : NaN;
  if (Number.isFinite(n)) {
    return n > 0;
  }
  const k = STATUS_NORM(r.status);
  if (k !== "success") return false;
  const tid = m && typeof m === "object" && "task_id" in m ? (m as { task_id?: unknown }).task_id : null;
  return typeof tid === "string" && tid.length > 0;
}

export function getScheduledRunSkillTaskId(r: ScheduledTaskRunItemApi): string | null {
  const m = r.meta;
  if (!m || typeof m !== "object" || !("task_id" in m)) return null;
  const t = (m as { task_id?: unknown }).task_id;
  return typeof t === "string" && t.trim() ? t.trim() : null;
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
