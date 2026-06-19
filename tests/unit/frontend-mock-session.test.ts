import { describe, expect, it } from "vitest";

import {
  getFrontendMockSessionMessages,
  mergeFrontendMockSessionMessages,
} from "@/lib/frontend-mock-session";
import type { SessionMessageItem } from "@/lib/agent-api/types";

describe("frontend mock session", () => {
  it("does not include system messages in the base mock session", () => {
    expect(getFrontendMockSessionMessages().some((message) => message.role === "system")).toBe(false);
  });

  it("filters cached system messages when merging mock session history", () => {
    const cachedSystemMessage: SessionMessageItem = {
      id: "cached-system-message",
      role: "system",
      content: "不应出现在聊天流里的系统消息",
      created_at: "2026-06-14T10:27:00.000+08:00",
      message_index: 99,
      meta: {},
    };

    const merged = mergeFrontendMockSessionMessages([cachedSystemMessage]);

    expect(merged.some((message) => message.id === cachedSystemMessage.id)).toBe(false);
    expect(merged.some((message) => message.role === "system")).toBe(false);
  });
});
