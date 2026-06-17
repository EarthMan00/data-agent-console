import type { SessionMessageItem } from "@/lib/agent-api/types";

const sessionMessageCache = new Map<string, { messages: SessionMessageItem[]; at: number }>();
const SESSION_CACHE_TTL_MS = 5 * 60 * 1000;

export function readSessionMessageCache(sessionId: string): SessionMessageItem[] | null {
  const entry = sessionMessageCache.get(sessionId);
  if (!entry || Date.now() - entry.at > SESSION_CACHE_TTL_MS) {
    sessionMessageCache.delete(sessionId);
    return null;
  }
  return entry.messages;
}

export function writeSessionMessageCache(sessionId: string, messages: SessionMessageItem[]): void {
  sessionMessageCache.set(sessionId, { messages, at: Date.now() });
}

export function clearSessionMessageCache(sessionId?: string): void {
  if (sessionId) {
    sessionMessageCache.delete(sessionId);
  } else {
    sessionMessageCache.clear();
  }
}
