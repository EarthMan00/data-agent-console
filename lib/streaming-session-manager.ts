/** 跨组件生命周期的 SSE 流状态管理 —— 切会话不断流，切回来可恢复。 */

export type StreamState = {
  abortController: AbortController;
  assistantStreamId: string;
  content: string;
  status: "streaming" | "completed" | "error";
  errorMessage?: string;
};

const streams = new Map<string, StreamState>();

/** UI 订阅表：与 StreamState 生命周期分离，releaseStream 不删除 */
const sessionListeners = new Map<string, Set<() => void>>();

function listenerSet(sessionId: string): Set<() => void> {
  let set = sessionListeners.get(sessionId);
  if (!set) {
    set = new Set();
    sessionListeners.set(sessionId, set);
  }
  return set;
}

function notify(sessionId: string): void {
  const set = sessionListeners.get(sessionId);
  if (!set) return;
  set.forEach((fn) => fn());
}

function maybeCleanupStream(sessionId: string): void {
  const state = streams.get(sessionId);
  const listeners = sessionListeners.get(sessionId);
  if (state && state.status !== "streaming" && (!listeners || listeners.size === 0)) {
    streams.delete(sessionId);
  }
}

export function registerStream(
  sessionId: string,
  state: { abortController: AbortController; assistantStreamId: string },
): void {
  streams.set(sessionId, {
    abortController: state.abortController,
    assistantStreamId: state.assistantStreamId,
    content: "",
    status: "streaming",
  });
}

export function updateStreamContent(sessionId: string, content: string): void {
  const state = streams.get(sessionId);
  if (!state || state.status !== "streaming") return;
  state.content = content;
  notify(sessionId);
}

export function completeStream(sessionId: string): void {
  const state = streams.get(sessionId);
  if (!state) return;
  state.status = "completed";
  notify(sessionId);
  maybeCleanupStream(sessionId);
}

export function getStreamState(sessionId: string): StreamState | undefined {
  return streams.get(sessionId);
}

export function subscribe(sessionId: string, listener: () => void): () => void {
  listenerSet(sessionId).add(listener);
  return () => {
    const set = sessionListeners.get(sessionId);
    if (!set) return;
    set.delete(listener);
    if (set.size === 0) {
      sessionListeners.delete(sessionId);
    }
    maybeCleanupStream(sessionId);
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
