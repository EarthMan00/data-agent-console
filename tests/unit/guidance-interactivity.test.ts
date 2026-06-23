import { describe, expect, it } from "vitest";

import type { SessionMessageItem } from "@/lib/agent-api/types";
import {
  resolveDedicatedPostTaskGuidanceInSegment,
  resolveInteractiveGuidanceMessageId,
  resolveInteractiveGuidanceRoundId,
  resolveRoundPostTaskGuidanceContent,
  shouldDeferPostTaskGuidanceToStepsBubble,
  shouldRenderGuidanceBubbleAtMessage,
  shouldSuppressPlainAssistantBubbleForGuidance,
} from "@/lib/guidance-interactivity";

function guidanceMsg(id: string, index: number, kind = "post_task_guidance"): SessionMessageItem {
  return {
    id,
    role: "assistant",
    content: "【接下来您可以】\n1. 重新发送完整需求",
    created_at: new Date(Date.UTC(2026, 5, 20, index)).toISOString(),
    message_index: index,
    meta: { kind },
  };
}

function userMsg(id: string, index: number): SessionMessageItem {
  return {
    id,
    role: "user",
    content: "继续",
    created_at: new Date(Date.UTC(2026, 5, 20, index)).toISOString(),
    message_index: index,
    meta: {},
  };
}

describe("resolveInteractiveGuidanceMessageId", () => {
  it("returns latest guidance when no user message follows", () => {
    const messages = [guidanceMsg("g1", 1), guidanceMsg("g2", 3)];
    expect(resolveInteractiveGuidanceMessageId(messages)).toBe("g2");
  });

  it("returns null when user message follows latest guidance", () => {
    const messages = [guidanceMsg("g1", 1), guidanceMsg("g2", 3), userMsg("u1", 5)];
    expect(resolveInteractiveGuidanceMessageId(messages)).toBeNull();
  });

  it("includes synthetic terminated anchor", () => {
    const messages = [guidanceMsg("steps", 1), userMsg("u0", 2)];
    expect(
      resolveInteractiveGuidanceMessageId(messages, { syntheticTerminatedMessageId: "steps" }),
    ).toBeNull();
  });

  it("returns synthetic anchor when it is the latest and no user follows", () => {
    const messages = [userMsg("u0", 0), { ...guidanceMsg("steps", 1), meta: { kind: "task_execution_steps" } }];
    expect(
      resolveInteractiveGuidanceMessageId(messages, { syntheticTerminatedMessageId: "steps" }),
    ).toBe("steps");
  });
});

describe("shouldRenderGuidanceBubbleAtMessage", () => {
  it("renders only the latest guidance within the same user turn", () => {
    const messages = [
      userMsg("u0", 0),
      guidanceMsg("g1", 1),
      guidanceMsg("g2", 2),
    ];
    expect(shouldRenderGuidanceBubbleAtMessage(messages, 1)).toBe(false);
    expect(shouldRenderGuidanceBubbleAtMessage(messages, 2)).toBe(true);
  });

  it("prefers dedicated post_task_guidance over embedded guidance in the same turn", () => {
    const messages = [
      userMsg("u0", 0),
      {
        id: "legacy",
        role: "assistant" as const,
        content: "任务已完成\n\n【接下来您可以】\n1. 旧版内嵌引导",
        created_at: new Date(Date.UTC(2026, 5, 20, 1)).toISOString(),
        message_index: 1,
        meta: { task_id: "task-1" },
      },
      guidanceMsg("dedicated", 2),
    ];
    expect(shouldRenderGuidanceBubbleAtMessage(messages, 1)).toBe(false);
    expect(shouldRenderGuidanceBubbleAtMessage(messages, 2)).toBe(true);
  });

  it("keeps guidance from earlier turns visible", () => {
    const messages = [
      userMsg("u0", 0),
      guidanceMsg("g1", 1),
      userMsg("u1", 2),
      guidanceMsg("g2", 3),
    ];
    expect(shouldRenderGuidanceBubbleAtMessage(messages, 1)).toBe(true);
    expect(shouldRenderGuidanceBubbleAtMessage(messages, 3)).toBe(true);
  });
});

describe("resolveInteractiveGuidanceRoundId", () => {
  it("returns last round with guidance when no later rounds", () => {
    const rounds = [
      { roundId: "r1", postTaskGuidance: "【接下来您可以】\n1. A" },
      { roundId: "r2", postTaskGuidance: "【接下来您可以】\n1. B" },
    ];
    expect(resolveInteractiveGuidanceRoundId(rounds)).toBe("r2");
  });

  it("returns null when a later round exists", () => {
    const rounds = [
      { roundId: "r1", postTaskGuidance: "【接下来您可以】\n1. A" },
      { roundId: "r2", postTaskGuidance: "【接下来您可以】\n1. B" },
      { roundId: "r3", postTaskGuidance: null },
    ];
    expect(resolveInteractiveGuidanceRoundId(rounds)).toBeNull();
  });

  it("returns null when supplemental user messages exist on last guidance round", () => {
    const rounds = [
      {
        roundId: "r1",
        postTaskGuidance: "【接下来您可以】\n1. A",
        supplementalUserMessages: [{ text: "补充" }],
      },
    ];
    expect(resolveInteractiveGuidanceRoundId(rounds)).toBeNull();
  });
});

describe("shouldSuppressPlainAssistantBubbleForGuidance", () => {
  it("suppresses dedicated and embedded guidance source messages", () => {
    expect(shouldSuppressPlainAssistantBubbleForGuidance({ kind: "none" })).toBe(false);
    expect(shouldSuppressPlainAssistantBubbleForGuidance({ kind: "dedicated" })).toBe(true);
    expect(shouldSuppressPlainAssistantBubbleForGuidance({ kind: "embedded" })).toBe(true);
  });
});

describe("resolveRoundPostTaskGuidanceContent", () => {
  it("reads dedicated post_task_guidance in the same user turn", () => {
    const messages: SessionMessageItem[] = [
      userMsg("u1", 0),
      {
        id: "steps",
        role: "assistant",
        content: "（以下为该轮任务的执行步骤记录）",
        created_at: "2026-05-22T10:00:00Z",
        message_index: 1,
        meta: {
          kind: "task_execution_steps",
          task_id: "task-1",
          steps: [{ id: "s1", label: "分析", status: "done" }],
        },
      },
      guidanceMsg("g1", 2),
    ];
    const hit = resolveRoundPostTaskGuidanceContent(messages, 1, { taskId: "task-1" });
    expect(hit?.messageId).toBe("g1");
    expect(hit?.content).toContain("重新发送完整需求");
  });

  it("defers standalone post_task_guidance when steps bubble should own guidance", () => {
    const messages: SessionMessageItem[] = [
      userMsg("u1", 0),
      {
        id: "steps",
        role: "assistant",
        content: "（以下为该轮任务的执行步骤记录）",
        created_at: "2026-05-22T10:00:00Z",
        message_index: 1,
        meta: {
          kind: "task_execution_steps",
          task_id: "task-1",
          steps: [{ id: "s1", label: "分析", status: "done" }],
        },
      },
      guidanceMsg("g1", 2),
    ];
    expect(shouldDeferPostTaskGuidanceToStepsBubble(messages, 2, "steps")).toBe(true);
    expect(shouldRenderGuidanceBubbleAtMessage(messages, 2)).toBe(true);
  });
});
