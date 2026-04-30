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
} from "react";
import { useRouter } from "next/navigation";

import {
  AgentApiError,
  checkUsernameAvailable,
  createSession,
  login,
  refreshAccessToken,
  registerByEmail,
  releaseSession,
  sendRegisterEmailOtp,
} from "@/lib/agent-api/client";
import { isAgentRealApiEnabled } from "@/lib/agent-api/config";
import {
  AGENT_AUTH_EXPIRED_EVENT,
  AGENT_SESSION_CHANGED_EVENT,
  clearAgentSession,
  clearPlatformSessionId,
  loadAgentSession,
  loadPlatformSessionId,
  saveAgentSession,
  savePlatformSessionId,
  type AgentSessionSnapshot,
} from "@/lib/agent-api/session";
import { invalidateSessionAndRequestLogin } from "@/lib/agent-runtime/auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type PlatformAgentContextValue = {
  auth: AgentSessionSnapshot | null;
  /** 已在浏览器读取 sessionStorage；首帧为 false，与 SSR 一致，避免 hydration 与 Require* 分支不一致 */
  authHydrated: boolean;
  /**
   * 兼容字段：部分页面依赖远端实现里的 authValidated。
   * 在当前本地实现中，用 authHydrated 表达“客户端已完成认证态读取”的最小语义以通过类型检查。
   */
  authValidated: boolean;
  platformSessionId: string | null;
  openLogin: (banner?: string) => void;
  closeLogin: () => void;
  loginWithPassword: (account: string, password: string) => Promise<void>;
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
  const [registerOpen, setRegisterOpen] = useState(false);
  const [loginBanner, setLoginBanner] = useState("");

  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regCode, setRegCode] = useState("");
  const [regBusy, setRegBusy] = useState(false);
  const [regError, setRegError] = useState("");
  const [regUsernameOk, setRegUsernameOk] = useState<boolean | null>(null);
  const [regCooldownLeft, setRegCooldownLeft] = useState(0);
  const regNameTimer = useRef<number | null>(null);

  useEffect(() => {
    if (regCooldownLeft <= 0) return;
    const t = window.setInterval(() => {
      setRegCooldownLeft((v) => (v <= 1 ? 0 : v - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, [regCooldownLeft]);

  useEffect(() => {
    if (!registerOpen) return;
    const u = (regUsername || "").trim();
    if (u.length < 2) {
      setRegUsernameOk(null);
      return;
    }
    if (regNameTimer.current) window.clearTimeout(regNameTimer.current);
    regNameTimer.current = window.setTimeout(() => {
      void (async () => {
        try {
          const ok = await checkUsernameAvailable(u);
          setRegUsernameOk(ok);
        } catch {
          setRegUsernameOk(null);
        }
      })();
    }, 350) as unknown as number;
    return () => {
      if (regNameTimer.current) window.clearTimeout(regNameTimer.current);
    };
  }, [regUsername, registerOpen]);

  useEffect(() => {
    setAuth(loadAgentSession());
    setPlatformSessionId(loadPlatformSessionId());
    setAuthHydrated(true);
    const sync = () => setAuth(loadAgentSession());
    window.addEventListener(AGENT_SESSION_CHANGED_EVENT, sync);
    return () => window.removeEventListener(AGENT_SESSION_CHANGED_EVENT, sync);
  }, []);

  const openLogin = useCallback((banner?: string) => {
    setLoginBanner(banner?.trim() || "登录后即可连接 agent_web_platform。");
    setLoginError("");
    setRegisterOpen(false);
    setLoginOpen(true);
  }, []);

  const closeLogin = useCallback(() => {
    setLoginOpen(false);
  }, []);

  const withFreshToken = useCallback(
    async (run: (token: string) => Promise<void>) => {
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
            await run(nextAccess);
            return;
          } catch (refreshErr) {
            invalidateSessionAndRequestLogin();
            throw new AgentApiError("登录已失效，请重新登录。", 401, refreshErr);
          }
        }
        throw e;
      }
    },
    [auth],
  );

  useEffect(() => {
    const onExpired = () => {
      setAuth(null);
      setPlatformSessionId(null);
      setRegisterOpen(false);
      openLogin("登录已失效，请重新登录。");
      router.replace("/");
    };
    window.addEventListener(AGENT_AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AGENT_AUTH_EXPIRED_EVENT, onExpired);
  }, [openLogin, router]);

  const applyLoginResponse = useCallback(
    async (res: { access_token: string; refresh_token: string; user_id: string; user_role?: string | undefined }) => {
      const prevSnap = loadAgentSession();
      const prevSid = loadPlatformSessionId();
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
      setRegisterOpen(false);
    },
    [],
  );

  const loginWithPassword = useCallback(
    async (a: string, p: string) => {
      setLoginBusy(true);
      setLoginError("");
      try {
        const res = await login(a, p);
        await applyLoginResponse(res);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const hint =
          /failed to fetch|load failed|networkerror/i.test(msg) && (process.env.NEXT_PUBLIC_AGENT_API_USE_PROXY ?? "").trim() !== "1"
            ? " 若为从其它电脑访问，请在 .env.local 设置 NEXT_PUBLIC_AGENT_API_USE_PROXY=1 并重启 dev。"
            : "";
        setLoginError(msg + hint);
      } finally {
        setLoginBusy(false);
      }
    },
    [applyLoginResponse],
  );

  const requestRegisterEmailOtp = useCallback(async () => {
    if (regCooldownLeft > 0) return;
    setRegError("");
    try {
      const r = await sendRegisterEmailOtp((regUsername || "").trim(), (regEmail || "").trim());
      if (r.retryAfterSeconds != null) {
        setRegCooldownLeft(Math.max(1, Math.floor(r.retryAfterSeconds)));
      } else {
        setRegCooldownLeft(60);
      }
    } catch (e) {
      setRegError(e instanceof Error ? e.message : String(e));
    }
  }, [regCooldownLeft, regEmail, regUsername]);

  const completeRegister = useCallback(async () => {
    setRegBusy(true);
    setRegError("");
    try {
      const res = await registerByEmail({
        username: (regUsername || "").trim(),
        email: (regEmail || "").trim(),
        password: regPassword,
        code: (regCode || "").trim(),
      });
      await applyLoginResponse(res);
    } catch (e) {
      setRegError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegBusy(false);
    }
  }, [applyLoginResponse, regCode, regEmail, regPassword, regUsername]);

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
    setRegisterOpen(false);
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
      authValidated: authHydrated,
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
      <Dialog
        open={loginOpen}
        onOpenChange={(o) => {
          if (!o) closeLogin();
        }}
      >
        <DialogContent className="max-w-md rounded-[14px] sm:rounded-[14px]" aria-describedby={undefined}>
          <DialogTitle className="font-[family:var(--font-jakarta)] text-lg text-[#1d2a3b]">登录</DialogTitle>
          {loginBanner ? <p className="text-sm text-[#64748b]">{loginBanner}</p> : null}
          <form
            className="grid gap-3 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              void loginWithPassword(account, password);
            }}
          >
            <div className="grid gap-1">
              <label className="text-xs text-[#7e8da0]">账号</label>
              <Input
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                className="h-9 rounded-[10px]"
                autoComplete="username"
                placeholder="用户名或邮箱"
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
                placeholder="请输入密码"
              />
            </div>
            {loginError ? <p className="text-sm text-red-600">{loginError}</p> : null}
            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="ghost"
                className="h-9 rounded-[10px] px-2 text-[#64748b] hover:text-[#1d2a3b]"
                onClick={() => {
                  setLoginError("");
                  setRegError("");
                  setRegUsernameOk(null);
                  setRegisterOpen(true);
                }}
              >
                注册
              </Button>
              <Button type="submit" className="rounded-[10px]" disabled={loginBusy}>
                {loginBusy ? "登录中…" : "登录"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={registerOpen}
        onOpenChange={(o) => {
          setRegisterOpen(o);
        }}
      >
        <DialogContent className="max-w-md rounded-[14px] sm:rounded-[14px]" aria-describedby={undefined}>
          <DialogTitle className="font-[family:var(--font-jakarta)] text-lg text-[#1d2a3b]">注册</DialogTitle>
          <p className="text-sm text-[#64748b]">通过邮箱验证码完成注册；注册成功后将自动登录。</p>

          <div className="grid gap-3 pt-1">
            <div className="grid gap-1">
              <label className="text-xs text-[#7e8da0]">用户名</label>
              <Input
                value={regUsername}
                onChange={(e) => setRegUsername(e.target.value)}
                className="h-9 rounded-[10px]"
                autoComplete="off"
                placeholder="2-64 个字符"
              />
              {regUsernameOk === true ? <p className="text-xs text-emerald-700">用户名可用</p> : null}
              {regUsernameOk === false ? <p className="text-xs text-red-600">用户名已存在</p> : null}
            </div>

            <div className="grid gap-1">
              <label className="text-xs text-[#7e8da0]">邮箱</label>
              <Input
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                className="h-9 rounded-[10px]"
                inputMode="email"
                autoComplete="email"
                placeholder="name@example.com"
              />
            </div>

            <div className="grid gap-1">
              <label className="text-xs text-[#7e8da0]">密码</label>
              <Input
                type="password"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                className="h-9 rounded-[10px]"
                autoComplete="new-password"
                placeholder="至少 4 位"
              />
            </div>

            <div className="grid gap-1">
              <label className="text-xs text-[#7e8da0]">邮箱验证码</label>
              <div className="flex gap-2">
                <Input
                  value={regCode}
                  onChange={(e) => setRegCode(e.target.value)}
                  className="h-9 flex-1 rounded-[10px]"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6 位验证码"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-[10px] px-3"
                  onClick={() => void requestRegisterEmailOtp()}
                  disabled={regCooldownLeft > 0 || regBusy}
                >
                  {regCooldownLeft > 0 ? `${regCooldownLeft}s` : "获取验证码"}
                </Button>
              </div>
            </div>

            {regError ? <p className="text-sm text-red-600">{regError}</p> : null}

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                className="rounded-[10px]"
                onClick={() => setRegisterOpen(false)}
                disabled={regBusy}
              >
                返回登录
              </Button>
              <Button type="button" className="rounded-[10px]" disabled={regBusy} onClick={() => void completeRegister()}>
                {regBusy ? "处理中…" : "完成注册并登录"}
              </Button>
            </div>
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
