import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { push, searchParamsValue } = vi.hoisted(() => ({
  push: vi.fn(),
  searchParamsValue: { current: "workflowId=wf-1" },
}));

const scheduledTaskMocks = vi.hoisted(() => ({
  fetchAllUserScheduledTaskGroups: vi.fn(),
  fetchAllUserScheduledTasks: vi.fn(),
  fetchAllScheduledTaskRuns: vi.fn(),
}));

const platformAgentMock = vi.hoisted(() => ({
  auth: { accessToken: "test-token" },
  withFreshToken: vi.fn(async <T,>(fn: (token: string) => Promise<T>) => fn("test-token")),
  beginNewHomeTaskSession: vi.fn(),
  setActivePlatformSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(searchParamsValue.current),
}));

vi.mock("@/components/more-data-shell", () => ({
  MoreDataShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/platform-agent-provider", () => ({
  useOptionalPlatformAgent: () => platformAgentMock,
}));

vi.mock("@/lib/agent-runtime", () => ({
  isPlatformBackendEnabled: () => true,
}));

vi.mock("@/lib/schedule-next-run", () => ({
  computeNextRunForCreateBody: () => new Date("2026-06-15T04:00:00Z"),
  defaultNearestHalfHourHhmm: () => "04:00",
  runOnceDateYmdImpliedToday: () => false,
}));

vi.mock("@/components/task-composer", () => ({
  TaskComposer: ({ value, onValueChange }: { value: string; onValueChange: (value: string) => void }) => (
    <textarea
      aria-label="提示词"
      value={value}
      onChange={(event) => onValueChange(event.currentTarget.value)}
    />
  ),
}));

vi.mock("@/components/schedule-result-push", () => ({
  ScheduleResultPushSection: ({ onConfigSnapshot }: { onConfigSnapshot?: (payload: { blocks: Array<{ id: string; type: string; webhook: string; signSecret: string }> }) => void }) => {
    onConfigSnapshot?.({
      blocks: [{ id: "feishu-1", type: "feishu", webhook: "", signSecret: "" }],
    });
    return <div>结果推送</div>;
  },
  validateResultPushBlocks: (blocks: Array<{ type: string; webhook?: string }>) =>
    blocks.some((block) => block.type === "feishu" && !block.webhook?.trim())
      ? "请填写飞书的 Webhook 地址。"
      : null,
}));

vi.mock("@/lib/agent-api/scheduled-tasks", () => ({
  ...scheduledTaskMocks,
  createUserScheduledTaskGroup: vi.fn(),
  deleteUserScheduledTaskGroup: vi.fn(),
  deleteUserScheduledTask: vi.fn(),
  getUserScheduledTask: vi.fn(),
  patchUserScheduledTask: vi.fn(),
  runUserScheduledTaskNow: vi.fn(),
}));

import { SchedulesWorkspace } from "@/components/schedules-workspace";

describe("schedules flow", () => {
  beforeEach(() => {
    push.mockReset();
    platformAgentMock.withFreshToken.mockClear();
    platformAgentMock.beginNewHomeTaskSession.mockReset();
    platformAgentMock.setActivePlatformSession.mockReset();
    searchParamsValue.current = "workflowId=wf-1";
    scheduledTaskMocks.fetchAllUserScheduledTaskGroups.mockResolvedValue([
      { id: "g1", name: "默认", created_at: "2026-06-01T00:00:00Z", updated_at: "2026-06-01T00:00:00Z" },
    ]);
    scheduledTaskMocks.fetchAllUserScheduledTasks.mockResolvedValue([
      {
        id: "task-1",
        group_id: null,
        group_name: "默认",
        title: "美国站平板键盘套周监控",
        prompt_text: "监控关键词",
        enabled: true,
        recurrence: "daily",
        time_hhmm: "04:00",
        weekday: null,
        day_of_month: null,
        run_once_date: null,
        next_run_at: "2026-06-15T04:00:00Z",
        last_run_at: null,
        result_push_config: null,
        created_at: "2026-06-01T00:00:00Z",
        updated_at: "2026-06-01T00:00:00Z",
      },
    ]);
    scheduledTaskMocks.fetchAllScheduledTaskRuns.mockResolvedValue([]);
  });

  it("renders scheduled workflows with both primary tabs", async () => {
    render(<SchedulesWorkspace />);

    expect(screen.getByRole("heading", { name: "定时任务" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "已定时" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "运行记录" })).toBeInTheDocument();
    expect(await screen.findByText("美国站平板键盘套周监控")).toBeInTheDocument();
  });

  it("shows webhook validation notice inside the create dialog", async () => {
    searchParamsValue.current = "create=1";
    render(<SchedulesWorkspace />);

    fireEvent.change(screen.getByPlaceholderText("请输入任务名称"), { target: { value: "每日任务" } });
    fireEvent.change(screen.getByLabelText("提示词"), { target: { value: "生成报告" } });
    fireEvent.click(screen.getByRole("button", { name: "高级设置" }));
    expect(screen.getByText("结果推送")).toBeInTheDocument();

    const submit = screen.getByRole("button", { name: "试运行" });
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);

    const dialog = screen.getByRole("dialog", { name: "创建定时任务" });
    await waitFor(() => {
      expect(within(dialog).getByRole("alert")).toHaveTextContent("请填写飞书的 Webhook 地址。");
    });
    expect(screen.getAllByText("请填写飞书的 Webhook 地址。")).toHaveLength(1);
  });
});
