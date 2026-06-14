import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AgentTaskResultPanel } from "@/components/agent-task-result-panel";

describe("AgentTaskResultPanel", () => {
  it("uses color-text-1 for the active chat Excel sheet tab", () => {
    render(
      <AgentTaskResultPanel
        onClose={vi.fn()}
        subtaskResultTabs={[
          { taskId: "qa", label: "汇总 QA 检查项" },
          { taskId: "listing", label: "生成标题与五点描述版本" },
        ]}
        activeSubtaskTaskId="qa"
        onSubtaskSelect={vi.fn()}
      />,
    );

    const activeTab = screen.getByRole("tab", { name: "汇总 QA 检查项" });
    expect(activeTab).toHaveClass("text-[var(--color-text-1)]");
    expect(activeTab).not.toHaveClass("text-success");
    expect(activeTab.querySelector("[aria-hidden='true']")).toHaveClass("bg-[var(--color-text-1)]");
  });
});
