/** Long-poll token refresh after login notifies the Provider to sync React state. */
export const AGENT_SESSION_CHANGED_EVENT = "agent-platform-session-changed";
/** Refresh failed or the session is invalid. Clear UI state and return to login/home. */
export const AGENT_AUTH_EXPIRED_EVENT = "agent-platform-auth-expired";
export const HTTP_ONLY_REFRESH_TOKEN_PLACEHOLDER = "__http_only_refresh__";

export function notifyAgentSessionChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AGENT_SESSION_CHANGED_EVENT));
  }
}

const ACCESS_KEY = "agent_platform.access_token";
const REFRESH_KEY = "agent_platform.refresh_token";
const USER_ID_KEY = "agent_platform.user_id";
const USER_ROLE_KEY = "agent_platform.user_role";
const USER_DISPLAY_NAME_KEY = "agent_platform.user_display_name";
const PLATFORM_SESSION_KEY = "agent_platform.platform_session_id";
const AGENT_STORAGE_KEYS = [
  ACCESS_KEY,
  REFRESH_KEY,
  USER_ID_KEY,
  USER_ROLE_KEY,
  USER_DISPLAY_NAME_KEY,
  PLATFORM_SESSION_KEY,
];

export type AgentSessionSnapshot = {
  accessToken: string;
  refreshToken: string;
  userId: string;
  displayName?: string | null;
  userRole?: string | null;
};

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function getLegacyLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getStoredItem(key: string): string | null {
  const session = getSessionStorage();
  if (session) {
    try {
      const value = session.getItem(key);
      if (value != null) return value;
    } catch {
      // Ignore read failure.
    }
  }

  const legacy = getLegacyLocalStorage();
  if (legacy) {
    try {
      const value = legacy.getItem(key);
      if (value != null) return value;
    } catch {
      // Ignore read failure.
    }
  }
  return null;
}

function getSessionItem(key: string): string | null {
  const session = getSessionStorage();
  if (!session) return null;
  try {
    return session.getItem(key);
  } catch {
    return null;
  }
}

function setStoredItem(key: string, value: string): void {
  try {
    getSessionStorage()?.setItem(key, value);
  } catch {
    // Ignore storage failures; callers still keep in-memory React state.
  }
  try {
    getLegacyLocalStorage()?.removeItem(key);
  } catch {
    // Best-effort legacy cleanup.
  }
}

function removeStoredItem(key: string): void {
  try {
    getSessionStorage()?.removeItem(key);
  } catch {
    // Best-effort cleanup.
  }
  try {
    getLegacyLocalStorage()?.removeItem(key);
  } catch {
    // Best-effort cleanup.
  }
}

function migrateLegacySessionIfNeeded(): AgentSessionSnapshot | null {
  const legacy = getLegacyLocalStorage();
  if (!legacy) return null;
  try {
    const accessToken = legacy.getItem(ACCESS_KEY);
    const refreshToken = legacy.getItem(REFRESH_KEY);
    const userId = legacy.getItem(USER_ID_KEY);
    if (!accessToken || !userId) {
      return null;
    }
    const userRole = legacy.getItem(USER_ROLE_KEY);
    const displayName = legacy.getItem(USER_DISPLAY_NAME_KEY);
    const snapshot: AgentSessionSnapshot = {
      accessToken,
      refreshToken: refreshToken ? HTTP_ONLY_REFRESH_TOKEN_PLACEHOLDER : HTTP_ONLY_REFRESH_TOKEN_PLACEHOLDER,
      userId,
      displayName: displayName || undefined,
      userRole: userRole || undefined,
    };
    saveAgentSession(snapshot);
    return snapshot;
  } catch {
    return null;
  }
}

export function loadAgentSession(): AgentSessionSnapshot | null {
  if (typeof window === "undefined") return null;
  const accessToken = getSessionItem(ACCESS_KEY);
  const refreshToken = getSessionItem(REFRESH_KEY);
  const userId = getSessionItem(USER_ID_KEY);
  if (!accessToken || !userId) {
    return migrateLegacySessionIfNeeded();
  }
  const userRole = getSessionItem(USER_ROLE_KEY);
  const displayName = getSessionItem(USER_DISPLAY_NAME_KEY);
  const snapshot = {
    accessToken,
    refreshToken: refreshToken || HTTP_ONLY_REFRESH_TOKEN_PLACEHOLDER,
    userId,
    displayName: displayName || undefined,
    userRole: userRole || undefined,
  };
  saveAgentSession(snapshot);
  return snapshot;
}

export function saveAgentSession(snapshot: AgentSessionSnapshot): void {
  setStoredItem(ACCESS_KEY, snapshot.accessToken);
  setStoredItem(REFRESH_KEY, snapshot.refreshToken || HTTP_ONLY_REFRESH_TOKEN_PLACEHOLDER);
  setStoredItem(USER_ID_KEY, snapshot.userId);
  if (snapshot.displayName != null && snapshot.displayName !== "") {
    setStoredItem(USER_DISPLAY_NAME_KEY, snapshot.displayName);
  } else {
    removeStoredItem(USER_DISPLAY_NAME_KEY);
  }
  if (snapshot.userRole != null && snapshot.userRole !== "") {
    setStoredItem(USER_ROLE_KEY, snapshot.userRole);
  } else {
    removeStoredItem(USER_ROLE_KEY);
  }
}

export function clearAgentSession(): void {
  AGENT_STORAGE_KEYS.forEach(removeStoredItem);
}

export function loadPlatformSessionId(): string | null {
  if (typeof window === "undefined") return null;
  const sessionId = getStoredItem(PLATFORM_SESSION_KEY);
  if (sessionId) savePlatformSessionId(sessionId);
  return sessionId;
}

export function savePlatformSessionId(sessionId: string): void {
  setStoredItem(PLATFORM_SESSION_KEY, sessionId);
}

export function clearPlatformSessionId(): void {
  removeStoredItem(PLATFORM_SESSION_KEY);
}

/** Prompt library "use" action writes here; PlatformSessionAgentWorkspace consumes it on mount. */
export const AGENT_COMPOSER_PREFILL_STORAGE_KEY = "agent_platform.composer_prefill_text_v1";
