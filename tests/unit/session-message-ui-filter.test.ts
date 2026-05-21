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
  it("hides multi-step plan and completion boilerplate", () => {
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
