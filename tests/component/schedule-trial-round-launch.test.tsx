import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SchedulesWorkspace } from "@/components/schedules-workspace";
import { loadScheduleCreateDraft, loadScheduleTrialMeta } from "@/lib/schedule-create-draft";

const SESSION_ID = "f4159ee9-c863-41c8-9c1b-ffbfa193917f";
const ROUND_ID = "3da8ff9a-95e2-4f9e-9788-7fda3d450fe7";
const ASSISTANT_ID = "46aa60a5-64dd-471d-adfe-9856a3ee17c5";
const CLIENT_MESSAGE_ID = "a62430bc-1417-4b95-9432-937b331a7d7a";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  createInitialChatRound: vi.fn(),
  safeRandomUUID: vi.fn(() => "a62430bc-1417-4b95-9432-937b331a7d7a"),
  setActivePlatformSession: vi.fn(),
  createSession: vi.fn(),
  releaseSession: vi.fn(),
  fetchGroups: vi.fn(),
  fetchTasks: vi.fn(),
  getTask: vi.fn(),
  fetchRuns: vi.fn(),
}));

const platformAgent = vi.hoisted(() => ({
  auth: { accessToken: "access-token", userId: "user-1" },
  authHydrated: true,
  authValidated: true,
  platformSessionId: null,
  openLogin: vi.fn(),
  closeLogin: vi.fn(),
  loginWithPassword: vi.fn(),
  logout: vi.fn(),
  setActivePlatformSession: mocks.setActivePlatformSession,
  clearActivePlatformSession: vi.fn(),
  withFreshToken: vi.fn(async <T,>(run: (token: string) => Promise<T>) => run("fresh-token")),
}));

vi.mock("@/components/alice-shell", () => ({
  AliceShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/new-conversation-task-composer", () => ({
  NewConversationTaskComposer: ({
    value,
    onValueChange,
    onFilesSelected,
    onAttachmentsChange,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    onFilesSelected?: (files: FileList) => void;
    onAttachmentsChange?: (files: File[]) => void;
  }) => (
    <div>
      <textarea
        aria-label="任务输入编辑器"
        value={value}
        onChange={(event) => onValueChange(event.currentTarget.value)}
      />
      <input
        aria-label="试跑附件"
        type="file"
        multiple
        onChange={(event) => {
          if (event.currentTarget.files) {
            onAttachmentsChange?.(Array.from(event.currentTarget.files));
            if (!onAttachmentsChange) onFilesSelected?.(event.currentTarget.files);
          }
        }}
      />
    </div>
  ),
}));

vi.mock("@/components/platform-agent-provider", () => ({
  useOptionalPlatformAgent: () => platformAgent,
}));

vi.mock("@/lib/agent-runtime", () => ({ isPlatformBackendEnabled: () => true }));

vi.mock("@/lib/random-uuid", () => ({ safeRandomUUID: mocks.safeRandomUUID }));

vi.mock("@/lib/agent-api/chat-rounds", () => ({
  createInitialChatRound: mocks.createInitialChatRound,
}));

vi.mock("@/lib/agent-api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/agent-api/client")>("@/lib/agent-api/client");
  return {
    ...actual,
    createSession: mocks.createSession,
    releaseSession: mocks.releaseSession,
  };
});

vi.mock("@/lib/agent-api/scheduled-tasks", () => ({
  createUserScheduledTaskGroup: vi.fn(),
  createUserScheduledTask: vi.fn(),
  deleteUserScheduledTaskGroup: vi.fn(),
  deleteUserScheduledTask: vi.fn(),
  fetchAllScheduledTaskRuns: mocks.fetchRuns,
  deleteScheduledTaskRun: vi.fn(),
  fetchAllUserScheduledTaskGroups: mocks.fetchGroups,
  fetchAllUserScheduledTasks: mocks.fetchTasks,
  getUserScheduledTask: mocks.getTask,
  patchUserScheduledTask: vi.fn(),
  runUserScheduledTaskNow: vi.fn(),
}));

vi.mock("@/lib/agent-api/home-prompts", () => ({
  fetchHomePromptRecommendations: vi.fn().mockResolvedValue([]),
  fetchPublicPromptCategories: vi.fn().mockResolvedValue([]),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams("create=1&edit=task-existing"),
}));

const existingTask = {
  id: "task-existing",
  group_id: null,
  group_name: null,
  title: "美国站周监控",
  prompt_text: "旧提示词",
  enabled: true,
  recurrence: "daily",
  time_hhmm: "09:00",
  weekday: null,
  day_of_month: null,
  run_once_date: null,
  next_run_at: "2026-07-28T09:00:00Z",
  last_run_at: null,
  created_at: "2026-07-20T09:00:00Z",
  updated_at: "2026-07-20T09:00:00Z",
};

describe("schedule trial durable Round launch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mocks.fetchGroups.mockResolvedValue([]);
    mocks.fetchTasks.mockResolvedValue([existingTask]);
    mocks.getTask.mockResolvedValue(existingTask);
    mocks.fetchRuns.mockResolvedValue([]);
    platformAgent.withFreshToken.mockImplementation(
      async <T,>(run: (token: string) => Promise<T>) => run("fresh-token"),
    );
  });

  it("uploads the serialized prompt and files once, then stores v2 identity and navigates", async () => {
    let acceptRound!: (value: {
      session_id: string;
      round_id: string;
      assistant_message_id: string;
      status: string;
      last_event_seq: number;
    }) => void;
    mocks.createInitialChatRound.mockReturnValue(new Promise((resolve) => {
      acceptRound = resolve;
    }));
    const attachment = new File(["sku,stock\nA,3"], "inventory.csv", { type: "text/csv" });

    render(<SchedulesWorkspace />);

    const editor = await screen.findByLabelText("任务输入编辑器");
    await waitFor(() => expect(editor).toHaveValue("旧提示词"));
    fireEvent.change(editor, { target: { value: "更新后的试跑提示词" } });
    fireEvent.change(screen.getByLabelText("试跑附件"), { target: { files: [attachment] } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    fireEvent.click(await screen.findByRole("button", { name: "试运行" }));

    await waitFor(() => {
      expect(mocks.createInitialChatRound).toHaveBeenCalledWith(
        "fresh-token",
        "更新后的试跑提示词",
        CLIENT_MESSAGE_ID,
        [attachment],
      );
    });
    expect(mocks.createInitialChatRound).toHaveBeenCalledTimes(1);
    expect(mocks.safeRandomUUID).toHaveBeenCalledTimes(1);
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.releaseSession).not.toHaveBeenCalled();
    expect(mocks.setActivePlatformSession).not.toHaveBeenCalled();
    expect(loadScheduleTrialMeta()).toBeNull();
    expect(mocks.push).not.toHaveBeenCalled();

    acceptRound({
      session_id: SESSION_ID,
      round_id: ROUND_ID,
      assistant_message_id: ASSISTANT_ID,
      status: "QUEUED",
      last_event_seq: 1,
    });

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith(
        `/agent?sessionId=${SESSION_ID}&scheduleTrial=1`,
      );
    });
    expect(mocks.setActivePlatformSession).toHaveBeenCalledWith(SESSION_ID);
    expect(loadScheduleTrialMeta()).toEqual({
      v: 2,
      sessionId: SESSION_ID,
      roundId: ROUND_ID,
      sendKind: "queued",
    });
    expect(loadScheduleCreateDraft()).toEqual(expect.objectContaining({
      title: "美国站周监控",
      prompt: "更新后的试跑提示词",
      editingTaskId: "task-existing",
    }));
  });

  it("reuses identity for the same File refs but changes it for a new same-metadata File", async () => {
    const first = new File(["first payload"], "trial.csv", { type: "text/csv", lastModified: 4321 });
    const changed = new File(["other payload"], "trial.csv", { type: "text/csv", lastModified: 4321 });
    expect([changed.name, changed.size, changed.type, changed.lastModified]).toEqual([
      first.name,
      first.size,
      first.type,
      first.lastModified,
    ]);
    mocks.safeRandomUUID.mockReset();
    mocks.safeRandomUUID
      .mockReturnValueOnce(CLIENT_MESSAGE_ID)
      .mockReturnValue("0743332a-89e5-423c-9278-6f62262ab7c2");
    mocks.createInitialChatRound
      .mockRejectedValueOnce(new Error("first response lost"))
      .mockRejectedValueOnce(new Error("second response lost"))
      .mockResolvedValueOnce({
        session_id: SESSION_ID,
        round_id: ROUND_ID,
        assistant_message_id: ASSISTANT_ID,
        status: "QUEUED",
        last_event_seq: 1,
      });
    render(<SchedulesWorkspace />);

    const editor = await screen.findByLabelText("任务输入编辑器");
    await waitFor(() => expect(editor).toHaveValue("旧提示词"));
    fireEvent.change(editor, { target: { value: "重试试跑" } });
    fireEvent.change(screen.getByLabelText("试跑附件"), { target: { files: [first] } });

    const launch = async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      fireEvent.click(await screen.findByRole("button", { name: "试运行" }));
    };
    await launch();
    await waitFor(() => expect(mocks.createInitialChatRound).toHaveBeenCalledTimes(1));
    await launch();
    await waitFor(() => expect(mocks.createInitialChatRound).toHaveBeenCalledTimes(2));
    expect(mocks.createInitialChatRound.mock.calls[0]?.[2]).toBe(CLIENT_MESSAGE_ID);
    expect(mocks.createInitialChatRound.mock.calls[1]?.[2]).toBe(CLIENT_MESSAGE_ID);

    fireEvent.change(screen.getByLabelText("试跑附件"), { target: { files: [changed] } });
    await launch();
    await waitFor(() => expect(mocks.createInitialChatRound).toHaveBeenCalledTimes(3));
    expect(mocks.createInitialChatRound.mock.calls[2]?.[2]).toBe("0743332a-89e5-423c-9278-6f62262ab7c2");
    expect(mocks.createInitialChatRound.mock.calls[2]?.[3]).toEqual([changed]);
    expect(mocks.safeRandomUUID).toHaveBeenCalledTimes(2);
  });
});
