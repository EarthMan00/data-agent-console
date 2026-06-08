/** 跨组件生命周期的 SSE 流状态管理 —— 切会话不断流，切回来可恢复。 */

export type StreamState = {
  abortController: AbortController;
  assistantStreamId: string;
  content: string;
  status: "streaming" | "completed" | "error";
  errorMessage?: string;
  listeners: Set<() => void>;
};

const streams = new Map<string, StreamState>();

export function registerStream(
  sessionId: string,
  state: { abortController: AbortController; assistantStreamId: string },
): void {
  const existing = streams.get(sessionId);
  streams.set(sessionId, {
    abortController: state.abortController,
    assistantStreamId: state.assistantStreamId,
    content: "",
    status: "streaming",
    listeners: existing?.listeners ?? new Set(),
  });
}

export function updateStreamContent(sessionId: string, content: string): void {
  const state = streams.get(sessionId);
  if (!state || state.status !== "streaming") return;
  state.content = content;
  state.listeners.forEach((fn) => fn());
}

export function completeStream(sessionId: string): void {
  const state = streams.get(sessionId);
  if (!state) return;
  state.status = "completed";
  state.listeners.forEach((fn) => fn());
}

export function getStreamState(sessionId: string): StreamState | undefined {
  return streams.get(sessionId);
}

export function subscribe(sessionId: string, listener: () => void): () => void {
  const state = streams.get(sessionId);
  if (!state) return () => {};
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
    const s = streams.get(sessionId);
    if (s && s.listeners.size === 0 && s.status !== "streaming") {
      streams.delete(sessionId);
    }
  };
}

export function releaseStream(sessionId: string): void {
  const state = streams.get(sessionId);
  if (!state) return;
  if (state.status === "streaming") {
    try {
      state.abortController.abort();
    } catch {
      /* abort 可能因已结束而抛异常，忽略 */
    }
  }
  streams.delete(sessionId);
}
