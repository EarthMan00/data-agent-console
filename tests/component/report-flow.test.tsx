import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReportView } from "@/components/report-view";
import { workspaceActions, workspaceStore } from "@/lib/workspace-store";

const push = vi.fn();
const routeState = vi.hoisted(() => ({ reportId: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(routeState.reportId ? `reportId=${routeState.reportId}` : ""),
}));

describe("report flow", () => {
  it("renders summary mode and can switch to the sheet tab", () => {
    const runId = workspaceActions.startPlatformTask({
      platformSessionId: "session-report-test",
      objective: "生成一份亚马逊选品报告",
      mode: "轻量模式",
      selectedCapabilities: ["amazon"],
    });
    const reportId = workspaceStore.getSnapshot().runs.find((item) => item.id === runId)?.reportId;
    if (!reportId) throw new Error("Failed to create report test fixture");
    routeState.reportId = reportId;

    render(<ReportView />);

    expect(screen.getByText("报告摘要")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "结构化表格" }));
    expect(screen.getByRole("button", { name: "保存为模板" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回任务页" })).toBeInTheDocument();
  });
});
