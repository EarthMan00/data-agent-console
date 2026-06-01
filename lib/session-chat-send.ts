import type { Dispatch, SetStateAction } from "react";

import { sendChatMessageStream, uploadSessionAttachments } from "@/lib/agent-api/client";
import type { ChatSendResult, SessionMessageItem } from "@/lib/agent-api/types";
import { stripModelThinkingForStreamPartial, stripModelThinkingForUi } from "@/lib/strip-model-thinking";

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

/** 助手消息是否有可展示正文（过滤思考块后非空）。 */
export function assistantMessageHasVisibleContent(m: SessionMessageItem): boolean {
  if (m.role !== "assistant") return false;
  const raw = (m.content ?? "").trim();
  if (!raw) return false;
  const visible = isStreamingAssistantMessage(m)
    ? stripModelThinkingForStreamPartial(raw)
    : stripModelThinkingForUi(raw);
  const t = visible.trim();
  return t.length > 0 && t !== "（无回复）";
}

/** 发送/任务轮询进行中：是否已有可展示的助手回复（不含仅 streaming 标记的空占位）。 */
export function sessionHasVisibleInFlightAssistant(messages: SessionMessageItem[]): boolean {
  return messages.some((m) => assistantMessageHasVisibleContent(m));
}

/** 是否在消息列表中展示「思考中」占位（避免与底部全局 loading 重复）。 */
export function shouldShowAssistantThinkingPlaceholder(
  m: SessionMessageItem,
  messages: SessionMessageItem[],
  messageIndex: number,
  sending: boolean,
): boolean {
  if (m.role !== "assistant") return false;
  if (assistantMessageHasVisibleContent(m)) return false;
  if (isStreamingAssistantMessage(m)) return true;
  return sending && messageIndex === messages.length - 1;
}

export function sessionHasAssistantThinkingPlaceholder(
  messages: SessionMessageItem[],
  sending: boolean,
): boolean {
  return messages.some((m, i) => shouldShowAssistantThinkingPlaceholder(m, messages, i, sending));
}

export function finalizeStreamingAssistantMessage(
  setMessages: Dispatch<SetStateAction<SessionMessageItem[]>>,
  assistantStreamId: string,
) {
  setMessages((cur) =>
    cur.map((m) => {
      if (m.id !== assistantStreamId || !isStreamingAssistantMessage(m)) return m;
      const meta =
        m.meta && typeof m.meta === "object" && !Array.isArray(m.meta)
          ? { ...(m.meta as Record<string, unknown>) }
          : {};
      delete meta.streaming;
      return { ...m, meta };
    }),
  );
}

export async function sendSessionMessageStream(
  accessToken: string,
  sessionId: string,
  text: string,
  messageId: string,
  setMessages: Dispatch<SetStateAction<SessionMessageItem[]>>,
  assistantStreamId: string,
  files: File[] = [],
): Promise<ChatSendResult> {
  const attachmentIds =
    files.length > 0
      ? (await uploadSessionAttachments(accessToken, sessionId, files)).map((item) => item.attachment_id)
      : [];

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
        cur.map((m) => {
          if (m.id !== assistantStreamId) return m;
          const merged =
            cleaned && cleaned !== "（无回复）" ? cleaned : (m.content ?? "");
          return { ...m, content: merged, meta: { streaming: true } };
        }),
      );
    },
    onError: (message) => {
      const cleaned = stripModelThinkingForUi(message);
      setMessages((cur) =>
        cur.map((m) =>
          m.id === assistantStreamId
            ? {
                ...m,
                content: cleaned || "任务启动失败，请稍后重试。",
                meta: { streaming: false, kind: "model_error" },
              }
            : m,
        ),
      );
    },
  }, { attachmentIds });
}
