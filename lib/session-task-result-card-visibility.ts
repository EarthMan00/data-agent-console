import type { SessionMessageItem } from "@/lib/agent-api/types";
import { parseTaskExecutionStepsFromMeta } from "@/lib/task-execution-steps-meta";

function messageMeta(m: SessionMessageItem): Record<string, unknown> | undefined {
  return m.meta && typeof m.meta === "object" && !Array.isArray(m.meta)
    ? (m.meta as Record<string, unknown>)
    : undefined;
}

/**
 * 每个 task_id 仅展示一张「任务结果」卡片。
 * 优先挂在**最后一条**带步骤元数据的 assistant 消息上，避免「多步任务已全部完成」总结消息
 * 因 message_index 更早而出现在「任务拆分/执行」上方（历史回放错位）。
 */
export function messageIdsEligibleForTaskResultCard(messages: SessionMessageItem[]): Set<string> {
  const out = new Set<string>();
  const coveredTaskIds = new Set<string>();

  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role !== "assistant") continue;
    const meta = messageMeta(m);
    const tid = typeof meta?.task_id === "string" ? meta.task_id.trim() : "";
    if (!tid || coveredTaskIds.has(tid)) continue;
    const steps = parseTaskExecutionStepsFromMeta(meta);
    if (!steps?.length) continue;
    coveredTaskIds.add(tid);
    out.add(m.id);
  }

  for (const m of messages) {
    if (m.role !== "assistant") continue;
    const meta = messageMeta(m);
    const tid = typeof meta?.task_id === "string" ? meta.task_id.trim() : "";
    if (!tid || coveredTaskIds.has(tid)) continue;
    coveredTaskIds.add(tid);
    out.add(m.id);
  }

  return out;
}

/** 同一会话内仅渲染最新一条 task_execution_steps 气泡，忽略较早的占位消息。 */
export function isSupersededTaskExecutionStepsMessage(
  message: SessionMessageItem,
  latestStepsMessageId: string | null,
  taskStepsFromMessage: ReturnType<typeof parseTaskExecutionStepsFromMeta>,
): boolean {
  if (!taskStepsFromMessage?.length || !latestStepsMessageId) return false;
  return message.id !== latestStepsMessageId;
}
