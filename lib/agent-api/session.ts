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
const PLATFORM_SESSION_KEY = "agent_platform.platform_session_id";

export type AgentSessionSnapshot = {
  accessToken: string;
  refreshToken: string;
  userId: string;
  /** 登录时由服务端返回，用于前端展示管理员入口 */
  userRole?: string | null;
};

export function loadAgentSession(): AgentSessionSnapshot | null {
  if (typeof window === "undefined") return null;
  const accessToken = sessionStorage.getItem(ACCESS_KEY);
  const refreshToken = sessionStorage.getItem(REFRESH_KEY);
  const userId = sessionStorage.getItem(USER_ID_KEY);
  if (!accessToken || !refreshToken || !userId) {
    return null;
  }
  const userRole = sessionStorage.getItem(USER_ROLE_KEY);
  return { accessToken, refreshToken, userId, userRole: userRole || undefined };
}

export function saveAgentSession(snapshot: AgentSessionSnapshot): void {
  sessionStorage.setItem(ACCESS_KEY, snapshot.accessToken);
  sessionStorage.setItem(REFRESH_KEY, snapshot.refreshToken);
  sessionStorage.setItem(USER_ID_KEY, snapshot.userId);
  if (snapshot.userRole != null && snapshot.userRole !== "") {
    sessionStorage.setItem(USER_ROLE_KEY, snapshot.userRole);
  } else {
    sessionStorage.removeItem(USER_ROLE_KEY);
  }
}

export function clearAgentSession(): void {
  sessionStorage.removeItem(ACCESS_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
  sessionStorage.removeItem(USER_ID_KEY);
  sessionStorage.removeItem(USER_ROLE_KEY);
  sessionStorage.removeItem(PLATFORM_SESSION_KEY);
}

export function loadPlatformSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(PLATFORM_SESSION_KEY);
}

export function savePlatformSessionId(sessionId: string): void {
  sessionStorage.setItem(PLATFORM_SESSION_KEY, sessionId);
}

export function clearPlatformSessionId(): void {
  sessionStorage.removeItem(PLATFORM_SESSION_KEY);
}

/** 提示词库「使用」写入，PlatformSessionAgentWorkspace 挂载时读入 composer 并清除 */
export const AGENT_COMPOSER_PREFILL_STORAGE_KEY = "agent_platform.composer_prefill_text_v1";
