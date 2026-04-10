import type { SessionMessageItem } from "@/lib/agent-api/types";

/**
 * 按消息时间顺序，每个 task_id 仅在第一条携带 meta.task_id 的 assistant 消息下展示「任务结果」卡片。
 * 多步编排时「任务步骤条」消息与后续总结消息可能共用同一 task_id，避免重复入口。
 */
export function messageIdsEligibleForTaskResultCard(messages: SessionMessageItem[]): Set<string> {
  const seenTaskIds = new Set<string>();
  const out = new Set<string>();
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    const meta =
      m.meta && typeof m.meta === "object" && !Array.isArray(m.meta)
        ? (m.meta as Record<string, unknown>)
        : undefined;
    const tid = typeof meta?.task_id === "string" ? meta.task_id.trim() : "";
    if (!tid) continue;
    if (seenTaskIds.has(tid)) continue;
    seenTaskIds.add(tid);
    out.add(m.id);
  }
  return out;
}
