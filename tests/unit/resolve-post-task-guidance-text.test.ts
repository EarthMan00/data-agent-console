import { describe, expect, it } from "vitest";

import type { SessionMessageItem } from "@/lib/agent-api/types";
import { sessionHasTaskCompletionSummaryMessage } from "@/lib/resolve-post-task-guidance-text";

function assistant(
  id: string,
  partial: Partial<SessionMessageItem> & { meta?: Record<string, unknown>; content?: string },
): SessionMessageItem {
  return {
    id,
    role: "assistant",
    content: partial.content ?? "",
    created_at: "2026-05-22T10:00:00Z",
    message_index: 0,
    meta: partial.meta ?? {},
    ...partial,
  };
}

describe("sessionHasTaskCompletionSummaryMessage", () => {
  it("detects completion summary with has_artifacts for matching task_id", () => {
    const messages: SessionMessageItem[] = [
      assistant("steps", {
        meta: {
          kind: "task_execution_steps",
          task_id: "task-1",
          steps: [{ id: "s1", label: "步骤一", status: "done" }],
        },
      }),
      assistant("completion", {
        content: "任务已完成，可以在右侧查看本轮任务结果和 CSV 数据。",
        meta: { task_id: "task-1", has_artifacts: true, task_status: "SUCCESS" },
      }),
    ];
    expect(sessionHasTaskCompletionSummaryMessage(messages, "task-1")).toBe(true);
    expect(sessionHasTaskCompletionSummaryMessage(messages, "task-2")).toBe(false);
  });

  it("ignores post_task_guidance and task_execution_steps", () => {
    const messages: SessionMessageItem[] = [
      assistant("guidance", {
        content: "【接下来您可以】\n1. 继续分析",
        meta: { kind: "post_task_guidance", task_id: "task-1" },
      }),
    ];
    expect(sessionHasTaskCompletionSummaryMessage(messages, "task-1")).toBe(false);
  });
});
