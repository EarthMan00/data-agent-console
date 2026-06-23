import { sleep } from "@/lib/agent-runtime/util";
import type { TaskResponse } from "@/lib/agent-api/types";

/** 单任务执行期间 GET /api/tasks/{id} 轮询间隔（platform-round） */
export const TASK_STATUS_POLL_INTERVAL_MS = 3_000;

/** 多步编排轮询 /api/tool-orchestrations/{id} 间隔（子任务完成时仍会按需 getTask） */
export const ORCHESTRATION_STATUS_POLL_INTERVAL_MS = 2_000;

/** 定时任务试跑 / 历史会话 / 运行记录查看执行过程 轮询任务/编排状态（与新建会话频率一致） */
export const SCHEDULE_TRIAL_TASK_POLL_INTERVAL_MS = 3_000;

/** 试跑首条 in_flight 时刷新会话消息列表 */
export const SCHEDULE_TRIAL_SESSION_RELOAD_INTERVAL_MS = 6_000;

// ── 指数退避轮询调度器 ──

const INITIAL_POLL_MS = 2_000;
const MAX_POLL_MS = 30_000;
const BACKOFF_FACTOR = 1.5;

export class PollTimeoutError extends Error {
  constructor(message = "轮询超时") {
    super(message);
    this.name = "PollTimeoutError";
  }
}

export interface PollScheduler {
  nextDelay(): Promise<void>;
  readonly attempts: number;
}

export function createPollScheduler(options: {
  maxDurationMs: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
}): PollScheduler {
  const { maxDurationMs } = options;
  const initialDelayMs = options.initialDelayMs ?? INITIAL_POLL_MS;
  const maxDelayMs = options.maxDelayMs ?? MAX_POLL_MS;

  const startTime = Date.now();
  let currentDelay = initialDelayMs;
  let _attempts = 0;

  return {
    get attempts() {
      return _attempts;
    },
    async nextDelay() {
      if (Date.now() - startTime > maxDurationMs) {
        throw new PollTimeoutError("轮询超时");
      }
      await sleep(currentDelay);
      _attempts += 1;
      currentDelay = Math.min(currentDelay * BACKOFF_FACTOR, maxDelayMs);
    },
  };
}

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
