import { type ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlatformSessionAgentWorkspace } from "@/components/agent-workspace/platform-session-agent-workspace";
import type { ChatRoundSnapshot, SessionMessageItem } from "@/lib/agent-api/types";
import { saveScheduleTrialMeta } from "@/lib/schedule-create-draft";

const SESSION_A = "f4159ee9-c863-41c8-9c1b-ffbfa193917f";
const SESSION_B = "a27ab89a-74bc-43f0-bb15-bb3b8387635e";
const ROUND_ID = "3da8ff9a-95e2-4f9e-9788-7fda3d450fe7";
const USER_ID = "7f277820-a80d-481d-90f4-0b2653ded858";
const ASSISTANT_ID = "46aa60a5-64dd-471d-adfe-9856a3ee17c5";
const CLIENT_MESSAGE_ID = "a62430bc-1417-4b95-9432-937b331a7d7a";

const roundController = vi.hoisted(() => ({
  snapshots: new Map<string, ChatRoundSnapshot>(),
  activeRound: null as ChatRoundSnapshot | null,
  loading: false,
  error: "",
  send: vi.fn(),
  resume: vi.fn(),
  cancel: vi.fn(),
  reload: vi.fn(),
  calls: [] as string[],
}));

const api = vi.hoisted(() => ({
  listSessionMessages: vi.fn(),
}));

const roundApi = vi.hoisted(() => ({
  createInitialChatRound: vi.fn(),
  createChatRound: vi.fn(),
}));

const agent = vi.hoisted(() => ({
  auth: { accessToken: "token", displayName: "Alice", userId: "user" },
  platformSessionId: "f4159ee9-c863-41c8-9c1b-ffbfa193917f",
  withFreshToken: vi.fn(async (run: (token: string) => Promise<unknown>) => run("token")),
  setActivePlatformSession: vi.fn(),
  clearActivePlatformSession: vi.fn(),
  openLogin: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
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
  useChatRounds: ({ sessionId }: { sessionId: string }) => {
    roundController.calls.push(sessionId);
    return {
      snapshots: roundController.snapshots,
      activeRound: roundController.activeRound,
      loading: roundController.loading,
      error: roundController.error,
      send: roundController.send,
      resume: roundController.resume,
      cancel: roundController.cancel,
      reload: roundController.reload,
    };
  },
}));

vi.mock("@/lib/agent-api/chat-rounds", () => ({
  createInitialChatRound: roundApi.createInitialChatRound,
  createChatRound: roundApi.createChatRound,
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
  TaskComposer: ({
    value,
    onValueChange,
    onSubmit,
    onStop,
    submitVariant = "send",
    showSubmitButton = true,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    onSubmit: () => void;
    onStop?: () => void;
    submitVariant?: "send" | "stop";
    showSubmitButton?: boolean;
  }) => (
    <div data-testid="task-composer">
      <input
        aria-label="消息"
        value={value}
        onChange={(event) => onValueChange(event.currentTarget.value)}
      />
      {showSubmitButton ? (
        <button
          type="button"
          aria-label={submitVariant === "stop" ? "停止任务" : "发送任务"}
          onClick={submitVariant === "stop" ? onStop : onSubmit}
        >
          {submitVariant === "stop" ? "停止任务" : "发送任务"}
        </button>
      ) : null}
    </div>
  ),
}));

vi.mock("@/components/agent-workspace/chat-bubbles", () => ({
  SIMPLE_CHAT_COLUMN_MAX: "max-w-test",
  SimpleUserBubble: ({ text }: { text: string }) => <div data-testid="user-bubble">{text}</div>,
  SimpleAssistantBubble: ({ body, after }: { body: string; after?: ReactNode }) => (
    <div data-testid="assistant-bubble">
      <span>{body}</span>
      {after}
    </div>
  ),
}));

vi.mock("@/components/agent-task-result-panel", () => ({
  AgentTaskResultPanel: ({ artifacts }: { artifacts?: Array<{ original_name: string }> }) => (
    <div data-testid="agent-task-result-panel">
      {(artifacts ?? []).map((artifact) => artifact.original_name).join(",")}
    </div>
  ),
}));

function persistedMessages(): SessionMessageItem[] {
  return [
    {
      id: USER_ID,
      role: "user",
      content: "分析这份数据",
      created_at: "2026-07-27T00:00:00Z",
      message_index: 1,
      message_id: CLIENT_MESSAGE_ID,
      meta: { round_id: ROUND_ID, client_message_id: CLIENT_MESSAGE_ID },
    },
    {
      id: ASSISTANT_ID,
      role: "assistant",
      content: "old persisted content",
      created_at: "2026-07-27T00:00:01Z",
      message_index: 2,
      meta: { round_id: ROUND_ID },
    },
  ];
}

function snapshot(overrides: Partial<ChatRoundSnapshot> = {}): ChatRoundSnapshot {
  return {
    round_id: ROUND_ID,
    session_id: SESSION_A,
    status: "EXECUTING",
    assistant_message_id: ASSISTANT_ID,
    content: "snapshot replacement",
    last_event_seq: 8,
    steps: [
      {
        step_id: "data",
        step_index: 0,
        label: "采集公开数据",
        status: "RUNNING",
        task_id: "task-public-ref",
        artifacts: [],
        evidence: null,
        error_code: null,
        error_message: null,
      },
    ],
    error_code: null,
    error_message: null,
    ...overrides,
  };
}

function installSnapshot(value: ChatRoundSnapshot | null): void {
  roundController.activeRound = value;
  roundController.snapshots = value ? new Map([[value.round_id, value]]) : new Map();
}

describe("PlatformSessionAgentWorkspace durable Round presentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    roundController.calls = [];
    roundController.loading = false;
    roundController.error = "";
    roundController.send.mockResolvedValue({
      session_id: SESSION_A,
      round_id: ROUND_ID,
      assistant_message_id: ASSISTANT_ID,
      status: "QUEUED",
      last_event_seq: 1,
    });
    roundController.resume.mockResolvedValue(undefined);
    roundController.cancel.mockResolvedValue(snapshot({ status: "CANCELLED" }));
    roundController.reload.mockResolvedValue(undefined);
    api.listSessionMessages.mockResolvedValue({ messages: persistedMessages(), has_more: false });
    installSnapshot(snapshot());
  });

  afterEach(() => {
    installSnapshot(null);
  });

  it("renders one persisted user and one canonical assistant whose delta is snapshot replacement", async () => {
    const view = render(<PlatformSessionAgentWorkspace sessionId={SESSION_A} />);

    await waitFor(() => expect(screen.getAllByTestId("user-bubble")).toHaveLength(1));
    expect(screen.getAllByTestId("assistant-bubble")).toHaveLength(1);
    expect(screen.getByTestId("assistant-bubble")).toHaveTextContent("snapshot replacement");
    expect(screen.queryByText("old persisted content")).not.toBeInTheDocument();
    expect(screen.getByTestId("chat-round-progress")).toHaveTextContent("采集公开数据");
    expect(screen.getByTestId("assistant-bubble")).not.toContainElement(
      screen.getByTestId("chat-round-progress"),
    );

    installSnapshot(snapshot({ content: "complete delta replacement", last_event_seq: 9 }));
    view.rerender(<PlatformSessionAgentWorkspace sessionId={SESSION_A} />);
    expect(screen.getByTestId("assistant-bubble")).toHaveTextContent("complete delta replacement");
    expect(screen.queryByText("snapshot replacement")).not.toBeInTheDocument();
  });

  it("shows partial success boundaries and retains earlier data artifacts for the result panel", async () => {
    installSnapshot(
      snapshot({
        status: "PARTIAL_SUCCESS",
        content: "数据可用，报告生成失败。",
        steps: [
          {
            step_id: "data",
            step_index: 0,
            label: "采集数据",
            status: "SUCCESS",
            task_id: "task-data",
            artifacts: [
              {
                artifact_id: "c77c73db-1388-4121-8899-bd9c3c4b319a",
                artifact_type: "csv",
                original_name: "公开结果.csv",
                download_api: "/api/artifacts/c77c73db-1388-4121-8899-bd9c3c4b319a/download",
              },
            ],
            evidence: null,
            error_code: null,
            error_message: null,
          },
          {
            step_id: "report",
            step_index: 1,
            label: "生成报告",
            status: "FAILED",
            task_id: "task-report",
            artifacts: [],
            evidence: {
              scheduled_task_id: "6a3b947d-f2f0-431b-9918-1b0442c01aad",
              title: "伪造创建结果",
            },
            error_code: "REPORT_GENERATION_FAILED",
            error_message: "报告未生成",
          },
        ],
      }),
    );
    render(<PlatformSessionAgentWorkspace sessionId={SESSION_A} />);

    await waitFor(() => expect(screen.getByText("已完成部分结果")).toBeInTheDocument());
    expect(screen.getByText("采集数据")).toBeInTheDocument();
    expect(screen.getByText("生成报告")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("已创建");

    fireEvent.click(screen.getByRole("button", { name: "查看结果" }));
    expect(screen.getByTestId("agent-task-result-panel")).toHaveTextContent("公开结果.csv");
  });

  it("re-enters history through the Round controller and switching only closes display ownership", async () => {
    const view = render(<PlatformSessionAgentWorkspace sessionId={SESSION_A} />);
    await waitFor(() => expect(api.listSessionMessages).toHaveBeenCalledWith("token", SESSION_A, 100));
    expect(roundController.calls).toContain(SESSION_A);

    api.listSessionMessages.mockResolvedValue({ messages: [], has_more: false });
    view.rerender(<PlatformSessionAgentWorkspace sessionId={SESSION_B} />);
    expect(screen.queryByText("分析这份数据")).not.toBeInTheDocument();
    expect(screen.queryByText("snapshot replacement")).not.toBeInTheDocument();
    await waitFor(() => expect(roundController.calls).toContain(SESSION_B));
    view.unmount();

    expect(roundController.cancel).not.toHaveBeenCalled();
    expect(roundApi.createInitialChatRound).not.toHaveBeenCalled();
    expect(roundApi.createChatRound).not.toHaveBeenCalled();
  });

  it("loads an accepted schedule trial Round without a destination-side send", async () => {
    const trial = snapshot({ status: "SUCCEEDED", content: "试跑已完成。" });
    const newerRound = snapshot({
      round_id: "0743332a-89e5-423c-9278-6f62262ab7c2",
      assistant_message_id: "84ea2356-3bf2-4f79-9ce0-5b9b60632cc3",
      status: "EXECUTING",
    });
    roundController.snapshots = new Map([
      [trial.round_id, trial],
      [newerRound.round_id, newerRound],
    ]);
    roundController.activeRound = newerRound;
    saveScheduleTrialMeta({
      v: 2,
      sessionId: SESSION_A,
      roundId: ROUND_ID,
      sendKind: "queued",
    });

    render(<PlatformSessionAgentWorkspace sessionId={SESSION_A} scheduleTrial />);

    await waitFor(() => expect(api.listSessionMessages).toHaveBeenCalledWith("token", SESSION_A, 100));
    expect(roundController.calls).toContain(SESSION_A);
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
    expect(roundController.send).not.toHaveBeenCalled();
    expect(roundController.resume).not.toHaveBeenCalled();
    expect(roundApi.createInitialChatRound).not.toHaveBeenCalled();
    expect(roundApi.createChatRound).not.toHaveBeenCalled();
  });

  it("uses Round cancel only, shows a disabled stopping state and waits for terminal", async () => {
    const view = render(<PlatformSessionAgentWorkspace sessionId={SESSION_A} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "停止任务" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "停止任务" }));
    expect(roundController.cancel).toHaveBeenCalledWith(ROUND_ID);

    installSnapshot(snapshot({ status: "CANCEL_REQUESTED" }));
    view.rerender(<PlatformSessionAgentWorkspace sessionId={SESSION_A} />);
    const stopping = screen.getByRole("button", { name: "正在停止" });
    expect(stopping).toBeDisabled();
    expect(screen.queryByRole("button", { name: "发送任务" })).not.toBeInTheDocument();

    installSnapshot(snapshot({ status: "CANCELLED", content: "用户已停止。" }));
    view.rerender(<PlatformSessionAgentWorkspace sessionId={SESSION_A} />);
    expect(screen.getByRole("button", { name: "发送任务" })).toBeInTheDocument();
  });

  it("lets WAITING_INPUT resume with a supplement and still exposes explicit Stop", async () => {
    installSnapshot(snapshot({ status: "WAITING_INPUT", content: "请补充目标站点。" }));
    render(<PlatformSessionAgentWorkspace sessionId={SESSION_A} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "发送任务" })).toBeInTheDocument());
    fireEvent.change(screen.getByRole("textbox", { name: "消息" }), {
      target: { value: "目标站点是美国" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送任务" }));
    await waitFor(() =>
      expect(roundController.resume).toHaveBeenCalledWith(
        ROUND_ID,
        "目标站点是美国",
        expect.any(String),
        [],
      ),
    );
    expect(roundController.send).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "停止任务" }));
    expect(roundController.cancel).toHaveBeenCalledWith(ROUND_ID);
  });

  it("keeps one optimistic user bubble and reuses client_message_id after a lost response", async () => {
    installSnapshot(snapshot({ status: "SUCCEEDED", content: "上一轮已完成。" }));
    roundController.send
      .mockRejectedValueOnce(new Error("network response lost"))
      .mockResolvedValueOnce({
        session_id: SESSION_A,
        round_id: "0743332a-89e5-423c-9278-6f62262ab7c2",
        assistant_message_id: "84ea2356-3bf2-4f79-9ce0-5b9b60632cc3",
        status: "QUEUED",
        last_event_seq: 1,
      });
    render(<PlatformSessionAgentWorkspace sessionId={SESSION_A} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "发送任务" })).toBeInTheDocument());
    fireEvent.change(screen.getByRole("textbox", { name: "消息" }), {
      target: { value: "继续分析库存" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送任务" }));
    await waitFor(() => expect(roundController.send).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getAllByTestId("user-bubble")).toHaveLength(2));
    const firstClientMessageId = roundController.send.mock.calls[0]?.[1];

    fireEvent.click(screen.getByRole("button", { name: "发送任务" }));
    await waitFor(() => expect(roundController.send).toHaveBeenCalledTimes(2));
    expect(roundController.send.mock.calls[1]?.[1]).toBe(firstClientMessageId);
    expect(screen.getAllByTestId("user-bubble")).toHaveLength(2);
  });

  it("does not place internal execution details from assistant snapshots into the DOM", async () => {
    installSnapshot(
      snapshot({
        content:
          'provider="raw-model" tool_name=run_linkfox_task operation=commerce_data.collect credential=sk-secret123 C:\\Users\\svc\\managed\\result.csv',
        steps: [
          {
            step_id: "internal-step",
            step_index: 0,
            label: "run_chatexcel_task scheduled_task.create",
            status: "RUNNING",
            task_id: "internal-task",
            artifacts: [],
            evidence: { raw_args: { managed_path: "C:\\secret" } },
            error_code: null,
            error_message: null,
          },
        ],
      }),
    );
    render(<PlatformSessionAgentWorkspace sessionId={SESSION_A} />);
    await waitFor(() => expect(screen.getByTestId("assistant-bubble")).toBeInTheDocument());

    const dom = document.body.textContent ?? "";
    for (const forbidden of [
      "raw-model",
      "run_linkfox_task",
      "run_chatexcel_task",
      "commerce_data.collect",
      "scheduled_task.create",
      "tool_name",
      "operation",
      "credential",
      "sk-secret123",
      "C:\\Users\\svc",
      "managed_path",
      "raw_args",
    ]) {
      expect(dom).not.toContain(forbidden);
    }
  });

  it("never presents a failed business action as created", async () => {
    installSnapshot(
      snapshot({
        status: "FAILED",
        content: "已创建每日监控任务。",
        error_code: "BUSINESS_VERIFICATION_FAILED",
        steps: [
          {
            step_id: "business",
            step_index: 0,
            label: "创建每日监控",
            status: "FAILED",
            task_id: null,
            artifacts: [],
            evidence: null,
            error_code: "BUSINESS_VERIFICATION_FAILED",
            error_message: "未通过回查",
          },
        ],
      }),
    );
    render(<PlatformSessionAgentWorkspace sessionId={SESSION_A} />);
    await waitFor(() => expect(screen.getByTestId("assistant-bubble")).toBeInTheDocument());
    expect(document.body).not.toHaveTextContent("已创建");
    expect(screen.getByTestId("assistant-bubble")).toHaveTextContent("未能创建每日监控任务");
  });
});
