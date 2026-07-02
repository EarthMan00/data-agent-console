import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PlatformRoundStepTimeline } from "@/components/agent-workspace/platform-step-views";
import { ExecutionStepCard } from "@/components/execution-steps-monitor";

describe("ExecutionStepCard", () => {
  it("uses one warning tone for awaiting input status text", () => {
    render(
      <ExecutionStepCard
        step={{
          id: "awaiting-step",
          label: "1. 进入亚马逊美国站前台，围绕目标关键词搜索",
          order: 0,
          status: "awaiting_input",
          roundId: "round-1",
        }}
        stepIndex={0}
        total={2}
      />,
    );

    const card = screen.getByTestId("execution-step-card");
    const warningText = card.querySelector(".text-warning");
    expect(warningText).not.toBeNull();
    expect(warningText).toHaveTextContent("1. 进入亚马逊美国站前台，围绕目标关键词搜索");
  });

  it("does not highlight a completed step just because it is the last row", () => {
    render(
      <ExecutionStepCard
        step={{
          id: "done-step",
          label: "已完成步骤",
          order: 0,
          status: "done",
          roundId: "round-1",
        }}
        stepIndex={0}
        total={1}
      />,
    );

    const label = screen.getByText("已完成步骤");
    expect(label).toHaveClass("font-medium", "text-text-secondary");
    expect(label).not.toHaveClass("font-semibold", "text-foreground");
  });

  it("does not highlight completed result rows when the preview is active", () => {
    render(
      <PlatformRoundStepTimeline
        executionSteps={[
          {
            id: "step-1",
            label: "已完成的数据查询",
            order: 0,
            status: "done",
            roundId: "round-1",
          },
        ]}
        platformSubtasks={[
          {
            stepIndex: 0,
            stepId: "step-1",
            label: "已完成的数据查询",
            taskId: "task-1",
            outcome: "success",
            taskStatus: "SUCCESS",
            artifacts: [],
            zipDownloadApi: null,
          },
        ]}
        activeHighlightTaskId="task-1"
        runId="run-1"
      />,
    );

    const label = screen.getByText("已完成的数据查询");
    expect(label).toHaveClass("font-medium", "text-text-secondary");
    expect(label).not.toHaveClass("font-semibold", "text-foreground");
  });
});
