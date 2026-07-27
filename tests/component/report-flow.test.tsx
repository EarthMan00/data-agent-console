import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReportView } from "@/components/report-view";
import { workspaceActions, workspaceStore } from "@/lib/workspace-store";

const push = vi.fn();
const routeState = vi.hoisted(() => ({ reportId: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(routeState.reportId ? `reportId=${routeState.reportId}` : ""),
}));

describe("report flow", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("returns to the encoded real platform Session", () => {
    const platformSessionId = "f4159ee9-c863-41c8-9c1b-ffbfa193917f";
    const runId = workspaceActions.startPlatformTask({
      platformSessionId,
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
    fireEvent.click(screen.getByRole("button", { name: "返回任务页" }));
    expect(push).toHaveBeenCalledWith(
      `/agent?sessionId=${encodeURIComponent(platformSessionId)}`,
    );
  });

  it("hides return navigation when the run has no real platform Session", () => {
    const runId = workspaceActions.startPlatformTask({
      platformSessionId: "",
      objective: "生成一份亚马逊选品报告",
      mode: "轻量模式",
      selectedCapabilities: ["amazon"],
    });
    const reportId = workspaceStore.getSnapshot().runs.find((item) => item.id === runId)?.reportId;
    if (!reportId) throw new Error("Failed to create report test fixture");
    routeState.reportId = reportId;

    render(<ReportView />);

    expect(screen.queryByRole("button", { name: "返回任务页" })).not.toBeInTheDocument();
  });
});
