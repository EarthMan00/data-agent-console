import type { TaskResponse } from "@/lib/agent-api/types";

/** 单任务执行期间 GET /api/tasks/{id} 轮询间隔（platform-round） */
export const TASK_STATUS_POLL_INTERVAL_MS = 3_000;

/** 多步编排轮询 /api/tool-orchestrations/{id} 间隔（子任务完成时仍会按需 getTask） */
export const ORCHESTRATION_STATUS_POLL_INTERVAL_MS = 2_000;

/** 定时任务试跑页轮询任务/编排状态（不宜过密，否则会连续请求 /api/tasks/{id}） */
export const SCHEDULE_TRIAL_TASK_POLL_INTERVAL_MS = 8_000;

/** 试跑首条 in_flight 时刷新会话消息列表 */
export const SCHEDULE_TRIAL_SESSION_RELOAD_INTERVAL_MS = 6_000;

/** 任务是否仍在执行（未结束） */
export function isTaskInFlight(t: TaskResponse | null | undefined): boolean {
  if (!t) return false;
  if (t.finished_at) return false;
  const s = (t.status || "").toUpperCase();
  if (s === "RUNNING" || s === "PENDING" || s === "QUEUED") return true;
  if (
    s === "SUCCESS" ||
    s === "SUCCEEDED" ||
    s === "FAILED" ||
    s === "CANCELLED" ||
    s === "CANCEL" ||
    s === "TIMEOUT"
  ) {
    return false;
  }
  return s.includes("RUNN");
}
