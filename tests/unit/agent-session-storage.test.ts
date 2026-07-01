import { beforeEach, describe, expect, it } from "vitest";

import {
  clearAgentSession,
  clearPlatformSessionId,
  loadAgentSession,
  loadPlatformSessionId,
  saveAgentSession,
  savePlatformSessionId,
} from "@/lib/agent-api/session";

const ACCESS_KEY = "agent_platform.access_token";
const REFRESH_KEY = "agent_platform.refresh_token";
const USER_ID_KEY = "agent_platform.user_id";
const USER_ROLE_KEY = "agent_platform.user_role";
const USER_DISPLAY_NAME_KEY = "agent_platform.user_display_name";
const PLATFORM_SESSION_KEY = "agent_platform.platform_session_id";

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

describe("agent session storage", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createMemoryStorage(),
    });
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: createMemoryStorage(),
    });
  });

  it("persists login session in sessionStorage", () => {
    saveAgentSession({
      accessToken: "access-1",
      refreshToken: "__http_only_refresh__",
      userId: "user-1",
      displayName: "Alice",
      userRole: "admin",
    });

    expect(window.sessionStorage.getItem(ACCESS_KEY)).toBe("access-1");
    expect(window.sessionStorage.getItem(REFRESH_KEY)).toBe("__http_only_refresh__");
    expect(window.sessionStorage.getItem(USER_ID_KEY)).toBe("user-1");
    expect(window.sessionStorage.getItem(USER_DISPLAY_NAME_KEY)).toBe("Alice");
    expect(window.sessionStorage.getItem(USER_ROLE_KEY)).toBe("admin");
    expect(window.localStorage.getItem(ACCESS_KEY)).toBeNull();
  });

  it("loads and migrates legacy localStorage login sessions", () => {
    window.localStorage.setItem(ACCESS_KEY, "legacy-access");
    window.localStorage.setItem(REFRESH_KEY, "legacy-refresh");
    window.localStorage.setItem(USER_ID_KEY, "legacy-user");
    window.localStorage.setItem(USER_DISPLAY_NAME_KEY, "Legacy Alice");

    expect(loadAgentSession()).toEqual({
      accessToken: "legacy-access",
      refreshToken: "__http_only_refresh__",
      userId: "legacy-user",
      displayName: "Legacy Alice",
      userRole: undefined,
    });
    expect(window.sessionStorage.getItem(ACCESS_KEY)).toBe("legacy-access");
    expect(window.localStorage.getItem(ACCESS_KEY)).toBeNull();
  });

  it("persists and migrates the active platform session id", () => {
    savePlatformSessionId("session-1");

    expect(window.sessionStorage.getItem(PLATFORM_SESSION_KEY)).toBe("session-1");
    expect(loadPlatformSessionId()).toBe("session-1");

    window.sessionStorage.removeItem(PLATFORM_SESSION_KEY);
    window.localStorage.setItem(PLATFORM_SESSION_KEY, "legacy-session");

    expect(loadPlatformSessionId()).toBe("legacy-session");
    expect(window.sessionStorage.getItem(PLATFORM_SESSION_KEY)).toBe("legacy-session");
    expect(window.localStorage.getItem(PLATFORM_SESSION_KEY)).toBeNull();
  });

  it("clears sessionStorage and legacy localStorage auth state", () => {
    saveAgentSession({
      accessToken: "access-1",
      refreshToken: "__http_only_refresh__",
      userId: "user-1",
    });
    savePlatformSessionId("session-1");
    window.localStorage.setItem(ACCESS_KEY, "legacy-access");
    window.localStorage.setItem(PLATFORM_SESSION_KEY, "legacy-session");

    clearPlatformSessionId();
    expect(window.sessionStorage.getItem(PLATFORM_SESSION_KEY)).toBeNull();
    expect(window.localStorage.getItem(PLATFORM_SESSION_KEY)).toBeNull();

    clearAgentSession();
    expect(window.sessionStorage.getItem(ACCESS_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(REFRESH_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(USER_ID_KEY)).toBeNull();
    expect(window.localStorage.getItem(ACCESS_KEY)).toBeNull();
  });
});
