import type { TaskExecutionStep, TaskExecutionStepStatus } from "@/lib/agent-events";
import { humanizeStepLabelForUi } from "@/lib/humanize-step-label";

/** 当前写入库中的 meta.kind */
export const TASK_EXECUTION_STEPS_META_KIND = "task_execution_steps" as const;

function isStepStatus(v: unknown): v is TaskExecutionStepStatus {
  return v === "pending" || v === "running" || v === "awaiting_input" || v === "done" || v === "error";
}

/** 从 session_messages.meta 解析持久化的任务步骤条（供历史/平台会话时间线渲染）。 */
export function parseTaskExecutionStepsFromMeta(
  meta: Record<string, unknown> | undefined,
): TaskExecutionStep[] | null {
  if (!meta) return null;
  const k = meta.kind;
  if (k !== TASK_EXECUTION_STEPS_META_KIND && k !== "orchestration_failure") return null;
  const roundId = typeof meta.round_id === "string" ? meta.round_id : "";
  const raw = meta.steps;
  if (!Array.isArray(raw)) return null;
  const out: TaskExecutionStep[] = [];
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i];
    if (!s || typeof s !== "object" || Array.isArray(s)) continue;
    const o = s as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : `step-${i}`;
    const rawLabel = typeof o.label === "string" ? o.label : "";
    const label = rawLabel ? humanizeStepLabelForUi(rawLabel) : "";
    const status: TaskExecutionStepStatus = isStepStatus(o.status) ? o.status : "pending";
    const runtimeHint = typeof o.runtime_hint === "string" ? o.runtime_hint : undefined;
    const runtimeStartedAt = typeof o.runtime_started_at === "string" ? o.runtime_started_at : undefined;
    out.push({ id, label, order: i + 1, status, roundId, runtimeHint, runtimeStartedAt });
  }
  return out.length > 0 ? out : null;
}
