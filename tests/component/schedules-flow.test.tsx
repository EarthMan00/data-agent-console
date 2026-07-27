import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SchedulesWorkspace } from "@/components/schedules-workspace";
import { AGENT_COMPOSER_PREFILL_STORAGE_KEY } from "@/lib/agent-api/session";

const {
  push,
  searchParamsValue,
  withFreshToken,
  mockCreateUserScheduledTask,
  mockFetchAllUserScheduledTaskGroups,
  mockFetchAllUserScheduledTasks,
  mockFetchAllScheduledTaskRuns,
  mockFetchHomePromptRecommendations,
  mockFetchPublicPromptCategories,
  mockRunUserScheduledTaskNow,
  platformAgent,
} = vi.hoisted(() => {
  const withFreshToken = vi.fn();
  return {
    push: vi.fn(),
    searchParamsValue: { current: "workflowId=wf-1" },
    withFreshToken,
    mockCreateUserScheduledTask: vi.fn(),
    mockFetchAllUserScheduledTaskGroups: vi.fn(),
    mockFetchAllUserScheduledTasks: vi.fn(),
    mockFetchAllScheduledTaskRuns: vi.fn(),
    mockFetchHomePromptRecommendations: vi.fn(),
    mockFetchPublicPromptCategories: vi.fn(),
    mockRunUserScheduledTaskNow: vi.fn(),
    platformAgent: {
      auth: { accessToken: "access-token" },
      withFreshToken,
    },
  };
});

vi.mock("@/components/alice-shell", () => ({
  AliceShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/new-conversation-task-composer", () => ({
  NewConversationTaskComposer: ({
    value,
    onValueChange,
    placeholder,
    containerClassName,
    dataSourceGroups,
    dataSourceItems,
    selectedSourceIds,
    sourceMenuSide,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
    containerClassName?: string;
    dataSourceGroups?: Array<{ label: string }>;
    dataSourceItems?: Array<{ label: string }>;
    selectedSourceIds?: string[];
    sourceMenuSide?: string;
  }) => (
    <textarea
      aria-label="任务输入编辑器"
      data-container-class={containerClassName}
      data-source-group-labels={(dataSourceGroups ?? []).map((group) => group.label).join("|")}
      data-source-item-labels={(dataSourceItems ?? []).map((item) => item.label).join("|")}
      data-selected-source-ids={(selectedSourceIds ?? []).join("|")}
      data-source-menu-side={sourceMenuSide}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onValueChange(event.currentTarget.value)}
    />
  ),
}));

vi.mock("@/components/platform-agent-provider", () => ({
  useOptionalPlatformAgent: () => platformAgent,
}));

vi.mock("@/lib/agent-runtime", () => ({
  isPlatformBackendEnabled: () => true,
}));

vi.mock("@/lib/agent-api/scheduled-tasks", () => ({
  createUserScheduledTask: mockCreateUserScheduledTask,
  createUserScheduledTaskGroup: vi.fn(),
  deleteScheduledTaskRun: vi.fn(),
  deleteUserScheduledTask: vi.fn(),
  deleteUserScheduledTaskGroup: vi.fn(),
  fetchAllScheduledTaskRuns: mockFetchAllScheduledTaskRuns,
  fetchAllUserScheduledTaskGroups: mockFetchAllUserScheduledTaskGroups,
  fetchAllUserScheduledTasks: mockFetchAllUserScheduledTasks,
  getUserScheduledTask: vi.fn(),
  patchUserScheduledTask: vi.fn(),
  runUserScheduledTaskNow: mockRunUserScheduledTaskNow,
}));

vi.mock("@/lib/agent-api/home-prompts", () => ({
  fetchHomePromptRecommendations: mockFetchHomePromptRecommendations,
  fetchPublicPromptCategories: mockFetchPublicPromptCategories,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(searchParamsValue.current),
}));

const existingTask = {
  id: "task-existing",
  group_id: null,
  group_name: null,
  title: "美国站平板键盘套周监控",
  prompt_text: "监控关键词变化",
  enabled: true,
  recurrence: "daily",
  time_hhmm: "09:00",
  weekday: null,
  day_of_month: null,
  run_once_date: null,
  next_run_at: "2026-06-22T09:00:00Z",
  last_run_at: null,
  created_at: "2026-06-20T09:00:00Z",
  updated_at: "2026-06-20T09:00:00Z",
};

const scheduledRun = {
  id: "scheduled-run-1",
  task_id: "scheduled-task-filter-id",
  trigger_type: "schedule",
  status: "success",
  session_id: "f4159ee9-c863-41c8-9c1b-ffbfa193917f",
  started_at: "2026-07-27T00:00:00Z",
  finished_at: "2026-07-27T00:01:00Z",
  error_message: null,
  task_title_snapshot: "美国站日报",
  prompt_snapshot: "生成日报",
  group_name_snapshot: null,
  meta: {
    result_artifact_count: 2,
    task_id: "legacy-skill-task",
    round_id: "untyped-round-id-must-not-be-guessed",
  },
  created_at: "2026-07-27T00:00:00Z",
};

function fillRequiredCreateFields() {
  fireEvent.change(screen.getByPlaceholderText("请输入任务名称"), { target: { value: "测试任务" } });
  fireEvent.change(screen.getByLabelText("任务输入编辑器"), { target: { value: "测试提示词" } });
}

describe("schedules flow", () => {
  beforeEach(() => {
    push.mockReset();
    searchParamsValue.current = "workflowId=wf-1";
    withFreshToken.mockReset();
    withFreshToken.mockImplementation(async (fn: (token: string) => Promise<void>) => {
      await fn("test-token");
    });
    mockFetchAllUserScheduledTaskGroups.mockReset();
    mockFetchAllUserScheduledTaskGroups.mockResolvedValue([]);
    mockFetchAllUserScheduledTasks.mockReset();
    mockFetchAllUserScheduledTasks.mockResolvedValue([existingTask]);
    mockFetchAllScheduledTaskRuns.mockReset();
    mockFetchAllScheduledTaskRuns.mockResolvedValue([]);
    mockFetchPublicPromptCategories.mockReset();
    mockFetchPublicPromptCategories.mockResolvedValue([
      { id: "source-keepa", name: "Keepa", sort_order: 1 },
    ]);
    mockFetchHomePromptRecommendations.mockReset();
    mockFetchHomePromptRecommendations.mockResolvedValue([
      {
        id: "dynamic-keepa-search",
        title: "动态 Keepa 搜索",
        description: "来自后端提示词推荐的数据源。",
        prompt: "@后端动态Keepa工具 查询商品",
        meta: "",
        capability_ids: ["后端动态Keepa工具"],
        replay_run_id: null,
        replay_share_id: null,
        sort_order: 1,
      },
    ]);
    mockCreateUserScheduledTask.mockReset();
    mockCreateUserScheduledTask.mockResolvedValue({ ...existingTask, id: "task-new", title: "测试任务" });
    mockRunUserScheduledTaskNow.mockReset();
    mockRunUserScheduledTaskNow.mockResolvedValue({ status: "accepted" });
    sessionStorage.clear();
  });

  it("renders scheduled workflows with both primary tabs", async () => {
    render(<SchedulesWorkspace />);

    expect(screen.getByRole("heading", { name: "定时任务" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "已定时" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "运行记录" })).toBeInTheDocument();
    expect(await screen.findByText("美国站平板键盘套周监控")).toBeInTheDocument();
  });

  it("opens scheduled result artifacts through the canonical Session without a Task query", async () => {
    mockFetchAllScheduledTaskRuns.mockResolvedValue([scheduledRun]);
    render(<SchedulesWorkspace />);

    await userEvent.click(screen.getByRole("tab", { name: "运行记录" }));
    const openResult = await screen.findByRole("button", { name: "查看并下载报告" });
    fireEvent.click(openResult);

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(
        "/agent?sessionId=f4159ee9-c863-41c8-9c1b-ffbfa193917f&scheduledRunRecord=1&runLabel=%E7%BE%8E%E5%9B%BD%E7%AB%99%E6%97%A5%E6%8A%A5",
      );
    });
    const destination = String(push.mock.calls.at(-1)?.[0] ?? "");
    expect(destination).not.toContain("taskId");
    expect(destination).not.toContain("roundId");
    expect(destination).not.toContain("legacy-skill-task");
  });

  it("does not navigate when result artifacts have no canonical Session", async () => {
    mockFetchAllScheduledTaskRuns.mockResolvedValue([
      { ...scheduledRun, id: "scheduled-run-without-session", session_id: null },
    ]);
    render(<SchedulesWorkspace />);

    await userEvent.click(screen.getByRole("tab", { name: "运行记录" }));
    const openResult = await screen.findByRole("button", { name: "查看并下载报告" });
    await userEvent.click(openResult);

    expect(push).not.toHaveBeenCalled();
    expect(
      await screen.findByText("该记录缺少关联会话，无法查看或下载报告"),
    ).toBeInTheDocument();
  });

  it("shows immediate-run create controls by default", () => {
    searchParamsValue.current = "create=1";
    render(<SchedulesWorkspace />);

    expect(screen.getByRole("checkbox", { name: "立即运行" })).toBeChecked();
    expect(screen.queryByRole("button", { name: "试运行" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "取消" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建" })).toBeDisabled();
    expect(screen.getByLabelText("任务输入编辑器").getAttribute("data-container-class")).toContain("!rounded-[10px]");
    expect(screen.getByLabelText("任务输入编辑器").getAttribute("data-container-class")).toContain("sm:!rounded-[10px]");
    expect(screen.getByLabelText("任务输入编辑器")).toHaveAttribute("data-source-menu-side", "top");
  });

  it("uses the same dynamic datasource menu data as the new conversation composer", async () => {
    searchParamsValue.current = "create=1";
    render(<SchedulesWorkspace />);

    const editor = screen.getByLabelText("任务输入编辑器");
    await waitFor(() => {
      expect(editor.getAttribute("data-source-item-labels")).toContain("后端动态Keepa工具");
    });
    expect(editor.getAttribute("data-source-group-labels")).toContain("Keepa");
  });

  it("parses stored prompt prefill with the dynamic datasource list", async () => {
    searchParamsValue.current = "create=1";
    sessionStorage.setItem(AGENT_COMPOSER_PREFILL_STORAGE_KEY, "@后端动态Keepa工具 查询运动水杯");
    render(<SchedulesWorkspace />);

    const editor = screen.getByLabelText("任务输入编辑器");
    await waitFor(() => {
      expect(editor).toHaveValue("查询运动水杯");
      expect(editor.getAttribute("data-selected-source-ids")).toBe("后端动态Keepa工具");
    });
  });

  it("keeps the create dialog at a fixed height", () => {
    searchParamsValue.current = "create=1";
    render(<SchedulesWorkspace />);

    expect(screen.getByRole("dialog")).toHaveClass("h-schedule-dialog");
  });

  it("creates the schedule and runs it once when immediate run is checked", async () => {
    searchParamsValue.current = "create=1";
    render(<SchedulesWorkspace />);

    fillRequiredCreateFields();
    const createButton = screen.getByRole("button", { name: "创建" });
    await waitFor(() => {
      expect(createButton).toBeEnabled();
    });
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(mockCreateUserScheduledTask).toHaveBeenCalledWith(
        "test-token",
        expect.objectContaining({
          title: "测试任务",
          prompt_text: "测试提示词",
          enabled: true,
          recurrence: "daily",
        }),
      );
    });
    expect(mockRunUserScheduledTaskNow).toHaveBeenCalledWith("test-token", "task-new");
  });

  it("creates without running when immediate run is unchecked", async () => {
    searchParamsValue.current = "create=1";
    render(<SchedulesWorkspace />);

    fireEvent.click(screen.getByRole("checkbox", { name: "立即运行" }));
    fillRequiredCreateFields();
    const createButton = screen.getByRole("button", { name: "创建" });
    await waitFor(() => {
      expect(createButton).toBeEnabled();
    });
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(mockCreateUserScheduledTask).toHaveBeenCalledTimes(1);
    });
    expect(mockRunUserScheduledTaskNow).not.toHaveBeenCalled();
  });
});
