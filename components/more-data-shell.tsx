"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Bookmark,
  BookOpen,
  Clock3,
  FolderHeart,
  HelpCircle,
  Home,
  LogOut,
  MessageCircleMore,
  PanelLeft,
  Plus,
  Search,
  Settings,
  SparkleHighlight,
  Trash2,
  UserRound,
  Users,
  X,
} from "@/components/ui/tabler-icons";

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
import { workspaceActions, useWorkspaceState } from "@/lib/workspace-store";

const navItems = [
  { href: "/", label: "新的对话", icon: SparkleHighlight },
  { href: "/prompt-library", label: "提示词库", icon: Bookmark },
  { href: "/schedules", label: "定时任务", icon: Clock3 },
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
  const shellMetaContext = useContext(ShellMetaContext);
  const setShellMeta = shellMetaContext?.setMeta;

  useEffect(() => {
    setShellMeta?.({
      currentPath,
      rightRail,
      currentRunLabel,
      mainDecoration,
      contentScrollMode,
    });
  }, [currentPath, rightRail, currentRunLabel, mainDecoration, contentScrollMode, setShellMeta]);

  return <>{children}</>;
}

export function MoreDataShellRoot({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith("/admin");
  const isShareRoute = pathname?.startsWith("/share");
  const isFavoriteReportRoute = pathname?.startsWith("/favorite/report");

  if (isAdminRoute || isShareRoute || isFavoriteReportRoute) {
    return <>{children}</>;
  }

  return (
    <ShellMetaProvider>
      <MoreDataShellStateProvider>
        <Suspense fallback={<div className="min-h-full flex-1 bg-[#fafafa]" aria-hidden />}>
          <MoreDataShellInner>{children}</MoreDataShellInner>
        </Suspense>
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const platformAgent = useOptionalPlatformAgent();
  const { runs, currentRunId } = useWorkspaceState();

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
  const [historySearch, setHistorySearch] = useState("");
  const [historySearchOpen, setHistorySearchOpen] = useState(false);
  const historySearchInputRef = useRef<HTMLInputElement | null>(null);
  /** 首屏与服务端 HTML 一致：认证态来自客户端存储，仅在 mount 后再按登录态渲染侧栏，避免 hydration mismatch */
  const [clientMounted, setClientMounted] = useState(false);
  useEffect(() => {
    setClientMounted(true);
  }, []);
  const childManagedScroll = contentScrollMode === "child";
  const sidebarExpandedWidth = 300;
  const sidebarCollapsedWidth = 68;

  const isLoggedIn = Boolean(isPlatformBackendEnabled() && platformAgent?.auth?.accessToken);

  /** 从对话页返回首页等路由时再拉一次列表，避免仅靠首屏加载看不到刚结束的会话 */
  useEffect(() => {
    if (!clientMounted || !isLoggedIn) return;
    if (pathname === "/") void refreshHistory();
  }, [pathname, clientMounted, isLoggedIn, refreshHistory]);
  const activeSessionId = platformAgent?.platformSessionId ?? null;
  const showAuthSidebar = clientMounted && isLoggedIn;
  /** 顶栏用户区：与侧栏同理，mount 前固定为「登录」，避免 token 仅在客户端存在时 hydration 不一致 */
  const headerAuth = platformAgent?.auth;
  const showHeaderUserMenu = clientMounted && Boolean(headerAuth);

  useEffect(() => {
    if (!historySearchOpen) return;
    const timer = window.setTimeout(() => historySearchInputRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHistorySearch("");
        setHistorySearchOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [historySearchOpen]);

  const sidebarNavItems = useMemo(() => {
    const base = [...navItems];
    if (showAuthSidebar && platformAgent?.auth?.userRole === "admin") {
      base.push({ href: "/user-management", label: "用户管理", icon: Users });
    }
    return base;
  }, [showAuthSidebar, platformAgent?.auth?.userRole]);

  const filteredHistorySessions = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return historySessions;
    return historySessions.filter((s) => {
      const haystack = [s.firstMessage, s.session_id, s.firstAt, s.created_at]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [historySearch, historySessions]);

  const formatTime = (iso: string | null | undefined) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString();
  };

  const formatShortDate = (iso: string | null | undefined) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
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

        const sid = (sessionId || "").trim();
        const matchingRunIds = runs
          .filter((r) => ((r.platformSessionId ?? "").trim() === sid))
          .map((r) => r.id);
        for (const rid of matchingRunIds) {
          workspaceActions.removeRunById(rid);
        }

        const urlRunId = searchParams.get("runId");
        const urlSessionId = (searchParams.get("sessionId") ?? "").trim();
        const urlHitsDeletedRun = Boolean(urlRunId && matchingRunIds.includes(urlRunId));
        const currentHitsDeletedRun = matchingRunIds.includes(currentRunId);
        const urlHitsDeletedSession = urlSessionId !== "" && urlSessionId === sid;

        if (activeSessionId === sessionId) {
          platformAgent.clearActivePlatformSession();
        }

        if (
          activeSessionId === sessionId ||
          urlHitsDeletedRun ||
          currentHitsDeletedRun ||
          urlHitsDeletedSession
        ) {
          router.replace("/");
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
    [
      activeSessionId,
      currentRunId,
      platformAgent,
      refreshHistory,
      router,
      runs,
      searchParams,
      setHistoryError,
    ],
  );

  return (
    <div className={childManagedScroll ? "h-screen overflow-hidden bg-transparent" : "min-h-screen bg-transparent"}>
      <div
        className={childManagedScroll ? "grid h-screen overflow-hidden bg-[#f8f8f7]" : "grid min-h-screen bg-[#f8f8f7]"}
        style={{ gridTemplateColumns: sidebarCollapsed ? `${sidebarCollapsedWidth}px minmax(0,1fr)` : `${sidebarExpandedWidth}px minmax(0,1fr)` }}
      >
        <aside className="sticky top-0 self-start flex h-screen min-h-0 flex-col overflow-hidden bg-[#ebebeb] transition-[padding,width]">
          <div className="relative flex min-h-0 flex-1 flex-col">
            <div className="shrink-0">
              {sidebarCollapsed ? (
                <div className="flex flex-col items-center gap-2 px-2 pt-3">
                  <BrandLogo compact />
                  <button
                    type="button"
                    aria-label="展开侧边栏"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#5f625f] transition hover:bg-[#e9e9e7] hover:text-[#22221f]"
                    onClick={() => setSidebarCollapsed(false)}
                  >
                    <PanelLeft className="h-4 w-4" strokeWidth={1.8} />
                  </button>
                </div>
              ) : (
                <div>
                  <div className="flex h-14 items-center gap-2 py-3 pl-3 pr-2.5">
                    <BrandLogo />
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        type="button"
                        aria-label="搜索所有任务"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#5f625f] transition hover:bg-[#e9e9e7] hover:text-[#22221f]"
                        onClick={() => {
                          if (historySearchOpen) {
                            setHistorySearch("");
                            setHistorySearchOpen(false);
                            return;
                          }
                          setHistorySearchOpen(true);
                        }}
                      >
                        <Search className="h-[18px] w-[18px]" strokeWidth={1.8} />
                      </button>
                      <button
                        type="button"
                        aria-label="收起侧边栏"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#5f625f] transition hover:bg-[#e9e9e7] hover:text-[#22221f]"
                        onClick={() => setSidebarCollapsed(true)}
                      >
                        <PanelLeft className="h-[18px] w-[18px]" strokeWidth={1.8} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <nav className={cn("space-y-px", sidebarCollapsed ? "mt-3 px-2" : "px-2 pt-2")}>
              {sidebarNavItems.map(({ href, label, icon: Icon }) => {
                const active = currentPath === href || (href === "/" && currentPath === "/agent");
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={(e) => {
                      if (href === "/") {
                        e.preventDefault();
                        platformAgent?.clearActivePlatformSession();
                        router.replace("/");
                        return;
                      }
                      platformAgent?.clearActivePlatformSession();
                      if (!platformAgent) return;
                      if (!platformAgent.auth) {
                        e.preventDefault();
                        platformAgent.openLogin("请先登录后再继续操作。");
                      }
                    }}
                    className={`group flex h-9 items-center rounded-[10px] text-[16px] font-normal leading-6 transition-colors ${
                    active
                        ? "bg-[rgba(55,53,47,0.06)] text-[#34322d]"
                        : "text-[#34322d] hover:bg-[rgba(55,53,47,0.06)]"
                  } ${sidebarCollapsed ? "justify-center px-0" : "gap-3 pl-[9px] pr-0.5"}`}
                    title={sidebarCollapsed ? label : undefined}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0 text-[#34322d]" strokeWidth={1.8} />
                    {!sidebarCollapsed ? (
                      <>
                        <span className="text-[14px] leading-[21px]">{label}</span>
                      </>
                    ) : null}
                  </Link>
                );
              })}
              </nav>
            </div>

            {!sidebarCollapsed && showAuthSidebar ? (
              <div className="mt-[98px] flex min-h-0 flex-1 flex-col px-2">
                <div className="flex h-9 shrink-0 items-center justify-between rounded-[10px] px-[9px] text-[16px] font-normal leading-6 text-[#858481]">
                  <span className="text-[13px] font-medium leading-[18px] text-[#858481]">所有任务</span>
                </div>
                <div className="mt-1 min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  <div className="space-y-0.5">
                  {historyBusy ? (
                    <div className="px-[9px] py-2 text-[14px] leading-5 text-[#858481]">加载中…</div>
                  ) : historyError ? (
                    <div className="px-[9px] py-2 text-[14px] leading-5 text-red-600">加载失败：{historyError}</div>
                  ) : filteredHistorySessions.length === 0 ? (
                    historySearch.trim() ? (
                      <div className="px-[9px] py-2 text-[14px] leading-5 text-[#858481]">没有匹配的任务</div>
                    ) : null
                  ) : (
                    filteredHistorySessions.map((s) => {
                      const historyItemActive = currentPath === "/agent" && activeSessionId === s.session_id;
                      return (
                      <div
                        key={s.session_id}
                        className={`group/history flex w-full items-stretch gap-0.5 rounded-[10px] text-[16px] font-normal leading-6 transition-colors ${
                          historyItemActive
                            ? "bg-[rgba(55,53,47,0.06)] text-[#34322d]"
                            : "text-[#34322d] hover:bg-[rgba(55,53,47,0.06)]"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            platformAgent?.setActivePlatformSession(s.session_id);
                            router.push(`/agent?sessionId=${encodeURIComponent(s.session_id)}`);
                          }}
                          className="flex min-w-0 flex-1 items-center px-[9px] py-1.5 text-left"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate">{s.firstMessage || s.session_id}</div>
                            {s.firstAt ? (
                              <div className="mt-0.5 text-[14px] leading-5 text-[#858481] select-none">
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
                              className="inline-flex w-8 shrink-0 items-center justify-center rounded-r-[9px] text-[#7f817d] opacity-0 transition hover:bg-[#eadfdd] hover:text-red-600 group-hover/history:opacity-100 focus-visible:opacity-100 disabled:opacity-40 data-[state=open]:bg-[#eadfdd] data-[state=open]:text-red-600 data-[state=open]:opacity-100"
                              aria-label="删除该历史任务"
                              aria-expanded={historyPurgeConfirmId === s.session_id}
                              disabled={deletingId === s.session_id}
                            >
                              <Trash2 className="h-[15px] w-[15px]" aria-hidden />
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
                              确定删除该历史任务？消息、任务与产物将从服务端永久删除，且不可恢复。
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
                    );
                    })
                  )}
                  </div>
                </div>
              </div>
            ) : null}

          </div>
        </aside>

        {historySearchOpen ? (
          <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="搜索所有任务">
            <button
              type="button"
              className="absolute inset-0 cursor-default bg-transparent"
              aria-label="关闭搜索"
              onClick={() => {
                setHistorySearch("");
                setHistorySearchOpen(false);
              }}
            />
            <div className="pointer-events-none fixed left-1/2 top-1/2 w-[min(680px,calc(100vw_-_32px))] -translate-x-1/2 -translate-y-1/2">
              <div className="pointer-events-auto flex h-[min(440px,calc(100vh_-_40px))] flex-col overflow-hidden rounded-[20px] border border-[rgba(0,0,0,0.06)] bg-[#f8f8f7] shadow-[0_0_1.25px_rgba(0,0,0,0.12),0_5px_16px_rgba(0,0,0,0.12)]">
                <div className="flex h-[67px] shrink-0 items-center gap-2.5 border-b border-[rgba(0,0,0,0.06)] pb-[18px] pl-6 pr-2 pt-5">
                  <Search className="h-6 w-6 shrink-0 text-[#5e5e5b]" strokeWidth={1.8} />
                  <input
                    ref={historySearchInputRef}
                    id="history-task-search"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="搜索任务..."
                    className="h-7 min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 py-0 text-[18px] font-normal leading-7 text-[#34322d] shadow-none outline-none placeholder:text-[#858481] focus-visible:rounded-none focus-visible:[box-shadow:none!important]"
                  />
                  <button
                    type="button"
                    aria-label="关闭搜索"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#858481] transition hover:bg-[rgba(55,53,47,0.06)] hover:text-[#34322d]"
                    onClick={() => {
                      setHistorySearch("");
                      setHistorySearchOpen(false);
                    }}
                  >
                    <X className="h-5 w-5" strokeWidth={1.9} />
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
                  <button
                    type="button"
                    className="flex h-12 w-full items-center gap-2.5 rounded-lg bg-[rgba(55,53,47,0.06)] py-2 pl-2 pr-3 text-left text-sm text-[#34322d] transition hover:bg-[rgba(55,53,47,0.08)]"
                    onClick={() => {
                      setHistorySearch("");
                      setHistorySearchOpen(false);
                      platformAgent?.clearActivePlatformSession();
                      router.replace("/");
                    }}
                    >
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgba(55,53,47,0.06)] text-[#3f403b]">
                      <Plus className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <span className="truncate text-sm font-normal leading-5 text-[#34322d]">新建任务</span>
                  </button>

                  <div className="mt-2 mb-1 flex px-2.5 pb-1.5 text-xs font-medium leading-4 text-[#858481]">更早的</div>
                  <div className="space-y-0">
                    {historyBusy ? (
                      <div className="px-2 py-3 text-[14px] text-[#8b8c87]">加载中...</div>
                    ) : filteredHistorySessions.length === 0 ? (
                      historySearch.trim() ? (
                        <div className="px-2 py-3 text-[14px] text-[#8b8c87]">没有匹配的任务</div>
                      ) : null
                    ) : (
                      filteredHistorySessions.slice(0, 8).map((s) => (
                        <button
                          key={s.session_id}
                          type="button"
                          className="flex min-h-[52px] w-full items-center gap-2.5 rounded-lg py-1.5 pl-2 pr-3 text-left text-sm text-[#34322d] transition hover:bg-[rgba(55,53,47,0.06)]"
                          onClick={() => {
                            setHistorySearch("");
                            setHistorySearchOpen(false);
                            platformAgent?.setActivePlatformSession(s.session_id);
                            router.push(`/agent?sessionId=${encodeURIComponent(s.session_id)}`);
                          }}
                        >
                          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgba(55,53,47,0.06)] text-[#666761]">
                            <MessageCircleMore className="h-4 w-4" strokeWidth={1.9} />
                          </span>
                          <span className="min-w-0 flex-1 pr-4">
                            <span className="block truncate text-sm font-medium leading-5 text-[#34322d]">
                              {s.firstMessage || s.session_id}
                            </span>
                            <span className="block truncate text-sm font-normal leading-5 text-[#858481]">
                              {s.session_id}
                            </span>
                          </span>
                          {s.firstAt ? (
                            <span className="shrink-0 text-sm font-normal text-[#858481]">
                              {formatShortDate(s.firstAt)}
                            </span>
                          ) : null}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <main className={childManagedScroll ? "flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-transparent" : "flex min-h-screen min-w-0 flex-col bg-transparent"}>
          <header className="sticky top-0 z-50 flex h-14.5 items-center justify-between bg-transparent px-6">
            <div className="flex min-w-0 items-center gap-3">
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
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-[#18181b] text-[12px] font-semibold text-white shadow-none transition hover:bg-[#2a2a2d]"
                        aria-label="用户中心"
                        title={headerAuth.userId}
                      >
                        {(headerAuth.userId || "?").slice(0, 1).toUpperCase()}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      sideOffset={8}
                      className="w-[300px] rounded-[20px] border border-[rgba(0,0,0,0.12)] bg-white p-0 text-[#34322d] shadow-[0_8px_32px_rgba(0,0,0,0.06)]"
                    >
                      <div className="flex w-full gap-2 px-4 pb-3 pt-5">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#18181b] text-[17px] font-semibold leading-none text-white">
                          {(headerAuth.userId || "?").slice(0, 1).toUpperCase()}
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col justify-center">
                          <div className="truncate text-[14px] font-medium leading-[22px] text-[#34322d]">Mdata 用户</div>
                          <div className="truncate text-[13px] font-normal leading-5 text-[#858481]" title={headerAuth.userId}>
                            {headerAuth.userId}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 px-3 pb-3">
                        <div className="rounded-[16px] border border-[rgba(0,0,0,0.06)] bg-[rgba(55,53,47,0.04)]">
                          <div className="flex items-center justify-between gap-3 border-b border-dashed border-[rgba(0,0,0,0.12)] px-3 py-3">
                            <span className="text-[14px] font-medium leading-5 text-[#34322d]">当前账户</span>
                            <span className="rounded-full bg-white px-2 py-1 text-[12px] font-medium leading-4 text-[#5e5e5b]">已登录</span>
                          </div>
                          <div className="flex items-center justify-between gap-3 px-3 py-3">
                            <span className="text-[14px] font-medium leading-5 text-[#34322d]">身份</span>
                            <span className="truncate text-[14px] leading-5 text-[#858481]">{headerAuth.userRole ?? "user"}</span>
                          </div>
                        </div>

                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            className="flex h-9 w-full items-center gap-3 rounded-lg px-2 text-left text-[14px] font-medium leading-5 text-[#34322d] transition hover:bg-[rgba(55,53,47,0.06)]"
                            onClick={() => router.replace("/")}
                          >
                            <Home className="h-5 w-5 text-[#5e5e5b]" strokeWidth={1.8} />
                            主页
                          </button>
                          <div className="flex h-9 w-full items-center gap-3 rounded-lg px-2 text-[14px] font-medium leading-5 text-[#34322d]">
                            <UserRound className="h-5 w-5 text-[#5e5e5b]" strokeWidth={1.8} />
                            账户
                          </div>
                          <div className="flex h-9 w-full items-center gap-3 rounded-lg px-2 text-[14px] font-medium leading-5 text-[#34322d]">
                            <Settings className="h-5 w-5 text-[#5e5e5b]" strokeWidth={1.8} />
                            设置
                          </div>
                          <div className="my-1 h-px bg-[rgba(0,0,0,0.06)]" />
                          <div className="flex h-9 w-full items-center gap-3 rounded-lg px-2 text-[14px] font-medium leading-5 text-[#34322d]">
                            <HelpCircle className="h-5 w-5 text-[#5e5e5b]" strokeWidth={1.8} />
                            获取帮助
                          </div>
                          <div className="flex h-9 w-full items-center gap-3 rounded-lg px-2 text-[14px] font-medium leading-5 text-[#34322d]">
                            <BookOpen className="h-5 w-5 text-[#5e5e5b]" strokeWidth={1.8} />
                            文档
                          </div>
                          <button
                          type="button"
                            className="flex h-9 w-full items-center gap-3 rounded-lg px-2 text-left text-[14px] font-medium leading-5 text-[#34322d] transition hover:bg-[rgba(55,53,47,0.06)]"
                          onClick={() => void platformAgent.logout()}
                        >
                            <LogOut className="h-5 w-5 text-[#5e5e5b]" strokeWidth={1.8} />
                          退出登录
                          </button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <button
                    type="button"
                    className="inline-flex h-8 items-center justify-center rounded-[14px] bg-[#18181b] px-3 text-[13px] font-medium leading-5 text-white shadow-none transition hover:bg-[#2a2a2d]"
                    onClick={() => platformAgent.openLogin()}
                  >
                    登录
                  </button>
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
