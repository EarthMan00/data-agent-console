import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TaskExecutionStepsAssistantBubble } from "@/components/task-execution-steps-assistant-bubble";

describe("TaskExecutionStepsAssistantBubble", () => {
  it("lets users collapse and reopen the execution panel while a task is running", () => {
    render(
      <TaskExecutionStepsAssistantBubble
        datetime="2026-07-13T08:00:00.000Z"
        steps={[
          {
            id: "step-1",
            label: "在美国站筛选关键词",
            order: 0,
            status: "running",
            roundId: "round-1",
          },
        ]}
      />,
    );

    const panel = screen.getByTestId("platform-task-execution-panel");
    expect(within(panel).getByText("在美国站筛选关键词")).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: "收起任务执行" }));
    expect(within(panel).queryByText("在美国站筛选关键词")).not.toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: "展开任务执行" }));
    expect(within(panel).getByText("在美国站筛选关键词")).toBeInTheDocument();
  });
});
