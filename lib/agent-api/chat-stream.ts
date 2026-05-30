import { readSSEChunk } from "@/lib/agent-runtime/sse";

import type { ChatSendResult } from "./types";

export class ChatStreamError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "ChatStreamError";
    this.code = code;
  }
}

export type ChatStreamHandlers = {
  onDelta?: (text: string) => void;
  onSplitDelta?: (steps: string[]) => void;
  onAssistantComplete?: (text: string, sessionId: string) => void;
  onError?: (message: string, code?: string) => void;
};

export type ChatStreamParseResult =
  | { type: "delta"; text: string }
  | { type: "split_delta"; steps: string[] }
  | { type: "assistant_complete"; text: string; session_id: string }
  | { type: "completed"; session_id: string; message: string }
  | {
      type: "task_accepted";
      task_id: string;
      task_status: string;
      execution_steps: string[];
      orchestration_id: string | null;
    }
  | { type: "blocked"; session_id: string; message: string; task_id: string | null }
  | { type: "error"; message: string; code?: string }
  | { type: "done" }
  | null;

function parseChatStreamBlock(block: string): ChatStreamParseResult {
  const lines = block.split("\n").filter(Boolean);
  let event = "message";
  const dataLines: string[] = [];

  lines.forEach((line) => {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      return;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  });

  if (dataLines.length === 0) return null;
  const raw = dataLines.join("\n");

  let payload: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      payload = parsed as Record<string, unknown>;
    }
  } catch {
    if (event === "delta") return { type: "delta", text: raw };
    if (event === "error") return { type: "error", message: raw };
    return null;
  }

  if (event === "delta") {
    return { type: "delta", text: String(payload.text ?? "") };
  }
  if (event === "split_delta") {
    const steps = payload.steps;
    const labels = Array.isArray(steps)
      ? steps.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      : [];
    return { type: "split_delta", steps: labels };
  }
  if (event === "assistant_complete") {
    return {
      type: "assistant_complete",
      text: String(payload.text ?? ""),
      session_id: String(payload.session_id ?? ""),
    };
  }
  if (event === "completed") {
    return {
      type: "completed",
      session_id: String(payload.session_id ?? ""),
      message: String(payload.message ?? ""),
    };
  }
  if (event === "task_accepted") {
    const steps = payload.execution_steps;
    const execution_steps = Array.isArray(steps)
      ? steps.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      : [];
    const orch = payload.orchestration_id;
    return {
      type: "task_accepted",
      task_id: String(payload.task_id ?? ""),
      task_status: String(payload.task_status ?? "RUNNING"),
      execution_steps,
      orchestration_id: typeof orch === "string" && orch.trim() ? orch.trim() : null,
    };
  }
  if (event === "blocked") {
    const tid = payload.task_id;
    return {
      type: "blocked",
      session_id: String(payload.session_id ?? ""),
      message: String(payload.message ?? ""),
      task_id: typeof tid === "string" ? tid : null,
    };
  }
  if (event === "error") {
    return {
      type: "error",
      message: String(payload.message ?? "发送失败"),
      code: typeof payload.code === "string" ? payload.code : undefined,
    };
  }
  if (event === "done") {
    return { type: "done" };
  }
  return null;
}

export async function consumeChatSendStream(
  response: Response,
  handlers: ChatStreamHandlers,
): Promise<ChatSendResult> {
  if (!response.ok || !response.body) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `流式请求失败：${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let outcome: ChatSendResult | null = null;
  const streamState = {
    lastAssistantComplete: null as { session_id: string; text: string } | null,
  };

  const handleParsed = (parsed: ChatStreamParseResult) => {
    if (!parsed) return;
    if (parsed.type === "delta" && parsed.text) {
      handlers.onDelta?.(parsed.text);
    }
    if (parsed.type === "split_delta" && parsed.steps.length > 0) {
      handlers.onSplitDelta?.(parsed.steps);
    }
    if (parsed.type === "assistant_complete") {
      streamState.lastAssistantComplete = {
        session_id: parsed.session_id,
        text: parsed.text,
      };
      handlers.onAssistantComplete?.(parsed.text, parsed.session_id);
    }
    if (parsed.type === "completed") {
      outcome = {
        kind: "completed",
        session_id: parsed.session_id,
        message: parsed.message,
      };
    }
    if (parsed.type === "task_accepted") {
      if (!parsed.task_id) {
        throw new Error("invalid task_accepted event");
      }
      outcome = {
        kind: "accepted",
        task_id: parsed.task_id,
        task_status: parsed.task_status,
        execution_steps: parsed.execution_steps,
        orchestration_id: parsed.orchestration_id,
      };
    }
    if (parsed.type === "blocked") {
      outcome = {
        kind: "blocked",
        session_id: parsed.session_id,
        message: parsed.message,
        task_id: parsed.task_id,
      };
    }
    if (parsed.type === "error") {
      handlers.onError?.(parsed.message, parsed.code);
      throw new ChatStreamError(parsed.message, parsed.code);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { completed, rest } = readSSEChunk(buffer);
    buffer = rest;
    for (const block of completed) {
      handleParsed(parseChatStreamBlock(block));
    }
  }

  buffer += decoder.decode();
  const { completed: tailBlocks } = readSSEChunk(`${buffer}\n\n`);
  for (const block of tailBlocks) {
    handleParsed(parseChatStreamBlock(block));
  }

  const assistantCompleteFallback = streamState.lastAssistantComplete;
  if (!outcome && assistantCompleteFallback) {
    outcome = {
      kind: "completed",
      session_id: assistantCompleteFallback.session_id,
      message: assistantCompleteFallback.text,
    };
  }

  if (!outcome) {
    throw new Error("流式对话未返回终态（completed / task_accepted / blocked）");
  }
  return outcome;
}
