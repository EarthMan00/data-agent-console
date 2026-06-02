import { getTask, getToolOrchestration } from "@/lib/agent-api/client";
import type { ChatSendResult } from "@/lib/agent-api/types";
import {
  createPollScheduler,
  ORCHESTRATION_STATUS_POLL_INTERVAL_MS,
  PollTimeoutError,
  TASK_STATUS_POLL_INTERVAL_MS,
  isTaskInFlight,
} from "@/lib/task-status-poll";

/**
 * 发送后任务在后台执行：轮询直至编排或单任务结束，便于 reload 拉取 post_task_guidance 等会话消息。
 */
export async function pollPlatformTaskUntilSettled(
  withFreshToken: (fn: (token: string) => Promise<void>) => Promise<void>,
  accepted: Extract<ChatSendResult, { kind: "accepted" }>,
  shouldAbort?: () => boolean,
): Promise<void> {
  const taskId = accepted.task_id;
  const orchId = accepted.orchestration_id;

  const scheduler = createPollScheduler({
    maxDurationMs: orchId ? 30 * 60 * 1000 : 15 * 60 * 1000,
    initialDelayMs: orchId ? ORCHESTRATION_STATUS_POLL_INTERVAL_MS : TASK_STATUS_POLL_INTERVAL_MS,
    maxDelayMs: 30_000,
  });

  while (true) {
    if (shouldAbort?.()) return;
    try {
      await scheduler.nextDelay();
    } catch (e) {
      if (e instanceof PollTimeoutError) return;
      throw e;
    }
    let done = false;
    await withFreshToken(async (token) => {
      if (orchId) {
        const orch = await getToolOrchestration(token, orchId);
        if (orch.finished || orch.awaiting_clarification) done = true;
      } else if (taskId) {
        const t = await getTask(token, taskId);
        if (!isTaskInFlight(t)) done = true;
      }
    });
    if (done) return;
  }
}
