"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import {
  AgentApiError,
  checkUsernameAvailable,
  checkAccessToken,
  createSession,
  formatAgentApiErrorForUser,
  login,
  logoutPlatformAuth,
  parseFastApiDetail,
  registerByEmail,
  refreshAccessToken,
  releaseSession,
  sendRegisterEmailOtp,
} from "@/lib/agent-api/client";
import {
  AGENT_AUTH_EXPIRED_EVENT,
  AGENT_SESSION_CHANGED_EVENT,
  clearAgentSession,
  clearPlatformSessionId,
  HTTP_ONLY_REFRESH_TOKEN_PLACEHOLDER,
  loadAgentSession,
  loadPlatformSessionId,
  saveAgentSession,
  savePlatformSessionId,
  type AgentSessionSnapshot,
} from "@/lib/agent-api/session";
import { invalidateSessionAndRequestLogin } from "@/lib/agent-runtime/auth";
import { ALICE_LOGO_SRC } from "@/lib/brand-assets";
import { ArrowLeft, ArrowRight, Power } from "@/components/ui/tabler-icons";

const LOGIN_INTRO_TEXT = "我是 Alice，欢迎回来。";
const LOGIN_RETURNING_TEXT = "我是 Alice，欢迎回来。";
const REGISTER_INTRO_TEXT = "欢迎注册，我是 Alice，你的跨境运营助手";
const REGISTER_CODE_TITLE = "请输入发送给您邮箱的验证码";
const LOGIN_INTRO_CHAR_INTERVAL_MS = 34;
const LOGIN_RETURNING_STORAGE_KEY = "alice:has-logged-in";
const PENDING_HOME_TASK_STORAGE_KEY = "alice:pending-home-task-after-login";
const REGISTER_CODE_LENGTH = 6;
type AuthMode = "login" | "register";
type RegisterStep = "email" | "code" | "password";
type LoginContinuation = () => void | Promise<void>;
type AuthTitleAnimationState = {
  done: boolean;
  key: string;
  text: string;
};

const REGISTER_STEP_META: Record<
  RegisterStep,
  {
    label: string;
    placeholder: string;
    autoComplete: string;
    inputMode?: "email" | "text" | "numeric";
    type?: string;
  }
> = {
  email: {
    label: "邮箱",
    placeholder: "请在此处输入邮箱",
    autoComplete: "email",
    inputMode: "email",
    type: "email",
  },
  code: {
    label: "验证码",
    placeholder: "请输入 6 位验证码",
    autoComplete: "one-time-code",
    inputMode: "numeric",
  },
  password: {
    label: "密码",
    placeholder: "请在此处设置密码",
    autoComplete: "new-password",
    type: "password",
  },
};

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
  openLogin: (banner?: string, afterLogin?: LoginContinuation) => void;
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

  if (/failed to fetch|load failed|networkerror/i.test(msg)) {
    return "当前无法连接登录服务，请检查网络后重试。若仍无法登录，请联系管理员。";
  }
  if (e instanceof AgentApiError) {
    const detail = parseFastApiDetail(e.body);
    if (detail && e.status !== 401 && e.status !== 403) return detail;
  }
  if (
    (e instanceof AgentApiError && (e.status === 401 || e.status === 403)) ||
    /invalid credentials|invalid password|incorrect|unauthorized/i.test(
      msg,
    )
  ) {
    return "账号或密码错误，请重新输入。";
  }
  if (/NEXT_PUBLIC|\.env|API_ORIGIN|API_USE_PROXY|dev/i.test(msg)) {
    return "登录服务暂时不可用，请稍后重试或联系管理员。";
  }
  if (/[\u4e00-\u9fa5]/.test(msg)) {
    return msg;
  }
  return "登录失败，请稍后重试。";
}

function formatRegisterError(e: unknown): string {
  const msg = formatAgentApiErrorForUser(e)
    .replace(/\s*\(HTTP\s+\d+[^)]*\)\s*$/i, "")
    .trim();
  if (/failed to fetch|load failed|networkerror/i.test(msg)) {
    return "当前无法连接注册服务，请检查网络后重试。";
  }
  if (
    e instanceof AgentApiError &&
    e.status === 403 &&
    /public register disabled/i.test(msg)
  ) {
    return "注册暂未开放，请联系管理员。";
  }
  if (
    e instanceof AgentApiError &&
    e.status >= 500 &&
    /email register not available|identity not available/i.test(msg)
  ) {
    return "邮箱注册暂时不可用，请稍后重试。";
  }
  if (/[\u4e00-\u9fa5]/.test(msg)) {
    return msg;
  }
  return "注册失败，请稍后重试。";
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function defaultUsernameFromEmail(email: string): string {
  const localPart = email.trim().split("@")[0]?.trim() ?? "";
  return localPart.slice(0, 64);
}

function registerUsernameCandidates(email: string): string[] {
  const base = defaultUsernameFromEmail(email);
  let hash = 0;
  for (const ch of email.trim().toLowerCase()) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  const suffix = hash.toString(36).slice(0, 6).padStart(4, "0");
  const primary = base.length >= 2 ? base : `user-${suffix}`;
  const prefix = primary.slice(0, Math.max(2, 63 - suffix.length));
  const fallback = `${prefix}-${suffix}`;
  return Array.from(new Set([primary.slice(0, 64), fallback.slice(0, 64)]));
}

function hasLoggedInOnThisDevice(): boolean {
  try {
    return window.localStorage.getItem(LOGIN_RETURNING_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markLoggedInOnThisDevice() {
  try {
    window.localStorage.setItem(LOGIN_RETURNING_STORAGE_KEY, "1");
  } catch {
    // localStorage may be unavailable in restricted browser contexts.
  }
}

function AuthTypewriterText({
  text,
  enabled,
  intervalMs = 28,
  onDone,
}: {
  text: string;
  enabled: boolean;
  intervalMs?: number;
  onDone: () => void;
}) {
  const shouldType = enabled && text.length > 0;
  const [visibleText, setVisibleText] = useState(() => (shouldType ? "" : text));
  const [done, setDone] = useState(() => !shouldType);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const chars = [...text];
    if (!shouldType || chars.length === 0) {
      onDoneRef.current();
      return;
    }

    let index = 0;
    let timer: number | undefined;

    const tick = () => {
      index += 1;
      setVisibleText(chars.slice(0, index).join(""));
      if (index >= chars.length) {
        setDone(true);
        onDoneRef.current();
        return;
      }
      timer = window.setTimeout(tick, intervalMs);
    };

    timer = window.setTimeout(tick, 80);
    return () => {
      if (timer != null) window.clearTimeout(timer);
    };
  }, [intervalMs, shouldType, text]);

  return (
    <>
      {visibleText}
      {enabled && !done ? (
        <span className="mdata-auth-type-caret" aria-hidden="true" />
      ) : null}
    </>
  );
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
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [loginStep, setLoginStep] = useState<"account" | "password">("account");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginIntroFullText, setLoginIntroFullText] = useState(LOGIN_INTRO_TEXT);
  const [, setLoginTitleAnimation] =
    useState<AuthTitleAnimationState>({ done: true, key: "", text: LOGIN_INTRO_TEXT });
  const [loginTitleOverride, setLoginTitleOverride] = useState("");
  const [loginTitleReplayId, setLoginTitleReplayId] = useState(0);
  const [authTitleDoneKey, setAuthTitleDoneKey] = useState("");
  const [registerStep, setRegisterStep] = useState<RegisterStep>("email");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerCode, setRegisterCode] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerCodeEntryId, setRegisterCodeEntryId] = useState(0);
  const [registerRetrySeconds, setRegisterRetrySeconds] = useState(0);
  const accountInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const registerInputRef = useRef<HTMLInputElement | null>(null);
  const registerCodeDigitRefs = useRef<Array<HTMLInputElement | null>>([]);
  const suppressLoginOpenUntilRef = useRef(0);
  const loginContinuationRef = useRef<LoginContinuation | null>(null);

  const resetRegisterForm = useCallback(() => {
    setRegisterStep("email");
    setRegisterEmail("");
    setRegisterUsername("");
    setRegisterCode("");
    setRegisterPassword("");
    setRegisterRetrySeconds(0);
  }, []);

  const focusRegisterCodeDigit = useCallback((index = 0) => {
    const safeIndex = Math.min(Math.max(index, 0), REGISTER_CODE_LENGTH - 1);
    const focus = () => {
      const input = registerCodeDigitRefs.current[safeIndex];
      input?.focus({ preventScroll: true });
      input?.select();
    };
    focus();
    window.requestAnimationFrame(() => {
      focus();
      window.setTimeout(focus, 80);
    });
  }, []);
  const isRegisterCodeStep = authMode === "register" && registerStep === "code";
  const baseLoginTitleText = isRegisterCodeStep
    ? REGISTER_CODE_TITLE
    : authMode === "register"
      ? REGISTER_INTRO_TEXT
      : loginIntroFullText;
  const activeLoginTitleText = loginTitleOverride || baseLoginTitleText;
  const activeLoginTitleKey = [
    loginTitleReplayId,
    authMode,
    loginStep,
    registerStep,
    isRegisterCodeStep ? registerCodeEntryId : 0,
    activeLoginTitleText,
  ].join(":");
  const isLoginTitleError = Boolean(loginTitleOverride);
  const activeTitleTypingDone = !loginOpen || authTitleDoneKey === activeLoginTitleKey;

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      const snap = loadAgentSession();
      if (snap) {
        if (!cancelled) {
          setAuth(snap);
          markLoggedInOnThisDevice();
        }
      } else {
        try {
          const nextAccess = await refreshAccessToken();
          const checked = await checkAccessToken(nextAccess);
          const next: AgentSessionSnapshot = {
            accessToken: nextAccess,
            refreshToken: HTTP_ONLY_REFRESH_TOKEN_PLACEHOLDER,
            userId: checked.user_id ?? "",
            displayName: checked.username ?? undefined,
            userRole: checked.user_role ?? undefined,
          };
          saveAgentSession(next);
          if (!cancelled) {
            setAuth(next);
            markLoggedInOnThisDevice();
          }
        } catch {
          // No valid cookie-backed session to restore.
        }
      }
      if (!cancelled) {
        setPlatformSessionId(loadPlatformSessionId());
        setAuthHydrated(true);
      }
    };
    void hydrate();
    const sync = () => setAuth(loadAgentSession());
    window.addEventListener(AGENT_SESSION_CHANGED_EVENT, sync);
    return () => {
      cancelled = true;
      window.removeEventListener(AGENT_SESSION_CHANGED_EVENT, sync);
    };
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

  const openLogin = useCallback((banner?: string, afterLogin?: LoginContinuation) => {
    if (Date.now() < suppressLoginOpenUntilRef.current) return;
    loginContinuationRef.current = afterLogin ?? null;
    setAccount("");
    setPassword("");
    setAuthMode("login");
    resetRegisterForm();
    setLoginError("");
    setLoginStep("account");
    setLoginIntroFullText(
      hasLoggedInOnThisDevice() ? LOGIN_RETURNING_TEXT : LOGIN_INTRO_TEXT,
    );
    setLoginTitleOverride("");
    setLoginTitleReplayId((id) => id + 1);
    setLoginOpen(true);
  }, [resetRegisterForm]);

  const closeLogin = useCallback(() => {
    suppressLoginOpenUntilRef.current = Date.now() + 650;
    try {
      sessionStorage.removeItem(PENDING_HOME_TASK_STORAGE_KEY);
    } catch {
      // sessionStorage may be unavailable in restricted browser contexts.
    }
    setAccount("");
    setPassword("");
    setAuthMode("login");
    resetRegisterForm();
    setLoginError("");
    loginContinuationRef.current = null;
    setLoginStep("account");
    setLoginTitleOverride("");
    setLoginTitleAnimation({ done: true, key: "", text: "" });
    setLoginOpen(false);
  }, [resetRegisterForm]);

  const replayAuthTitle = useCallback((titleOverride = "") => {
    setLoginTitleOverride(titleOverride);
    setLoginTitleReplayId((id) => id + 1);
  }, []);

  const showAuthErrorTitle = useCallback(
    (message: string) => {
      setLoginError(message);
      replayAuthTitle(message);
    },
    [replayAuthTitle],
  );

  useEffect(() => {
    if (!loginOpen) return;

    let cancelled = false;
    let timer: number | undefined;
    let index = 1;
    const chars = [...activeLoginTitleText];
    const key = activeLoginTitleKey;
    const firstText = chars.slice(0, index).join("");

    setLoginTitleAnimation({
      done: chars.length <= index,
      key,
      text: firstText,
    });

    const tick = () => {
      if (cancelled) return;
      index += 1;
      const done = index >= chars.length;
      setLoginTitleAnimation({
        done,
        key,
        text: chars.slice(0, index).join(""),
      });
      if (!done) {
        timer = window.setTimeout(tick, LOGIN_INTRO_CHAR_INTERVAL_MS);
      }
    };

    if (chars.length > index) {
      timer = window.setTimeout(tick, LOGIN_INTRO_CHAR_INTERVAL_MS);
    }

    return () => {
      cancelled = true;
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [activeLoginTitleKey, activeLoginTitleText, loginOpen]);

  useEffect(() => {
    if (!loginOpen || !activeTitleTypingDone) return;
    const focusActiveInput = () => {
      if (authMode === "register") {
        if (registerStep === "code") {
          focusRegisterCodeDigit(Math.min(registerCode.length, REGISTER_CODE_LENGTH - 1));
        } else {
          registerInputRef.current?.focus();
        }
      } else if (loginStep === "account") {
        accountInputRef.current?.focus();
      } else {
        passwordInputRef.current?.focus();
      }
    };
    const raf = window.requestAnimationFrame(focusActiveInput);
    return () => window.cancelAnimationFrame(raf);
  }, [activeTitleTypingDone, authMode, focusRegisterCodeDigit, loginOpen, loginStep, registerCode.length, registerStep]);

  useEffect(() => {
    if (!loginOpen || authMode !== "register" || registerStep !== "code") return;
    if (loginBusy || registerCode.length !== REGISTER_CODE_LENGTH) return;
    const t = window.setTimeout(() => {
      setLoginError("");
      replayAuthTitle("");
      setRegisterStep("password");
    }, 220);
    return () => window.clearTimeout(t);
  }, [authMode, loginBusy, loginOpen, registerCode, registerStep, replayAuthTitle]);

  useEffect(() => {
    if (!loginOpen || registerRetrySeconds <= 0) return;
    const t = window.setTimeout(() => {
      setRegisterRetrySeconds((next) => Math.max(0, next - 1));
    }, 1000);
    return () => window.clearTimeout(t);
  }, [loginOpen, registerRetrySeconds]);

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
            const nextAccess = await refreshAccessToken();
            const next: AgentSessionSnapshot = {
              ...snap,
              accessToken: nextAccess,
              refreshToken: HTTP_ONLY_REFRESH_TOKEN_PLACEHOLDER,
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
        refreshToken: res.refresh_token || HTTP_ONLY_REFRESH_TOKEN_PLACEHOLDER,
        userId: res.user_id,
        displayName: res.username ?? displayNameHint ?? res.user_id,
        userRole: res.user_role,
      };
      saveAgentSession(snap);
      markLoggedInOnThisDevice();
      setAuth(snap);
      clearPlatformSessionId();
      setPlatformSessionId(null);
      setLoginOpen(false);
      const continuation = loginContinuationRef.current;
      loginContinuationRef.current = null;
      if (continuation) {
        try {
          await continuation();
        } catch (e) {
          console.warn("[platform-agent] login_continuation_failed", {
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
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
        showAuthErrorTitle(formatLoginError(e));
      } finally {
        setLoginBusy(false);
      }
    },
    [applyLoginResponse, showAuthErrorTitle],
  );

  const sendRegisterCode = useCallback(
    async (emailValue = registerEmail.trim()) => {
      const email = emailValue.trim();
      if (!isLikelyEmail(email)) {
        showAuthErrorTitle("请输入有效邮箱");
        setRegisterStep("email");
        return false;
      }
      setLoginBusy(true);
      setLoginError("");
      try {
        let username = "";
        for (const candidate of registerUsernameCandidates(email)) {
          if (await checkUsernameAvailable(candidate)) {
            username = candidate;
            break;
          }
        }
        if (!username) {
          showAuthErrorTitle("该邮箱暂时无法注册，请换一个邮箱或去登录");
          return false;
        }
        setRegisterUsername(username);
        const res = await sendRegisterEmailOtp(username, email);
        setRegisterCode("");
        if (res.retryAfterSeconds) {
          setRegisterRetrySeconds(res.retryAfterSeconds);
          showAuthErrorTitle(`${res.retryAfterSeconds} 秒后可重新获取验证码`);
        } else {
          setRegisterRetrySeconds(60);
          replayAuthTitle("");
        }
        if (registerStep !== "code") {
          setRegisterCodeEntryId((id) => id + 1);
        }
        setRegisterStep("code");
        return true;
      } catch (e) {
        showAuthErrorTitle(formatRegisterError(e));
        return false;
      } finally {
        setLoginBusy(false);
      }
    },
    [registerEmail, registerStep, replayAuthTitle, showAuthErrorTitle],
  );

  const advanceRegister = useCallback(async () => {
    if (registerStep === "email") {
      const email = registerEmail.trim();
      if (!isLikelyEmail(email)) {
        showAuthErrorTitle("请输入有效邮箱");
        return;
      }
      await sendRegisterCode(email);
      return;
    }

    if (registerStep === "code") {
      if (registerCode.trim().length < REGISTER_CODE_LENGTH) {
        showAuthErrorTitle("请输入 6 位验证码");
        return;
      }
      setLoginError("");
      replayAuthTitle("");
      setRegisterStep("password");
      return;
    }

    const passwordValue = registerPassword;
    if (passwordValue.length < 4) {
      showAuthErrorTitle("密码至少 4 位");
      return;
    }

    setLoginBusy(true);
    setLoginError("");
    try {
      const res = await registerByEmail({
        email: registerEmail.trim(),
        username: registerUsername.trim(),
        code: registerCode.trim(),
        password: passwordValue,
      });
      await applyLoginResponse(res, registerUsername.trim());
    } catch (e) {
      showAuthErrorTitle(formatRegisterError(e));
    } finally {
      setLoginBusy(false);
    }
  }, [
    applyLoginResponse,
    registerCode,
    registerEmail,
    registerPassword,
    registerStep,
    registerUsername,
    replayAuthTitle,
    sendRegisterCode,
    showAuthErrorTitle,
  ]);

  const advanceLogin = useCallback(() => {
    if (loginStep === "account") {
      if (!account.trim()) {
        showAuthErrorTitle("请输入账号");
        return;
      }
      setLoginError("");
      replayAuthTitle("");
      setLoginStep("password");
      return;
    }
    if (!password.trim()) {
      showAuthErrorTitle("请输入密码");
      return;
    }
    void loginWithPassword(account, password);
  }, [account, loginStep, loginWithPassword, password, replayAuthTitle, showAuthErrorTitle]);

  const returnToAccountStep = useCallback(() => {
    setLoginError("");
    setPassword("");
    replayAuthTitle("");
    setLoginStep("account");
  }, [replayAuthTitle]);

  const returnRegisterStep = useCallback(() => {
    setLoginError("");
    replayAuthTitle("");
    if (registerStep === "password") {
      setRegisterPassword("");
      setRegisterCodeEntryId((id) => id + 1);
      setRegisterStep("code");
      return;
    }
    if (registerStep === "code") {
      setRegisterCode("");
      setRegisterStep("email");
      return;
    }
    setRegisterStep("email");
  }, [registerStep, replayAuthTitle]);

  const switchToRegister = useCallback(() => {
    if (loginBusy) return;
    setAuthMode("register");
    setLoginStep("account");
    setAccount("");
    setPassword("");
    resetRegisterForm();
    setLoginError("");
    replayAuthTitle("");
  }, [loginBusy, replayAuthTitle, resetRegisterForm]);

  const switchToLogin = useCallback(() => {
    if (loginBusy) return;
    setAuthMode("login");
    setLoginStep("account");
    setAccount("");
    setPassword("");
    resetRegisterForm();
    setLoginError("");
    replayAuthTitle("");
  }, [loginBusy, replayAuthTitle, resetRegisterForm]);

  const handleLoginInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      advanceLogin();
    },
    [advanceLogin],
  );

  const handleRegisterInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      void advanceRegister();
    },
    [advanceRegister],
  );

  const updateRegisterCode = useCallback((value: string, focusIndex?: number) => {
    const nextCode = value.replace(/\D/g, "").slice(0, REGISTER_CODE_LENGTH);
    setRegisterCode(nextCode);
    if (loginError) setLoginError("");
    if (focusIndex != null) {
      focusRegisterCodeDigit(focusIndex);
    }
  }, [focusRegisterCodeDigit, loginError]);

  const handleRegisterCodeDigitChange = useCallback(
    (index: number, rawValue: string) => {
      const typed = rawValue.replace(/\D/g, "");
      if (typed.length > 1) {
        updateRegisterCode(typed, Math.min(typed.length, REGISTER_CODE_LENGTH - 1));
        return;
      }
      const digits = Array.from({ length: REGISTER_CODE_LENGTH }, (_, digitIndex) => registerCode[digitIndex] ?? "");
      digits[index] = typed;
      const nextCode = digits.join("").slice(0, REGISTER_CODE_LENGTH);
      updateRegisterCode(nextCode, typed ? index + 1 : index);
    },
    [registerCode, updateRegisterCode],
  );

  const handleRegisterCodeDigitKeyDown = useCallback(
    (index: number, e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void advanceRegister();
        return;
      }
      if (e.key !== "Backspace") return;
      const digits = Array.from({ length: REGISTER_CODE_LENGTH }, (_, digitIndex) => registerCode[digitIndex] ?? "");
      if (digits[index]) {
        digits[index] = "";
        updateRegisterCode(digits.join(""), index);
        return;
      }
      if (index > 0) {
        digits[index - 1] = "";
        updateRegisterCode(digits.join(""), index - 1);
      }
    },
    [advanceRegister, registerCode, updateRegisterCode],
  );

  const handleRegisterCodePaste = useCallback(
    (e: ClipboardEvent<HTMLInputElement>) => {
      const text = e.clipboardData.getData("text");
      const digits = text.replace(/\D/g, "");
      if (!digits) return;
      e.preventDefault();
      updateRegisterCode(digits, Math.min(digits.length, REGISTER_CODE_LENGTH - 1));
    },
    [updateRegisterCode],
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
    try {
      await logoutPlatformAuth(snap?.accessToken);
    } catch (e) {
      console.warn("[platform-agent] logout_failed", {
        error: e instanceof Error ? e.message : String(e),
      });
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
        // Release the old session in the background — we don't need to wait
        // for it before creating the new one, and blocking here freezes the
        // UI while a previous task may still be polling on the old token.
        const sid = platformSessionId ?? loadPlatformSessionId();
        if (sid) {
          releaseSession(token, sid).catch((e) => {
            console.warn(
              "[platform-agent] release_session_before_new_home_failed",
              {
                session_id: sid,
                error: e instanceof Error ? e.message : String(e),
                status: e instanceof AgentApiError ? e.status : undefined,
              },
            );
          });
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

  const registerStepMeta = REGISTER_STEP_META[registerStep];
  const registerInputValue =
    registerStep === "email"
      ? registerEmail
      : registerStep === "code"
        ? registerCode
        : registerPassword;
  const canGoBack =
    authMode === "register" ? registerStep !== "email" : loginStep === "password";
  const activeAuthInputHasValue =
    authMode === "register"
      ? registerInputValue.trim().length > 0
      : loginStep === "account"
        ? account.trim().length > 0
        : password.trim().length > 0;
  const submitAuthLabel =
    authMode === "register"
      ? registerStep === "password"
        ? "注册"
        : "继续"
      : loginStep === "account"
        ? "继续"
        : "登录";
  const registerCodeDigits = Array.from(
    { length: REGISTER_CODE_LENGTH },
    (_, index) => registerCode[index] ?? "",
  );

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
        <div className="mdata-auth-overlay fixed inset-0 z-auth-overlay bg-fill-active" data-state="open">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="mdata-login-title"
            className="mdata-auth-panel fixed left-1/2 top-1/2 h-auth-panel w-auth-panel max-w-none -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-hero border-0 bg-primary p-0 text-primary-foreground shadow-none sm:rounded-hero"
          >
            <div className="relative h-full w-full overflow-hidden">
              <button
                type="button"
                className="absolute right-8 top-7 z-20 inline-flex h-attachment-thumb w-attachment-thumb items-center justify-center rounded-full text-primary-foreground/58 transition-colors duration-300 hover:bg-bg-surface/5 hover:text-primary-foreground/80"
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
                <div
                  className={
                    isRegisterCodeStep
                      ? "h-64 w-auth-visual-sm"
                      : "h-64 w-auth-visual-lg"
                  }
                >
                  <div
                    className={
                      isRegisterCodeStep
                        ? "flex items-center gap-4"
                        : "flex items-center gap-5"
                    }
                  >
                    <Image
                      src={ALICE_LOGO_SRC}
                      alt="Alice"
                      width={52}
                      height={52}
                      className={
                        isRegisterCodeStep
                          ? "mt-0.5 h-12 w-12 shrink-0 object-contain"
                          : "mt-0.5 h-13 w-13 shrink-0 object-contain"
                      }
                      draggable={false}
                      priority
                    />
                    <div className="min-w-0 flex-1">
                      <h2
                        id="alice-login-title"
                        aria-label={activeLoginTitleText}
                        className={
                          isRegisterCodeStep
                            ? "mdata-auth-title min-h-8 max-w-none text-left text-title-3 font-semibold leading-8 tracking-normal text-primary-foreground transition-colors duration-300"
                            : `mdata-auth-title min-h-source-row max-w-2xl text-left text-display font-medium leading-12 tracking-normal transition-colors duration-300 ${
                                isLoginTitleError
                                  ? "text-primary-foreground"
                                  : activeTitleTypingDone
                                    ? "mdata-auth-title-muted"
                                    : "text-primary-foreground"
                              }`
                        }
                      >
                        <AuthTypewriterText
                          key={activeLoginTitleKey}
                          text={activeLoginTitleText}
                          enabled={loginOpen}
                          intervalMs={isRegisterCodeStep ? 20 : 30}
                          onDone={() => setAuthTitleDoneKey(activeLoginTitleKey)}
                        />
                      </h2>
                    </div>
                  </div>
	                  <form
	                    key={activeLoginTitleKey}
	                    className={`${isRegisterCodeStep ? "ml-16 mt-4 h-auto" : "ml-18 mt-8 h-30"} transition-all ${
                      activeTitleTypingDone
                        ? "translate-y-0 opacity-100 duration-500"
                        : "pointer-events-none translate-y-2 opacity-0 duration-0"
                    }`}
                    aria-hidden={!activeTitleTypingDone}
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!activeTitleTypingDone) return;
                      if (authMode === "register") {
                        void advanceRegister();
                      } else {
                        advanceLogin();
                      }
                    }}
                  >
                    <label className="sr-only" htmlFor="alice-login-account">
                      账号
                    </label>
                    <label className="sr-only" htmlFor="alice-login-password">
                      密码
                    </label>
                    <label className="sr-only" htmlFor="alice-register-input">
                      注册信息
                    </label>
                    {isRegisterCodeStep ? (
                      <div className="flex w-full flex-col">
                        <p className="max-w-full text-left text-body font-medium leading-5 text-primary-foreground/24">
                          验证码已经发送至您的邮箱{registerEmail.trim()}，如果没有收到，请检查垃圾邮件。
                        </p>
                        <div className="mt-4 flex items-center justify-center gap-3" role="group" aria-label="验证码">
                          {registerCodeDigits.map((digit, index) => (
                            <input
                              key={index}
                              ref={(node) => {
                                registerCodeDigitRefs.current[index] = node;
                              }}
                              aria-label={`验证码第 ${index + 1} 位`}
                              inputMode="numeric"
                              autoComplete={index === 0 ? "one-time-code" : "off"}
                              pattern="[0-9]*"
                              value={digit}
                              maxLength={1}
                              disabled={!activeTitleTypingDone || loginBusy}
                              onChange={(e) => handleRegisterCodeDigitChange(index, e.target.value)}
                              onKeyDown={(e) => handleRegisterCodeDigitKeyDown(index, e)}
                              onPaste={handleRegisterCodePaste}
                              onFocus={(e) => e.currentTarget.select()}
                              className="h-source-row w-12 rounded-md border border-border-subtle/18 bg-transparent text-center text-title-3 font-semibold leading-none text-primary-foreground caret-white outline-none transition-colors duration-200 focus:border-border-subtle/64 focus:bg-bg-surface/5 disabled:cursor-not-allowed disabled:opacity-45"
                            />
                          ))}
                        </div>
                        <button
                          type="button"
                          disabled={loginBusy || !activeTitleTypingDone || registerRetrySeconds > 0}
                          className="mt-7 inline-flex h-6 items-center justify-center text-body font-semibold leading-5 text-primary-foreground/26 transition-colors duration-300 hover:text-primary-foreground/54 disabled:cursor-not-allowed disabled:text-primary-foreground/20"
                          onClick={() => {
                            void sendRegisterCode();
                          }}
                        >
                          {registerRetrySeconds > 0
                            ? `${registerRetrySeconds}s后重新发送`
                            : "重新发送"}
                        </button>
                      </div>
                    ) : (
                      <div className="flex h-11 w-auth-input items-center">
                        <input
                          id="alice-login-account"
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
                              ? "alice-login-error"
                              : undefined
                          }
                          value={account}
                          onChange={(e) => {
                            setAccount(e.target.value);
                            if (loginError) setLoginError("");
                          }}
                          onKeyDown={handleLoginInputKeyDown}
                          disabled={!activeTitleTypingDone}
                          className={
                            authMode === "login" && loginStep === "account"
                              ? "mdata-auth-input h-attachment-thumb min-w-0 flex-1 appearance-none bg-transparent text-display font-extrabold leading-none text-primary-foreground caret-white outline-none placeholder:text-text-secondary"
                              : "hidden"
                          }
                          autoComplete="username"
                          placeholder="请在此处输入用户名或邮箱"
                        />
                        <input
                          id="alice-login-password"
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
                              ? "alice-login-error"
                              : undefined
                          }
                          type="password"
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            if (loginError) setLoginError("");
                          }}
                          onKeyDown={handleLoginInputKeyDown}
                          disabled={!activeTitleTypingDone}
                          className={
                            authMode === "login" && loginStep === "password"
                              ? "mdata-auth-input h-attachment-thumb min-w-0 flex-1 appearance-none bg-transparent text-display font-extrabold leading-none text-primary-foreground caret-white outline-none placeholder:text-text-secondary"
                              : "hidden"
                          }
                          autoComplete="current-password"
                          placeholder="请在此处输入密码"
                        />
                        <input
                          id="alice-register-input"
                          ref={registerInputRef}
                          name={registerStep}
                          aria-label={registerStepMeta.label}
                          aria-invalid={
                            authMode === "register" && loginError
                              ? true
                              : undefined
                          }
                          aria-describedby={
                            authMode === "register" && loginError
                              ? "alice-login-error"
                              : undefined
                          }
                          type={registerStepMeta.type ?? "text"}
                          inputMode={registerStepMeta.inputMode}
                          value={registerInputValue}
                          onChange={(e) => {
                            const nextValue = e.target.value;
                            if (registerStep === "email") {
                              setRegisterEmail(nextValue);
                            } else {
                              setRegisterPassword(nextValue);
                            }
                            if (loginError) setLoginError("");
                          }}
                          onKeyDown={handleRegisterInputKeyDown}
                          disabled={!activeTitleTypingDone || loginBusy}
                          className={
                            authMode === "register"
                              ? "mdata-auth-input h-attachment-thumb min-w-0 flex-1 appearance-none bg-transparent text-display font-extrabold leading-none text-primary-foreground caret-white outline-none placeholder:text-text-secondary"
                              : "hidden"
                          }
                          autoComplete={registerStepMeta.autoComplete}
                          placeholder={registerStepMeta.placeholder}
                        />
                        {activeAuthInputHasValue ? (
                          <button
                            type="button"
                            aria-label={submitAuthLabel}
                            disabled={loginBusy || !activeTitleTypingDone}
                            className="ml-2 inline-flex h-attachment-thumb w-attachment-thumb shrink-0 items-center justify-center rounded-full text-primary-foreground transition-colors duration-300 hover:bg-bg-surface/5 disabled:cursor-not-allowed disabled:opacity-45"
                            onClick={() => {
                              if (!activeTitleTypingDone) return;
                              if (authMode === "register") {
                                void advanceRegister();
                              } else {
                                advanceLogin();
                              }
                            }}
                          >
                            <ArrowRight className="h-8 w-8" strokeWidth={1.85} />
                          </button>
                        ) : null}
                      </div>
                    )}

                    {loginError ? (
                      <p
                        id="alice-login-error"
                        role="alert"
                        className={
                          isLoginTitleError
                            ? "sr-only"
                            : "mt-4 max-w-2xl text-body font-medium leading-6 text-danger"
                        }
                      >
                        {loginError}
                      </p>
                    ) : null}

                  </form>
                </div>
              </div>
              {!isRegisterCodeStep ? (
                <div
                  className={`absolute bottom-3.5 left-9 z-20 flex h-16 items-center transition-opacity ${
                    activeTitleTypingDone
                      ? "opacity-100 duration-300"
                      : "pointer-events-none opacity-0 duration-0"
                  }`}
                >
                  <button
                    type="button"
                    disabled={loginBusy || !activeTitleTypingDone}
                    className="inline-flex h-16 items-center justify-start rounded-full px-0 text-body font-medium leading-5 text-primary-foreground/42 transition-colors duration-300 hover:text-primary-foreground/70 disabled:cursor-not-allowed disabled:text-primary-foreground/25"
                    onClick={
                      authMode === "register" ? switchToLogin : switchToRegister
                    }
                  >
                    {authMode === "register" ? "前往登录" : "注册账号"}
                  </button>
                </div>
              ) : null}
              <div
                className={`absolute bottom-7 right-8 z-20 flex items-center gap-2 transition-opacity ${
                  activeTitleTypingDone
                    ? "opacity-100 duration-300"
                    : "pointer-events-none opacity-0 duration-0"
                }`}
              >
                {canGoBack ? (
                  <button
                    type="button"
                    aria-label={
                      authMode === "register" ? "返回上一步" : "返回账号"
                    }
                    disabled={loginBusy || !activeTitleTypingDone}
                    className="inline-flex h-attachment-thumb w-attachment-thumb items-center justify-center rounded-full text-primary-foreground transition-colors duration-300 hover:bg-bg-surface/5 disabled:cursor-not-allowed disabled:opacity-45"
                    onClick={
                      authMode === "register"
                        ? returnRegisterStep
                        : returnToAccountStep
                    }
                  >
                    <ArrowLeft className="h-9 w-9" strokeWidth={1.85} />
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </PlatformAgentContext.Provider>
  );
}

export function PlatformAgentProvider({ children }: { children: ReactNode }) {
  return <PlatformAgentInner>{children}</PlatformAgentInner>;
}
