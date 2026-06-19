import type { SessionMessageItem } from "@/lib/agent-api/types";
import {
  looksLikeClarificationPrompt,
  sanitizeClarificationForUserDisplay,
} from "@/lib/alice-clarification";

export type SessionClarificationFlow = {
  /** 归档的 Alice 二次确认文案 */
  archivedClarification: string | null;
  /** 用户补充消息 id（二次确认回复） */
  supplementUserMessageId: string | null;
  /** 归档的 linkfox_clarification 消息 id（若存在） */
  clarificationMessageId: string | null;
};

function messageMeta(m: SessionMessageItem): Record<string, unknown> | undefined {
  return m.meta && typeof m.meta === "object" && !Array.isArray(m.meta)
    ? (m.meta as Record<string, unknown>)
    : undefined;
}

function isArchivedClarificationMessage(m: SessionMessageItem): string | null {
  if (m.role !== "assistant") return null;
  const meta = messageMeta(m);
  const kind = typeof meta?.kind === "string" ? meta.kind.trim() : "";
  if (kind === "linkfox_clarification") {
    return sanitizeClarificationForUserDisplay(m.content);
  }
  const cleaned = sanitizeClarificationForUserDisplay(m.content);
  if (looksLikeClarificationPrompt(cleaned)) return cleaned;
  return null;
}

/** 识别「Alice 追问 → 用户补充」流程，用于调整任务执行卡片与追问归档展示顺序。 */
export function analyzeSessionClarificationFlow(
  messages: SessionMessageItem[],
): SessionClarificationFlow {
  const firstUserId = messages.find((m) => m.role === "user" && (m.content || "").trim())?.id ?? null;

  for (let i = 0; i < messages.length; i++) {
    const clarifyText = isArchivedClarificationMessage(messages[i]!);
    if (!clarifyText) continue;

    const supplementUser = messages.slice(i + 1).find((m) => {
      if (m.role !== "user") return false;
      if (!firstUserId || m.id === firstUserId) return false;
      return Boolean((m.content || "").trim());
    });

    if (!supplementUser) continue;

    return {
      archivedClarification: clarifyText,
      supplementUserMessageId: supplementUser.id,
      clarificationMessageId: messages[i]!.id,
    };
  }

  return {
    archivedClarification: null,
    supplementUserMessageId: null,
    clarificationMessageId: null,
  };
}

export function shouldDeferSessionTaskSteps(
  flow: SessionClarificationFlow,
  messageId: string,
): boolean {
  return Boolean(flow.supplementUserMessageId && flow.supplementUserMessageId === messageId);
}

export function shouldSuppressSessionClarificationAt(
  flow: SessionClarificationFlow,
  messageId: string,
): boolean {
  return Boolean(flow.clarificationMessageId && flow.clarificationMessageId === messageId);
}
