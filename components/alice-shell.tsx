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
  type DragEvent,
  type ReactNode,
} from "react";
import {
  AlarmFilled,
  Bell,
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
  PanelRightOpen,
  Plus,
  Search,
  SparkleHighlight,
  Trash2,
  UserCircle,
  UserRound,
  X,
} from "@/components/ui/tabler-icons";

import { BrandLogo } from "@/components/brand-logo";
import { DotmSquare11 } from "@/components/ui/dotm-square-11";
import { EmptyState } from "@/components/empty-state";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isPlatformBackendEnabled } from "@/lib/agent-runtime";
import { isFrontendMockSessionId } from "@/lib/frontend-mock-session";
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
  { href: "/schedules", label: "定时任务", icon: Clock3 },
  { href: "/artifacts", label: "收藏夹", icon: FolderHeart },
];

const mockNotificationItems = [
  {
    id: "mock-task-complete",
    title: "任务「搜集Github热门ai项目」已完成",
    description: "点击查看任务详情",
    time: "5/31 20:01",
    unread: true,
  },
];

type AliceShellProps = {
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
  AliceShellProps,
  "currentPath" | "rightRail" | "currentRunLabel" | "mainDecoration" | "contentScrollMode" | "showTopHeader" | "mainClassName"
>;

const ShellMetaValueContext = createContext<ShellMeta | null>(null);
const ShellMetaDispatchContext = createContext<((next: ShellMeta) => void) | null>(null);

function ShellMetaProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [meta, setMeta] = useState<ShellMeta>({ currentPath: pathname ?? "/", contentScrollMode: "shell" });
  const updateMeta = useCallback((next: ShellMeta) => {
    setMeta(next);
  }, []);

  return (
    <ShellMetaDispatchContext.Provider value={updateMeta}>
      <ShellMetaValueContext.Provider value={meta}>{children}</ShellMetaValueContext.Provider>
    </ShellMetaDispatchContext.Provider>
  );
}

function useShellMetaContext() {
  const meta = useContext(ShellMetaValueContext);
  if (!meta) {
    throw new Error("useShellMetaContext must be used within ShellMetaProvider");
  }
  return { meta };
}

type HistoryEntry = SessionListItem & {
  firstMessage?: string | null;
  firstAt?: string | null;
  lastMessageAt?: string | null;
  hasMessages?: boolean;
  isOptimistic?: boolean;
};

const HISTORY_PAGE_SIZE = 20;
const HISTORY_TITLE_OVERRIDES_KEY = "alice:history-title-overrides";
const HISTORY_ORDER_OVERRIDES_KEY = "alice:history-order-overrides";
const OPTIMISTIC_HISTORY_TITLE = "正在规划工作...";
const LEGACY_OPTIMISTIC_HISTORY_TITLE = "正在思考...";
const ACCOUNT_AVATAR_CLASSES = ["bg-avatar-1", "bg-avatar-2", "bg-avatar-3", "bg-avatar-4", "bg-avatar-5", "bg-avatar-6", "bg-avatar-7", "bg-avatar-8"];
type HistoryDropPosition = "before" | "after";
type HistoryDragTarget = { sessionId: string; position: HistoryDropPosition };

function readHistoryTitleOverrides(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(HISTORY_TITLE_OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([key, value]) => [key, typeof value === "string" ? value.trim() : ""] as const)
        .filter(([key, value]) => key.trim() && value),
    );
  } catch {
    return {};
  }
}

function writeHistoryTitleOverrides(next: Record<string, string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HISTORY_TITLE_OVERRIDES_KEY, JSON.stringify(next));
}

function readHistoryOrderOverrides(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_ORDER_OVERRIDES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function writeHistoryOrderOverrides(next: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HISTORY_ORDER_OVERRIDES_KEY, JSON.stringify(next));
}

function historyTimestampMs(entry: HistoryEntry) {
  const times = [entry.last_active_at, entry.lastMessageAt, entry.created_at]
    .map((iso) => {
      const ms = Date.parse(iso || "");
      return Number.isFinite(ms) ? ms : 0;
    });
  return Math.max(...times);
}

function resolveHistoryDisplayTitle(entry: HistoryEntry, effectiveActiveSessionId: string | null | undefined, activeSessionTitle: string) {
  if (entry.isOptimistic && (!entry.firstMessage || entry.firstMessage === LEGACY_OPTIMISTIC_HISTORY_TITLE)) {
    return OPTIMISTIC_HISTORY_TITLE;
  }
  return entry.firstMessage || (entry.session_id === effectiveActiveSessionId ? activeSessionTitle : null) || "新对话";
}

function sortHistoryEntries(entries: HistoryEntry[]) {
  return [...entries].sort((a, b) => {
    const timeDelta = historyTimestampMs(b) - historyTimestampMs(a);
    if (timeDelta !== 0) return timeDelta;
    return b.session_id.localeCompare(a.session_id);
  });
}

function applyHistoryOrder(entries: HistoryEntry[], orderedSessionIds: string[]) {
  const sorted = sortHistoryEntries(entries);
  if (orderedSessionIds.length === 0) return sorted;
  const bySessionId = new Map(sorted.map((entry) => [entry.session_id, entry]));
  const ordered = orderedSessionIds
    .map((sessionId) => bySessionId.get(sessionId))
    .filter((entry): entry is HistoryEntry => Boolean(entry));
  const orderedSet = new Set(ordered.map((entry) => entry.session_id));
  return [
    ...ordered,
    ...sorted.filter((entry) => !orderedSet.has(entry.session_id)),
  ];
}

function moveHistorySessionId(
  sessionIds: string[],
  draggedId: string,
  targetId: string,
  position: HistoryDropPosition,
) {
  if (draggedId === targetId) return sessionIds;
  const withoutDragged = sessionIds.filter((sessionId) => sessionId !== draggedId);
  const targetIndex = withoutDragged.indexOf(targetId);
  if (targetIndex < 0) return sessionIds;
  const insertIndex = position === "after" ? targetIndex + 1 : targetIndex;
  return [
    ...withoutDragged.slice(0, insertIndex),
    draggedId,
    ...withoutDragged.slice(insertIndex),
  ];
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
    colorClass: ACCOUNT_AVATAR_CLASSES[hash % ACCOUNT_AVATAR_CLASSES.length] ?? ACCOUNT_AVATAR_CLASSES[0],
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
      const lastMsg = sorted.length > 0 ? sorted[sorted.length - 1] : undefined;
      return {
        ...s,
        hasMessages: sorted.length > 0,
        firstMessage: firstUser?.content ?? null,
        firstAt: firstUser?.created_at ?? s.created_at,
        lastMessageAt: lastMsg?.created_at ?? s.last_active_at,
      };
    } catch {
      return { ...s, firstMessage: null, firstAt: s.created_at };
    }
  });
}

type AliceShellStateValue = {
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
  /** 当前活跃会话的乐观标题（来自 workspace 实时首条用户消息），覆盖 enrichment 尚未完成的 firstMessage */
  activeSessionTitle: string;
  setActiveSessionTitle: (title: string) => void;
  upsertOptimisticHistorySession: (sessionId: string, title?: string) => void;
  removeOptimisticHistorySession: (sessionId: string) => void;
  /** 发送新消息时乐观刷新侧栏排序（last_active_at） */
  bumpHistorySessionActivity: (sessionId: string) => void;
};

const AliceShellStateContext = createContext<AliceShellStateValue | null>(null);

export function AliceShellStateProvider({ children }: { children: ReactNode }) {
  const platformAgent = useOptionalPlatformAgent();
  const [historySessions, setHistorySessions] = useState<HistoryEntry[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyError, setHistoryError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeSessionTitle, setActiveSessionTitle] = useState("");
  const [historyWasLoaded, setHistoryWasLoaded] = useState(false);
  const historyPageRef = useRef(0);
  const historyLoadMoreLockRef = useRef(false);
  const refreshHistoryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshHistoryInFlightRef = useRef(false);
  const refreshHistoryPendingRef = useRef(false);
  const optimisticHistoryRef = useRef<Map<string, HistoryEntry>>(new Map());

  const isLoggedIn = Boolean(isPlatformBackendEnabled() && platformAgent?.auth?.accessToken);
  const historyHasMore = historySessions.length < historyTotal;

  const upsertOptimisticHistorySession = useCallback((sessionId: string, title = OPTIMISTIC_HISTORY_TITLE) => {
    const sid = sessionId.trim();
    if (!sid) return;
    const now = new Date().toISOString();
    const entry: HistoryEntry = {
      session_id: sid,
      status: "creating",
      created_at: now,
      last_active_at: now,
      expires_at: now,
      firstMessage: title,
      firstAt: now,
      lastMessageAt: now,
      isOptimistic: true,
    };
    optimisticHistoryRef.current.set(sid, entry);
    setHistorySessions((prev) => {
      const next = [entry, ...prev.filter((s) => s.session_id !== sid)];
      return sortHistoryEntries(next);
    });
  }, []);

  const removeOptimisticHistorySession = useCallback((sessionId: string) => {
    const sid = sessionId.trim();
    if (!sid) return;
    optimisticHistoryRef.current.delete(sid);
    setHistorySessions((prev) => prev.filter((s) => !(s.isOptimistic && s.session_id === sid)));
  }, []);

  const bumpHistorySessionActivity = useCallback((sessionId: string) => {
    const sid = sessionId.trim();
    if (!sid) return;
    const now = new Date().toISOString();
    setHistorySessions((prev) =>
      sortHistoryEntries(
        prev.map((s) =>
          s.session_id === sid
            ? { ...s, last_active_at: now, lastMessageAt: now }
            : s,
        ),
      ),
    );
  }, []);

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
        const serverSessionIds = new Set(enriched.map((s) => s.session_id));
        for (const sid of serverSessionIds) {
          optimisticHistoryRef.current.delete(sid);
        }
        const optimisticOnly = Array.from(optimisticHistoryRef.current.values());
        setHistoryTotal((res.total ?? enriched.length) + optimisticOnly.length);
        setHistorySessions(sortHistoryEntries([...optimisticOnly, ...enriched]));
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
        for (const row of enriched) {
          optimisticHistoryRef.current.delete(row.session_id);
        }
        setHistorySessions((prev) => {
          const bySessionId = new Map(prev.map((s) => [s.session_id, s]));
          for (const row of enriched) {
            bySessionId.set(row.session_id, row);
          }
          for (const optimistic of optimisticHistoryRef.current.values()) {
            bySessionId.set(optimistic.session_id, optimistic);
          }
          return sortHistoryEntries(Array.from(bySessionId.values()));
        });
        setHistoryTotal((res.total ?? historyTotal) + optimisticHistoryRef.current.size);
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
      optimisticHistoryRef.current.clear();
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
      activeSessionTitle,
      setActiveSessionTitle,
      upsertOptimisticHistorySession,
      removeOptimisticHistorySession,
      bumpHistorySessionActivity,
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
      activeSessionTitle,
      upsertOptimisticHistorySession,
      removeOptimisticHistorySession,
      bumpHistorySessionActivity,
    ],
  );

  return <AliceShellStateContext.Provider value={value}>{children}</AliceShellStateContext.Provider>;
}

function SidebarHistorySkeleton() {
  return (
    <div className="space-y-2 px-2 py-2" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="rounded-control px-0 py-1.5">
          <div className="h-4 w-skeleton-wide animate-pulse rounded-full bg-fill-active" />
          <div className="mt-2 h-3 w-skeleton-short animate-pulse rounded-full bg-bg-subtle" />
        </div>
      ))}
    </div>
  );
}

export function useAliceShellState() {
  const context = useContext(AliceShellStateContext);
  if (!context) {
    throw new Error("useAliceShellState must be used within AliceShellStateProvider");
  }
  return context;
}

export function AliceShell({
  currentPath,
  children,
  rightRail,
  currentRunLabel,
  mainDecoration,
  contentScrollMode = "shell",
  showTopHeader = true,
  mainClassName,
}: AliceShellProps) {
  const setShellMeta = useContext(ShellMetaDispatchContext);

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

export function AliceShellRoot({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith("/admin");
  const isShareRoute = pathname?.startsWith("/share");
  const isFavoriteReportRoute = pathname?.startsWith("/favorite/report");

  if (isAdminRoute || isShareRoute || isFavoriteReportRoute) {
    return <>{children}</>;
  }

  return (
    <ShellMetaProvider>
      <AliceShellStateProvider>
        <Suspense fallback={<div className="min-h-full flex-1 bg-bg-page" aria-hidden />}>
          <AliceShellInner>{children}</AliceShellInner>
        </Suspense>
      </AliceShellStateProvider>
    </ShellMetaProvider>
  );
}

function AliceShellInner({ children }: { children: ReactNode }) {
  const { meta } = useShellMetaContext();
  return (
    <AliceShellComponent
      currentPath={meta.currentPath}
      rightRail={meta.rightRail}
      currentRunLabel={meta.currentRunLabel}
      mainDecoration={meta.mainDecoration}
      contentScrollMode={meta.contentScrollMode}
      showTopHeader={meta.showTopHeader}
      mainClassName={meta.mainClassName}
    >
      {children}
    </AliceShellComponent>
  );
}

function AliceShellComponent({
  currentPath,
  children,
  rightRail,
  currentRunLabel,
  mainDecoration,
  contentScrollMode = "shell",
  showTopHeader = true,
  mainClassName,
}: AliceShellProps) {
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
    activeSessionTitle,
    setActiveSessionTitle,
    removeOptimisticHistorySession,
  } = useAliceShellState();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [historyPurgeConfirmId, setHistoryPurgeConfirmId] = useState<string | null>(null);
  const [renamingHistory, setRenamingHistory] = useState<HistoryEntry | null>(null);
  const [renameHistoryValue, setRenameHistoryValue] = useState("");
  const [historyTitleOverrides, setHistoryTitleOverrides] = useState<Record<string, string>>({});
  const [historyOrderOverrides, setHistoryOrderOverrides] = useState<string[]>([]);
  const [draggingHistoryId, setDraggingHistoryId] = useState<string | null>(null);
  const [historyDragTarget, setHistoryDragTarget] = useState<HistoryDragTarget | null>(null);
  const [historySearch, setHistorySearch] = useState("");
  const [historySearchOpen, setHistorySearchOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isResultRailDrawerViewport, setIsResultRailDrawerViewport] = useState(false);
  const [compactResultDrawerOpen, setCompactResultDrawerOpen] = useState(false);
  const historySearchInputRef = useRef<HTMLInputElement | null>(null);
  const renameHistoryInputRef = useRef<HTMLInputElement | null>(null);
  const historyListScrollRef = useRef<HTMLDivElement | null>(null);
  const historyLoadSentinelRef = useRef<HTMLDivElement | null>(null);
  const historyDragSuppressClickRef = useRef(false);
  /** 首屏与服务端 HTML 一致：认证态来自客户端存储，仅在 mount 后再按登录态渲染侧栏，避免 hydration mismatch */
  const [clientMounted, setClientMounted] = useState(false);
  useEffect(() => {
    setClientMounted(true);
  }, []);

  useEffect(() => {
    if (!clientMounted) return;
    setHistoryTitleOverrides(readHistoryTitleOverrides());
    setHistoryOrderOverrides(readHistoryOrderOverrides());
  }, [clientMounted]);

  const childManagedScroll = contentScrollMode === "child";
  const sidebarExpandedWidth = 300;
  const sidebarCollapsedWidth = 68;
  const effectiveSidebarCollapsed = !isMobileViewport && sidebarCollapsed;
  const showCompactRightRailDrawer = Boolean(rightRail && clientMounted && !isMobileViewport && isResultRailDrawerViewport);
  const showDesktopRightRail = Boolean(rightRail && clientMounted && !isMobileViewport && !isResultRailDrawerViewport);
  const showMobileRightRailDrawer = Boolean(rightRail && clientMounted && isMobileViewport);

  const isLoggedIn = Boolean(isPlatformBackendEnabled() && platformAgent?.auth?.accessToken);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobileViewport(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsResultRailDrawerViewport(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!showCompactRightRailDrawer) setCompactResultDrawerOpen(false);
  }, [showCompactRightRailDrawer]);

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
  const isFrontendMockRoute = isFrontendMockSessionId(urlSessionId);
  const activeRun = (urlRunId ? runs.find((run) => run.id === urlRunId) : null) ?? runs.find((run) => run.id === currentRunId);
  const effectiveActiveSessionId = urlSessionId || activeRun?.platformSessionId || activeSessionId;
  const agentHasSpecificSelection = currentPath === "/agent" && Boolean(urlRunId || urlSessionId);
  const showAuthSidebar = clientMounted && (isLoggedIn || isFrontendMockRoute);
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

  useEffect(() => {
    if (!renamingHistory) return;
    const timer = window.setTimeout(() => {
      renameHistoryInputRef.current?.focus();
      renameHistoryInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [renamingHistory]);

  const getHistoryDisplayTitle = useCallback(
    (entry: HistoryEntry) =>
      historyTitleOverrides[entry.session_id]?.trim() ||
      resolveHistoryDisplayTitle(entry, effectiveActiveSessionId, activeSessionTitle),
    [activeSessionTitle, effectiveActiveSessionId, historyTitleOverrides],
  );

  const filteredHistorySessions = useMemo(() => {
    const visibleHistorySessions = historySessions
      .filter((s) => !isFrontendMockSessionId(s.session_id))
      .filter((s) => s.isOptimistic || s.hasMessages !== false);
    const q = historySearch.trim().toLowerCase();
    const base = q ? visibleHistorySessions.filter((s) => {
      const haystack = [getHistoryDisplayTitle(s), s.firstMessage, s.session_id, s.firstAt, s.created_at]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    }) : visibleHistorySessions;
    if (q) return sortHistoryEntries(base);
    return applyHistoryOrder(base, historyOrderOverrides);
  }, [getHistoryDisplayTitle, historyOrderOverrides, historySearch, historySessions]);

  const historyDragDisabled = Boolean(historySearch.trim());

  const persistHistoryOrder = useCallback((nextSessionIds: string[]) => {
    setHistoryOrderOverrides(nextSessionIds);
    writeHistoryOrderOverrides(nextSessionIds);
  }, []);

  const reorderHistorySessions = useCallback(
    (draggedId: string, targetId: string, position: HistoryDropPosition) => {
      if (historyDragDisabled) return;
      const visibleSessionIds = filteredHistorySessions.map((entry) => entry.session_id);
      const nextVisibleSessionIds = moveHistorySessionId(visibleSessionIds, draggedId, targetId, position);
      if (nextVisibleSessionIds.join("\u0000") === visibleSessionIds.join("\u0000")) return;

      const visibleSet = new Set(visibleSessionIds);
      const hiddenOrderedSessionIds = historyOrderOverrides.filter((sessionId) => !visibleSet.has(sessionId));
      persistHistoryOrder([...nextVisibleSessionIds, ...hiddenOrderedSessionIds]);
    },
    [filteredHistorySessions, historyDragDisabled, historyOrderOverrides, persistHistoryOrder],
  );

  const handleHistoryDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>, targetSessionId: string) => {
      if (historyDragDisabled || !draggingHistoryId || draggingHistoryId === targetSessionId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const rect = event.currentTarget.getBoundingClientRect();
      const position: HistoryDropPosition = event.clientY > rect.top + rect.height / 2 ? "after" : "before";
      setHistoryDragTarget((current) => {
        if (current?.sessionId === targetSessionId && current.position === position) return current;
        return { sessionId: targetSessionId, position };
      });
    },
    [draggingHistoryId, historyDragDisabled],
  );

  const handleHistoryDrop = useCallback(
    (event: DragEvent<HTMLDivElement>, targetSessionId: string) => {
      if (historyDragDisabled || !draggingHistoryId) return;
      event.preventDefault();
      const position = historyDragTarget?.sessionId === targetSessionId ? historyDragTarget.position : "before";
      reorderHistorySessions(draggingHistoryId, targetSessionId, position);
      setDraggingHistoryId(null);
      setHistoryDragTarget(null);
      historyDragSuppressClickRef.current = true;
      window.setTimeout(() => {
        historyDragSuppressClickRef.current = false;
      }, 120);
    },
    [draggingHistoryId, historyDragDisabled, historyDragTarget, reorderHistorySessions],
  );

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

  const closeHistoryRenameDialog = useCallback(() => {
    setRenamingHistory(null);
    setRenameHistoryValue("");
  }, []);

  const submitHistoryRename = useCallback(() => {
    const target = renamingHistory;
    const title = renameHistoryValue.trim();
    if (!target || !title) return;

    const sessionId = target.session_id.trim();
    if (!sessionId) return;
    setHistoryTitleOverrides((current) => {
      const next = { ...current, [sessionId]: title };
      writeHistoryTitleOverrides(next);
      return next;
    });

    runs
      .filter((run) => ((run.platformSessionId ?? "").trim() === sessionId))
      .forEach((run) => workspaceActions.renameRun(run.id, title));

    if (sessionId && sessionId === effectiveActiveSessionId) {
      setActiveSessionTitle(title);
    }
    closeHistoryRenameDialog();
  }, [closeHistoryRenameDialog, effectiveActiveSessionId, renameHistoryValue, renamingHistory, runs, setActiveSessionTitle]);

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
        removeOptimisticHistorySession(sid);
        setHistoryOrderOverrides((current) => {
          const next = current.filter((id) => id !== sid);
          writeHistoryOrderOverrides(next);
          return next;
        });
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
      removeOptimisticHistorySession,
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
          "grid grid-cols-[minmax(0,1fr)] bg-background md:[grid-template-columns:var(--sidebar-width)_minmax(0,1fr)]",
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
            className="fixed inset-0 z-sidebar-overlay bg-mask-bg backdrop-blur-soft md:hidden"
            aria-label="关闭侧边栏遮罩"
            onClick={() => setMobileSidebarOpen(false)}
          />
        ) : null}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-sidebar flex h-dvh min-h-0 w-mobile-sidebar max-w-mobile-sidebar flex-col overflow-hidden border-r border-border bg-bg-surface shadow-side transition-transform duration-200 md:sticky md:top-0 md:z-auto md:h-screen md:!w-[var(--sidebar-width)] md:!max-w-[var(--sidebar-width)] md:self-start md:translate-x-0 md:shadow-none",
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
                    className="inline-flex h-9 w-9 items-center justify-center rounded-control text-foreground transition hover:bg-fill-hover hover:text-foreground"
                    onClick={() => setSidebarCollapsed(false)}
                  >
                    <PanelLeftExpand className="h-icon-md w-icon-md" strokeWidth={1.8} />
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
                        className="inline-flex h-9 w-9 items-center justify-center rounded-control text-foreground transition hover:bg-fill-hover hover:text-foreground"
                        onClick={() => {
                          if (historySearchOpen) {
                            setHistorySearch("");
                            setHistorySearchOpen(false);
                            return;
                          }
                          setHistorySearchOpen(true);
                        }}
                      >
                        <Search className="h-icon-md w-icon-md" strokeWidth={1.8} />
                      </button>
                      <button
                        type="button"
                        aria-label="收起侧边栏"
                        className="hidden h-9 w-9 items-center justify-center rounded-control text-foreground transition hover:bg-fill-hover hover:text-foreground md:inline-flex"
                        onClick={() => setSidebarCollapsed(true)}
                      >
                        <PanelLeft className="h-icon-md w-icon-md" strokeWidth={1.8} />
                      </button>
                      <button
                        type="button"
                        aria-label="关闭侧边栏"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-control text-foreground transition hover:bg-fill-hover hover:text-foreground md:hidden"
                        onClick={() => setMobileSidebarOpen(false)}
                      >
                        <X className="h-icon-md w-icon-md" strokeWidth={1.8} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <nav className={cn("space-y-1", effectiveSidebarCollapsed ? "mt-3 px-2" : "px-2 pt-2")}>
              {navItems.map(({ href, label, icon: Icon }) => {
                const active =
                  currentPath === href ||
                  pathname === href ||
                  (href === "/" && currentPath === "/agent" && !agentHasSpecificSelection);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    data-active={active ? "true" : undefined}
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
                    className={`mdata-sidebar-nav-item group flex h-9 items-center rounded-control text-title-1 font-normal leading-6 transition-colors ${
                    active
                        ? "text-foreground"
                        : "text-foreground"
                  } ${effectiveSidebarCollapsed ? "mx-auto w-9 justify-center px-0" : "gap-3 pl-2 pr-0.5"}`}
                    title={effectiveSidebarCollapsed ? label : undefined}
                  >
                    <Icon className="h-icon-md w-icon-md shrink-0 text-foreground" strokeWidth={2} />
                    {!effectiveSidebarCollapsed ? (
                      <>
                        <span className="text-body leading-5">{label}</span>
                      </>
                    ) : null}
                  </Link>
                );
              })}
              </nav>
            </div>

            {!effectiveSidebarCollapsed && showAuthSidebar ? (
              <div className="mt-4 flex min-h-0 flex-1 flex-col px-2">
                <div className="flex h-9 shrink-0 items-center justify-between rounded-control px-2 text-title-1 font-normal leading-6 text-text-tertiary">
                  <span className="text-body font-medium leading-5 text-text-tertiary">所有任务</span>
                </div>
                <div ref={historyListScrollRef} className="mt-1 min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  <div className="space-y-1" data-testid="sidebar-history-list" aria-label="所有任务列表">
                  {historyBusy && historySessions.length === 0 ? (
                    <SidebarHistorySkeleton />
                  ) : historyError ? (
                    <div className="px-2 py-2 text-body leading-5 text-danger">加载失败：{historyError}</div>
                  ) : filteredHistorySessions.length === 0 ? (
                    historySearch.trim() ? (
                      <div className="px-2 py-2 text-body leading-5 text-text-tertiary">没有匹配的任务</div>
                    ) : null
                  ) : (
                    filteredHistorySessions.map((s) => {
                      const historyItemActive =
                        currentPath.startsWith("/agent") && effectiveActiveSessionId === s.session_id;
                      const createdTime = formatHistoryCreatedTime(s);
                      const frontendMockHistory = isFrontendMockSessionId(s.session_id);
                      return (
                        <div
                          key={s.session_id}
                          data-testid="sidebar-history-item"
                          data-session-id={s.session_id}
                          draggable={!historyDragDisabled && deletingId !== s.session_id}
                          aria-grabbed={draggingHistoryId === s.session_id}
                          onDragStart={(event) => {
                            if (historyDragDisabled) return;
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", s.session_id);
                            setDraggingHistoryId(s.session_id);
                            setHistoryDragTarget(null);
                          }}
                          onDragOver={(event) => handleHistoryDragOver(event, s.session_id)}
                          onDragLeave={(event) => {
                            const relatedTarget = event.relatedTarget;
                            if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) return;
                            setHistoryDragTarget((current) => (current?.sessionId === s.session_id ? null : current));
                          }}
                          onDrop={(event) => handleHistoryDrop(event, s.session_id)}
                          onDragEnd={() => {
                            setDraggingHistoryId(null);
                            setHistoryDragTarget(null);
                          }}
                          className={cn(
                            "mdata-history-item group relative flex w-full items-stretch rounded-control text-title-1 font-normal leading-6 transition-colors",
                            !historyDragDisabled && "cursor-grab active:cursor-grabbing",
                            draggingHistoryId === s.session_id && "opacity-45",
                            historyDragTarget?.sessionId === s.session_id &&
                              historyDragTarget.position === "before" &&
                              "before:absolute before:left-2 before:right-2 before:top-0 before:h-0.5 before:rounded-full before:bg-foreground before:content-['']",
                            historyDragTarget?.sessionId === s.session_id &&
                              historyDragTarget.position === "after" &&
                              "after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:rounded-full after:bg-foreground after:content-['']",
                            historyItemActive
                              ? "bg-fill-hover text-foreground"
                              : "text-foreground hover:bg-fill-hover"
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              if (historyDragSuppressClickRef.current) return;
                              platformAgent?.setActivePlatformSession(s.session_id);
                              router.push(`/agent?sessionId=${encodeURIComponent(s.session_id)}`);
                              setMobileSidebarOpen(false);
                            }}
                            className="relative flex min-w-0 flex-1 items-center overflow-hidden px-2 py-1.5 text-left"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center gap-1.5 text-body leading-5">
                                {s.isOptimistic ? (
                                  <DotmSquare11
                                    size={14}
                                    dotSize={2}
                                    speed={1.15}
                                    className="shrink-0 text-foreground"
                                    aria-hidden
                                  />
                                ) : null}
                                <span className="truncate">{getHistoryDisplayTitle(s)}</span>
                              </div>
                            </div>
                            {createdTime ? (
                              <span
                                className={cn(
                                  "mdata-history-time pointer-events-none",
                                  historyPurgeConfirmId === s.session_id && "mdata-history-time--visible"
                                )}
                              >
                                {createdTime}
                              </span>
                            ) : null}
                          </button>
                          {!frontendMockHistory ? (
                          <Popover
                            open={historyPurgeConfirmId === s.session_id}
                            onOpenChange={(open) => {
                              setHistoryPurgeConfirmId(open ? s.session_id : null);
                            }}
                          >
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex w-8 shrink-0 items-center justify-center rounded-r-control text-text-tertiary opacity-0 transition hover:bg-transparent hover:text-danger group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-40 data-[state=open]:bg-transparent data-[state=open]:text-danger data-[state=open]:opacity-100"
                                aria-label="删除该历史任务"
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
                              className="w-responsive-popover-sm rounded-panel border border-border bg-bg-surface p-4 shadow-popover-strong"
                              onClick={(e) => e.stopPropagation()}
                              onCloseAutoFocus={(e) => e.preventDefault()}
                            >
                              <p className="text-body leading-6 text-foreground">
                                确定删除该任务吗？删除后会话记忆与产出物将不可恢复
                              </p>
                              <div className="mt-4 flex justify-end gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-9 rounded-control border-border bg-bg-surface px-4 text-body text-text-tertiary hover:bg-fill-hover"
                                  disabled={deletingId === s.session_id}
                                  onClick={() => setHistoryPurgeConfirmId(null)}
                                >
                                  取消
                                </Button>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  className="h-9 rounded-control bg-danger px-4 text-body text-primary-foreground hover:bg-danger-hover"
                                  disabled={deletingId === s.session_id}
                                  onClick={() => void executePurgeHistorySession(s.session_id)}
                                >
                                  {deletingId === s.session_id ? "删除中…" : "确定删除"}
                                </Button>
                              </div>
                            </PopoverContent>
                          </Popover>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                  {historyHasMore ? (
                    <div
                      ref={historyLoadSentinelRef}
                      className="px-3 py-2 text-center text-caption text-text-tertiary"
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
                <div className="mx-2 mb-3 h-px bg-border" />
                <div className="flex h-9 w-full items-center gap-1">
                  {showHeaderUserMenu && headerAuth ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="flex h-9 min-w-0 flex-1 items-center gap-3 rounded-control pl-2 pr-1 text-left text-foreground transition-colors hover:bg-fill-hover"
                          aria-label="用户中心"
                          title={accountDisplayName}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-caption font-semibold leading-none text-primary-foreground",
                              accountAvatar.colorClass,
                            )}
                          >
                            {accountAvatar.initial}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-body font-normal leading-5 tracking-normal">
                            {accountDisplayName}
                          </span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        side="top"
                        sideOffset={8}
                        className="w-panel-sm rounded-composer border border-border-strong bg-bg-surface p-0 text-foreground shadow-popover"
                      >
                        <div className="flex flex-col gap-3 px-3 pb-3 pt-3">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex h-9 w-full items-center gap-3 rounded-lg px-2 text-body font-medium leading-5 text-foreground">
                              <UserRound className="h-5 w-5 text-text-secondary" strokeWidth={1.8} />
                              我的账号
                            </div>
                            <div className="flex h-9 w-full items-center gap-3 rounded-lg px-2 text-body font-medium leading-5 text-foreground">
                              <BookOpen className="h-5 w-5 text-text-secondary" strokeWidth={1.8} />
                              帮助文档
                            </div>
                            <div className="flex h-9 w-full items-center gap-3 rounded-lg px-2 text-body font-medium leading-5 text-foreground">
                              <HelpCircle className="h-5 w-5 text-text-secondary" strokeWidth={1.8} />
                              联系我们
                            </div>
                            <div className="my-1 h-px bg-fill-active" />
                            <button
                              type="button"
                              className="flex h-9 w-full items-center gap-3 rounded-lg px-2 text-left text-body font-medium leading-5 text-foreground transition hover:bg-fill-hover"
                              onClick={() => setLogoutConfirmOpen(true)}
                            >
                              <LogOut className="h-5 w-5 text-text-secondary" strokeWidth={1.8} />
                              退出登录
                            </button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <button
                      type="button"
                      className="flex h-9 min-w-0 flex-1 items-center gap-3 rounded-control pl-2 pr-1 text-left text-foreground transition-colors hover:bg-fill-hover"
                      onClick={() => platformAgent.openLogin()}
                    >
                      <UserCircle className="h-icon-md w-icon-md shrink-0 text-foreground" strokeWidth={2} />
                      <span className="min-w-0 flex-1 truncate text-body font-normal leading-5 tracking-normal">
                        账号与设置
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="通知提醒"
                    title="通知提醒"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-foreground transition-colors hover:bg-fill-hover"
                    onClick={openNotifications}
                  >
                    <Bell className="h-icon-md w-icon-md" strokeWidth={1.8} />
                  </button>
                </div>
              </div>
            ) : null}

          </div>
        </aside>

        {historySearchOpen ? (
          <div className="fixed inset-0 z-sidebar-overlay" role="dialog" aria-modal="true" aria-label="搜索所有任务">
            <button
              type="button"
              className="absolute inset-0 cursor-default bg-transparent"
              aria-label="关闭搜索"
              onClick={() => {
                setHistorySearch("");
                setHistorySearchOpen(false);
              }}
            />
            <div className="pointer-events-none fixed left-1/2 top-1/2 w-message-box -translate-x-1/2 -translate-y-1/2">
              <div className="pointer-events-auto flex h-message-box flex-col overflow-hidden rounded-composer border border-border-subtle bg-white shadow-popover-strong">
                <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-border-subtle pb-4 pl-6 pr-2 pt-5">
                  <Search className="h-6 w-6 shrink-0 text-text-secondary" strokeWidth={1.8} />
                  <input
                    ref={historySearchInputRef}
                    id="history-task-search"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="搜索任务..."
                    className="h-7 min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 py-0 text-lg font-normal leading-7 text-foreground shadow-none outline-none placeholder:text-text-tertiary focus-visible:rounded-none focus-ring-none-important"
                  />
                  <button
                    type="button"
                    aria-label="关闭搜索"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-foreground transition hover:bg-fill-hover hover:text-foreground"
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
                    className="flex h-12 w-full items-center gap-2.5 rounded-lg py-2 pl-2 pr-3 text-left text-sm text-foreground transition hover:bg-fill-hover focus-visible:bg-fill-hover"
                    onClick={() => {
                      setHistorySearch("");
                      setHistorySearchOpen(false);
                      platformAgent?.clearActivePlatformSession();
                      router.replace("/");
                    }}
                    >
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fill-hover text-text-secondary">
                      <Plus className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <span className="truncate text-sm font-normal leading-5 text-foreground">新建任务</span>
                  </button>

                  <div className="mt-2 mb-1 flex px-2.5 pb-1.5 text-xs font-medium leading-4 text-text-tertiary">更早的</div>
                  <div className="space-y-0">
                    {historyBusy && historySessions.length === 0 ? (
                      <SidebarHistorySkeleton />
                    ) : filteredHistorySessions.length === 0 ? (
                      historySearch.trim() ? (
                        <div className="px-2 py-3 text-body text-text-tertiary">没有匹配的任务</div>
                      ) : null
                    ) : (
                      filteredHistorySessions.slice(0, 8).map((s) => (
                        <button
                          key={s.session_id}
                          type="button"
                          className="flex min-h-composer-compact w-full items-center gap-2.5 rounded-lg py-1.5 pl-2 pr-3 text-left text-sm text-foreground transition hover:bg-fill-hover"
                          onClick={() => {
                            setHistorySearch("");
                            setHistorySearchOpen(false);
                            platformAgent?.setActivePlatformSession(s.session_id);
                            router.push(`/agent?sessionId=${encodeURIComponent(s.session_id)}`);
                          }}
                        >
                          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fill-hover text-text-secondary">
                            <MessageCircleMore className="h-4 w-4" strokeWidth={1.9} />
                          </span>
                            <span className="min-w-0 flex-1 pr-4">
                            <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium leading-5 text-foreground">
                              {s.isOptimistic ? (
                                <DotmSquare11
                                  size={14}
                                  dotSize={2}
                                  speed={1.15}
                                  className="shrink-0 text-foreground"
                                  aria-hidden
                                />
                              ) : null}
                              <span className="truncate">{getHistoryDisplayTitle(s)}</span>
                            </span>
                            <span className="block truncate text-sm font-normal leading-5 text-text-tertiary">
                              {s.session_id}
                            </span>
                          </span>
                          {s.firstAt ? (
                            <span className="shrink-0 text-sm font-normal text-text-tertiary">
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

        <Dialog
          open={Boolean(renamingHistory)}
          onOpenChange={(open) => {
            if (!open) closeHistoryRenameDialog();
          }}
        >
          <DialogContent
            hideClose
            aria-describedby={undefined}
            className="w-[420px] max-w-[calc(100vw-32px)] rounded-[16px] border-transparent p-0 shadow-[0_20px_56px_rgba(0,0,0,0.16)]"
            overlayClassName="bg-[rgba(0,0,0,0.38)] backdrop-blur-[1px]"
          >
            <form
              className="flex flex-col px-6 pb-5 pt-5"
              onSubmit={(event) => {
                event.preventDefault();
                submitHistoryRename();
              }}
            >
              <div className="flex items-center justify-between gap-4">
                <DialogTitle className="text-[16px] font-semibold leading-6 text-[#1d2129]">重命名任务</DialogTitle>
                <button
                  type="button"
                  aria-label="关闭重命名"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[#4e5969] transition hover:bg-[rgba(55,53,47,0.06)] hover:text-[#1d2129]"
                  onClick={closeHistoryRenameDialog}
                >
                  <X className="h-5 w-5" strokeWidth={1.8} />
                </button>
              </div>
              <label htmlFor="history-rename-title" className="mt-4 text-[14px] leading-5 text-[#4e5969]">
                名称
              </label>
              <input
                ref={renameHistoryInputRef}
                id="history-rename-title"
                value={renameHistoryValue}
                maxLength={80}
                onChange={(event) => setRenameHistoryValue(event.target.value)}
                className="mt-2 h-10 rounded-[10px] border border-[#d8dbe2] bg-white px-3 text-[14px] leading-5 text-[#1d2129] outline-none transition placeholder:text-[#4e5969] focus:border-[#1d2129]"
              />
              <div className="mt-5 grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-[10px] border-[#d8dbe2] bg-white text-[14px] font-medium text-[#4e5969] hover:bg-white hover:text-[#1d2129]"
                  onClick={closeHistoryRenameDialog}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  className="h-10 rounded-[10px] bg-[#111111] text-[14px] font-medium text-white hover:bg-[#111111]"
                  disabled={!renameHistoryValue.trim()}
                >
                  确定
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
          <DialogContent
            hideClose
            className="h-confirm-dialog w-confirm-dialog max-w-screen-gutter rounded-panel border-transparent p-0 shadow-dialog"
            overlayClassName="bg-mask-bg backdrop-blur-soft"
          >
            <div className="flex h-full flex-col px-6 pb-5 pt-5">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg-subtle text-foreground">
                  <InfoCircle className="h-5 w-5" strokeWidth={1.9} />
                </span>
                <DialogTitle className="text-title-1 font-semibold leading-6 text-foreground">提示</DialogTitle>
              </div>
              <p className="mt-4 text-body font-normal leading-6 text-foreground">确定要退出登录吗？</p>
              <div className="mt-auto grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-control border-border bg-bg-surface text-body font-medium text-text-secondary hover:bg-bg-surface hover:text-foreground"
                  onClick={() => setLogoutConfirmOpen(false)}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  className="h-10 rounded-control bg-primary text-body font-medium text-primary-foreground hover:bg-primary"
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
            overlayClassName="bg-overlay-bg backdrop-blur-soft"
            className="h-message-box w-message-box max-w-none overflow-hidden rounded-composer border border-border-subtle bg-bg-page p-0 shadow-popover"
          >
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex h-16 shrink-0 items-center justify-between border-b border-border-subtle pb-4 pl-6 pr-2 pt-5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Bell className="h-6 w-6 shrink-0 text-text-secondary" strokeWidth={1.8} />
                  <DialogTitle className="truncate text-lg font-normal leading-7 text-foreground">消息盒子</DialogTitle>
                </div>
                <button
                  type="button"
                  aria-label="关闭消息盒子"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-foreground transition hover:bg-fill-hover hover:text-foreground"
                  onClick={() => setNotificationOpen(false)}
                >
                  <X className="h-6 w-6" strokeWidth={1.6} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                {mockNotificationItems.length > 0 ? (
                  <div className="space-y-3">
                    {mockNotificationItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="relative flex min-h-20 w-full items-center gap-4 rounded-card bg-bg-surface px-4 py-4 text-left transition hover:bg-fill-hover"
                      >
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-subtle text-primary">
                          <AlarmFilled className="h-6 w-6" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body font-semibold leading-5 text-foreground">
                            {item.title}
                          </span>
                          <span className="mt-1 block truncate text-caption leading-5 text-text-tertiary">
                            {item.description}
                          </span>
                        </span>
                        <span className="shrink-0 text-caption leading-5 text-text-tertiary">{item.time}</span>
                        {item.unread ? (
                          <span className="absolute right-4 top-4 h-1.5 w-1.5 rounded-full bg-danger" aria-label="未读" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center pb-8">
                    <EmptyState className="m-0 min-h-0" message="暂无消息" />
                  </div>
                )}
              </div>
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
            <header className="fixed left-0 right-0 top-0 z-50 grid h-16 grid-mobile-header items-center border-b border-transparent bg-bg-surface px-2 md:hidden">
              <button
                type="button"
                aria-label="打开侧边栏"
                className="inline-flex h-10 w-10 items-center justify-center rounded-control text-foreground transition hover:bg-fill-hover"
                onClick={() => setMobileSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" strokeWidth={2} />
              </button>
              <div className="min-w-0 text-center text-title-1 font-semibold leading-6 text-foreground">Alice</div>
              <button
                type="button"
                aria-label="通知提醒"
                title="通知提醒"
                className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-control text-foreground transition hover:bg-fill-hover"
                onClick={openNotifications}
              >
                <Bell className="h-icon-md w-icon-md" strokeWidth={1.8} />
              </button>
            </header>
          ) : null}

          {showTopHeader || currentRunLabel ? (
            <header className="sticky top-0 z-50 flex h-14.5 items-center bg-bg-surface px-3 sm:px-4 md:px-6">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <button
                  type="button"
                  aria-label="打开侧边栏"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-foreground transition hover:bg-fill-hover md:hidden"
                  onClick={() => setMobileSidebarOpen(true)}
                >
                  <Menu className="h-5 w-5" strokeWidth={2} />
                </button>
                {currentRunLabel ? (
                  <div className="min-w-0 truncate text-body font-medium text-foreground">
                    {currentRunLabel}
                  </div>
                ) : null}
              </div>
              {showCompactRightRailDrawer ? (
                <button
                  type="button"
                  aria-label="查看任务执行结果"
                  className="ml-3 hidden h-9 shrink-0 items-center gap-2 rounded-control px-3 text-body font-medium text-foreground transition hover:bg-fill-hover md:inline-flex lg:hidden"
                  onClick={() => setCompactResultDrawerOpen(true)}
                >
                  <PanelRightOpen className="h-icon-md w-icon-md" strokeWidth={1.9} />
                  查看结果
                </button>
              ) : null}
            </header>
          ) : null}

          <div
            data-testid={rightRail ? "workspace-main-grid" : undefined}
            className={cn(
              "min-h-0 flex-1",
              childManagedScroll && "overflow-hidden",
              !showTopHeader && !currentRunLabel && "pt-16 md:pt-0",
              showDesktopRightRail && "grid min-h-0 grid-cols-1 lg:grid-cols-[minmax(360px,42%)_minmax(680px,58%)]",
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
            {showDesktopRightRail ? (
              <aside
                data-testid="workspace-right-rail"
                className={cn(
                  "flex min-h-0 min-w-0 flex-col border-l border-border bg-bg-surface/70 backdrop-blur-xl",
                  "border-l-0 border-t lg:border-l lg:border-t",
                  childManagedScroll ? "overflow-hidden" : "overflow-visible",
                )}
              >
                {rightRail}
              </aside>
            ) : null}
          </div>
        </main>
      </div>

      {showCompactRightRailDrawer ? (
        <div
          className={cn(
            "fixed inset-0 z-mobile-sheet hidden transition md:block lg:hidden",
            compactResultDrawerOpen ? "pointer-events-auto" : "pointer-events-none",
          )}
          role="dialog"
          aria-modal={compactResultDrawerOpen ? "true" : undefined}
          aria-hidden={!compactResultDrawerOpen}
          aria-label="任务执行结果"
        >
          <button
            type="button"
            aria-label="关闭任务执行结果"
            className={cn(
              "absolute inset-0 bg-overlay-bg backdrop-blur-soft transition-opacity",
              compactResultDrawerOpen ? "opacity-100" : "opacity-0",
            )}
            onClick={() => setCompactResultDrawerOpen(false)}
          />
          <aside
            className={cn(
              "absolute bottom-0 right-0 top-0 flex w-[min(720px,calc(100vw-80px))] min-w-0 flex-col border-l border-border bg-bg-surface shadow-side-strong transition-transform duration-200 ease-out",
              compactResultDrawerOpen ? "translate-x-0" : "translate-x-full",
            )}
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
              <div className="truncate text-title-1 font-semibold leading-6 text-foreground">任务执行结果</div>
              <button
                type="button"
                aria-label="关闭任务执行结果"
                className="inline-flex h-9 w-9 items-center justify-center rounded-control text-text-tertiary transition hover:bg-fill-hover hover:text-foreground"
                onClick={() => setCompactResultDrawerOpen(false)}
              >
                <X className="h-5 w-5" strokeWidth={1.8} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">{rightRail}</div>
          </aside>
        </div>
      ) : null}

      {showMobileRightRailDrawer ? (
        <div
          className="fixed inset-0 z-mobile-sheet flex items-end justify-center bg-overlay-bg backdrop-blur-soft md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="任务执行结果抽屉"
        >
          <div className="flex max-h-mobile-sheet min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-t-composer border border-b-0 border-border bg-bg-surface shadow-sheet">
            <div className="mx-auto my-2 h-1 w-10 shrink-0 rounded-full bg-fill-active" aria-hidden />
            <div className="min-h-0 flex-1 overflow-hidden">{rightRail}</div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
