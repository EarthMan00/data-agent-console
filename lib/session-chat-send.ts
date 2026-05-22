import type { Dispatch, SetStateAction } from "react";

import { sendChatMessageStream } from "@/lib/agent-api/client";
import type { ChatSendResult, SessionMessageItem } from "@/lib/agent-api/types";
import { stripModelThinkingForUi } from "@/lib/strip-model-thinking";

export function createStreamingAssistantMessage(id: string, createdAt: string): SessionMessageItem {
  return {
    id,
    role: "assistant",
    content: "",
    created_at: createdAt,
    message_index: 0,
    meta: { streaming: true },
  };
}

export function isStreamingAssistantMessage(m: SessionMessageItem): boolean {
  const meta = m.meta && typeof m.meta === "object" ? (m.meta as Record<string, unknown>) : null;
  return Boolean(meta?.streaming);
}

export async function sendSessionMessageStream(
  accessToken: string,
  sessionId: string,
  text: string,
  messageId: string,
  setMessages: Dispatch<SetStateAction<SessionMessageItem[]>>,
  assistantStreamId: string,
): Promise<ChatSendResult> {
  return sendChatMessageStream(accessToken, sessionId, text, messageId, {
    onDelta: (chunk) => {
      if (!chunk) return;
      setMessages((cur) =>
        cur.map((m) => (m.id === assistantStreamId ? { ...m, content: `${m.content}${chunk}` } : m)),
      );
    },
    onAssistantComplete: (full) => {
      const cleaned = stripModelThinkingForUi(full);
      setMessages((cur) =>
        cur.map((m) =>
          m.id === assistantStreamId
            ? { ...m, content: cleaned, meta: { streaming: false } }
            : m,
        ),
      );
    },
  });
}
