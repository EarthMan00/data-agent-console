import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SchedulesWorkspace } from "@/components/schedules-workspace";

const { push, searchParamsValue } = vi.hoisted(() => ({
  push: vi.fn(),
  searchParamsValue: { current: "workflowId=wf-1" },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(searchParamsValue.current),
}));

describe("schedules flow", () => {
  beforeEach(() => {
    push.mockReset();
    searchParamsValue.current = "workflowId=wf-1";
  });

  it("renders scheduled workflows with both primary tabs", () => {
    render(<SchedulesWorkspace />);

    expect(screen.getByRole("heading", { name: "定时任务" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "已定时" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "运行记录" })).toBeInTheDocument();
    expect(screen.getByText("美国站平板键盘套周监控")).toBeInTheDocument();
  });

  it("validates required fields in create mode", () => {
    searchParamsValue.current = "create=1";
    render(<SchedulesWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: "试运行" }));
    expect(screen.getByText("请先补全标题和提示词。")).toBeInTheDocument();
  });
});
