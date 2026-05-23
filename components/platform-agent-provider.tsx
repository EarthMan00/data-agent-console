"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

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
import { ArrowLeft, ArrowRight, Power } from "@/components/ui/tabler-icons";

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

const PlatformAgentContext = createContext<PlatformAgentContextValue | null>(
  null,
);

function formatLoginError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const proxyHint =
    /failed to fetch|load failed|networkerror/i.test(msg) &&
    (process.env.NEXT_PUBLIC_AGENT_API_USE_PROXY ?? "").trim() !== "1"
      ? " 若为从其它电脑访问，请在 .env.local 设置 NEXT_PUBLIC_AGENT_API_USE_PROXY=1 并重启 dev。"
      : "";

  if (/failed to fetch|load failed|networkerror/i.test(msg)) {
    return `无法连接登录服务，请检查网络或服务配置。${proxyHint}`;
  }
  if (
    (e instanceof AgentApiError && (e.status === 401 || e.status === 403)) ||
    /login failed|invalid credentials|invalid password|incorrect|unauthorized/i.test(
      msg,
    )
  ) {
    return "账号或密码错误，请重新输入。";
  }
  if (/[\u4e00-\u9fa5]/.test(msg)) {
    return msg;
  }
  return "登录失败，请稍后重试。";
}

export function useOptionalPlatformAgent(): PlatformAgentContextValue | null {
  return useContext(PlatformAgentContext);
}

function PlatformAgentInner({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [auth, setAuth] = useState<AgentSessionSnapshot | null>(null);
  const [platformSessionId, setPlatformSessionId] = useState<string | null>(
    null,
  );
  const [authHydrated, setAuthHydrated] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [loginStep, setLoginStep] = useState<"account" | "password">("account");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");
  const accountInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const suppressLoginOpenUntilRef = useRef(0);

  useEffect(() => {
    const snap = loadAgentSession();
    setAuth(snap);
    setPlatformSessionId(loadPlatformSessionId());
    setAuthHydrated(true);
    const sync = () => setAuth(loadAgentSession());
    window.addEventListener(AGENT_SESSION_CHANGED_EVENT, sync);
    return () => window.removeEventListener(AGENT_SESSION_CHANGED_EVENT, sync);
  }, []);

  useEffect(() => {
    const snap = auth;
    if (!snap?.accessToken || snap.displayName) return;
    let cancelled = false;
    void checkAccessToken(snap.accessToken)
      .then((res) => {
        if (cancelled || !res.username) return;
        const next: AgentSessionSnapshot = { ...snap, displayName: res.username, userRole: res.user_role ?? snap.userRole };
        saveAgentSession(next);
        setAuth(next);
      })
      .catch(() => {
        // 展示名补全失败不影响既有登录态。
      });
    return () => {
      cancelled = true;
    };
  }, [auth]);

  const openLogin = useCallback((banner?: string) => {
    void banner;
    if (Date.now() < suppressLoginOpenUntilRef.current) return;
    setAccount("");
    setPassword("");
    setLoginError("");
    setLoginStep("account");
    setLoginOpen(true);
  }, []);

  const closeLogin = useCallback(() => {
    suppressLoginOpenUntilRef.current = Date.now() + 650;
    setAccount("");
    setPassword("");
    setLoginError("");
    setLoginStep("account");
    setLoginOpen(false);
  }, []);

  useEffect(() => {
    if (!loginOpen) return;
    const t = window.setTimeout(() => {
      if (loginStep === "account") {
        accountInputRef.current?.focus();
      } else {
        passwordInputRef.current?.focus();
      }
    }, 120);
    return () => window.clearTimeout(t);
  }, [loginOpen, loginStep]);

  useEffect(() => {
    if (!loginOpen) return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        closeLogin();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeLogin, loginOpen]);

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
            const next: AgentSessionSnapshot = {
              ...snap,
              accessToken: nextAccess,
            };
            saveAgentSession(next);
            setAuth(next);
            await run(nextAccess);
            return;
          } catch (refreshErr) {
            invalidateSessionAndRequestLogin();
            throw new AgentApiError(
              "登录已失效，请重新登录。",
              401,
              refreshErr,
            );
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
      openLogin("登录已失效，请重新登录。");
      router.replace("/");
    };
    window.addEventListener(AGENT_AUTH_EXPIRED_EVENT, onExpired);
    return () =>
      window.removeEventListener(AGENT_AUTH_EXPIRED_EVENT, onExpired);
  }, [openLogin, router]);

  const applyLoginResponse = useCallback(
    async (res: {
      access_token: string;
      refresh_token: string;
      user_id: string;
      username?: string;
      user_role?: string | undefined;
    }, displayNameHint?: string) => {
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
        displayName: res.username ?? displayNameHint ?? res.user_id,
        userRole: res.user_role,
      };
      saveAgentSession(snap);
      setAuth(snap);
      clearPlatformSessionId();
      setPlatformSessionId(null);
      setLoginOpen(false);
    },
    [],
  );

  const loginWithPassword = useCallback(
    async (a: string, p: string) => {
      setLoginBusy(true);
      setLoginError("");
      try {
        const res = await login(a, p);
        await applyLoginResponse(res, a.trim());
      } catch (e) {
        setLoginError(formatLoginError(e));
      } finally {
        setLoginBusy(false);
      }
    },
    [applyLoginResponse],
  );

  const advanceLogin = useCallback(() => {
    if (loginStep === "account") {
      if (!account.trim()) {
        setLoginError("请输入账号");
        accountInputRef.current?.focus();
        return;
      }
      setLoginError("");
      setLoginStep("password");
      return;
    }
    void loginWithPassword(account, password);
  }, [account, loginStep, loginWithPassword, password]);

  const returnToAccountStep = useCallback(() => {
    setLoginError("");
    setPassword("");
    setLoginStep("account");
  }, []);

  const handleLoginInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      advanceLogin();
    },
    [advanceLogin],
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
    setPlatformSessionId(null);
    router.push("/");
  }, [auth, platformSessionId, router]);

  const beginNewHomeTaskSession = useCallback(async (): Promise<
    string | null
  > => {
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
            console.warn(
              "[platform-agent] release_session_before_new_home_failed",
              {
                session_id: sid,
                error: e instanceof Error ? e.message : String(e),
                status: e instanceof AgentApiError ? e.status : undefined,
              },
            );
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
      authValidated: authHydrated && Boolean(auth?.accessToken),
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
      {loginOpen ? (
        <div className="mdata-auth-overlay fixed inset-0 z-50 bg-[#b9b8b5]">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="mdata-login-title"
            className="mdata-auth-panel fixed left-1/2 top-1/2 h-[calc(100vh-40px)] w-[calc(100vw-40px)] max-w-none -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[24px] border-0 bg-[#141414] p-0 text-white shadow-none sm:rounded-[24px]"
          >
            <div className="relative h-full w-full overflow-hidden">
              <div className="absolute left-9 top-[21px] flex h-[31px] items-center gap-2.5">
                <div className="flex items-center gap-2.5">
                  <Image
                    src="/mdata-logo.png"
                    alt="Alice"
                    width={31}
                    height={31}
                    className="h-[31px] w-[31px] object-contain"
                    draggable={false}
                    priority
                  />
                  <span className="text-[27px] font-semibold leading-[31px] text-white">
                    Alice
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="absolute right-[18px] top-3.5 z-20 inline-flex h-16 w-16 items-center justify-center rounded-full text-white/58 transition-[color,background-color,opacity] duration-300 hover:bg-white/[0.04] hover:text-white/82"
                aria-label="关闭登录"
                onPointerDown={(e) => {
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  closeLogin();
                }}
              >
                <Power className="h-9 w-9" strokeWidth={1.8} />
              </button>

              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-[250px] w-[min(730px,calc(100vw-120px))]">
                  <h2
                    id="mdata-login-title"
                    className="h-[90px] max-w-[730px] text-left text-[30px] font-semibold leading-[45px] tracking-normal text-white transition-colors duration-300"
                  >
                    我是
                    Alice，跨境电商运营助手，掌握数据，洞察数据的神。请先登录
                  </h2>

                  <form
                    className="mt-5 h-[121px] w-full"
                    onSubmit={(e) => {
                      e.preventDefault();
                      advanceLogin();
                    }}
                  >
                    <label className="sr-only" htmlFor="mdata-login-account">
                      账号
                    </label>
                    <label className="sr-only" htmlFor="mdata-login-password">
                      密码
                    </label>
                    <div className="flex h-[45px] items-center">
                      <span className="inline-flex h-[45px] w-[103px] shrink-0 items-center text-[30px] font-bold leading-[45px] text-white">
                        {loginStep === "account" ? "账号" : "密码"}
                      </span>
                      <input
                        id="mdata-login-account"
                        ref={accountInputRef}
                        name="username"
                        aria-label="账号"
                        aria-invalid={
                          loginStep === "account" && loginError
                            ? true
                            : undefined
                        }
                        aria-describedby={
                          loginStep === "account" && loginError
                            ? "mdata-login-error"
                            : undefined
                        }
                        value={account}
                        onChange={(e) => {
                          setAccount(e.target.value);
                          if (loginError) setLoginError("");
                        }}
                        onKeyDown={handleLoginInputKeyDown}
                        className={
                          loginStep === "account"
                            ? "h-[42px] min-w-0 flex-1 bg-transparent text-[30px] font-bold leading-none text-white caret-white outline-none placeholder:text-[#4d4d4d]"
                            : "hidden"
                        }
                        autoComplete="username"
                        placeholder="请在此处输入用户名或邮箱"
                      />
                      <input
                        id="mdata-login-password"
                        ref={passwordInputRef}
                        name="password"
                        aria-label="密码"
                        aria-invalid={
                          loginStep === "password" && loginError
                            ? true
                            : undefined
                        }
                        aria-describedby={
                          loginStep === "password" && loginError
                            ? "mdata-login-error"
                            : undefined
                        }
                        type="password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (loginError) setLoginError("");
                        }}
                        onKeyDown={handleLoginInputKeyDown}
                        className={
                          loginStep === "password"
                            ? "h-[42px] min-w-0 flex-1 bg-transparent text-[30px] font-bold leading-none text-white caret-white outline-none placeholder:text-[#4d4d4d]"
                            : "hidden"
                        }
                        autoComplete="current-password"
                        placeholder="请在此处输入密码"
                      />
                    </div>

                    {loginError ? (
                      <p
                        id="mdata-login-error"
                        role="alert"
                        className="mt-4 max-w-[640px] text-[14px] font-medium leading-6 text-[#ff7a7a]"
                      >
                        {loginError}
                      </p>
                    ) : null}

                    <div className="-ml-3 mt-7 flex h-12 items-center gap-3">
                      {loginStep === "password" ? (
                        <button
                          type="button"
                          aria-label="返回账号"
                          disabled={loginBusy}
                          className="inline-flex h-12 w-12 items-center justify-center rounded-full text-white transition-colors duration-300 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-45"
                          onClick={returnToAccountStep}
                        >
                          <ArrowLeft className="h-7 w-7" strokeWidth={1.85} />
                        </button>
                      ) : null}
                      <button
                        type="submit"
                        aria-label={loginStep === "account" ? "继续" : "登录"}
                        disabled={loginBusy}
                        className="inline-flex h-12 w-12 items-center justify-center rounded-full text-white transition-colors duration-300 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <ArrowRight className="h-7 w-7" strokeWidth={1.85} />
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </PlatformAgentContext.Provider>
  );
}

export function PlatformAgentProvider({ children }: { children: ReactNode }) {
  if (!isAgentRealApiEnabled()) {
    return (
      <PlatformAgentContext.Provider value={null}>
        {children}
      </PlatformAgentContext.Provider>
    );
  }
  return <PlatformAgentInner>{children}</PlatformAgentInner>;
}
