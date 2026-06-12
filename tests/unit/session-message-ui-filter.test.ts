import { describe, expect, it } from "vitest";

import { shouldHideAssistantMessageBubble } from "@/lib/session-message-ui-filter";
import type { SessionMessageItem } from "@/lib/agent-api/types";

function msg(partial: Partial<SessionMessageItem> & Pick<SessionMessageItem, "content">): SessionMessageItem {
  return {
    id: "m1",
    role: "assistant",
    created_at: new Date().toISOString(),
    message_index: 0,
    meta: {},
    ...partial,
  };
}

describe("shouldHideAssistantMessageBubble", () => {
  it("hides empty assistant bubbles and tool-only turn placeholders", () => {
    expect(
      shouldHideAssistantMessageBubble(
        msg({ content: "", meta: {} }),
      ),
    ).toBe(true);
    expect(
      shouldHideAssistantMessageBubble(
        msg({ content: "", meta: { kind: "tool_only_turn" } }),
      ),
    ).toBe(true);
  });

  it("hides multi-step plan and completion boilerplate", () => {
    expect(
      shouldHideAssistantMessageBubble(
        msg({ content: "已分析请求，将触发工具执行。" }),
      ),
    ).toBe(true);
    expect(
      shouldHideAssistantMessageBubble(
        msg({
          content:
            "已拆解为 2 个执行步骤（工具由模型指定），将按顺序依次完成。\n1. [run__task] 搜索",
        }),
      ),
    ).toBe(true);
    expect(
      shouldHideAssistantMessageBubble(
        msg({ content: "多步任务已全部完成，可以在右侧查看最后一步任务结果与数据。" }),
      ),
    ).toBe(true);
    expect(
      shouldHideAssistantMessageBubble(
        msg({
          content: "任务已完成，可以在右侧查看本轮任务结果和 CSV 数据。",
          meta: { task_id: "t1", tool_name: "run_linkfox_task", has_artifacts: true },
        }),
      ),
    ).toBe(true);
    expect(
      shouldHideAssistantMessageBubble(
        msg({
          content: "任务执行失败，错误信息已记录在任务结果中，可在右侧查看详情。",
          meta: { task_id: "t1", tool_name: "run_linkfox_task", has_artifacts: false },
        }),
      ),
    ).toBe(true);
  });

  it("shows orchestration_failure with user-readable reason", () => {
    expect(
      shouldHideAssistantMessageBubble(
        msg({
          content:
            "无法基于当前会话已有结果生成分析报告：未找到可分析的表格数据。请先完成数据采集，或将「查看结果并生成报告」与其它搜索需求分开发送。",
          meta: { kind: "orchestration_failure" },
        }),
      ),
    ).toBe(false);
  });

  it("keeps task_execution_steps messages", () => {
    expect(
      shouldHideAssistantMessageBubble(
        msg({
          content: "（以下为该轮任务的执行步骤记录）",
          meta: {
            kind: "task_execution_steps",
            task_id: "t1",
            steps: [{ id: "s1", order: 0, label: "步骤1", status: "done" }],
          },
        }),
      ),
    ).toBe(false);
  });

  it("keeps normal assistant replies", () => {
    expect(shouldHideAssistantMessageBubble(msg({ content: "这是模型直接回复的正文。" }))).toBe(false);
  });
});
