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

/** 按 task_id / orchestration_id 分组，返回每组最新的 steps 消息 id。 */
export function buildLatestStepsMessageIdByTaskId(
  messages: SessionMessageItem[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role !== "assistant") continue;
    const meta = messageMeta(m);
    const steps = parseTaskExecutionStepsFromMeta(meta);
    if (!steps?.length) continue;
    const tid = typeof meta?.task_id === "string" ? meta.task_id.trim() : "";
    const oid = typeof meta?.orchestration_id === "string" ? meta.orchestration_id.trim() : "";
    const key = tid || oid || "__global__";
    if (!map[key]) map[key] = m.id;
  }
  return map;
}

/**
 * 仅当与同 task_id / orchestration_id 的最新 steps 消息不同时视为 superseded。
 * 不同任务各自保留最新的 progress 消息。
 */
export function isSupersededTaskExecutionStepsMessage(
  message: SessionMessageItem,
  latestStepsByTaskId: Record<string, string> | null,
  taskStepsFromMessage: ReturnType<typeof parseTaskExecutionStepsFromMeta>,
): boolean {
  if (!taskStepsFromMessage?.length || !latestStepsByTaskId) return false;
  const meta = messageMeta(message);
  const tid = typeof meta?.task_id === "string" ? meta.task_id.trim() : "";
  const oid = typeof meta?.orchestration_id === "string" ? meta.orchestration_id.trim() : "";
  const key = tid || oid || "__global__";
  const latestForThisTask = latestStepsByTaskId[key];
  if (!latestForThisTask) return false;
  return message.id !== latestForThisTask;
}
