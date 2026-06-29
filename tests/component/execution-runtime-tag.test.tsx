import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ExecutionRuntimeTag } from "@/components/execution-steps-monitor";

describe("ExecutionRuntimeTag", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-27T10:00:19.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("normalizes malformed wait hints and shows a single elapsed segment", () => {
    render(
      <ExecutionRuntimeTag
        steps={[
          {
            id: "step-1",
            roundId: "round-1",
            label: "查询亚马逊站点",
            order: 1,
            status: "running",
            runtimeHint: "数据查询?· 已等?0 ?19 ?",
            runtimeStartedAt: "2026-06-27T10:00:00.000Z",
          },
        ]}
      />,
    );

    const tag = screen.getByTestId("execution-runtime-tag");
    expect(tag).toHaveTextContent("数据查询 · 已等待 0 分 19 秒");
    expect(tag.textContent?.match(/已等待/g)?.length).toBe(1);
    expect(tag).not.toHaveTextContent("?");
  });
});
