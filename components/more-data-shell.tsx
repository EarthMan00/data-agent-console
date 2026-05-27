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
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Bell,
  Bookmark,
  BookOpen,
  Clock3,
  FolderHeart,
  HelpCircle,
  InfoCircle,
  LogOut,
  Menu,
  MessageCircleMore,
  PanelLeft,
  PanelLeftExpand,
  Plus,
  Search,
  SparkleHighlight,
  Trash2,
  UserCircle,
  UserRound,
  Users,
  X,
} from "@/components/ui/tabler-icons";

import { BrandLogo } from "@/components/brand-logo";
import { EmptyState } from "@/components/empty-state";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
  showTopHeader?: boolean;
  mainClassName?: string;
};

type ShellMeta = Pick<
  MoreDataShellProps,
  "currentPath" | "rightRail" | "currentRunLabel" | "mainDecoration" | "contentScrollMode" | "showTopHeader" | "mainClassName"
>;

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

const HISTORY_PAGE_SIZE = 20;
const ACCOUNT_AVATAR_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#16a34a", "#0891b2", "#4f46e5"];

function historyTimestampMs(entry: HistoryEntry) {
  const times = [entry.last_active_at, entry.firstAt, entry.created_at]
    .map((iso) => {
      const ms = Date.parse(iso || "");
      return Number.isFinite(ms) ? ms : 0;
    });
  return Math.max(...times);
}

function sortHistoryEntries(entries: HistoryEntry[]) {
  return [...entries].sort((a, b) => {
    const timeDelta = historyTimestampMs(b) - historyTimestampMs(a);
    if (timeDelta !== 0) return timeDelta;
    return b.session_id.localeCompare(a.session_id);
  });
}

function getAccountAvatarMeta(name: string) {
  const trimmed = name.trim();
  const chars = Array.from(trimmed || "?");
  const initial = (chars[0] ?? "?").toUpperCase();
  let hash = 0;
  for (const char of chars) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return {
    initial,
    color: ACCOUNT_AVATAR_COLORS[hash % ACCOUNT_AVATAR_COLORS.length] ?? ACCOUNT_AVATAR_COLORS[0],
  };
}

const HISTORY_ENRICH_CONCURRENCY = 2;

async function enrichHistoryEntries(
  token: string,
  sessions: SessionListItem[],
): Promise<HistoryEntry[]> {
  const { mapWithConcurrency } = await import("@/lib/map-with-concurrency");
  return mapWithConcurrency(sessions, HISTORY_ENRICH_CONCURRENCY, async (s) => {
    try {
      const mr = await listSessionMessages(token, s.session_id, 30);
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
  });
}

type MoreDataShellStateValue = {
  historySessions: HistoryEntry[];
  historyBusy: boolean;
  historyLoadingMore: boolean;
  historyHasMore: boolean;
  historyError: string;
  /** 防抖刷新侧栏历史；删除会话等需立即刷新时请用 refreshHistoryNow */
  refreshHistory: () => void;
  refreshHistoryNow: () => Promise<void>;
  loadMoreHistory: () => Promise<void>;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (next: boolean | ((current: boolean) => boolean)) => void;
  setHistoryError: (next: string) => void;
};

const MoreDataShellStateContext = createContext<MoreDataShellStateValue | null>(null);

export function MoreDataShellStateProvider({ children }: { children: ReactNode }) {
  const platformAgent = useOptionalPlatformAgent();
  const [historySessions, setHistorySessions] = useState<HistoryEntry[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyError, setHistoryError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [historyWasLoaded, setHistoryWasLoaded] = useState(false);
  const historyPageRef = useRef(0);
  const historyLoadMoreLockRef = useRef(false);
  const refreshHistoryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshHistoryInFlightRef = useRef(false);
  const refreshHistoryPendingRef = useRef(false);

  const isLoggedIn = Boolean(isPlatformBackendEnabled() && platformAgent?.auth?.accessToken);
  const historyHasMore = historySessions.length < historyTotal;

  const refreshHistoryNow = useCallback(async () => {
    if (!platformAgent?.auth?.accessToken) return;
    if (refreshHistoryInFlightRef.current) {
      refreshHistoryPendingRef.current = true;
      return;
    }
    refreshHistoryInFlightRef.current = true;
    setHistoryBusy(true);
    setHistoryError("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        const res = await listSessions(token, 1, HISTORY_PAGE_SIZE);
        const base = res.sessions ?? [];
        const enriched = await enrichHistoryEntries(token, base);
        historyPageRef.current = 1;
        setHistoryTotal(res.total ?? enriched.length);
        setHistorySessions(sortHistoryEntries(enriched));
        setHistoryWasLoaded(true);
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setHistoryError(msg);
    } finally {
      setHistoryWasLoaded(true);
      setHistoryBusy(false);
      refreshHistoryInFlightRef.current = false;
      if (refreshHistoryPendingRef.current) {
        refreshHistoryPendingRef.current = false;
        void refreshHistoryNow();
      }
    }
  }, [platformAgent]);

  const refreshHistory = useCallback(() => {
    if (refreshHistoryTimerRef.current) {
      clearTimeout(refreshHistoryTimerRef.current);
    }
    refreshHistoryTimerRef.current = setTimeout(() => {
      refreshHistoryTimerRef.current = null;
      void refreshHistoryNow();
    }, 900);
  }, [refreshHistoryNow]);

  useEffect(() => {
    return () => {
      if (refreshHistoryTimerRef.current) clearTimeout(refreshHistoryTimerRef.current);
    };
  }, []);

  const loadMoreHistory = useCallback(async () => {
    if (!platformAgent?.auth?.accessToken) return;
    if (historyLoadMoreLockRef.current || historyBusy) return;
    if (historySessions.length >= historyTotal) return;

    historyLoadMoreLockRef.current = true;
    setHistoryLoadingMore(true);
    setHistoryError("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        const nextPage = historyPageRef.current + 1;
        const res = await listSessions(token, nextPage, HISTORY_PAGE_SIZE);
        const base = res.sessions ?? [];
        if (base.length === 0) {
          setHistoryTotal(res.total ?? historySessions.length);
          return;
        }
        const enriched = await enrichHistoryEntries(token, base);
        historyPageRef.current = nextPage;
        setHistoryTotal(res.total ?? historyTotal);
        setHistorySessions((prev) => {
          const seen = new Set(prev.map((s) => s.session_id));
          const merged = [...prev];
          for (const row of enriched) {
            if (!seen.has(row.session_id)) {
              merged.push(row);
              seen.add(row.session_id);
            }
          }
          return sortHistoryEntries(merged);
        });
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setHistoryError(msg);
    } finally {
      setHistoryLoadingMore(false);
      historyLoadMoreLockRef.current = false;
    }
  }, [historyBusy, historySessions.length, historyTotal, platformAgent]);

  useEffect(() => {
    if (!isLoggedIn) {
      setHistorySessions([]);
      setHistoryWasLoaded(false);
      setHistoryTotal(0);
      historyPageRef.current = 0;
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
      historyLoadingMore,
      historyHasMore,
      historyError,
      refreshHistory,
      refreshHistoryNow,
      loadMoreHistory,
      sidebarCollapsed,
      setSidebarCollapsed,
      setHistoryError,
    }),
    [
      historySessions,
      historyBusy,
      historyLoadingMore,
      historyHasMore,
      historyError,
      refreshHistory,
      refreshHistoryNow,
      loadMoreHistory,
      sidebarCollapsed,
      setHistoryError,
    ],
  );

  return <MoreDataShellStateContext.Provider value={value}>{children}</MoreDataShellStateContext.Provider>;
}

function SidebarHistorySkeleton() {
  return (
    <div className="space-y-2 px-[9px] py-2" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="rounded-[10px] px-0 py-1.5">
          <div className="h-4 w-[82%] animate-pulse rounded-full bg-[#ececea]" />
          <div className="mt-2 h-3 w-[46%] animate-pulse rounded-full bg-[#f1f1ef]" />
        </div>
      ))}
    </div>
  );
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
  showTopHeader = true,
  mainClassName,
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
      showTopHeader,
      mainClassName,
    });
  }, [currentPath, rightRail, currentRunLabel, mainDecoration, contentScrollMode, showTopHeader, mainClassName, setShellMeta]);

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
      showTopHeader={meta.showTopHeader}
      mainClassName={meta.mainClassName}
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
  showTopHeader = true,
  mainClassName,
}: MoreDataShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const platformAgent = useOptionalPlatformAgent();
  const { runs, currentRunId } = useWorkspaceState();

  const {
    historySessions,
    historyBusy,
    historyLoadingMore,
    historyHasMore,
    historyError,
    refreshHistory,
    refreshHistoryNow,
    loadMoreHistory,
    sidebarCollapsed,
    setSidebarCollapsed,
    setHistoryError,
  } = useMoreDataShellState();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [historyPurgeConfirmId, setHistoryPurgeConfirmId] = useState<string | null>(null);
  const [historySearch, setHistorySearch] = useState("");
  const [historySearchOpen, setHistorySearchOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const historySearchInputRef = useRef<HTMLInputElement | null>(null);
  const historyListScrollRef = useRef<HTMLDivElement | null>(null);
  const historyLoadSentinelRef = useRef<HTMLDivElement | null>(null);
  /** 首屏与服务端 HTML 一致：认证态来自客户端存储，仅在 mount 后再按登录态渲染侧栏，避免 hydration mismatch */
  const [clientMounted, setClientMounted] = useState(false);
  useEffect(() => {
    setClientMounted(true);
  }, []);
  const childManagedScroll = contentScrollMode === "child";
  const sidebarExpandedWidth = 300;
  const sidebarCollapsedWidth = 68;
  const effectiveSidebarCollapsed = !isMobileViewport && sidebarCollapsed;

  const isLoggedIn = Boolean(isPlatformBackendEnabled() && platformAgent?.auth?.accessToken);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobileViewport(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  /** 从对话页返回首页等路由时再拉一次列表，避免仅靠首屏加载看不到刚结束的会话 */
  useEffect(() => {
    if (!clientMounted || !isLoggedIn) return;
    if (pathname === "/") void refreshHistory();
  }, [pathname, clientMounted, isLoggedIn, refreshHistory]);

  /** 历史列表触底加载下一页 */
  useEffect(() => {
    const root = historyListScrollRef.current;
    const sentinel = historyLoadSentinelRef.current;
    if (!root || !sentinel || !historyHasMore || historyBusy) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMoreHistory();
      },
      { root, rootMargin: "64px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [historyBusy, historyHasMore, historySessions.length, loadMoreHistory]);
  const activeSessionId = platformAgent?.platformSessionId ?? null;
  const urlRunId = searchParams.get("runId");
  const urlSessionId = searchParams.get("sessionId");
  const activeRun = (urlRunId ? runs.find((run) => run.id === urlRunId) : null) ?? runs.find((run) => run.id === currentRunId);
  const effectiveActiveSessionId = urlSessionId || activeRun?.platformSessionId || activeSessionId;
  const agentHasSpecificSelection = currentPath === "/agent" && Boolean(urlRunId || urlSessionId);
  const showAuthSidebar = clientMounted && isLoggedIn;
  /** 账户区：mount 前固定为「登录」，避免 token 仅在客户端存在时 hydration 不一致 */
  const headerAuth = platformAgent?.auth;
  const showHeaderUserMenu = clientMounted && Boolean(headerAuth);
  const accountDisplayName = headerAuth?.displayName || headerAuth?.userId || "账号与设置";
  const accountAvatar = useMemo(() => getAccountAvatarMeta(accountDisplayName), [accountDisplayName]);
  const openNotifications = useCallback(() => {
    if (!headerAuth) {
      platformAgent?.openLogin("请先登录后再查看通知。");
      return;
    }
    setNotificationOpen(true);
  }, [headerAuth, platformAgent]);

  useEffect(() => {
    if (!showHeaderUserMenu) {
      setNotificationOpen(false);
      setLogoutConfirmOpen(false);
    }
  }, [showHeaderUserMenu]);

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
    const base = q ? historySessions.filter((s) => {
      const haystack = [s.firstMessage, s.session_id, s.firstAt, s.created_at]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    }) : historySessions;
    return sortHistoryEntries(base);
  }, [historySearch, historySessions]);

  const formatShortDate = (iso: string | null | undefined) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  };

  const formatHistoryCreatedTime = (entry: HistoryEntry) => {
    const iso = entry.firstAt || entry.created_at;
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

        await refreshHistoryNow();
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
      refreshHistoryNow,
      router,
      runs,
      searchParams,
      setHistoryError,
    ],
  );

  return (
    <div className={childManagedScroll ? "h-screen overflow-hidden bg-transparent" : "min-h-screen bg-transparent"}>
      <div
        className={cn(
          "grid grid-cols-[minmax(0,1fr)] bg-[#f7f7f7] md:[grid-template-columns:var(--sidebar-width)_minmax(0,1fr)]",
          childManagedScroll ? "h-screen overflow-hidden" : "min-h-screen",
        )}
        style={
          {
            "--sidebar-width": `${effectiveSidebarCollapsed ? sidebarCollapsedWidth : sidebarExpandedWidth}px`,
          } as CSSProperties
        }
      >
        {mobileSidebarOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-[80] bg-black/20 backdrop-blur-[1px] md:hidden"
            aria-label="关闭侧边栏遮罩"
            onClick={() => setMobileSidebarOpen(false)}
          />
        ) : null}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-[90] flex h-dvh min-h-0 w-[min(300px,86vw)] max-w-[calc(100vw-24px)] flex-col overflow-hidden border-r border-[#e2e2df] bg-white shadow-[16px_0_40px_rgba(15,23,42,0.12)] transition-transform duration-200 md:sticky md:top-0 md:z-auto md:h-screen md:w-auto md:self-start md:translate-x-0 md:shadow-none",
            mobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="relative flex min-h-0 flex-1 flex-col">
            <div className="shrink-0">
              {effectiveSidebarCollapsed ? (
                <div className="flex flex-col items-center gap-2 px-2 pt-3">
                  <BrandLogo compact />
                  <button
                    type="button"
                    aria-label="展开侧边栏"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-[#34322d] transition hover:bg-[rgba(55,53,47,0.06)] hover:text-[#34322d]"
                    onClick={() => setSidebarCollapsed(false)}
                  >
                    <PanelLeftExpand className="h-[18px] w-[18px]" strokeWidth={1.8} />
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
                        className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-[#34322d] transition hover:bg-[rgba(55,53,47,0.06)] hover:text-[#34322d]"
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
                        className="hidden h-9 w-9 items-center justify-center rounded-[10px] text-[#34322d] transition hover:bg-[rgba(55,53,47,0.06)] hover:text-[#34322d] md:inline-flex"
                        onClick={() => setSidebarCollapsed(true)}
                      >
                        <PanelLeft className="h-[18px] w-[18px]" strokeWidth={1.8} />
                      </button>
                      <button
                        type="button"
                        aria-label="关闭侧边栏"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-[#34322d] transition hover:bg-[rgba(55,53,47,0.06)] hover:text-[#34322d] md:hidden"
                        onClick={() => setMobileSidebarOpen(false)}
                      >
                        <X className="h-[18px] w-[18px]" strokeWidth={1.8} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <nav className={cn("space-y-1", effectiveSidebarCollapsed ? "mt-3 px-2" : "px-2 pt-2")}>
              {sidebarNavItems.map(({ href, label, icon: Icon }) => {
                const active = currentPath === href || (href === "/" && currentPath === "/agent" && !agentHasSpecificSelection);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={(e) => {
                      if (href === "/") {
                        e.preventDefault();
                        platformAgent?.clearActivePlatformSession();
                        router.replace("/");
                        setMobileSidebarOpen(false);
                        return;
                      }
                      platformAgent?.clearActivePlatformSession();
                      if (!platformAgent) return;
                      if (!platformAgent.auth) {
                        e.preventDefault();
                        platformAgent.openLogin("请先登录后再继续操作。");
                      }
                      setMobileSidebarOpen(false);
                    }}
                    className={`group flex h-9 items-center rounded-[10px] text-[16px] font-normal leading-6 transition-colors ${
                    active
                        ? "bg-[rgba(55,53,47,0.06)] text-[#34322d]"
                        : "text-[#34322d] hover:bg-[rgba(55,53,47,0.06)]"
                  } ${effectiveSidebarCollapsed ? "mx-auto w-9 justify-center px-0" : "gap-3 pl-[9px] pr-0.5"}`}
                    title={effectiveSidebarCollapsed ? label : undefined}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0 text-[#34322d]" strokeWidth={2} />
                    {!effectiveSidebarCollapsed ? (
                      <>
                        <span className="text-[14px] leading-[21px]">{label}</span>
                      </>
                    ) : null}
                  </Link>
                );
              })}
              </nav>
            </div>

            {!effectiveSidebarCollapsed && showAuthSidebar ? (
              <div className="mt-4 flex min-h-0 flex-1 flex-col px-2">
                <div className="flex h-9 shrink-0 items-center justify-between rounded-[10px] px-[9px] text-[16px] font-normal leading-6 text-[#858481]">
                  <span className="text-[14px] font-medium leading-[18px] text-[#858481]">所有任务</span>
                </div>
                <div ref={historyListScrollRef} className="mt-1 min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  <div className="space-y-1">
                  {historyBusy && historySessions.length === 0 ? (
                    <SidebarHistorySkeleton />
                  ) : historyError ? (
                    <div className="px-[9px] py-2 text-[14px] leading-5 text-red-600">加载失败：{historyError}</div>
                  ) : filteredHistorySessions.length === 0 ? (
                    historySearch.trim() ? (
                      <div className="px-[9px] py-2 text-[14px] leading-5 text-[#858481]">没有匹配的任务</div>
                    ) : null
                  ) : (
                    filteredHistorySessions.map((s) => {
                      const historyItemActive =
                        currentPath.startsWith("/agent") && effectiveActiveSessionId === s.session_id;
                      const createdTime = formatHistoryCreatedTime(s);
                      return (
                        <div
                          key={s.session_id}
                          className={`group/history relative flex w-full items-stretch gap-0.5 rounded-[10px] text-[16px] font-normal leading-6 transition-colors ${
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
                              setMobileSidebarOpen(false);
                            }}
                            className="relative flex min-w-0 flex-1 items-center overflow-hidden px-[9px] py-1.5 text-left"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[14px] leading-5 transition-[padding] group-hover/history:pr-[148px] group-focus-within/history:pr-[148px]">
                                {s.firstMessage || s.session_id}
                              </div>
                            </div>
                          </button>
                          {createdTime ? (
                            <span
                              className={cn(
                                "pointer-events-none absolute right-10 top-1/2 hidden max-w-[140px] -translate-y-1/2 items-center truncate bg-gradient-to-l from-[#f3f3f2] via-[#f3f3f2] to-transparent pl-8 pr-0 text-[12px] leading-4 text-[#858481] group-focus-within/history:flex group-hover/history:flex",
                                historyPurgeConfirmId === s.session_id && "flex"
                              )}
                            >
                              {createdTime}
                            </span>
                          ) : null}
                          <Popover
                            open={historyPurgeConfirmId === s.session_id}
                            onOpenChange={(open) => {
                              setHistoryPurgeConfirmId(open ? s.session_id : null);
                            }}
                          >
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex w-8 shrink-0 items-center justify-center rounded-r-[9px] text-[#7f817d] opacity-0 transition hover:bg-transparent hover:text-red-600 group-hover/history:opacity-100 focus-visible:opacity-100 disabled:opacity-40 data-[state=open]:bg-transparent data-[state=open]:text-red-600 data-[state=open]:opacity-100"
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
                              className="w-[min(300px,calc(100vw-2rem))] rounded-[16px] border border-[#e5e5e2] bg-white p-4 shadow-[0_18px_48px_rgba(15,23,42,0.12)]"
                              onClick={(e) => e.stopPropagation()}
                              onCloseAutoFocus={(e) => e.preventDefault()}
                            >
                              <p className="text-[14px] leading-6 text-[#34322d]">
                                确定删除该任务吗？删除后会话记忆与产出物将永久删除且不可恢复
                              </p>
                              <div className="mt-4 flex justify-end gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-9 rounded-[10px] border-[#e2e2df] bg-white px-4 text-[14px] text-[#747571] hover:bg-[rgba(55,53,47,0.06)]"
                                  disabled={deletingId === s.session_id}
                                  onClick={() => setHistoryPurgeConfirmId(null)}
                                >
                                  取消
                                </Button>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  className="h-9 rounded-[10px] bg-red-600 px-4 text-[14px] text-white hover:bg-red-700"
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
                  {historyHasMore ? (
                    <div
                      ref={historyLoadSentinelRef}
                      className="px-3 py-2 text-center text-[12px] text-[#94a3b8]"
                      aria-hidden={!historyLoadingMore}
                    >
                      {historyLoadingMore ? "加载更多…" : "\u00a0"}
                    </div>
                  ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {!effectiveSidebarCollapsed && isPlatformBackendEnabled() && platformAgent ? (
              <div className="mt-auto shrink-0 px-2 pb-5 pt-4">
                <div className="mx-[9px] mb-3 h-px bg-[#e7e7e4]" />
                <div className="flex h-9 w-full items-center gap-1">
                  {showHeaderUserMenu && headerAuth ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="flex h-9 min-w-0 flex-1 items-center gap-3 rounded-[10px] pl-[9px] pr-1 text-left text-[#34322d] transition-colors hover:bg-[rgba(55,53,47,0.06)]"
                          aria-label="用户中心"
                          title={accountDisplayName}
                        >
                          <span
                            aria-hidden="true"
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold leading-none text-white"
                            style={{ backgroundColor: accountAvatar.color }}
                          >
                            {accountAvatar.initial}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[14px] font-normal leading-[21px] tracking-normal">
                            {accountDisplayName}
                          </span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        side="top"
                        sideOffset={8}
                        className="w-[300px] rounded-[20px] border border-[rgba(0,0,0,0.12)] bg-white p-0 text-[#34322d] shadow-[0_8px_32px_rgba(0,0,0,0.06)]"
                      >
                        <div className="flex w-full gap-2 px-4 pb-3 pt-5">
                          <span
                            aria-hidden="true"
                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[18px] font-semibold leading-none text-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]"
                            style={{ backgroundColor: accountAvatar.color }}
                          >
                            {accountAvatar.initial}
                          </span>
                          <div className="flex min-w-0 flex-1 flex-col justify-center">
                            <div className="truncate text-[14px] font-medium leading-[22px] text-[#34322d]">{accountDisplayName}</div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-3 px-3 pb-3">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex h-9 w-full items-center gap-3 rounded-lg px-2 text-[14px] font-medium leading-5 text-[#34322d]">
                              <UserRound className="h-5 w-5 text-[#5e5e5b]" strokeWidth={1.8} />
                              我的账号
                            </div>
                            <div className="flex h-9 w-full items-center gap-3 rounded-lg px-2 text-[14px] font-medium leading-5 text-[#34322d]">
                              <BookOpen className="h-5 w-5 text-[#5e5e5b]" strokeWidth={1.8} />
                              帮助文档
                            </div>
                            <div className="flex h-9 w-full items-center gap-3 rounded-lg px-2 text-[14px] font-medium leading-5 text-[#34322d]">
                              <HelpCircle className="h-5 w-5 text-[#5e5e5b]" strokeWidth={1.8} />
                              联系我们
                            </div>
                            <div className="my-1 h-px bg-[rgba(0,0,0,0.06)]" />
                            <button
                              type="button"
                              className="flex h-9 w-full items-center gap-3 rounded-lg px-2 text-left text-[14px] font-medium leading-5 text-[#34322d] transition hover:bg-[rgba(55,53,47,0.06)]"
                              onClick={() => setLogoutConfirmOpen(true)}
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
                      className="flex h-9 min-w-0 flex-1 items-center gap-3 rounded-[10px] pl-[9px] pr-1 text-left text-[#34322d] transition-colors hover:bg-[rgba(55,53,47,0.06)]"
                      onClick={() => platformAgent.openLogin()}
                    >
                      <UserCircle className="h-[18px] w-[18px] shrink-0 text-[#34322d]" strokeWidth={2} />
                      <span className="min-w-0 flex-1 truncate text-[14px] font-normal leading-[21px] tracking-normal">
                        账号与设置
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="通知提醒"
                    title="通知提醒"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[#34322d] transition-colors hover:bg-[rgba(55,53,47,0.06)]"
                    onClick={openNotifications}
                  >
                    <Bell className="h-[18px] w-[18px]" strokeWidth={1.8} />
                  </button>
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
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[#34322d] transition hover:bg-[rgba(55,53,47,0.06)] hover:text-[#34322d]"
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
                    className="flex h-12 w-full items-center gap-2.5 rounded-lg py-2 pl-2 pr-3 text-left text-sm text-[#34322d] transition hover:bg-[rgba(55,53,47,0.06)] focus-visible:bg-[rgba(55,53,47,0.06)]"
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
                    {historyBusy && historySessions.length === 0 ? (
                      <SidebarHistorySkeleton />
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

        <Dialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
          <DialogContent
            hideClose
            className="h-[180px] w-[420px] max-w-[calc(100vw-32px)] rounded-[16px] border-transparent p-0 shadow-[0_20px_56px_rgba(0,0,0,0.16)]"
            overlayClassName="bg-[rgba(0,0,0,0.38)] backdrop-blur-[1px]"
          >
            <div className="flex h-full flex-col px-6 pb-5 pt-5">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f4f4f3] text-[#111111]">
                  <InfoCircle className="h-5 w-5" strokeWidth={1.9} />
                </span>
                <DialogTitle className="text-[16px] font-semibold leading-6 text-[#34322d]">提示</DialogTitle>
              </div>
              <p className="mt-4 text-[14px] font-normal leading-6 text-[#34322d]">确定要退出登录吗？</p>
              <div className="mt-auto grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-[10px] border-[#d8dbe2] bg-white text-[14px] font-medium text-[#676a70] hover:bg-white hover:text-[#34322d]"
                  onClick={() => setLogoutConfirmOpen(false)}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  className="h-10 rounded-[10px] bg-[#111111] text-[14px] font-medium text-white hover:bg-[#111111]"
                  onClick={() => {
                    setLogoutConfirmOpen(false);
                    void platformAgent?.logout();
                  }}
                >
                  确定
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={notificationOpen} onOpenChange={setNotificationOpen}>
          <DialogContent
            hideClose
            aria-describedby={undefined}
            overlayClassName="bg-[rgba(22,24,28,0.32)] backdrop-blur-[1px]"
            className="h-[min(620px,calc(100vh-56px))] w-[min(828px,calc(100vw-32px))] max-w-none overflow-hidden rounded-[22px] border border-[rgba(0,0,0,0.06)] bg-white p-0 shadow-[0_28px_90px_rgba(15,23,42,0.18)] sm:rounded-[22px]"
          >
            <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] sm:grid-cols-[188px_minmax(0,1fr)] sm:grid-rows-none md:grid-cols-[228px_minmax(0,1fr)]">
              <aside className="min-h-0 border-b border-[rgba(0,0,0,0.04)] bg-white px-[18px] py-4 sm:border-b-0 sm:border-r sm:py-6">
                <div className="text-[18px] font-normal leading-7 text-[#858481]">消息盒子</div>
                <nav className="mt-3 flex gap-2 overflow-x-auto sm:mt-5 sm:block sm:space-y-2 sm:overflow-visible">
                  <button
                    type="button"
                    className="flex h-[49px] w-auto shrink-0 items-center gap-3 rounded-[10px] bg-[rgba(55,53,47,0.06)] px-4 text-left text-[#111111] sm:w-full sm:px-5"
                  >
                    <Bell className="h-5 w-5 shrink-0" strokeWidth={2.2} />
                    <span className="text-[14px] font-medium leading-[21px]">通知提醒</span>
                  </button>
                </nav>
              </aside>
              <section className="relative flex min-h-0 flex-col bg-[#fbfbfb]">
                <div className="flex h-[56px] shrink-0 items-center justify-between px-5 sm:px-8">
                  <DialogTitle className="text-[16px] font-semibold leading-6 text-[#111111]">通知提醒</DialogTitle>
                  <button
                    type="button"
                    aria-label="关闭消息盒子"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-[#9b9b98] transition hover:bg-[rgba(55,53,47,0.06)] hover:text-[#34322d]"
                    onClick={() => setNotificationOpen(false)}
                  >
                    <X className="h-6 w-6" strokeWidth={1.6} />
                  </button>
                </div>
                <div className="flex min-h-0 flex-1 items-center justify-center pb-[34px]">
                  <EmptyState className="m-0 min-h-0" message="暂无消息" />
                </div>
              </section>
            </div>
          </DialogContent>
        </Dialog>

        <main
          className={cn(
            childManagedScroll
              ? "flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
              : "flex min-h-screen min-w-0 flex-col",
            mainClassName,
          )}
        >
          {!showTopHeader && !currentRunLabel ? (
            <header className="fixed left-0 right-0 top-0 z-50 grid h-16 grid-cols-[64px_minmax(0,1fr)_64px] items-center border-b border-transparent bg-white px-2 md:hidden">
              <button
                type="button"
                aria-label="打开侧边栏"
                className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] text-[#34322d] transition hover:bg-[rgba(55,53,47,0.06)]"
                onClick={() => setMobileSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" strokeWidth={2} />
              </button>
              <div className="min-w-0 text-center text-[16px] font-semibold leading-6 text-[#111111]">Alice</div>
              <button
                type="button"
                aria-label="通知提醒"
                title="通知提醒"
                className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-[10px] text-[#34322d] transition hover:bg-[rgba(55,53,47,0.06)]"
                onClick={openNotifications}
              >
                <Bell className="h-[18px] w-[18px]" strokeWidth={1.8} />
              </button>
            </header>
          ) : null}

          {showTopHeader || currentRunLabel ? (
            <header className="sticky top-0 z-50 flex h-14.5 items-center bg-white px-3 sm:px-4 md:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  aria-label="打开侧边栏"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[#34322d] transition hover:bg-[rgba(55,53,47,0.06)] md:hidden"
                  onClick={() => setMobileSidebarOpen(true)}
                >
                  <Menu className="h-5 w-5" strokeWidth={2} />
                </button>
                {currentRunLabel ? (
                  <div className="min-w-0 truncate text-[14px] font-medium text-[#243248]">
                    {currentRunLabel}
                  </div>
                ) : null}
              </div>
            </header>
          ) : null}

          <div
            className={cn(
              "min-h-0 flex-1",
              !showTopHeader && !currentRunLabel && "pt-16 md:pt-0",
              rightRail && "grid min-h-0 grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(580px,61%)]",
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
                  "border-l-0 border-t md:border-l md:border-t-0",
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
