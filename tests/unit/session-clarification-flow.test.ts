import { describe, expect, it } from "vitest";

import { analyzeSessionClarificationFlow } from "@/lib/session-clarification-flow";
import type { SessionMessageItem } from "@/lib/agent-api/types";

function msg(partial: Partial<SessionMessageItem> & Pick<SessionMessageItem, "id" | "role" | "content">): SessionMessageItem {
  return {
    created_at: "2026-03-28 12:00:00",
    message_index: 0,
    meta: undefined,
    ...partial,
  };
}

describe("analyzeSessionClarificationFlow", () => {
  it("detects clarify then supplement user for deferred task steps", () => {
    const messages: SessionMessageItem[] = [
      msg({ id: "u1", role: "user", content: "保温杯选品" }),
      msg({
        id: "a-steps",
        role: "assistant",
        content: "（以下为该轮任务的执行步骤记录）",
        meta: { kind: "task_execution_steps" },
      }),
      msg({
        id: "a-clarify",
        role: "assistant",
        content: '请确认关键词：\n- thermos\n- vacuum flask',
        meta: { kind: "linkfox_clarification" },
      }),
      msg({ id: "u2", role: "user", content: "vacuum flask" }),
    ];

    const flow = analyzeSessionClarificationFlow(messages);
    expect(flow.supplementUserMessageId).toBe("u2");
    expect(flow.clarificationMessageId).toBe("a-clarify");
    expect(flow.archivedClarification).toContain("vacuum flask");
  });
});
