import { AgentApiError, refreshAccessToken } from "@/lib/agent-api/client";
import { loadAgentSession, notifyAgentSessionChanged, saveAgentSession } from "@/lib/agent-api/session";

export class PlatformAuthExpiredError extends Error {
  constructor() {
    super("PLATFORM_AUTH_EXPIRED");
    this.name = "PlatformAuthExpiredError";
  }
}

export async function refreshPlatformAccessToken(): Promise<string | null> {
  const snap = loadAgentSession();
  if (!snap?.refreshToken) return null;
  try {
    const next = await refreshAccessToken(snap.refreshToken);
    saveAgentSession({ ...snap, accessToken: next });
    notifyAgentSessionChanged();
    return next;
  } catch (e) {
    console.warn("[agent-runtime] platform_token_refresh_failed", {
      error: e instanceof Error ? e.message : String(e),
      status: e instanceof AgentApiError ? e.status : undefined,
    });
    return null;
  }
}
