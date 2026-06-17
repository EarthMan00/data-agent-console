import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AliceMessageBubble } from "@/components/agent-workspace/chat-bubbles";
import { PostTaskGuidanceBubble } from "@/components/agent-workspace/post-task-guidance-bubble";

describe("assistant suggestion chips", () => {
  it("keeps clarification options as keyboard-operable buttons", () => {
    const onToggle = vi.fn();

    render(
      <AliceMessageBubble
        body={
          "执行前需要确认一个筛选条件：是否只保留 FBA 且评分高于 4.3 的商品？\n\n1. 只保留 FBA 且评分高于 4.3\n2. 保留全部配送方式，先按销量排序"
        }
        datetime="2026-06-14T10:26:20Z"
        onSuggestionToggle={onToggle}
      />,
    );

    const first = screen.getByRole("button", { name: "只保留 FBA 且评分高于 4.3" });
    const second = screen.getByRole("button", { name: "保留全部配送方式，先按销量排序" });

    expect(first).not.toHaveAttribute("role", "option");

    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(second).toHaveFocus();

    fireEvent.keyDown(second, { key: "Enter" });
    expect(onToggle).toHaveBeenCalledWith("保留全部配送方式，先按销量排序");
  });

  it("supports the same keyboard interaction for post-task guidance chips", () => {
    const onToggle = vi.fn();

    render(
      <PostTaskGuidanceBubble
        content={"【接下来您可以】\n1. 查看结果数据详情，并生成分析报告\n2. 对比不同竞品的关键词价值打分表现"}
        datetime="2026-06-14T10:26:20Z"
        onSuggestionToggle={onToggle}
      />,
    );

    const first = screen.getByRole("button", { name: "查看结果数据详情，并生成分析报告" });
    const second = screen.getByRole("button", { name: "对比不同竞品的关键词价值打分表现" });

    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(second).toHaveFocus();

    fireEvent.keyDown(second, { key: " " });
    expect(onToggle).toHaveBeenCalledWith("对比不同竞品的关键词价值打分表现");
  });
});
