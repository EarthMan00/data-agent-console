import { getTask, listSessionMessages } from "@/lib/agent-api/client";
import type { SessionMessageItem, TaskResponse } from "@/lib/agent-api/types";
import { extractPostTaskGuidance } from "@/lib/task-chat-summary";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function messageMeta(m: SessionMessageItem): Record<string, unknown> | undefined {
  return m.meta && typeof m.meta === "object" && !Array.isArray(m.meta)
    ? (m.meta as Record<string, unknown>)
    : undefined;
}

/** 完成摘要消息（含 has_artifacts / task_status），不含步骤占位与专用引导消息。 */
export function sessionHasTaskCompletionSummaryMessage(
  messages: SessionMessageItem[],
  taskId: string | null,
): boolean {
  const tid = (taskId ?? "").trim();
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    const meta = messageMeta(m);
    if (!meta) continue;
    const kind = typeof meta.kind === "string" ? meta.kind.trim() : "";
    if (kind === "task_execution_steps" || kind === "post_task_guidance") continue;
    const msgTaskId = typeof meta.task_id === "string" ? meta.task_id.trim() : "";
    if (!msgTaskId) continue;
    if (tid && msgTaskId !== tid) continue;
    const status = typeof meta.task_status === "string" ? meta.task_status.trim() : "";
    if (status === "SUCCESS" || status === "FAILED") return true;
    const content = (m.content || "").trim();
    if (
      /^任务已完成/.test(content) ||
      /^多步任务已全部完成/.test(content) ||
      /^任务执行失败/.test(content) ||
      /^多步任务在执行过程中失败/.test(content)
    ) {
      return true;
    }
  }
  return false;
}

function findLatestPostTaskGuidanceContent(messages: SessionMessageItem[]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]!;
    if (m.role !== "assistant") continue;
    const meta = messageMeta(m);
    if (meta?.kind !== "post_task_guidance") continue;
    const content = m.content?.trim();
    if (content) return content;
  }
  return null;
}

/**
 * 轮询任务 response_summary 与会话消息，直至拿到 post_task_guidance 文案或超时。
 * 新建会话 round 与历史会话 send 路径共用。
 */
export async function resolvePostTaskGuidanceText(
  token: string,
  sessionId: string,
  task: Pick<TaskResponse, "task_id" | "response_summary" | "finished_at">,
): Promise<string | null> {
  const fromTask = extractPostTaskGuidance(task as TaskResponse);
  if (fromTask) return fromTask;

  const taskId = (task.task_id || "").trim();
  for (let i = 0; i < 10; i += 1) {
    await sleep(1000);
    if (taskId) {
      try {
        const latest = await getTask(token, taskId);
        const g = extractPostTaskGuidance(latest);
        if (g) return g;
      } catch {
        /* 单任务拉取失败时继续尝试会话消息 */
      }
    }
    if (i % 2 === 1) {
      try {
        const page = await listSessionMessages(token, sessionId, 50);
        const content = findLatestPostTaskGuidanceContent(page.messages ?? []);
        if (content) return content;
      } catch {
        /* 引导为增强能力，拉取失败不阻断主流程 */
      }
    }
  }
  return null;
}

/**
 * 编排/单任务在 API 上报 finished 后，后端仍可能异步写入完成摘要与引导消息。
 * 历史会话 send 轮询在 reload 前应等待这些消息落库，避免结果卡与引导气泡缺失。
 */
export async function waitForSessionTaskOutcomeMessages(
  token: string,
  sessionId: string,
  task: Pick<TaskResponse, "task_id" | "response_summary" | "finished_at"> | null,
): Promise<void> {
  const taskId = (task?.task_id ?? "").trim() || null;

  for (let i = 0; i < 12; i += 1) {
    if (i > 0) await sleep(1000);

    try {
      const page = await listSessionMessages(token, sessionId, 80);
      const messages = page.messages ?? [];
      if (findLatestPostTaskGuidanceContent(messages)) {
        return;
      }
      if (sessionHasTaskCompletionSummaryMessage(messages, taskId)) {
        break;
      }
    } catch {
      /* 会话拉取失败时继续重试 */
    }

    if (i === 11) {
      return;
    }
  }

  if (task) {
    await resolvePostTaskGuidanceText(token, sessionId, task);
    return;
  }

  if (taskId) {
    for (let i = 0; i < 10; i += 1) {
      await sleep(1000);
      try {
        const page = await listSessionMessages(token, sessionId, 80);
        if (findLatestPostTaskGuidanceContent(page.messages ?? [])) {
          return;
        }
      } catch {
        /* continue */
      }
    }
  }
}
