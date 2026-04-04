import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReportView } from "@/components/report-view";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams("reportId=report-default"),
}));

describe("report flow", () => {
  it("renders summary mode and can switch to the sheet tab", () => {
    render(<ReportView />);

    expect(screen.getByText("报告摘要")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "结构化表格" }));
    expect(screen.getByRole("button", { name: "保存为模板" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回任务页" })).toBeInTheDocument();
  });
});
