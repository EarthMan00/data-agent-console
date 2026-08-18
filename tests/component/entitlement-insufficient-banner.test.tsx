import { type ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlatformSessionAgentWorkspace } from "@/components/agent-workspace/platform-session-agent-workspace";
import type { ChatRoundSnapshot } from "@/lib/agent-api/types";

const SESSION_ID = "session-a";
const ROUND_ID = "round-a";
const push = vi.fn();

const roundController = vi.hoisted(() => ({
  snapshots: new Map<string, ChatRoundSnapshot>(),
  activeRound: null as ChatRoundSnapshot | null,
  loading: false,
  error: "",
  send: vi.fn(),
  resume: vi.fn(),
  cancel: vi.fn(),
  reload: vi.fn(),
}));

const api = vi.hoisted(() => ({ listSessionMessages: vi.fn() }));

const agent = vi.hoisted(() => ({
  auth: { accessToken: "token", displayName: "Alice", userId: "user" },
  platformSessionId: "session-a",
  withFreshToken: vi.fn(async (run: (token: string) => Promise<unknown>) => run("token")),
  setActivePlatformSession: vi.fn(),
  clearActivePlatformSession: vi.fn(),
  openLogin: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

vi.mock("@/components/platform-agent-provider", () => ({
  useOptionalPlatformAgent: () => agent,
}));

vi.mock("@/components/alice-shell", () => ({
  AliceShell: ({ children, rightRail }: { children: ReactNode; rightRail?: ReactNode }) => (
    <div>
      <main>{children}</main>
      <aside>{rightRail}</aside>
    </div>
  ),
  useAliceShellState: () => ({
    refreshHistoryNow: vi.fn(),
    setActiveSessionTitle: vi.fn(),
  }),
}));

vi.mock("@/components/agent-workspace/use-chat-rounds", () => ({
  useChatRounds: () => ({
    snapshots: roundController.snapshots,
    activeRound: roundController.activeRound,
    loading: roundController.loading,
    error: roundController.error,
    send: roundController.send,
    resume: roundController.resume,
    cancel: roundController.cancel,
    reload: roundController.reload,
  }),
}));

vi.mock("@/lib/agent-api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/agent-api/client")>(
    "@/lib/agent-api/client",
  );
  return {
    ...actual,
    listSessionMessages: api.listSessionMessages,
  };
});

vi.mock("@/lib/use-home-data-source-menu", () => ({
  useHomeDataSourceMenu: () => ({ dataSourceGroups: [], dataSourceItems: [], loaded: true }),
}));

vi.mock("@/lib/use-chat-stick-to-bottom", () => ({ useChatStickToBottom: vi.fn() }));

vi.mock("@/components/task-composer", () => ({
  TaskComposer: () => <div data-testid="task-composer" />,
}));

vi.mock("@/components/agent-workspace/chat-bubbles", () => ({
  SIMPLE_CHAT_COLUMN_MAX: "max-w-test",
  SimpleUserBubble: ({ text }: { text: string }) => <div data-testid="user-bubble">{text}</div>,
  AssistantOutputFrame: ({ children }: { children: ReactNode }) => (
    <div data-testid="assistant-frame">{children}</div>
  ),
  SimpleAssistantBubble: ({ body }: { body: string }) => (
    <div data-testid="assistant-bubble">{body}</div>
  ),
}));

vi.mock("@/components/agent-task-result-panel", () => ({
  AgentTaskResultPanel: () => <div data-testid="agent-task-result-panel" />,
}));

function failedSnapshot(overrides: Partial<ChatRoundSnapshot> = {}): ChatRoundSnapshot {
  return {
    round_id: ROUND_ID,
    session_id: SESSION_ID,
    status: "FAILED",
    assistant_message_id: "assistant-1",
    content: "",
    last_event_seq: 5,
    steps: [],
    error_code: "entitlement_insufficient",
    error_message: "当前套餐权益不足，请购买或升级套餐后重试",
    ...overrides,
  };
}

describe("权益不足引导", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    roundController.snapshots = new Map();
    roundController.activeRound = null;
    roundController.loading = false;
    roundController.error = "";
    api.listSessionMessages.mockResolvedValue({ messages: [], has_more: false });
  });

  afterEach(() => {
    roundController.snapshots = new Map();
  });

  it("round 失败码为 entitlement_insufficient 时展示购买引导并可跳转 /plans", async () => {
    roundController.snapshots = new Map([[ROUND_ID, failedSnapshot()]]);

    render(<PlatformSessionAgentWorkspace sessionId={SESSION_ID} />);

    expect(await screen.findByText("当前套餐权益不足")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "购买或升级套餐" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "购买或升级套餐" }));
    expect(push).toHaveBeenCalledWith("/plans");
  });

  it("非权益不足错误不展示购买引导", async () => {
    roundController.snapshots = new Map([
      [ROUND_ID, failedSnapshot({ error_code: "BUSINESS_ACTION_FAILED" })],
    ]);

    render(<PlatformSessionAgentWorkspace sessionId={SESSION_ID} />);

    await waitFor(() => expect(api.listSessionMessages).toHaveBeenCalled());
    expect(screen.queryByText("当前套餐权益不足")).not.toBeInTheDocument();
  });
});
