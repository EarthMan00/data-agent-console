import type { Dispatch, SetStateAction } from "react";

import { sendChatMessageStream, uploadSessionAttachments } from "@/lib/agent-api/client";
import type { ChatSendResult, SessionMessageItem } from "@/lib/agent-api/types";
import { streamSanitizeDeltaClient, stripModelThinkingForStreamPartial, stripModelThinkingForUi } from "@/lib/strip-model-thinking";

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

function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

export async function sendSessionMessageStream(
  accessToken: string,
  sessionId: string,
  text: string,
  messageId: string,
  setMessages: Dispatch<SetStateAction<SessionMessageItem[]>>,
  assistantStreamId: string,
  files: File[] = [],
  signal?: AbortSignal,
  onPersist?: (content: string) => void,
): Promise<ChatSendResult> {
  const attachmentIds =
    files.length > 0
      ? (await uploadSessionAttachments(accessToken, sessionId, files)).map((item) => item.attachment_id)
      : [];

  // 流式 thinking 清洗状态（对齐平台轮次的 streamSanitizeDeltaClient）
  let rawStreamAccum = "";
  let prevSanitizedStream = "";

  // SSE 完成后的全文（用于分块模拟送达以驱动打字机）
  let fullCleaned = "";

  try {
    return await sendChatMessageStream(accessToken, sessionId, text, messageId, {
      onDelta: (chunk) => {
        if (!chunk) return;
        rawStreamAccum += chunk;
        const { display } = streamSanitizeDeltaClient(prevSanitizedStream, rawStreamAccum);
        prevSanitizedStream = display;
      },
      onAssistantComplete: (full) => {
        fullCleaned = stripModelThinkingForUi(full);
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
    }, { attachmentIds, signal });
  } catch (e) {
    if (isAbortError(e)) {
      return { kind: "completed", session_id: sessionId, message: "" };
    }
    throw e;
  } finally {
    // 无论 SSE 是否被代理缓冲、是否异常，均以定时器逐块推进内容，
    // 确保打字机有稳定的增量渲染帧可消费
    const content = fullCleaned || prevSanitizedStream;
    if (content) {
      await _feedContentInChunks(setMessages, assistantStreamId, content, onPersist);
    }
    // 确保 streaming meta 在分块送达完成后才移除
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
}

/** 将全文按动画帧分块喂入消息，每次追加一小段以驱动打字机逐字展示。 */
async function _feedContentInChunks(
  setMessages: Dispatch<SetStateAction<SessionMessageItem[]>>,
  assistantStreamId: string,
  fullText: string,
  onPersist?: (content: string) => void,
): Promise<void> {
  const chars = [...fullText];
  if (chars.length === 0) return;
  const CHUNK = 3; // 每帧追加 3 个字符

  // 超时兜底：2 秒后如果还没完成，直接展示全文
  const FALLBACK_MS = 2000;
  let finished = false;

  return new Promise<void>((resolve) => {
    const fallbackTimer = setTimeout(() => {
      if (finished) return;
      finished = true;
      setMessages((cur) => {
        if (!cur.some((m) => m.id === assistantStreamId)) return cur;
        return cur.map((m) =>
          m.id === assistantStreamId
            ? { ...m, content: fullText, meta: { streaming: true } }
            : m,
        );
      });
      onPersist?.(fullText);
      resolve();
    }, FALLBACK_MS);

    let pos = 0;
    const tick = () => {
      if (finished) return;
      if (pos >= chars.length) {
        finished = true;
        clearTimeout(fallbackTimer);
        onPersist?.(fullText);
        resolve();
        return;
      }
      const piece = chars.slice(pos, pos + CHUNK).join("");
      pos += CHUNK;
      setMessages((cur) => {
        if (!cur.some((m) => m.id === assistantStreamId)) return cur;
        return cur.map((m) =>
          m.id === assistantStreamId
            ? { ...m, content: m.content + piece, meta: { streaming: true } }
            : m,
        );
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
