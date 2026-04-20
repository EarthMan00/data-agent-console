"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bookmark,
  ChevronDown,
  FolderHeart,
  LibraryBig,
  PanelLeft,
  PlusCircle,
  Trash2,
  Users,
} from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isPlatformBackendEnabled } from "@/lib/agent-runtime";
import {
  AgentApiError,
  listSessions,
  listSessionMessages,
  parseFastApiDetail,
  purgeSessionData,
} from "@/lib/agent-api/client";
import type { SessionListItem, SessionMessageItem } from "@/lib/agent-api/types";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "新的对话", icon: PlusCircle },
  { href: "/prompt-library", label: "提示词库", icon: Bookmark },
  { href: "/templates", label: "指令库", icon: LibraryBig },
  // { href: "/schedules", label: "定时任务", icon: Clock3 },
  { href: "/artifacts", label: "收藏夹", icon: FolderHeart },
];

type MoreDataShellProps = {
  currentPath: string;
  children: ReactNode;
  rightRail?: ReactNode;
  currentRunLabel?: string;
  mainDecoration?: ReactNode;
  contentScrollMode?: "shell" | "child";
};

type ShellMeta = Pick<MoreDataShellProps, "currentPath" | "rightRail" | "currentRunLabel" | "mainDecoration" | "contentScrollMode">;

type ShellMetaContextValue = {
  meta: ShellMeta;
  setMeta: (next: ShellMeta) => void;
};

const ShellMetaContext = createContext<ShellMetaContextValue | null>(null);

function ShellMetaProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [meta, setMeta] = useState<ShellMeta>({ currentPath: pathname ?? "/", contentScrollMode: "shell" });

  return <ShellMetaContext.Provider value={{ meta, setMeta }}>{children}</ShellMetaContext.Provider>;
}

function useShellMetaContext() {
  const context = useContext(ShellMetaContext);
  if (!context) {
    throw new Error("useShellMetaContext must be used within ShellMetaProvider");
  }
  return context;
}

type HistoryEntry = SessionListItem & {
  firstMessage?: string | null;
  firstAt?: string | null;
};

type MoreDataShellStateValue = {
  historySessions: HistoryEntry[];
  historyBusy: boolean;
  historyError: string;
  refreshHistory: () => Promise<void>;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (next: boolean | ((current: boolean) => boolean)) => void;
  setHistoryError: (next: string) => void;
};

const MoreDataShellStateContext = createContext<MoreDataShellStateValue | null>(null);

export function MoreDataShellStateProvider({ children }: { children: ReactNode }) {
  const platformAgent = useOptionalPlatformAgent();
  const [historySessions, setHistorySessions] = useState<HistoryEntry[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [historyWasLoaded, setHistoryWasLoaded] = useState(false);

  const isLoggedIn = Boolean(isPlatformBackendEnabled() && platformAgent?.auth?.accessToken);

  const refreshHistory = useCallback(async () => {
    if (!platformAgent?.auth?.accessToken) return;
    setHistoryBusy(true);
    setHistoryError("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        const res = await listSessions(token, 1, 50);
        const base = res.sessions ?? [];
        const head = base.slice(0, 8);
        const enriched: HistoryEntry[] = await Promise.all(
          head.map(async (s) => {
            try {
              const mr = await listSessionMessages(token, s.session_id, 80);
              const msgs = (mr.messages ?? []) as SessionMessageItem[];
              const sorted = [...msgs].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
              );
              const firstUser = sorted.find((m) => m.role === "user") ?? sorted[0];
              return {
                ...s,
                firstMessage: firstUser?.content ?? null,
                firstAt: firstUser?.created_at ?? s.created_at,
              };
            } catch {
              return { ...s, firstMessage: null, firstAt: s.created_at };
            }
          }),
        );
        setHistorySessions(enriched);
        setHistoryWasLoaded(true);
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setHistoryError(msg);
    } finally {
      setHistoryBusy(false);
    }
  }, [platformAgent, setHistoryError]);

  useEffect(() => {
    if (!isLoggedIn) {
      setHistorySessions([]);
      setHistoryWasLoaded(false);
      return;
    }
    if (!historyWasLoaded) {
      void refreshHistory();
    }
  }, [historyWasLoaded, isLoggedIn, refreshHistory]);

  const value = useMemo(
    () => ({
      historySessions,
      historyBusy,
      historyError,
      refreshHistory,
      sidebarCollapsed,
      setSidebarCollapsed,
      setHistoryError,
    }),
    [historySessions, historyBusy, historyError, refreshHistory, sidebarCollapsed, setHistoryError],
  );

  return <MoreDataShellStateContext.Provider value={value}>{children}</MoreDataShellStateContext.Provider>;
}

export function useMoreDataShellState() {
  const context = useContext(MoreDataShellStateContext);
  if (!context) {
    throw new Error("useMoreDataShellState must be used within MoreDataShellStateProvider");
  }
  return context;
}

export function MoreDataShell({
  currentPath,
  children,
  rightRail,
  currentRunLabel,
  mainDecoration,
  contentScrollMode = "shell",
}: MoreDataShellProps) {
  const { setMeta } = useShellMetaContext();

  useEffect(() => {
    setMeta({
      currentPath,
      rightRail,
      currentRunLabel,
      mainDecoration,
      contentScrollMode,
    });
  }, [currentPath, rightRail, currentRunLabel, mainDecoration, contentScrollMode, setMeta]);

  return <>{children}</>;
}

export function MoreDataShellRoot({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith("/admin");
  const isShareRoute = pathname?.startsWith("/share");

  if (isAdminRoute || isShareRoute) {
    return <>{children}</>;
  }

  return (
    <ShellMetaProvider>
      <MoreDataShellStateProvider>
        <MoreDataShellInner>{children}</MoreDataShellInner>
      </MoreDataShellStateProvider>
    </ShellMetaProvider>
  );
}

function MoreDataShellInner({ children }: { children: ReactNode }) {
  const { meta } = useShellMetaContext();
  return (
    <MoreDataShellComponent
      currentPath={meta.currentPath}
      rightRail={meta.rightRail}
      currentRunLabel={meta.currentRunLabel}
      mainDecoration={meta.mainDecoration}
      contentScrollMode={meta.contentScrollMode}
    >
      {children}
    </MoreDataShellComponent>
  );
}

function MoreDataShellComponent({
  currentPath,
  children,
  rightRail,
  currentRunLabel,
  mainDecoration,
  contentScrollMode = "shell",
}: MoreDataShellProps) {
  const router = useRouter();
  const platformAgent = useOptionalPlatformAgent();

  const {
    historySessions,
    historyBusy,
    historyError,
    refreshHistory,
    sidebarCollapsed,
    setSidebarCollapsed,
    setHistoryError,
  } = useMoreDataShellState();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [historyPurgeConfirmId, setHistoryPurgeConfirmId] = useState<string | null>(null);
  /** 首屏与服务端 HTML 一致：认证态来自客户端存储，仅在 mount 后再按登录态渲染侧栏，避免 hydration mismatch */
  const [clientMounted, setClientMounted] = useState(false);
  useEffect(() => {
    setClientMounted(true);
  }, []);
  const childManagedScroll = contentScrollMode === "child";

  const isLoggedIn = Boolean(isPlatformBackendEnabled() && platformAgent?.auth?.accessToken);
  const activeSessionId = platformAgent?.platformSessionId ?? null;
  const showAuthSidebar = clientMounted && isLoggedIn;
  /** 顶栏用户区：与侧栏同理，mount 前固定为「登录」，避免 token 仅在客户端存在时 hydration 不一致 */
  const headerAuth = platformAgent?.auth;
  const showHeaderUserMenu = clientMounted && Boolean(headerAuth);

  const sidebarNavItems = useMemo(() => {
    const base = [...navItems];
    if (showAuthSidebar && platformAgent?.auth?.userRole === "admin") {
      base.push({ href: "/user-management", label: "用户管理", icon: Users });
    }
    return base;
  }, [showAuthSidebar, platformAgent?.auth?.userRole]);

  const formatTime = (iso: string | null | undefined) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString();
  };

  const executePurgeHistorySession = useCallback(
    async (sessionId: string) => {
      if (!platformAgent?.auth) return;
      setDeletingId(sessionId);
      setHistoryError("");
      try {
        await platformAgent.withFreshToken(async (token) => {
          await purgeSessionData(token, sessionId);
        });
        setHistoryPurgeConfirmId(null);
        if (activeSessionId === sessionId) {
          platformAgent.clearActivePlatformSession();
          router.push("/");
        }
        await refreshHistory();
      } catch (e) {
        const msg =
          e instanceof AgentApiError
            ? parseFastApiDetail(e.body) ?? e.message
            : e instanceof Error
              ? e.message
              : String(e);
        setHistoryError(msg || "删除失败");
      } finally {
        setDeletingId(null);
      }
    },
    [activeSessionId, platformAgent, refreshHistory, router, setHistoryError],
  );

  return (
    <div className={childManagedScroll ? "h-screen overflow-hidden bg-transparent" : "min-h-screen bg-transparent"}>
      <div
        className={childManagedScroll ? "grid h-screen overflow-hidden bg-[rgba(250,249,245,0.82)]" : "grid min-h-screen bg-[rgba(250,249,245,0.82)]"}
        style={{ gridTemplateColumns: sidebarCollapsed ? "80px minmax(0,1fr)" : "272px minmax(0,1fr)" }}
      >
        <aside className={`sticky top-0 self-start h-screen min-h-0 overflow-y-auto border-r border-[#e2e7ef] bg-[rgba(255,255,255,0.76)] py-7 backdrop-blur-xl transition-[padding,width] ${sidebarCollapsed ? "px-4" : "px-6"}`}>
          <div className="relative">
            {sidebarCollapsed ? (
              <div className="flex justify-center">
                <BrandLogo compact />
              </div>
            ) : (
              <div>
                <div className="px-1">
                  <BrandLogo />
                </div>
              </div>
            )}

            <nav className="mt-6 space-y-2">
              {sidebarNavItems.map(({ href, label, icon: Icon }) => {
                const active = currentPath === href || (href === "/" && currentPath === "/agent");
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={(e) => {
                      platformAgent?.clearActivePlatformSession();
                      if (!platformAgent || href === "/") return;
                      if (!platformAgent.auth) {
                        e.preventDefault();
                        platformAgent.openLogin("请先登录后再继续操作。");
                      }
                    }}
                    className={`group flex items-center rounded-[14px] py-3 text-[15px] transition ${
                    active
                        ? "bg-[linear-gradient(180deg,#f5f5f5,#efefef)] font-medium text-[#18181b] shadow-[0_12px_24px_rgba(24,24,27,0.06)] ring-1 ring-[#e4e4e7]"
                        : "text-[#74839a] hover:bg-[#f2f5fa] hover:text-[#243248]"
                  } ${sidebarCollapsed ? "justify-center px-0" : "gap-3 px-4"}`}
                    title={sidebarCollapsed ? label : undefined}
                  >
                    <Icon className={`h-4 w-4 ${active ? "text-[#18181b]" : "text-[#8d9cb1] group-hover:text-[#18181b]"}`} />
                    {!sidebarCollapsed ? (
                      <>
                        <span>{label}</span>
                      </>
                    ) : null}
                  </Link>
                );
              })}
            </nav>

            {!sidebarCollapsed && showAuthSidebar ? (
              <div className="mt-10">
                <div className="flex items-center justify-between px-2 text-xs text-[#7f8da0]">
                  <span>历史对话</span>
                  <button
                    type="button"
                    className="h-4 w-4 rounded-full border border-[#d8dee8] hover:bg-white"
                    aria-label="刷新历史对话"
                    onClick={() => void refreshHistory()}
                  />
                </div>
                <div className="mt-2 space-y-2">
                  {historyBusy ? (
                    <div className="px-3 py-2 text-xs text-[#94a3b8]">加载中…</div>
                  ) : historyError ? (
                    <div className="px-3 py-2 text-xs text-red-600">加载失败：{historyError}</div>
                  ) : historySessions.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-[#94a3b8]">暂无历史对话</div>
                  ) : (
                    historySessions.map((s) => (
                      <div
                        key={s.session_id}
                        className={`flex w-full items-stretch gap-0.5 rounded-[14px] text-[13px] transition ${
                          activeSessionId && s.session_id === activeSessionId
                            ? "border border-[#e4e4e7] bg-[#f4f4f5] text-[#18181b]"
                            : "border border-transparent text-[#7d8795] hover:border-[#d9e0eb] hover:bg-[#f7f9fc] hover:text-[#243248]"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            platformAgent?.setActivePlatformSession(s.session_id);
                            router.push(`/agent?sessionId=${encodeURIComponent(s.session_id)}`);
                          }}
                          className="flex min-w-0 flex-1 items-center px-3 py-2.5 text-left"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate">{s.firstMessage || s.session_id}</div>
                            {s.firstAt ? (
                              <div className="mt-0.5 text-[11px] text-[#9ca3af] select-none">
                                {formatTime(s.firstAt)}
                              </div>
                            ) : null}
                          </div>
                        </button>
                        <Popover
                          open={historyPurgeConfirmId === s.session_id}
                          onOpenChange={(open) => {
                            setHistoryPurgeConfirmId(open ? s.session_id : null);
                          }}
                        >
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex w-9 shrink-0 items-center justify-center rounded-r-xl text-[#94a3b8] transition hover:bg-[#fee2e2] hover:text-red-600 disabled:opacity-40 data-[state=open]:bg-[#fee2e2] data-[state=open]:text-red-600"
                              aria-label="删除该历史会话"
                              aria-expanded={historyPurgeConfirmId === s.session_id}
                              disabled={deletingId === s.session_id}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            side="bottom"
                            align="end"
                            sideOffset={6}
                            className="w-[min(280px,calc(100vw-2rem))] space-y-3 p-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <p className="text-xs leading-relaxed text-[#475569]">
                              确定删除该历史会话？消息、任务与产物将从服务端永久删除，且不可恢复。
                            </p>
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 rounded-lg px-3 text-xs"
                                disabled={deletingId === s.session_id}
                                onClick={() => setHistoryPurgeConfirmId(null)}
                              >
                                取消
                              </Button>
                              <Button
                                type="button"
                                variant="default"
                                size="sm"
                                className="h-8 rounded-lg bg-red-600 px-3 text-xs hover:bg-red-700"
                                disabled={deletingId === s.session_id}
                                onClick={() => void executePurgeHistorySession(s.session_id)}
                              >
                                {deletingId === s.session_id ? "删除中…" : "确定删除"}
                              </Button>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}

          </div>
        </aside>

        <main className={childManagedScroll ? "flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-transparent" : "flex min-h-screen min-w-0 flex-col bg-transparent"}>
          <header className="sticky top-0 z-50 flex h-14.5 items-center justify-between border-b border-[#e3e8ef] bg-[rgba(255,255,255,0.95)] px-6 backdrop-blur-xl">
            <div className="flex min-w-0 items-center gap-3">
              <Button aria-label={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"} variant="ghost" size="icon" className="h-8 w-8 rounded-[10px] text-[#7e8da0]" onClick={() => setSidebarCollapsed((current) => !current)}>
                <PanelLeft className="h-4 w-4" />
              </Button>
              {currentRunLabel ? (
                <div className="min-w-0 truncate text-[15px] font-medium text-[#243248]">
                  {currentRunLabel}
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-2 text-sm text-[#7c8ca0]">
              {isPlatformBackendEnabled() && platformAgent ? (
                showHeaderUserMenu && headerAuth ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex h-9 max-w-55 items-center gap-2 rounded-full border border-[#e2e8f0] bg-white px-1.5 py-1 pr-2.5 text-left shadow-sm transition hover:bg-[#f8fafc]"
                        aria-label="用户中心"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#18181b] text-xs font-semibold text-white">
                          {(headerAuth.userId || "?").slice(0, 1).toUpperCase()}
                        </span>
                        <span className="hidden min-w-0 flex-1 truncate text-[13px] font-medium text-[#334155] sm:inline" title={headerAuth.userId}>
                          {headerAuth.userId}
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 text-[#94a3b8]" aria-hidden />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-72 space-y-3 p-4">
                      <div>
                        <div className="text-[13px] font-semibold text-[#1e293b]">用户中心</div>
                        <div className="mt-1 truncate text-xs text-[#64748b]" title={headerAuth.userId}>
                          {headerAuth.userId}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full justify-center rounded-[10px]"
                          onClick={() => void platformAgent.logout()}
                        >
                          退出登录
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <Button type="button" size="sm" className="rounded-[10px]" onClick={() => platformAgent.openLogin()}>
                    登录
                  </Button>
                )
              ) : (
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e4e4e7] text-sm font-semibold text-[#52525b]"
                  title="未启用后端联调"
                >
                  —
                </div>
              )}
            </div>
          </header>

          <div
            className={cn(
              "min-h-0 flex-1",
              rightRail && "grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(580px,61%)]",
            )}
          >
            <div
              className={cn(
                "relative min-w-0",
                childManagedScroll && "flex h-full min-h-0 flex-col overflow-hidden",
                !childManagedScroll && contentScrollMode === "shell" && "overflow-visible",
                !childManagedScroll && contentScrollMode !== "shell" && "overflow-hidden",
              )}
            >
              {mainDecoration ? <div className="pointer-events-none absolute inset-0">{mainDecoration}</div> : null}
              <div
                className={cn(
                  "relative z-1 min-h-0",
                  childManagedScroll ? "flex h-full min-h-0 flex-1 flex-col overflow-hidden" : "h-full",
                )}
              >
                {children}
              </div>
            </div>
            {rightRail ? (
              <aside
                className={cn(
                  "flex min-h-0 min-w-0 flex-col border-l border-[#e3e8ef] bg-[rgba(255,255,255,0.7)] backdrop-blur-xl",
                  childManagedScroll ? "overflow-hidden" : "overflow-visible",
                )}
              >
                {rightRail}
              </aside>
            ) : null}
          </div>
        </main>
      </div>

    </div>
  );
}
