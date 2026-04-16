"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  AgentApiError,
  checkAccessToken,
  createSession,
  login,
  refreshAccessToken,
  releaseSession,
} from "@/lib/agent-api/client";
import { isAgentRealApiEnabled } from "@/lib/agent-api/config";
import {
  AGENT_SESSION_CHANGED_EVENT,
  clearAgentSession,
  clearPlatformSessionId,
  loadAgentSession,
  loadPlatformSessionId,
  saveAgentSession,
  savePlatformSessionId,
  type AgentSessionSnapshot,
} from "@/lib/agent-api/session";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type PlatformAgentContextValue = {
  auth: AgentSessionSnapshot | null;
  authValidated: boolean;
  platformSessionId: string | null;
  openLogin: (banner?: string) => void;
  closeLogin: () => void;
  loginWithPassword: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** 从首页发起新研究：释放旧平台会话并创建新会话，返回新 session_id */
  beginNewHomeTaskSession: () => Promise<string | null>;
  ensurePlatformSession: () => Promise<boolean>;
  /** 切换到某个已存在会话（用于历史对话继续追问） */
  setActivePlatformSession: (sessionId: string) => void;
  /** 清除当前选中的平台会话（本地状态与 sessionStorage） */
  clearActivePlatformSession: () => void;
  withFreshToken: (run: (token: string) => Promise<void>) => Promise<void>;
};

const PlatformAgentContext = createContext<PlatformAgentContextValue | null>(null);

export function useOptionalPlatformAgent(): PlatformAgentContextValue | null {
  return useContext(PlatformAgentContext);
}

function PlatformAgentInner({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [auth, setAuth] = useState<AgentSessionSnapshot | null>(() => loadAgentSession());
  const [platformSessionId, setPlatformSessionId] = useState<string | null>(() => loadPlatformSessionId());
  const [loginOpen, setLoginOpen] = useState(false);
  const [authValidated, setAuthValidated] = useState(false);
  const [loginBanner, setLoginBanner] = useState("");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 5000);
  }, []);

  const openLogin = useCallback((banner?: string) => {
    setLoginBanner(banner?.trim() || "登录后即可连接 agent_web_platform。");
    setLoginError("");
    setLoginOpen(true);
  }, []);

  const closeLogin = useCallback(() => {
    setLoginOpen(false);
  }, []);

  const handleAuthExpired = useCallback(
    (banner?: string) => {
      clearAgentSession();
      setAuth(null);
      setAuthValidated(false);
      setPlatformSessionId(null);
      const message = banner || "登录已失效，请重新登录。";
      showToast(message);
      openLogin(message);
      if (pathname && /^(?:\/agent|\/artifacts|\/history|\/user-management|\/schedules|\/report|\/admin)(?:\/|$)/.test(pathname)) {
        router.push("/");
      }
    },
    [openLogin, pathname, router, showToast],
  );

  useEffect(() => {
    const sync = () => {
      setAuthValidated(false);
      setAuth(loadAgentSession());
    };
    window.addEventListener(AGENT_SESSION_CHANGED_EVENT, sync);
    return () => window.removeEventListener(AGENT_SESSION_CHANGED_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!auth?.accessToken) return;

    let cancelled = false;

    const validate = async () => {
      const snap = loadAgentSession();
      if (!snap) {
        setAuth(null);
        setAuthValidated(false);
        return;
      }
      try {
        await checkAccessToken(snap.accessToken);
        if (!cancelled) {
          setAuth(snap);
          setAuthValidated(true);
        }
      } catch (e) {
        if (!cancelled) {
          const refreshToken = snap.refreshToken;
          if (e instanceof AgentApiError && e.status === 401 && refreshToken) {
            try {
              const nextAccess = await refreshAccessToken(refreshToken);
              const next: AgentSessionSnapshot = { ...snap, accessToken: nextAccess };
              saveAgentSession(next);
              setAuth(next);
              setAuthValidated(true);
              return;
            } catch {
              // token refresh failed
            }
          }
          handleAuthExpired("登录已失效，请重新登录。需要重新登录后继续使用。");
        }
      }
    };

    const onFocusOrVisible = () => {
      if (document.visibilityState === "visible") {
        void validate();
      }
    };

    void validate();
    window.addEventListener("focus", onFocusOrVisible);
    window.addEventListener("visibilitychange", onFocusOrVisible);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocusOrVisible);
      window.removeEventListener("visibilitychange", onFocusOrVisible);
    };
  }, [auth?.accessToken, handleAuthExpired]);

  const withFreshToken = useCallback(async (run: (token: string) => Promise<void>) => {
    const snap = auth ?? loadAgentSession();
    if (!snap) {
      throw new Error("请先登录。");
    }
    try {
      await run(snap.accessToken);
    } catch (e) {
      if (e instanceof AgentApiError && e.status === 401) {
        try {
          const nextAccess = await refreshAccessToken(snap.refreshToken);
          const next: AgentSessionSnapshot = { ...snap, accessToken: nextAccess };
          saveAgentSession(next);
          setAuth(next);
          setAuthValidated(true);
          await run(nextAccess);
          return;
        } catch {
          handleAuthExpired("登录已失效，请重新登录。需要重新登录后继续使用。");
        }
      }
      throw e;
    }
  }, [auth, handleAuthExpired]);

  const loginWithPassword = useCallback(async (u: string, p: string) => {
    setLoginBusy(true);
    setLoginError("");
    try {
      const prevSnap = loadAgentSession();
      const prevSid = loadPlatformSessionId();
      const res = await login(u, p);
      if (prevSnap?.accessToken && prevSid) {
        try {
          await releaseSession(prevSnap.accessToken, prevSid);
        } catch (e) {
          console.warn("[platform-agent] release_session_after_login_failed", {
            session_id: prevSid,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      const snap: AgentSessionSnapshot = {
        accessToken: res.access_token,
        refreshToken: res.refresh_token,
        userId: res.user_id,
        userRole: res.user_role,
      };
      saveAgentSession(snap);
      setAuth(snap);
      setAuthValidated(true);
      clearPlatformSessionId();
      setPlatformSessionId(null);
      setLoginOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const hint =
        /failed to fetch|load failed|networkerror/i.test(msg) &&
        (process.env.NEXT_PUBLIC_AGENT_API_USE_PROXY ?? "").trim() !== "1"
          ? " 若为从其它电脑访问，请在 .env.local 设置 NEXT_PUBLIC_AGENT_API_USE_PROXY=1 并重启 dev。"
          : "";
      setLoginError(msg + hint);
    } finally {
      setLoginBusy(false);
    }
  }, []);

  const handleLoginFormSubmit = useCallback(
    (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      void loginWithPassword(username, password);
    },
    [username, password, loginWithPassword],
  );

  const logout = useCallback(async () => {
    const snap = auth ?? loadAgentSession();
    const sid = platformSessionId ?? loadPlatformSessionId();
    if (snap?.accessToken && sid) {
      try {
        await releaseSession(snap.accessToken, sid);
      } catch (e) {
        console.warn("[platform-agent] release_session_on_logout_failed", {
          session_id: sid,
          error: e instanceof Error ? e.message : String(e),
          status: e instanceof AgentApiError ? e.status : undefined,
        });
      }
    }
    clearAgentSession();
    setAuth(null);
    setAuthValidated(false);
    setPlatformSessionId(null);
    router.push("/");
  }, [auth, platformSessionId, router]);

  const beginNewHomeTaskSession = useCallback(async (): Promise<string | null> => {
    const snap = auth ?? loadAgentSession();
    if (!snap) {
      openLogin("请先登录后再发起任务。");
      return null;
    }
    try {
      let nextSid: string | null = null;
      await withFreshToken(async (token) => {
        const sid = platformSessionId ?? loadPlatformSessionId();
        if (sid) {
          try {
            await releaseSession(token, sid);
          } catch (e) {
            console.warn("[platform-agent] release_session_before_new_home_failed", {
              session_id: sid,
              error: e instanceof Error ? e.message : String(e),
              status: e instanceof AgentApiError ? e.status : undefined,
            });
          }
        }
        const created = await createSession(token);
        savePlatformSessionId(created.session_id);
        setPlatformSessionId(created.session_id);
        nextSid = created.session_id;
      });
      return nextSid;
    } catch (e) {
      openLogin(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [auth, openLogin, platformSessionId, withFreshToken]);

  const ensurePlatformSession = useCallback(async (): Promise<boolean> => {
    const snap = auth ?? loadAgentSession();
    if (!snap) {
      openLogin("请先登录后再发送任务。");
      return false;
    }
    const existing = platformSessionId ?? loadPlatformSessionId();
    if (existing) {
      if (!platformSessionId) setPlatformSessionId(existing);
      return true;
    }
    try {
      await withFreshToken(async (token) => {
        const created = await createSession(token);
        savePlatformSessionId(created.session_id);
        setPlatformSessionId(created.session_id);
      });
      return true;
    } catch (e) {
      openLogin(e instanceof Error ? e.message : String(e));
      return false;
    }
  }, [auth, openLogin, platformSessionId, withFreshToken]);

  const setActivePlatformSession = useCallback((sessionId: string) => {
    const sid = (sessionId || "").trim();
    if (!sid) return;
    savePlatformSessionId(sid);
    setPlatformSessionId(sid);
  }, []);

  const clearActivePlatformSession = useCallback(() => {
    clearPlatformSessionId();
    setPlatformSessionId(null);
  }, []);

  const value = useMemo<PlatformAgentContextValue>(
    () => ({
      auth,
      authValidated,
      platformSessionId,
      openLogin,
      closeLogin,
      loginWithPassword,
      logout,
      beginNewHomeTaskSession,
      ensurePlatformSession,
      setActivePlatformSession,
      clearActivePlatformSession,
      withFreshToken,
    }),
    [
      auth,
      authValidated,
      beginNewHomeTaskSession,
      clearActivePlatformSession,
      closeLogin,
      ensurePlatformSession,
      loginWithPassword,
      logout,
      openLogin,
      platformSessionId,
      setActivePlatformSession,
      withFreshToken,
    ],
  );

  return (
    <PlatformAgentContext.Provider value={value}>
      {children}
      {toastMessage ? (
        <div className="pointer-events-none fixed right-4 top-4 z-50 w-[min(320px,calc(100%-2rem))]">
          <div className="rounded-[14px] border border-[#e2e8ef] bg-white px-4 py-3 text-sm text-[#0f172a] shadow-[0_16px_40px_rgba(15,23,42,0.12)]">
            {toastMessage}
          </div>
        </div>
      ) : null}
      <Dialog open={loginOpen} onOpenChange={(o) => !o && closeLogin()}>
        <DialogContent className="max-w-md rounded-[14px] sm:rounded-[14px]" aria-describedby={undefined}>
          <DialogTitle className="text-lg text-[#1d2a3b]">登录</DialogTitle>
          {loginBanner ? <p className="text-sm text-[#64748b]">{loginBanner}</p> : null}
          <form className="grid gap-3 pt-2" onSubmit={handleLoginFormSubmit}>
            <div className="grid gap-1">
              <label className="text-xs text-[#7e8da0]">用户名</label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-9 rounded-[10px]"
                autoComplete="username"
              />
            </div>
            <div className="grid gap-1">
              <label className="text-xs text-[#7e8da0]">密码</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-9 rounded-[10px]"
                autoComplete="current-password"
              />
            </div>
            {loginError ? <p className="text-sm text-red-600">{loginError}</p> : null}
            <Button
              type="submit"
              className="rounded-[10px]"
              disabled={loginBusy}
            >
              {loginBusy ? "登录中…" : "登录"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </PlatformAgentContext.Provider>
  );
}

export function PlatformAgentProvider({ children }: { children: ReactNode }) {
  if (!isAgentRealApiEnabled()) {
    return <PlatformAgentContext.Provider value={null}>{children}</PlatformAgentContext.Provider>;
  }
  return <PlatformAgentInner>{children}</PlatformAgentInner>;
}
