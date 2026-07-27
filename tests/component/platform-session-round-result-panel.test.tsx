import { type ReactNode } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PlatformSessionAgentWorkspace } from "@/components/agent-workspace/platform-session-agent-workspace";
import type { PlatformTaskArtifactRef } from "@/lib/agent-events";
import type { ChatRoundSnapshot, SessionMessageItem } from "@/lib/agent-api/types";

const SESSION_ID = "f4159ee9-c863-41c8-9c1b-ffbfa193917f";
const ROUND_ID = "3da8ff9a-95e2-4f9e-9788-7fda3d450fe7";
const ASSISTANT_ID = "46aa60a5-64dd-471d-adfe-9856a3ee17c5";
const FAVORITE_SOURCE_TASK_ID = "round-owned-task-credential-secret";

const roundController = vi.hoisted(() => ({
  snapshot: null as ChatRoundSnapshot | null,
  send: vi.fn(),
  resume: vi.fn(),
  cancel: vi.fn(),
  reload: vi.fn(),
}));

const api = vi.hoisted(() => ({
  listSessionMessages: vi.fn(),
  getFavoriteByTask: vi.fn(),
  createUserFavorite: vi.fn(),
  deleteUserFavorite: vi.fn(),
  downloadAuthorizedFile: vi.fn(),
}));

const agent = vi.hoisted(() => ({
  auth: { accessToken: "token", displayName: "Alice", userId: "user" },
  platformSessionId: "f4159ee9-c863-41c8-9c1b-ffbfa193917f",
  withFreshToken: vi.fn(async (run: (token: string) => Promise<unknown>) => run("round-token")),
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
  useChatRounds: () => ({
    snapshots: roundController.snapshot
      ? new Map([[roundController.snapshot.round_id, roundController.snapshot]])
      : new Map(),
    activeRound: roundController.snapshot,
    loading: false,
    error: "",
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
    getFavoriteByTask: api.getFavoriteByTask,
    createUserFavorite: api.createUserFavorite,
    deleteUserFavorite: api.deleteUserFavorite,
    downloadAuthorizedFile: api.downloadAuthorizedFile,
  };
});

vi.mock("@/lib/build-favorite-snapshot", () => ({
  buildFavoriteSnapshotFromArtifacts: vi.fn().mockResolvedValue({
    title: "公开数据结果",
    snapshot: { version: 2, sheets: [] },
    copy_artifact_id: null,
  }),
}));

vi.mock("@/lib/use-home-data-source-menu", () => ({
  useHomeDataSourceMenu: () => ({ dataSourceGroups: [], dataSourceItems: [], loaded: true }),
}));

vi.mock("@/lib/use-chat-stick-to-bottom", () => ({ useChatStickToBottom: vi.fn() }));

vi.mock("@/components/task-composer", () => ({
  TaskComposer: () => <div data-testid="task-composer" />,
}));

vi.mock("@/components/agent-workspace/chat-bubbles", () => ({
  SIMPLE_CHAT_COLUMN_MAX: "max-w-test",
  SimpleUserBubble: ({ text }: { text: string }) => <div>{text}</div>,
  SimpleAssistantBubble: ({ body, after }: { body: string; after?: ReactNode }) => (
    <div>
      <span>{body}</span>
      {after}
    </div>
  ),
}));

vi.mock("@/components/task-result-sheet-body", () => ({
  TaskResultSheetBody: () => <div data-testid="real-panel-sheet-body" />,
}));

vi.mock("@/components/task-single-data-preview", () => ({
  TaskSingleDataArtifactPreview: () => <div data-testid="real-panel-single-body" />,
}));

const persistedMessages: SessionMessageItem[] = [
  {
    id: "user-message",
    role: "user",
    content: "分析公开数据",
    created_at: "2026-07-27T00:00:00Z",
    message_index: 1,
    message_id: "client-message",
    meta: { round_id: ROUND_ID, client_message_id: "client-message" },
  },
  {
    id: ASSISTANT_ID,
    role: "assistant",
    content: "持久内容",
    created_at: "2026-07-27T00:00:01Z",
    message_index: 2,
    meta: { round_id: ROUND_ID },
  },
];

function maliciousPair(): PlatformTaskArtifactRef[] {
  return [
    {
      artifact_id: "public-pdf",
      artifact_type: "pdf",
      original_name: "公开摘要.pdf",
      download_api: "/api/chat-rounds/round-1/artifacts/public-pdf/download",
    },
    {
      artifact_id: "round-csv",
      artifact_type: "csv",
      original_name:
        "C:\\Users\\svc\\managed\\20260727-provider=raw-model operation=commerce_data.collect credential=sk-secret.csv",
      download_api: "/api/chat-rounds/round-1/artifacts/round-csv/download",
      raw_args: { managed_path: "C:\\secrets\\raw.csv" },
      provider: "internal-provider",
    } as unknown as PlatformTaskArtifactRef,
    {
      artifact_id: "round-json",
      artifact_type: "json",
      original_name:
        "/var/lib/agent/result_2_provider=raw-model operation=commerce_data.collect credential=sk-secret.json",
      download_api: "/api/chat-rounds/round-1/artifacts/round-json/download",
      capability: "run_linkfox_task",
      secret: "token-value",
    } as unknown as PlatformTaskArtifactRef,
  ];
}

function partialSnapshot(artifacts: PlatformTaskArtifactRef[]): ChatRoundSnapshot {
  return {
    round_id: ROUND_ID,
    session_id: SESSION_ID,
    status: "PARTIAL_SUCCESS",
    assistant_message_id: ASSISTANT_ID,
    content: "数据可用，报告生成失败。",
    last_event_seq: 8,
    steps: [
      {
        step_id: "data",
        step_index: 0,
        label: "采集公开数据",
        status: "SUCCESS",
        task_id: FAVORITE_SOURCE_TASK_ID,
        artifacts,
        evidence: null,
        error_code: null,
        error_message: null,
      },
      {
        step_id: "report",
        step_index: 1,
        label: "生成报告",
        status: "FAILED",
        task_id: "failed-report-task",
        artifacts: [],
        evidence: null,
        error_code: "REPORT_GENERATION_FAILED",
        error_message: "报告未生成",
      },
    ],
    error_code: "REPORT_GENERATION_FAILED",
    error_message: "报告未生成",
  };
}

describe("PlatformSessionAgentWorkspace real durable result panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listSessionMessages.mockResolvedValue({ messages: persistedMessages, has_more: false });
    api.getFavoriteByTask.mockResolvedValue({ favorited: false, favorite_id: null });
    api.createUserFavorite.mockResolvedValue({ id: "favorite-round-1" });
    api.deleteUserFavorite.mockResolvedValue(undefined);
    roundController.snapshot = partialSnapshot(maliciousPair());
  });

  it("opens earlier successful artifacts after report failure and safely downloads the active table/code Round artifact", async () => {
    render(<PlatformSessionAgentWorkspace sessionId={SESSION_ID} />);
    await waitFor(() => expect(screen.getByText("查看结果")).toBeInTheDocument());
    fireEvent.click(screen.getByText("查看结果"));

    const panel = await screen.findByTestId("agent-preview-panel");
    expect(within(panel).getByTestId("real-panel-sheet-body")).toBeInTheDocument();
    expect(within(panel).getAllByRole("tab")).toHaveLength(2);
    const dom = document.body.textContent ?? "";
    for (const forbidden of [
      "provider",
      "raw-model",
      "operation",
      "commerce_data.collect",
      "credential",
      "sk-secret",
      "run_linkfox_task",
      "token-value",
      "internal-provider",
      "raw_args",
      "managed_path",
      "C:\\Users\\svc",
      "C:\\secrets",
      "/var/lib/agent",
      FAVORITE_SOURCE_TASK_ID,
    ]) {
      expect(dom).not.toContain(forbidden);
    }

    const download = within(panel).getByRole("button", { name: "下载当前结果" });
    fireEvent.click(download);
    await waitFor(() => {
      expect(api.downloadAuthorizedFile).toHaveBeenLastCalledWith(
        "round-token",
        "/api/chat-rounds/round-1/artifacts/round-csv/download",
        "结果.csv",
      );
    });
    fireEvent.click(within(panel).getByRole("button", { name: "代码" }));
    fireEvent.click(download);
    await waitFor(() => {
      expect(api.downloadAuthorizedFile).toHaveBeenLastCalledWith(
        "round-token",
        "/api/chat-rounds/round-1/artifacts/round-json/download",
        "结果.json",
      );
    });
    expect(api.downloadAuthorizedFile.mock.calls.flat().join(" ")).not.toContain("/api/tasks/");
  });

  it("wires the successful Step task identity only to favorite read/create/delete", async () => {
    roundController.snapshot = partialSnapshot([
      {
        artifact_id: "round-csv",
        artifact_type: "csv",
        original_name: "公开结果.csv",
        download_api: "/api/chat-rounds/round-1/artifacts/round-csv/download",
      },
    ]);
    render(<PlatformSessionAgentWorkspace sessionId={SESSION_ID} />);
    await waitFor(() => expect(screen.getByText("查看结果")).toBeInTheDocument());
    fireEvent.click(screen.getByText("查看结果"));

    const panel = await screen.findByTestId("agent-preview-panel");
    await waitFor(() => {
      expect(api.getFavoriteByTask).toHaveBeenCalledWith("round-token", FAVORITE_SOURCE_TASK_ID);
    });
    const favorite = within(panel).getByRole("button", { name: "收藏报告" });
    expect(favorite).toBeEnabled();
    expect(panel).not.toHaveTextContent(FAVORITE_SOURCE_TASK_ID);
    fireEvent.click(favorite);
    await waitFor(() => {
      expect(api.createUserFavorite).toHaveBeenCalledWith(
        "round-token",
        expect.objectContaining({ source_task_id: FAVORITE_SOURCE_TASK_ID }),
      );
    });
    fireEvent.click(within(panel).getByRole("button", { name: "取消收藏报告" }));
    await waitFor(() => {
      expect(api.deleteUserFavorite).toHaveBeenCalledWith("round-token", "favorite-round-1");
    });
    expect(api.downloadAuthorizedFile).not.toHaveBeenCalled();
  });
});
