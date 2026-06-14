import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
    expect(within(card).getByText("步骤 1 / 2 · 待您补充信息")).toHaveClass("text-warning");
    expect(
      within(card).getByText("1. 进入亚马逊美国站前台，围绕目标关键词搜索"),
    ).toHaveClass("text-warning");
  });
});
