import { getTask, getToolOrchestration } from "@/lib/agent-api/client";
import type { ChatSendResult } from "@/lib/agent-api/types";
import {
  ORCHESTRATION_STATUS_POLL_INTERVAL_MS,
  TASK_STATUS_POLL_INTERVAL_MS,
  isTaskInFlight,
} from "@/lib/task-status-poll";

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

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
  const maxPolls = orchId ? 4500 : 600;
  const intervalMs = orchId ? ORCHESTRATION_STATUS_POLL_INTERVAL_MS : TASK_STATUS_POLL_INTERVAL_MS;

  for (let i = 0; i < maxPolls; i += 1) {
    if (shouldAbort?.()) return;
    await sleep(intervalMs);
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
