import { refreshAccessToken } from "@/lib/agent-api/client";
import {
  AGENT_AUTH_EXPIRED_EVENT,
  clearAgentSession,
  loadAgentSession,
  notifyAgentSessionChanged,
  saveAgentSession,
} from "@/lib/agent-api/session";

export class PlatformAuthExpiredError extends Error {
  constructor() {
    super("PLATFORM_AUTH_EXPIRED");
    this.name = "PlatformAuthExpiredError";
  }
}

/** 清除本地会话并广播事件，由 `PlatformAgentProvider` 拉首页并弹登录。 */
export function invalidateSessionAndRequestLogin(): void {
  clearAgentSession();
  notifyAgentSessionChanged();
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AGENT_AUTH_EXPIRED_EVENT));
}

export async function refreshPlatformAccessToken(): Promise<string | null> {
  const snap = loadAgentSession();
  if (!snap?.refreshToken) {
    invalidateSessionAndRequestLogin();
    return null;
  }
  try {
    const next = await refreshAccessToken(snap.refreshToken);
    saveAgentSession({ ...snap, accessToken: next });
    notifyAgentSessionChanged();
    return next;
  } catch (e) {
    invalidateSessionAndRequestLogin();
    throw e;
  }
}
