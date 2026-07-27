import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReportView } from "@/components/report-view";
import {
  workspaceActions,
  type Report,
  type TaskRun,
} from "@/lib/workspace-store";

const push = vi.fn();
const routeState = vi.hoisted(() => ({ reportId: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(routeState.reportId ? `reportId=${routeState.reportId}` : ""),
}));

let fixtureSequence = 0;

function seedReportFixture(platformSessionId?: string) {
  fixtureSequence += 1;
  const runId = `report-run-${fixtureSequence}`;
  const reportId = `report-${fixtureSequence}`;
  const previewKey = `preview-${fixtureSequence}`;
  const now = new Date().toISOString();
  const run: TaskRun = {
    id: runId,
    platformSessionId,
    reportId,
    title: "亚马逊选品报告",
    objective: "生成一份亚马逊选品报告",
    mode: "轻量模式",
    status: "success",
    startedAt: now,
    sections: [],
    notes: [],
    activePreviewId: previewKey,
    summaryTitle: "报告摘要",
    summaryBody: "报告已生成。",
    saved: false,
    starred: false,
  };
  const report: Report = {
    id: reportId,
    runId,
    title: "亚马逊选品报告",
    subtitle: "测试报告",
    mode: "sheet",
    summary: ["报告已生成。"],
    sheetTabs: [],
    sheetRows: [["商品", "销量"], ["示例", "100"]],
    generatedAt: now,
    previewKey,
  };
  workspaceActions.upsertRunSnapshot(run, report);
  return reportId;
}

describe("report flow", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("returns to the encoded real platform Session", () => {
    const platformSessionId = "f4159ee9-c863-41c8-9c1b-ffbfa193917f";
    routeState.reportId = seedReportFixture(platformSessionId);

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
    routeState.reportId = seedReportFixture();

    render(<ReportView />);

    expect(screen.queryByRole("button", { name: "返回任务页" })).not.toBeInTheDocument();
  });
});
