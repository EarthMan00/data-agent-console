import { render, screen } from "@testing-library/react";
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
    const warningText = card.querySelector(".text-warning");
    expect(warningText).not.toBeNull();
    expect(warningText).toHaveTextContent("1. 进入亚马逊美国站前台，围绕目标关键词搜索");
  });
});
