import { StrictMode, type ReactNode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlatformSessionAgentWorkspace } from "@/components/agent-workspace/platform-session-agent-workspace";
import type { ChatSendResult } from "@/lib/agent-api/types";

const push = vi.fn();
const replace = vi.fn();

type HomeLaunchMetaMock = {
  v: 1;
  sessionId: string;
  prompt: string;
  selectedSourceIds: string[];
  sendKind: "pending" | "in_flight" | "done";
};

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

const sessionChatSendMock = vi.hoisted(() => ({
  sendSessionMessageStream: vi.fn<(...args: unknown[]) => Promise<ChatSendResult>>(),
}));

const homeLaunchState = vi.hoisted(() => ({
  meta: null as HomeLaunchMetaMock | null,
}));

const pollAcceptedTaskMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

vi.mock("@/components/platform-agent-provider", () => ({
  useOptionalPlatformAgent: () => platformAgentMock.current,
}));

vi.mock("@/components/alice-shell", () => ({
  AliceShell: ({ children }: { children: ReactNode }) => <div data-testid="alice-shell">{children}</div>,
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
  TaskExecutionStepsAssistantBubble: () => <div data-testid="task-execution-steps-bubble" />,
}));

vi.mock("@/components/agent-task-result-panel", () => ({
  AgentTaskResultPanel: () => <div data-testid="agent-task-result-panel" />,
}));

vi.mock("@/components/task-result-summary-card", () => ({
  TaskResultSummaryCard: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("@/components/task-composer", () => ({
  TaskComposer: () => <div data-testid="task-composer" />,
}));

vi.mock("@/lib/home-session-launch", () => ({
  tryClaimHomeSessionLaunchFirstSend: vi.fn((sessionId: string) => {
    const meta = homeLaunchState.meta;
    if (!meta || meta.sessionId !== sessionId || meta.sendKind !== "pending") return null;
    homeLaunchState.meta = { ...meta, sendKind: "in_flight" };
    return homeLaunchState.meta;
  }),
  loadHomeSessionLaunchMeta: vi.fn(() => homeLaunchState.meta),
  saveHomeSessionLaunchMeta: vi.fn((meta: HomeLaunchMetaMock) => {
    homeLaunchState.meta = meta;
  }),
  isHomeSessionLaunchAwaitingFirstMessage: vi.fn(
    (sessionId: string, meta?: HomeLaunchMetaMock | null) => {
      const current = meta ?? homeLaunchState.meta;
      if (!current || current.sessionId !== sessionId) return false;
      return current.sendKind === "pending" || current.sendKind === "in_flight";
    },
  ),
  takeHomeSessionLaunchFiles: vi.fn(() => []),
}));

vi.mock("@/lib/session-accepted-task-poll", () => ({
  pollAcceptedPlatformTaskInSession: pollAcceptedTaskMock,
}));

vi.mock("@/lib/session-chat-send", async () => {
  const actual = await vi.importActual<typeof import("@/lib/session-chat-send")>("@/lib/session-chat-send");
  return {
    ...actual,
    sendSessionMessageStream: sessionChatSendMock.sendSessionMessageStream,
  };
});

describe("PlatformSessionAgentWorkspace home-launch auto send", () => {
  beforeEach(() => {
    platformAgentMock.current = {
      auth: { accessToken: "token", displayName: "Alice", userId: "user-1" },
      platformSessionId: "session-1",
      withFreshToken: vi.fn(async (callback: (token: string) => Promise<unknown> | unknown) => callback("token")),
      setActivePlatformSession: vi.fn(),
      clearActivePlatformSession: vi.fn(),
      openLogin: vi.fn(),
    };
    homeLaunchState.meta = {
      v: 1,
      sessionId: "session-1",
      prompt: "首页首发任务",
      selectedSourceIds: [],
      sendKind: "pending",
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
    sessionChatSendMock.sendSessionMessageStream.mockReset();
    pollAcceptedTaskMock.mockReset();
    pollAcceptedTaskMock.mockResolvedValue({ lastTask: null });
    push.mockReset();
    replace.mockReset();
  });

  afterEach(() => {
    platformAgentMock.current = null;
    homeLaunchState.meta = null;
    vi.clearAllMocks();
  });

  it("keeps the optimistic user bubble visible during strict-mode home auto send", async () => {
    sessionChatSendMock.sendSessionMessageStream.mockImplementation(
      async () => new Promise<ChatSendResult>(() => undefined),
    );

    render(
      <StrictMode>
        <PlatformSessionAgentWorkspace sessionId="session-1" />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(sessionChatSendMock.sendSessionMessageStream).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId("agent-user-input-card")).toHaveTextContent("首页首发任务");
    expect(screen.getByTestId("assistant-loading-row")).toBeInTheDocument();
  });

  it("continues into accepted-task polling for a strict-mode home auto send", async () => {
    sessionChatSendMock.sendSessionMessageStream.mockResolvedValue({
      kind: "accepted",
      task_id: "task-1",
      task_status: "RUNNING",
      execution_steps: ["采集数据"],
      orchestration_id: null,
    });

    render(
      <StrictMode>
        <PlatformSessionAgentWorkspace sessionId="session-1" />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(pollAcceptedTaskMock).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByTestId("agent-user-input-card")).toHaveTextContent("首页首发任务");
  });
});
