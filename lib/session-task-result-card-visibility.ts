import type { SessionMessageItem } from "@/lib/agent-api/types";
import { parseTaskExecutionStepsFromMeta } from "@/lib/task-execution-steps-meta";

function messageMeta(m: SessionMessageItem): Record<string, unknown> | undefined {
  return m.meta && typeof m.meta === "object" && !Array.isArray(m.meta)
    ? (m.meta as Record<string, unknown>)
    : undefined;
}

export type TaskResultHints = {
  hasArtifacts: boolean;
  taskStatus?: string;
  errorMessage?: string;
};

/**
 * 从会话消息中汇总每个 task_id 的结果元数据。
 * 任务结果卡片挂在 task_execution_steps 消息上时，has_artifacts / task_status 等字段
 * 通常在同 task_id 的完成总结消息里，需要跨消息解析。
 */
export function buildTaskResultHintsByTaskId(
  messages: SessionMessageItem[],
): Map<string, TaskResultHints> {
  const map = new Map<string, TaskResultHints>();

  for (const m of messages) {
    if (m.role !== "assistant") continue;
    const meta = messageMeta(m);
    if (!meta) continue;
    const tid = typeof meta.task_id === "string" ? meta.task_id.trim() : "";
    if (!tid) continue;

    const kind = typeof meta.kind === "string" ? meta.kind.trim() : "";
    const status = typeof meta.task_status === "string" ? meta.task_status.trim() : "";
    const err = typeof meta.error_message === "string" ? meta.error_message.trim() : "";
    const hasArtifacts = meta.has_artifacts === true;

    const prev = map.get(tid) ?? { hasArtifacts: false };
    if (hasArtifacts) prev.hasArtifacts = true;

    // 完成总结 / 失败消息优先于步骤占位消息上的状态字段
    if (kind !== "task_execution_steps") {
      if (status) prev.taskStatus = status;
      if (err) prev.errorMessage = err;
    } else {
      if (!prev.taskStatus && status) prev.taskStatus = status;
      if (!prev.errorMessage && err) prev.errorMessage = err;
    }

    map.set(tid, prev);
  }

  return map;
}

/**
 * 每个 task_id 仅展示一张「任务结果」卡片。
 * 优先挂在**最后一条**带步骤元数据的 assistant 消息上，避免「多步任务已全部完成」总结消息
 * 因 message_index 更早而出现在「任务拆分/执行」上方（历史回放错位）。
 */
export function messageIdsEligibleForTaskResultCard(messages: SessionMessageItem[]): Set<string> {
  const out = new Set<string>();
  const coveredTaskIds = new Set<string>();

  // Pass 1: only task_execution_steps messages. Always reserve the task_id
  // so pass 2 won't add a fallback card, but only emit a result card if every
  // step has reached a terminal status.
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role !== "assistant") continue;
    const meta = messageMeta(m);
    const tid = typeof meta?.task_id === "string" ? meta.task_id.trim() : "";
    if (!tid || coveredTaskIds.has(tid)) continue;
    const steps = parseTaskExecutionStepsFromMeta(meta);
    if (!steps?.length) continue;
    coveredTaskIds.add(tid);
    const allTerminal = steps.every((s) => s.status === "done" || s.status === "error");
    if (allTerminal) {
      out.add(m.id);
    }
  }

  // Pass 2: remaining assistant messages with a task_id that lack explicit
  // task_execution_steps meta — e.g. orchestration summary messages.
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

/** 按 orchestration_id / task_id 分组，返回每组最新的 steps 消息 id。
 *  同一次编排可能产出多条 task_execution_steps 消息（task_id 不同），
 *  优先按 orchestration_id 去重以保证只有最新的那条被保留。 */
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
    const key = oid || tid || "__global__";
    if (!map[key]) map[key] = m.id;
  }
  return map;
}

/**
 * 仅当与同 orchestration_id / task_id 的最新 steps 消息不同时视为 superseded。
 * 优先按 orchestration_id 匹配，使同一次编排的多条进度消息互斥。
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
  const key = oid || tid || "__global__";
  const latestForThisTask = latestStepsByTaskId[key];
  if (!latestForThisTask) return false;
  return message.id !== latestForThisTask;
}
