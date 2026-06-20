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
  /** 读取当前已展示的字符数（用于 chunk 兜底追赶） */
  getDisplayedLen?: () => number,
  /** 当前会话是否仍活跃（用于 finally 守卫，避免卸载后 setMessages） */
  isCurrent?: () => boolean,
  capabilityIds: string[] = [],
): Promise<ChatSendResult> {
  const attachmentIds =
    files.length > 0
      ? (await uploadSessionAttachments(accessToken, sessionId, files)).map((item) => item.attachment_id)
      : [];

  // 流式 thinking 清洗状态
  let rawStreamAccum = "";
  let prevSanitizedStream = "";

  // SSE 完成后的全文
  let fullCleaned = "";

  try {
    return await sendChatMessageStream(accessToken, sessionId, text, messageId, {
      onDelta: (chunk) => {
        if (!chunk) return;
        rawStreamAccum += chunk;
        const { display, delta } = streamSanitizeDeltaClient(prevSanitizedStream, rawStreamAccum);
        prevSanitizedStream = display;
        // 仅在有可见增量时写入 manager，减少无效 rAF
        if (delta) onPersist?.(display);
      },
      onAssistantComplete: (full) => {
        fullCleaned = stripModelThinkingForUi(full);
      },
      onError: (message) => {
        if (isCurrent && !isCurrent()) return;
        const cleaned = stripModelThinkingForUi(message);
        setMessages((cur) =>
          cur.map((m) =>
            m.id === assistantStreamId
              ? { ...m, content: cleaned || "任务启动失败，请稍后重试。", meta: { streaming: false, kind: "model_error" } }
              : m,
          ),
        );
      },
    }, { attachmentIds, signal, capabilityIds });
  } catch (e) {
    if (isAbortError(e)) {
      return { kind: "completed", session_id: sessionId, message: "" };
    }
    throw e;
  } finally {
    // 会话已切走则跳过 UI 更新（manager + 订阅接管后续展示）
    if (!isCurrent || isCurrent()) {
      // 兜底：SSE 已结束但消息内容落后于全文时，由 chunk 机制追赶剩余部分
      const content = fullCleaned || prevSanitizedStream;
      if (content) {
        const displayed = getDisplayedLen?.() ?? 0;
        if (displayed < [...content].length) {
          await _feedContentInChunks(setMessages, assistantStreamId, content, displayed, onPersist);
        } else {
          onPersist?.(content);
        }
      }
      // 移除 streaming meta
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
}

// DEBUG: 在浏览器 Console 中执行 window.__feedContentVersion 验证代码版本（应为 5）
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__feedContentVersion = 5;
}

/** 兜底：从 startPos 位置起，按动画帧分块追赶全文剩余部分。 */
async function _feedContentInChunks(
  setMessages: Dispatch<SetStateAction<SessionMessageItem[]>>,
  assistantStreamId: string,
  fullText: string,
  startPos: number,
  onPersist?: (content: string) => void,
): Promise<void> {
  const chars = [...fullText];
  if (startPos >= chars.length) return;
  const CHUNK = 3;

  const FALLBACK_MS = 2000;
  let finished = false;

  return new Promise<void>((resolve) => {
    const fallbackTimer = setTimeout(() => {
      if (finished) return;
      finished = true;
      setMessages((cur) => {
        if (!cur.some((m) => m.id === assistantStreamId)) return cur;
        return cur.map((m) =>
          m.id === assistantStreamId ? { ...m, content: fullText, meta: { streaming: true } } : m,
        );
      });
      onPersist?.(fullText);
      resolve();
    }, FALLBACK_MS);

    let pos = startPos;
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
