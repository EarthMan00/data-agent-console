import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TemplatesWorkspace } from "@/components/templates-workspace";

const { push, searchParamsValue, startTaskRun } = vi.hoisted(() => ({
  push: vi.fn(),
  searchParamsValue: { current: "templateId=p2" },
  startTaskRun: vi.fn(() => "run-new"),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(searchParamsValue.current),
}));

vi.mock("@/lib/mock/store", () => ({
  demoActions: {
    saveTemplateFromRun: vi.fn(() => "template-from-run"),
    createTemplate: vi.fn(() => "template-new"),
    startTaskRun,
  },
  useDemoState: () => ({
    currentRunId: "run-1",
    runs: [],
    templates: [
      { id: "p1", title: "赛道调研日报模板", body: "围绕类目趋势输出机会方向", summary: "默认模板摘要", scope: "默认", createdAt: "2026-03-23 14:18:12" },
      { id: "p2", title: "评论痛点收敛模板", body: "围绕评论痛点抽取高频负反馈", summary: "全部模板摘要", scope: "全部", createdAt: "2026-03-22 20:12:09" },
    ],
  }),
}));

describe("templates flow", () => {
  beforeEach(() => {
    push.mockReset();
    startTaskRun.mockReset();
    searchParamsValue.current = "templateId=p2";
  });

  it("renders empty state for unmatched search", () => {
    render(<TemplatesWorkspace />);
    fireEvent.change(screen.getByPlaceholderText("搜索任务指令"), { target: { value: "不存在的模板关键词" } });

    expect(screen.getByText("当前筛选下没有匹配的任务指令")).toBeInTheDocument();
  });

  it("opens the create dialog and starts a task from the visible template", () => {
    render(<TemplatesWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: "创建任务指令" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    fireEvent.click(screen.getByRole("button", { name: "默认" }));
    fireEvent.click(screen.getByRole("button", { name: "直接发起任务" }));
    expect(startTaskRun).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/agent?runId=run-new");
  });
});
