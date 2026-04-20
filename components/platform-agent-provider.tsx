"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import {
  AgentApiError,
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
  /** 已在浏览器读取 sessionStorage；首帧为 false，与 SSR 一致，避免 hydration 与 Require* 分支不一致 */
  authHydrated: boolean;
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
  const [auth, setAuth] = useState<AgentSessionSnapshot | null>(null);
  const [platformSessionId, setPlatformSessionId] = useState<string | null>(null);
  const [authHydrated, setAuthHydrated] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginBanner, setLoginBanner] = useState("");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    setAuth(loadAgentSession());
    setPlatformSessionId(loadPlatformSessionId());
    setAuthHydrated(true);
    const sync = () => setAuth(loadAgentSession());
    window.addEventListener(AGENT_SESSION_CHANGED_EVENT, sync);
    return () => window.removeEventListener(AGENT_SESSION_CHANGED_EVENT, sync);
  }, []);

  const withFreshToken = useCallback(async (run: (token: string) => Promise<void>) => {
    const snap = auth ?? loadAgentSession();
    if (!snap) {
      throw new Error("请先登录。");
    }
    try {
      await run(snap.accessToken);
    } catch (e) {
      if (e instanceof AgentApiError && e.status === 401) {
        const nextAccess = await refreshAccessToken(snap.refreshToken);
        const next: AgentSessionSnapshot = { ...snap, accessToken: nextAccess };
        saveAgentSession(next);
        setAuth(next);
        await run(nextAccess);
        return;
      }
      throw e;
    }
  }, [auth]);

  const openLogin = useCallback((banner?: string) => {
    setLoginBanner(banner?.trim() || "登录后即可连接 agent_web_platform。");
    setLoginError("");
    setLoginOpen(true);
  }, []);

  const closeLogin = useCallback(() => {
    setLoginOpen(false);
  }, []);

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
      authHydrated,
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
      authHydrated,
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
      <Dialog open={loginOpen} onOpenChange={(o) => !o && closeLogin()}>
        <DialogContent className="max-w-md rounded-[14px] sm:rounded-[14px]" aria-describedby={undefined}>
          <DialogTitle className="font-[family:var(--font-jakarta)] text-lg text-[#1d2a3b]">登录</DialogTitle>
          {loginBanner ? <p className="text-sm text-[#64748b]">{loginBanner}</p> : null}
          <div className="grid gap-3 pt-2">
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
              type="button"
              className="rounded-[10px]"
              disabled={loginBusy}
              onClick={() => void loginWithPassword(username, password)}
            >
              {loginBusy ? "登录中…" : "登录"}
            </Button>
          </div>
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
