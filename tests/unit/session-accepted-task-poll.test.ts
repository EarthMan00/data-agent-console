import { beforeEach, describe, expect, it, vi } from "vitest";

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("persists runtime_started_at for the running step before the first reload", async () => {
    const { getTask, postTaskExecutionSteps } = await import("@/lib/agent-api/client");
    vi.mocked(getTask)
      .mockResolvedValueOnce({
        task_id: "task-1",
        status: "RUNNING",
        started_at: "2026-06-29T08:00:00Z",
      } as never)
      .mockResolvedValueOnce({
        task_id: "task-1",
        status: "SUCCESS",
        started_at: "2026-06-29T08:00:00Z",
      } as never);

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
        orchestration_id: null,
      },
      { onReload: vi.fn(async () => undefined) },
    );

    expect(postTaskExecutionSteps).toHaveBeenCalledWith(
      "token-a",
      "session-1",
      expect.objectContaining({
        steps: [
          expect.objectContaining({
            status: "running",
            runtime_started_at: "2026-06-29T08:00:00Z",
          }),
        ],
      }),
    );
  });

  it("patches the steps message with the terminal subtask id when orchestration finishes on a different child task", async () => {
    const { getToolOrchestration, getTask, patchTaskExecutionSteps, listSessionMessages } = await import("@/lib/agent-api/client");
    vi.mocked(getToolOrchestration).mockResolvedValue({
      finished: true,
      awaiting_clarification: false,
      steps: [
        { status: "SUCCESS", task_id: "task-1" },
        { status: "SUCCESS", task_id: "task-2" },
      ],
    } as never);
    vi.mocked(getTask).mockResolvedValue({
      task_id: "task-2",
      status: "SUCCESS",
      started_at: "2026-06-29T08:00:00Z",
      finished_at: "2026-06-29T08:00:03Z",
    } as never);
    vi.mocked(listSessionMessages).mockResolvedValue({
      messages: [
        {
          id: "completion-task-2",
          role: "assistant",
          content: "任务已完成，可以在右侧查看本轮任务结果和 CSV 数据。",
          created_at: "2026-06-29T08:00:04Z",
          message_index: 1,
          meta: { task_id: "task-2", has_artifacts: true, task_status: "SUCCESS" },
        },
        {
          id: "guidance-task-2",
          role: "assistant",
          content: "【接下来您可以试试】\n1. 继续分析",
          created_at: "2026-06-29T08:00:05Z",
          message_index: 2,
          meta: { kind: "post_task_guidance", task_id: "task-2" },
        },
      ],
    } as never);

    await pollAcceptedPlatformTaskInSession(
      async (fn) => {
        await fn("token-a");
      },
      "session-1",
      "round-1",
      {
        kind: "accepted",
        task_id: "task-root",
        task_status: "RUNNING",
        execution_steps: ["step 1", "step 2"],
        orchestration_id: "orch-1",
      },
      { onReload: vi.fn(async () => undefined) },
    );

    expect(patchTaskExecutionSteps).toHaveBeenLastCalledWith(
      "token-a",
      "session-1",
      "steps-msg-1",
      expect.objectContaining({
        task_id: "task-2",
        orchestration_id: "orch-1",
      }),
    );
  });
});
