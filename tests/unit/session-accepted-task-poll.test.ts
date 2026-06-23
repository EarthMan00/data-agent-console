import { describe, expect, it, vi } from "vitest";

import { pollAcceptedPlatformTaskInSession } from "@/lib/session-accepted-task-poll";

vi.mock("@/lib/agent-api/client", () => ({
  postTaskExecutionSteps: vi.fn(async () => "steps-msg-1"),
  patchTaskExecutionSteps: vi.fn(async () => true),
  getToolOrchestration: vi.fn(async () => ({
    finished: true,
    awaiting_clarification: false,
    steps: [{ status: "SUCCESS", task_id: "task-1" }],
  })),
  getTask: vi.fn(async () => ({ task_id: "task-1", status: "SUCCESS" })),
  listSessionMessages: vi.fn(async () => ({
    messages: [
      {
        id: "completion",
        role: "assistant",
        content: "任务已完成，可以在右侧查看本轮任务结果和 CSV 数据。",
        created_at: "2026-05-22T10:00:00Z",
        message_index: 1,
        meta: { task_id: "task-1", has_artifacts: true, task_status: "SUCCESS" },
      },
      {
        id: "guidance",
        role: "assistant",
        content: "【接下来您可以】\n1. 继续分析",
        created_at: "2026-05-22T10:00:01Z",
        message_index: 2,
        meta: { kind: "post_task_guidance", task_id: "task-1" },
      },
    ],
  })),
}));

vi.mock("@/lib/poll-task-until-settled", () => ({
  pollPlatformTaskUntilSettled: vi.fn(async () => undefined),
}));

describe("pollAcceptedPlatformTaskInSession", () => {
  it("posts task_execution_steps then reloads before polling", async () => {
    const { postTaskExecutionSteps, patchTaskExecutionSteps } = await import("@/lib/agent-api/client");
    const onReload = vi.fn(async () => undefined);
    const tokens: string[] = [];

    await pollAcceptedPlatformTaskInSession(
      async (fn) => {
        await fn("token-a");
      },
      "session-1",
      "round-1",
      {
        kind: "accepted",
        task_id: "task-1",
        task_status: "RUNNING",
        execution_steps: ["分析表格数据"],
        orchestration_id: "orch-1",
      },
      { onReload },
    );

    expect(postTaskExecutionSteps).toHaveBeenCalledWith(
      "token-a",
      "session-1",
      expect.objectContaining({
        round_id: "round-1",
        task_id: "task-1",
        orchestration_id: "orch-1",
      }),
    );
    expect(onReload).toHaveBeenCalled();
    expect(patchTaskExecutionSteps).toHaveBeenCalled();
    expect(tokens).toEqual([]);
  });
});
