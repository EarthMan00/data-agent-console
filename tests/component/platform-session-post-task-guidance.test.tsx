import type { ReactNode } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlatformSessionAgentWorkspace } from "@/components/agent-workspace/platform-session-agent-workspace";
import type { SessionMessageItem } from "@/lib/agent-api/types";
import { buildTaskCompletionSummary } from "@/lib/task-chat-summary";

const push = vi.fn();
const replace = vi.fn();

const platformAgentMock = vi.hoisted(() => ({
  current: null as
    | {
        auth: { accessToken: string; displayName: string; userId: string };
        platformSessionId: string | null;
        withFreshToken: ReturnType<typeof vi.fn>;
        setActivePlatformSession: ReturnType<typeof vi.fn>;
        clearActivePlatformSession: ReturnType<typeof vi.fn>;
        openLogin: ReturnType<typeof vi.fn>;
      }
    | null,
}));

const agentApiMocks = vi.hoisted(() => ({
  deleteTaskSession: vi.fn(),
  ensurePostTaskGuidance: vi.fn(),
  formatAgentApiErrorForUser: vi.fn(() => "request failed"),
  getTask: vi.fn(),
  getToolOrchestration: vi.fn(),
  listSessionMessages: vi.fn(),
  patchTaskExecutionSteps: vi.fn(),
  postTaskTerminatedMessage: vi.fn(),
  cancelToolOrchestration: vi.fn(),
  cancelTask: vi.fn(),
}));

const aliceShellStateMock = vi.hoisted(() => ({
  refreshHistoryNow: vi.fn(),
  setActiveSessionTitle: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

vi.mock("@/components/platform-agent-provider", () => ({
  useOptionalPlatformAgent: () => platformAgentMock.current,
}));

vi.mock("@/components/alice-shell", () => ({
  AliceShell: ({ children, rightRail }: { children: ReactNode; rightRail?: ReactNode }) => (
    <div data-testid="alice-shell">
      <div data-testid="alice-shell-main">{children}</div>
      {rightRail ? <div data-testid="alice-shell-right-rail">{rightRail}</div> : null}
    </div>
  ),
  useAliceShellState: () => aliceShellStateMock,
}));

vi.mock("@/lib/agent-api/client", () => ({
  deleteTaskSession: agentApiMocks.deleteTaskSession,
  ensurePostTaskGuidance: agentApiMocks.ensurePostTaskGuidance,
  formatAgentApiErrorForUser: agentApiMocks.formatAgentApiErrorForUser,
  getTask: agentApiMocks.getTask,
  getToolOrchestration: agentApiMocks.getToolOrchestration,
  listSessionMessages: agentApiMocks.listSessionMessages,
  patchTaskExecutionSteps: agentApiMocks.patchTaskExecutionSteps,
  postTaskTerminatedMessage: agentApiMocks.postTaskTerminatedMessage,
  cancelToolOrchestration: agentApiMocks.cancelToolOrchestration,
  cancelTask: agentApiMocks.cancelTask,
}));

vi.mock("@/lib/use-home-data-source-menu", () => ({
  useHomeDataSourceMenu: () => ({
    dataSourceGroups: [],
    dataSourceItems: [],
    loaded: true,
  }),
}));

vi.mock("@/lib/use-chat-stick-to-bottom", () => ({
  useChatStickToBottom: vi.fn(),
}));

vi.mock("@/lib/session-message-cache", () => ({
  readSessionMessageCache: vi.fn(() => null),
  writeSessionMessageCache: vi.fn(),
}));

vi.mock("@/lib/streaming-session-manager", () => ({
  registerStream: vi.fn(),
  updateStreamContent: vi.fn(),
  completeStream: vi.fn(),
  getStreamState: vi.fn(() => null),
  subscribe: vi.fn(() => () => undefined),
  releaseStream: vi.fn(),
}));

vi.mock("@/components/assistant-loading-row", () => ({
  AssistantLoadingRow: () => <div data-testid="assistant-loading-row" />,
}));

vi.mock("@/components/task-execution-steps-assistant-bubble", () => ({
  TaskExecutionStepsAssistantBubble: ({
    steps,
    afterExecution,
  }: {
    steps: Array<{ label: string }>;
    afterExecution?: ReactNode;
  }) => (
    <div data-testid="task-execution-steps-bubble">
      <div>{steps.map((step) => step.label).join(" / ")}</div>
      {afterExecution ? <div data-testid="task-execution-after">{afterExecution}</div> : null}
    </div>
  ),
}));

vi.mock("@/components/agent-task-result-panel", () => ({
  AgentTaskResultPanel: ({
    taskId,
    activeSubtaskTaskId,
    subtaskResultTabs,
    onSubtaskSelect,
  }: {
    taskId?: string | null;
    activeSubtaskTaskId?: string | null;
    subtaskResultTabs?: Array<{ taskId: string; label: string }>;
    onSubtaskSelect?: (taskId: string) => void;
  }) => (
    <div
      data-testid="agent-task-result-panel"
      data-task-id={taskId ?? ""}
      data-active-subtask-id={activeSubtaskTaskId ?? ""}
    >
      <div>{`panel-task:${taskId ?? ""}`}</div>
      <div>{`panel-subtask:${activeSubtaskTaskId ?? ""}`}</div>
      {subtaskResultTabs?.map((tab) => (
        <button key={tab.taskId} type="button" onClick={() => onSubtaskSelect?.(tab.taskId)}>
          {`select-${tab.taskId}`}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("@/components/task-result-summary-card", () => ({
  TaskResultSummaryCard: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("@/components/task-composer", () => ({
  TaskComposer: () => <div data-testid="task-composer" />,
}));

function message(
  id: string,
  role: SessionMessageItem["role"],
  content: string,
  messageIndex: number,
  meta?: Record<string, unknown>,
): SessionMessageItem {
  return {
    id,
    role,
    content,
    created_at: `2026-06-27T08:00:0${messageIndex}Z`,
    message_index: messageIndex,
    meta,
  };
}

describe("PlatformSessionAgentWorkspace post-task guidance", () => {
  beforeEach(() => {
    platformAgentMock.current = {
      auth: { accessToken: "token", displayName: "Alice", userId: "user-1" },
      platformSessionId: "session-1",
      withFreshToken: vi.fn(async (callback: (token: string) => Promise<unknown> | unknown) => callback("token")),
      setActivePlatformSession: vi.fn(),
      clearActivePlatformSession: vi.fn(),
      openLogin: vi.fn(),
    };
    agentApiMocks.listSessionMessages.mockReset();
    agentApiMocks.listSessionMessages.mockResolvedValue({
      messages: [],
      has_more: false,
    });
    agentApiMocks.ensurePostTaskGuidance.mockReset();
    agentApiMocks.ensurePostTaskGuidance.mockResolvedValue({ post_task_guidance: null });
    agentApiMocks.getTask.mockReset();
    agentApiMocks.getTask.mockResolvedValue(null);
    agentApiMocks.getToolOrchestration.mockReset();
    agentApiMocks.patchTaskExecutionSteps.mockReset();
    push.mockReset();
    replace.mockReset();
  });

  afterEach(() => {
    platformAgentMock.current = null;
    vi.clearAllMocks();
  });

  it("shows a normalized task summary above follow-up guidance when replay loads persisted guidance before the summary", async () => {
    agentApiMocks.listSessionMessages.mockResolvedValue({
      messages: [
        message("u1", "user", "亚马逊搜索cup并返回排名前三的爆品信息", 0),
        message(
          "a1",
          "assistant",
          "拆解为 1 个执行步骤，将开始执行。\n1. 在亚马逊上搜索“cup”，提取排名前三的爆品信息",
          1,
        ),
        message(
          "steps",
          "assistant",
          "（以下为该轮任务的执行步骤记录）",
          2,
          {
            kind: "task_execution_steps",
            task_id: "task-1",
            round_id: "round-1",
            steps: [
              {
                id: "round-1-step-1",
                label: "在亚马逊上搜索“cup”，提取排名前三的爆品信息",
                status: "done",
              },
            ],
          },
        ),
        message(
          "guidance",
          "assistant",
          [
            "1. 查看结果数据详情，生成这三款爆品的分析报告",
            "2. 将这三款产品进行横向对比，快速了解差异",
            "3. 追踪它们的价格和排名变化，把握动态趋势",
            "4. 采集它们的用户评论，提炼好评与差评关键点",
          ].join("\n"),
          3,
          {
            kind: "post_task_guidance",
            task_id: "task-1",
          },
        ),
        message(
          "summary",
          "assistant",
          "任务已完成，可以在右侧查看本轮任务结果和 CSV 数据。",
          4,
          {
            task_id: "task-1",
            task_status: "SUCCESS",
            has_artifacts: true,
            tool_name: "skill_task",
          },
        ),
      ],
      has_more: false,
    });

    render(<PlatformSessionAgentWorkspace sessionId="session-1" />);

    expect(
      await screen.findByText(
        "这轮已经完成“在亚马逊上搜索“cup”，提取排名前三的爆品信息”。结果数据已整理好，右侧可以直接查看。",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText("接下来您可以试试：")).toBeInTheDocument();
    expect(screen.getByText("查看结果数据详情，生成这三款爆品的分析报告")).toBeInTheDocument();
  });

  it("shows the same normalized task summary in scheduled run replay mode", async () => {
    agentApiMocks.listSessionMessages.mockResolvedValue({
      messages: [
        message("u1", "user", "亚马逊搜索cup并返回排名前三的爆品信息", 0),
        message(
          "steps",
          "assistant",
          "（以下为该轮任务的执行步骤记录）",
          1,
          {
            kind: "task_execution_steps",
            task_id: "task-1",
            round_id: "round-1",
            steps: [
              {
                id: "round-1-step-1",
                label: "在亚马逊上搜索“cup”，提取排名前三的爆品信息",
                status: "done",
              },
            ],
          },
        ),
        message(
          "guidance",
          "assistant",
          ["1. 查看结果数据详情，生成这三款爆品的分析报告"].join("\n"),
          2,
          {
            kind: "post_task_guidance",
            task_id: "task-1",
          },
        ),
        message(
          "summary",
          "assistant",
          "任务已完成，可以在右侧查看本轮任务结果和 CSV 数据。",
          3,
          {
            task_id: "task-1",
            task_status: "SUCCESS",
            has_artifacts: true,
            tool_name: "skill_task",
          },
        ),
      ],
      has_more: false,
    });

    render(<PlatformSessionAgentWorkspace sessionId="session-1" scheduledRunRecord />);

    expect(
      await screen.findByText(
        "这轮已经完成“在亚马逊上搜索“cup”，提取排名前三的爆品信息”。结果数据已整理好，右侧可以直接查看。",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText("接下来您可以试试：")).toBeInTheDocument();
    expect(screen.getByText("查看结果数据详情，生成这三款爆品的分析报告")).toBeInTheDocument();
  });

  it("normalizes a replayed multi-step completion summary even when persisted metadata only contains task_id", async () => {
    const taskName = "Search Amazon for cup and capture the top three listings";
    const expectedSummary = buildTaskCompletionSummary({
      task_id: "task-final",
      tool_name: "skill_task",
      status: "SUCCESS",
      started_at: "2026-06-27T08:00:00Z",
      finished_at: "2026-06-27T08:00:03Z",
      artifacts: [
        {
          artifact_id: "artifact-1",
          artifact_type: "result",
          original_name: "top-cups.csv",
          download_api: "/api/tasks/task-final/artifacts/artifact-1/download",
        },
      ],
      events: [],
      zip_download_api: null,
      request_payload: {
        message: taskName,
      },
    } as never);

    agentApiMocks.listSessionMessages.mockResolvedValue({
      messages: [
        message("u1", "user", taskName, 0),
        message(
          "steps",
          "assistant",
          "Running the accepted multi-step task",
          1,
          {
            kind: "task_execution_steps",
            task_id: "task-root",
            orchestration_id: "orch-1",
            round_id: "round-1",
            steps: [
              { id: "round-1-step-1", label: "Collect the top three cup listings", status: "done" },
              { id: "round-1-step-2", label: "Prepare the result handoff", status: "done" },
            ],
          },
        ),
        message(
          "summary",
          "assistant",
          "多步任务已全部完成，可以在右侧查看最后一步任务结果与数据。",
          2,
          {
            task_id: "task-final",
            has_artifacts: true,
          },
        ),
        message(
          "guidance",
          "assistant",
          "【接下来您可以】\n1. Review the output and generate a report",
          3,
          {
            kind: "post_task_guidance",
            task_id: "task-final",
          },
        ),
      ],
      has_more: false,
    });

    render(<PlatformSessionAgentWorkspace sessionId="session-1" />);

    expect(await screen.findByText(expectedSummary)).toBeInTheDocument();
    expect(screen.queryByText("多步任务已全部完成，可以在右侧查看最后一步任务结果与数据。")).not.toBeInTheDocument();
    expect(screen.getByText("接下来您可以试试：")).toBeInTheDocument();
    expect(screen.getByText("Review the output and generate a report")).toBeInTheDocument();
  });

  it("normalizes the same replayed multi-step completion summary in scheduled run replay mode when task_status metadata is missing", async () => {
    const taskName = "Search Amazon for cup and capture the top three listings";
    const expectedSummary = buildTaskCompletionSummary({
      task_id: "task-final",
      tool_name: "skill_task",
      status: "SUCCESS",
      started_at: "2026-06-27T08:00:00Z",
      finished_at: "2026-06-27T08:00:03Z",
      artifacts: [
        {
          artifact_id: "artifact-1",
          artifact_type: "result",
          original_name: "top-cups.csv",
          download_api: "/api/tasks/task-final/artifacts/artifact-1/download",
        },
      ],
      events: [],
      zip_download_api: null,
      request_payload: {
        message: taskName,
      },
    } as never);

    agentApiMocks.listSessionMessages.mockResolvedValue({
      messages: [
        message("u1", "user", taskName, 0),
        message(
          "steps",
          "assistant",
          "Running the accepted multi-step task",
          1,
          {
            kind: "task_execution_steps",
            task_id: "task-root",
            orchestration_id: "orch-1",
            round_id: "round-1",
            steps: [
              { id: "round-1-step-1", label: "Collect the top three cup listings", status: "done" },
              { id: "round-1-step-2", label: "Prepare the result handoff", status: "done" },
            ],
          },
        ),
        message(
          "summary",
          "assistant",
          "多步任务已全部完成，可以在右侧查看最后一步任务结果与数据。",
          2,
          {
            task_id: "task-final",
            has_artifacts: true,
          },
        ),
        message(
          "guidance",
          "assistant",
          "【接下来您可以】\n1. Review the output and generate a report",
          3,
          {
            kind: "post_task_guidance",
            task_id: "task-final",
          },
        ),
      ],
      has_more: false,
    });

    render(<PlatformSessionAgentWorkspace sessionId="session-1" scheduledRunRecord />);

    expect(await screen.findByText(expectedSummary)).toBeInTheDocument();
    expect(screen.queryByText("多步任务已全部完成，可以在右侧查看最后一步任务结果与数据。")).not.toBeInTheDocument();
    expect(screen.getByText("接下来您可以试试：")).toBeInTheDocument();
    expect(screen.getByText("Review the output and generate a report")).toBeInTheDocument();
  });

  it("does not promote a scheduled run replay session into the global active session", async () => {
    agentApiMocks.listSessionMessages.mockResolvedValue({
      messages: [],
      has_more: false,
    });

    render(<PlatformSessionAgentWorkspace sessionId="session-scheduled" scheduledRunRecord />);

    expect(await screen.findByText("此为定时任务执行记录，不支持继续追问。")).toBeInTheDocument();
    expect(platformAgentMock.current?.setActivePlatformSession).not.toHaveBeenCalled();
  });
  it("keeps reloading when only decomposition labels exist and persisted steps are still missing", async () => {
    vi.useFakeTimers();
    try {
      agentApiMocks.listSessionMessages.mockResolvedValue({
        messages: [
          message("u1", "user", "亚马逊搜索排名前三的 cup，并生成一份说明报告", 0),
          message(
            "a1",
            "assistant",
            [
              "已拆解为 2 个执行步骤，将按顺序依次完成。",
              "1. 在亚马逊搜索排名前三的 cup 产品，采集相关信息",
              "2. 基于采集到的前三 cup 产品信息，生成一份说明报告",
            ].join("\n"),
            1,
          ),
        ],
        has_more: false,
      });

      render(<PlatformSessionAgentWorkspace sessionId="session-1" />);

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(agentApiMocks.listSessionMessages).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(16_000);
      });

      expect(agentApiMocks.listSessionMessages.mock.calls.length).toBeGreaterThan(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the result card plus synthetic summary and guidance as soon as the live task snapshot settles", async () => {
    vi.useFakeTimers();
    try {
      const runningTask = {
        task_id: "task-1",
        status: "RUNNING",
        started_at: "2026-06-27T08:00:00Z",
        finished_at: null,
        artifacts: [],
        events: [],
        zip_download_api: null,
      };
      const settledTask = {
        task_id: "task-1",
        tool_name: "skill_task",
        status: "SUCCESS",
        started_at: "2026-06-27T08:00:00Z",
        finished_at: "2026-06-27T08:00:03Z",
        artifacts: [
          {
            artifact_id: "artifact-1",
            artifact_type: "result",
            original_name: "top-cups.csv",
            download_api: "/api/tasks/task-1/artifacts/artifact-1/download",
          },
        ],
        events: [],
        zip_download_api: null,
        response_summary: {
          post_task_guidance: "1. Review the top three listings",
        },
        request_payload: {
          message: "Search the top three cup listings",
        },
      };

      agentApiMocks.listSessionMessages.mockResolvedValue({
        messages: [
          message("u1", "user", "Search the top three cup listings", 0),
          message(
            "steps",
            "assistant",
            "Running the accepted task",
            1,
            {
              kind: "task_execution_steps",
              task_id: "task-1",
              round_id: "round-1",
              steps: [
                {
                  id: "round-1-step-1",
                  label: "Search the top three cup listings",
                  status: "running",
                },
              ],
            },
          ),
        ],
        has_more: false,
      });
      agentApiMocks.getTask
        .mockResolvedValueOnce(runningTask)
        .mockResolvedValueOnce(runningTask)
        .mockResolvedValueOnce(runningTask)
        .mockResolvedValue(settledTask);

      render(<PlatformSessionAgentWorkspace sessionId="session-1" />);

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getAllByText("Search the top three cup listings").length).toBeGreaterThan(0);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByText("任务结果")).toBeInTheDocument();
      expect(screen.getByText(buildTaskCompletionSummary(settledTask as never))).toBeInTheDocument();
      expect(screen.getByText("接下来您可以试试：")).toBeInTheDocument();
      expect(screen.getByText("Review the top three listings")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("auto-opens the live result panel on the first tabular artifact and switches to the newest subtask result", async () => {
    vi.useFakeTimers();
    try {
      const orchState: {
        finished: boolean;
        awaiting_clarification: boolean;
        steps: Array<{ status: string; task_id: string; task_started_at?: string }>;
      } = {
        finished: false,
        awaiting_clarification: false,
        steps: [{ status: "RUNNING", task_id: "task-1", task_started_at: "2026-06-27T08:00:00Z" }],
      };
      const taskState: Record<string, Record<string, unknown>> = {
        "task-1": {
          task_id: "task-1",
          tool_name: "skill_task",
          status: "RUNNING",
          started_at: "2026-06-27T08:00:00Z",
          finished_at: null,
          artifacts: [],
          events: [],
          zip_download_api: null,
        },
      };

      agentApiMocks.listSessionMessages.mockResolvedValue({
        messages: [
          message("u1", "user", "run multi step collection", 0),
          message(
            "steps",
            "assistant",
            "Running multi-step task",
            1,
            {
              kind: "task_execution_steps",
              task_id: "task-1",
              round_id: "round-1",
              orchestration_id: "orch-1",
              steps: [
                { id: "round-1-step-1", label: "Step 1", status: "running" },
                { id: "round-1-step-2", label: "Step 2", status: "pending" },
                { id: "round-1-step-3", label: "Step 3", status: "pending" },
              ],
            },
          ),
        ],
        has_more: false,
      });
      agentApiMocks.getToolOrchestration.mockImplementation(async () => orchState);
      agentApiMocks.getTask.mockImplementation(async (_token: string, taskId: string) => {
        const hit = taskState[taskId];
        if (!hit) {
          throw new Error(`unknown task ${taskId}`);
        }
        return hit;
      });

      render(<PlatformSessionAgentWorkspace sessionId="session-1" />);

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.queryByTestId("agent-task-result-panel")).not.toBeInTheDocument();

      orchState.steps = [
        { status: "SUCCESS", task_id: "task-1", task_started_at: "2026-06-27T08:00:00Z" },
        { status: "RUNNING", task_id: "task-2", task_started_at: "2026-06-27T08:00:03Z" },
      ];
      taskState["task-1"] = {
        task_id: "task-1",
        tool_name: "skill_task",
        status: "SUCCESS",
        started_at: "2026-06-27T08:00:00Z",
        finished_at: "2026-06-27T08:00:03Z",
        artifacts: [
          {
            artifact_id: "artifact-1",
            artifact_type: "csv",
            original_name: "step-1.csv",
            download_api: "/api/tasks/task-1/artifacts/artifact-1/download",
          },
        ],
        events: [],
        zip_download_api: null,
      };
      taskState["task-2"] = {
        task_id: "task-2",
        tool_name: "skill_task",
        status: "RUNNING",
        started_at: "2026-06-27T08:00:03Z",
        finished_at: null,
        artifacts: [],
        events: [],
        zip_download_api: null,
      };

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByTestId("agent-task-result-panel")).toHaveAttribute("data-active-subtask-id", "task-1");

      orchState.steps = [
        { status: "SUCCESS", task_id: "task-1", task_started_at: "2026-06-27T08:00:00Z" },
        { status: "SUCCESS", task_id: "task-2", task_started_at: "2026-06-27T08:00:03Z" },
      ];
      orchState.finished = true;
      taskState["task-2"] = {
        task_id: "task-2",
        tool_name: "skill_task",
        status: "SUCCESS",
        started_at: "2026-06-27T08:00:03Z",
        finished_at: "2026-06-27T08:00:06Z",
        artifacts: [
          {
            artifact_id: "artifact-2",
            artifact_type: "csv",
            original_name: "step-2.csv",
            download_api: "/api/tasks/task-2/artifacts/artifact-2/download",
          },
        ],
        events: [],
        zip_download_api: null,
      };

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByTestId("agent-task-result-panel")).toHaveAttribute("data-active-subtask-id", "task-2");
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops auto-following new live results after the user manually selects a subtask", async () => {
    vi.useFakeTimers();
    try {
      const orchState: {
        finished: boolean;
        awaiting_clarification: boolean;
        steps: Array<{ status: string; task_id: string; task_started_at?: string }>;
      } = {
        finished: false,
        awaiting_clarification: false,
        steps: [
          { status: "SUCCESS", task_id: "task-1", task_started_at: "2026-06-27T08:00:00Z" },
          { status: "SUCCESS", task_id: "task-2", task_started_at: "2026-06-27T08:00:03Z" },
          { status: "RUNNING", task_id: "task-3", task_started_at: "2026-06-27T08:00:06Z" },
        ],
      };
      const taskState: Record<string, Record<string, unknown>> = {
        "task-1": {
          task_id: "task-1",
          tool_name: "skill_task",
          status: "SUCCESS",
          started_at: "2026-06-27T08:00:00Z",
          finished_at: "2026-06-27T08:00:03Z",
          artifacts: [
            {
              artifact_id: "artifact-1",
              artifact_type: "csv",
              original_name: "step-1.csv",
              download_api: "/api/tasks/task-1/artifacts/artifact-1/download",
            },
          ],
          events: [],
          zip_download_api: null,
        },
        "task-2": {
          task_id: "task-2",
          tool_name: "skill_task",
          status: "SUCCESS",
          started_at: "2026-06-27T08:00:03Z",
          finished_at: "2026-06-27T08:00:06Z",
          artifacts: [
            {
              artifact_id: "artifact-2",
              artifact_type: "csv",
              original_name: "step-2.csv",
              download_api: "/api/tasks/task-2/artifacts/artifact-2/download",
            },
          ],
          events: [],
          zip_download_api: null,
        },
        "task-3": {
          task_id: "task-3",
          tool_name: "skill_task",
          status: "RUNNING",
          started_at: "2026-06-27T08:00:06Z",
          finished_at: null,
          artifacts: [],
          events: [],
          zip_download_api: null,
        },
      };

      agentApiMocks.listSessionMessages.mockResolvedValue({
        messages: [
          message("u1", "user", "run multi step collection", 0),
          message(
            "steps",
            "assistant",
            "Running multi-step task",
            1,
            {
              kind: "task_execution_steps",
              task_id: "task-1",
              round_id: "round-1",
              orchestration_id: "orch-1",
              steps: [
                { id: "round-1-step-1", label: "Step 1", status: "done" },
                { id: "round-1-step-2", label: "Step 2", status: "done" },
                { id: "round-1-step-3", label: "Step 3", status: "running" },
              ],
            },
          ),
        ],
        has_more: false,
      });
      agentApiMocks.getToolOrchestration.mockImplementation(async () => orchState);
      agentApiMocks.getTask.mockImplementation(async (_token: string, taskId: string) => {
        const hit = taskState[taskId];
        if (!hit) {
          throw new Error(`unknown task ${taskId}`);
        }
        return hit;
      });

      render(<PlatformSessionAgentWorkspace sessionId="session-1" />);

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(3_000);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByTestId("agent-task-result-panel")).toHaveAttribute("data-active-subtask-id", "task-2");

      await act(async () => {
        screen.getByRole("button", { name: "select-task-1" }).click();
      });

      expect(screen.getByTestId("agent-task-result-panel")).toHaveAttribute("data-active-subtask-id", "task-1");

      orchState.steps = [
        { status: "SUCCESS", task_id: "task-1", task_started_at: "2026-06-27T08:00:00Z" },
        { status: "SUCCESS", task_id: "task-2", task_started_at: "2026-06-27T08:00:03Z" },
        { status: "SUCCESS", task_id: "task-3", task_started_at: "2026-06-27T08:00:06Z" },
      ];
      orchState.finished = true;
      taskState["task-3"] = {
        task_id: "task-3",
        tool_name: "skill_task",
        status: "SUCCESS",
        started_at: "2026-06-27T08:00:06Z",
        finished_at: "2026-06-27T08:00:09Z",
        artifacts: [
          {
            artifact_id: "artifact-3",
            artifact_type: "csv",
            original_name: "step-3.csv",
            download_api: "/api/tasks/task-3/artifacts/artifact-3/download",
          },
        ],
        events: [],
        zip_download_api: null,
      };

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByTestId("agent-task-result-panel")).toHaveAttribute("data-active-subtask-id", "task-1");
    } finally {
      vi.useRealTimers();
    }
  });
});
