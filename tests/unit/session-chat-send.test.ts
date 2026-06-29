import { describe, expect, it } from "vitest";

import {
  assistantMessageHasVisibleContent,
  createStreamingAssistantMessage,
  mergeFreshMessagesWithLocalPending,
  sessionHasAssistantThinkingPlaceholder,
  sessionHasVisibleInFlightAssistant,
  shouldShowAssistantThinkingPlaceholder,
} from "@/lib/session-chat-send";

describe("session-chat-send thinking placeholders", () => {
  it("empty streaming placeholder is not visible in-flight content", () => {
    const m = createStreamingAssistantMessage("stream-1", new Date().toISOString());
    expect(assistantMessageHasVisibleContent(m)).toBe(false);
    expect(sessionHasVisibleInFlightAssistant([m])).toBe(false);
  });

  it("shows thinking placeholder for empty streaming assistant", () => {
    const m = createStreamingAssistantMessage("stream-1", new Date().toISOString());
    expect(shouldShowAssistantThinkingPlaceholder(m, [m], 0, false)).toBe(true);
    expect(sessionHasAssistantThinkingPlaceholder([m], false)).toBe(true);
  });

  it("shows thinking for last empty assistant while sending after stream ends", () => {
    const m = {
      ...createStreamingAssistantMessage("stream-1", new Date().toISOString()),
      meta: {},
    };
    expect(shouldShowAssistantThinkingPlaceholder(m, [m], 0, true)).toBe(true);
  });

  it("keeps the optimistic user message and assistant placeholder when reload returns no persisted messages yet", () => {
    const now = new Date().toISOString();
    const optimisticUser = {
      id: "optimistic_user_1",
      role: "user" as const,
      content: "分析 cup 的前三爆品",
      created_at: now,
      message_index: 0,
      message_id: "mid-1",
    };
    const assistantPlaceholder = {
      ...createStreamingAssistantMessage("streaming_assistant_mid-1", now),
      meta: {},
    };

    expect(mergeFreshMessagesWithLocalPending([], [optimisticUser, assistantPlaceholder])).toEqual([
      optimisticUser,
      assistantPlaceholder,
    ]);
  });

  it("dedupes the optimistic user once the server echoes the same client message id", () => {
    const now = new Date().toISOString();
    const optimisticUser = {
      id: "optimistic_user_1",
      role: "user" as const,
      content: "分析 cup 的前三爆品",
      created_at: now,
      message_index: 0,
      message_id: "mid-1",
    };
    const persistedUser = {
      id: "server-user-1",
      role: "user" as const,
      content: "分析 cup 的前三爆品",
      created_at: now,
      message_index: 1,
      message_id: "mid-1",
    };
    const assistantPlaceholder = {
      ...createStreamingAssistantMessage("streaming_assistant_mid-1", now),
      meta: {},
    };

    expect(
      mergeFreshMessagesWithLocalPending([persistedUser], [optimisticUser, assistantPlaceholder]),
    ).toEqual([persistedUser, assistantPlaceholder]);
  });

  it("drops the local assistant placeholder once fresh assistant activity exists", () => {
    const now = new Date().toISOString();
    const optimisticUser = {
      id: "optimistic_user_1",
      role: "user" as const,
      content: "分析 cup 的前三爆品",
      created_at: now,
      message_index: 0,
      message_id: "mid-1",
    };
    const assistantPlaceholder = {
      ...createStreamingAssistantMessage("streaming_assistant_mid-1", now),
      meta: {},
    };
    const persistedUser = {
      id: "server-user-1",
      role: "user" as const,
      content: "分析 cup 的前三爆品",
      created_at: now,
      message_index: 1,
      message_id: "mid-1",
    };
    const taskStepsMessage = {
      id: "steps-1",
      role: "assistant" as const,
      content: "（以下为该轮任务的执行步骤记录）",
      created_at: now,
      message_index: 2,
      meta: { kind: "task_execution_steps" },
    };

    expect(
      mergeFreshMessagesWithLocalPending(
        [persistedUser, taskStepsMessage],
        [optimisticUser, assistantPlaceholder],
      ),
    ).toEqual([persistedUser, taskStepsMessage]);
  });
});
