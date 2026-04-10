import type { TaskExecutionStep, TaskExecutionStepStatus } from "@/lib/agent-events";

/** 当前写入库中的 meta.kind */
export const TASK_EXECUTION_STEPS_META_KIND = "task_execution_steps" as const;

/** 历史数据兼容（旧端点写入） */
const LEGACY_TASK_STEPS_META_KIND = "mock_task_execution" as const;

function isStepStatus(v: unknown): v is TaskExecutionStepStatus {
  return v === "pending" || v === "running" || v === "done" || v === "error";
}

/** 从 session_messages.meta 解析持久化的任务步骤条（供历史/平台会话时间线渲染）。 */
export function parseTaskExecutionStepsFromMeta(
  meta: Record<string, unknown> | undefined,
): TaskExecutionStep[] | null {
  if (!meta) return null;
  const k = meta.kind;
  if (k !== TASK_EXECUTION_STEPS_META_KIND && k !== LEGACY_TASK_STEPS_META_KIND) return null;
  const roundId = typeof meta.round_id === "string" ? meta.round_id : "";
  const raw = meta.steps;
  if (!Array.isArray(raw)) return null;
  const out: TaskExecutionStep[] = [];
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i];
    if (!s || typeof s !== "object" || Array.isArray(s)) continue;
    const o = s as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : `step-${i}`;
    const label = typeof o.label === "string" ? o.label : "";
    const status: TaskExecutionStepStatus = isStepStatus(o.status) ? o.status : "pending";
    out.push({ id, label, order: i + 1, status, roundId });
  }
  return out.length > 0 ? out : null;
}
