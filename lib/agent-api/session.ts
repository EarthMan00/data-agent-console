/** 长轮询内刷新 token 后通知 Provider 同步 React 状态（避免仍用内存里的旧 accessToken）。 */
export const AGENT_SESSION_CHANGED_EVENT = "agent-platform-session-changed";
/** 刷新 token 失败或会话被判定无效：请求 UI 清状态并回登录/首页。 */
export const AGENT_AUTH_EXPIRED_EVENT = "agent-platform-auth-expired";

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
  /** 登录时由服务端返回，用于前端展示管理员入口 */
  userRole?: string | null;
};

function getBrowserStorage(kind: "local" | "session"): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function getStoredItem(key: string): string | null {
  for (const storage of [getBrowserStorage("local"), getBrowserStorage("session")]) {
    if (!storage) continue;
    try {
      const value = storage.getItem(key);
      if (value != null) return value;
    } catch {
      // Storage can be unavailable in restricted browser contexts.
    }
  }
  return null;
}

function setStoredItem(key: string, value: string): void {
  const local = getBrowserStorage("local");
  if (local) {
    try {
      local.setItem(key, value);
      const session = getBrowserStorage("session");
      try {
        session?.removeItem(key);
      } catch {
        // Ignore cleanup failures; localStorage already has the source of truth.
      }
      return;
    } catch {
      // Fall back to sessionStorage below.
    }
  }

  try {
    getBrowserStorage("session")?.setItem(key, value);
  } catch {
    // Ignore storage failures; callers still keep the in-memory React state.
  }
}

function removeStoredItem(key: string): void {
  for (const storage of [getBrowserStorage("local"), getBrowserStorage("session")]) {
    try {
      storage?.removeItem(key);
    } catch {
      // Best-effort cleanup.
    }
  }
}

export function loadAgentSession(): AgentSessionSnapshot | null {
  if (typeof window === "undefined") return null;
  const accessToken = getStoredItem(ACCESS_KEY);
  const refreshToken = getStoredItem(REFRESH_KEY);
  const userId = getStoredItem(USER_ID_KEY);
  if (!accessToken || !refreshToken || !userId) {
    return null;
  }
  const userRole = getStoredItem(USER_ROLE_KEY);
  const displayName = getStoredItem(USER_DISPLAY_NAME_KEY);
  const snapshot = { accessToken, refreshToken, userId, displayName: displayName || undefined, userRole: userRole || undefined };
  saveAgentSession(snapshot);
  return snapshot;
}

export function saveAgentSession(snapshot: AgentSessionSnapshot): void {
  setStoredItem(ACCESS_KEY, snapshot.accessToken);
  setStoredItem(REFRESH_KEY, snapshot.refreshToken);
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

/** 提示词库「使用」写入，PlatformSessionAgentWorkspace 挂载时读入 composer 并清除 */
export const AGENT_COMPOSER_PREFILL_STORAGE_KEY = "agent_platform.composer_prefill_text_v1";
