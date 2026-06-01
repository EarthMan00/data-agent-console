import { describe, expect, it } from "vitest";

import {
  assistantMessageHasVisibleContent,
  createStreamingAssistantMessage,
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
});
