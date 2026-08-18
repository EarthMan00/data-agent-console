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
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  Bell,
  AiGateway,
  ArrowLeft,
  BookOpen,
  ChevronRight,
  Clock3,
  Copy,
  CreditCard,
  FolderHeart,
  InfoCircle,
  LogOut,
  Menu,
  MessageCircleMore,
  PanelLeft,
  PanelLeftExpand,
  Pencil,
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
import {
  AgentApiError,
  listSessions,
  listSessionMessages,
  parseFastApiDetail,
  purgeSessionData,
} from "@/lib/agent-api/client";
import type { SessionListItem, SessionMessageItem } from "@/lib/agent-api/types";
import {
  createBillingOrder,
  fetchBillingOrders,
  fetchBillingSummary,
  fetchEntitlementLedger,
  fetchUserPlans,
  type BillingOrder,
  type BillingSummary,
  type LedgerItem,
  type UserPlanSpec,
} from "@/lib/agent-api/billing";
import { fetchProfile, patchProfile, type UserProfile } from "@/lib/agent-api/profile";
import { submitFeedback } from "@/lib/agent-api/feedback";
import { cn } from "@/lib/utils";
import { workspaceActions, useWorkspaceState } from "@/lib/workspace-store";

const navItems = [
  { href: "/", label: "新的对话", icon: SparkleHighlight },
  { href: "/schedules", label: "定时任务", icon: Clock3 },
  { href: "/artifacts", label: "收藏夹", icon: FolderHeart },
  { href: "/settings/api-keys", label: "API&Skills", icon: AiGateway },
];

type AliceShellProps = {
  currentPath: string;
  children: ReactNode;
  rightRail?: ReactNode;
  currentRunLabel?: string;
  headerContentScrolled?: boolean;
  mainDecoration?: ReactNode;
  contentScrollMode?: "shell" | "child";
  showTopHeader?: boolean;
  mainClassName?: string;
};

type ShellMeta = Pick<
  AliceShellProps,
  "currentPath" | "rightRail" | "currentRunLabel" | "headerContentScrolled" | "mainDecoration" | "contentScrollMode" | "showTopHeader" | "mainClassName"
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
const RESULT_RAIL_DEFAULT_WIDTH = 760;
const RESULT_RAIL_MIN_WIDTH = 420;
const RESULT_RAIL_MAX_WIDTH = 1040;
const RESULT_RAIL_MIN_MAIN_WIDTH = 360;
const RESULT_RAIL_DIVIDER_WIDTH = 8;
const ACCOUNT_AVATAR_CLASSES = ["bg-avatar-1", "bg-avatar-2", "bg-avatar-3", "bg-avatar-4", "bg-avatar-5", "bg-avatar-6", "bg-avatar-7", "bg-avatar-8"];
const LEDGER_EVENT_LABELS: Record<string, string> = {
  grant: "发放",
  reserve: "消耗",
  consume: "消耗",
  release: "返还",
  expire: "过期",
  adjust: "调整",
};
const LEDGER_TASK_LABELS: Record<string, string> = {
  standard_query: "标准数据查询",
  research_report: "调研报告",
  cycle_expiry: "周期到期",
  plan_grant: "套餐发放",
  product_adjudication: "产物判定",
};
const ORDER_STATUS_LABELS: Record<string, string> = {
  created: "待付款",
  paid: "待开通",
  fulfilled: "已开通",
  closed: "已关闭",
};
const ORDER_TYPE_LABELS: Record<string, string> = {
  new: "新购",
  renew: "续费",
  upgrade: "升级",
};
function fmtBillingDate(iso: string | null): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
function formatMoney(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}
function ledgerTaskLabel(taskKind: string | null): string {
  if (!taskKind) return "-";
  return LEDGER_TASK_LABELS[taskKind] ?? taskKind;
}
function computeLedgerBalances(
  items: LedgerItem[],
  dataQueryRemaining: number,
  reportRemaining: number,
): Array<LedgerItem & { balance: number }> {
  let dqBalance = dataQueryRemaining;
  let rrBalance = reportRemaining;
  return items.map((item) => {
    if (item.entitlement_type === "data_query") {
      const balance = dqBalance;
      dqBalance -= item.delta;
      return { ...item, balance };
    }
    const balance = rrBalance;
    rrBalance -= item.delta;
    return { ...item, balance };
  });
}

type HistoryDropPosition = "before" | "after";
type HistoryDragTarget = { sessionId: string; position: HistoryDropPosition };

function clampResultRailWidth(containerWidth: number, nextWidth: number) {
  const available = Math.max(0, containerWidth - RESULT_RAIL_DIVIDER_WIDTH);
  const maxByContainer = Math.max(0, available - RESULT_RAIL_MIN_MAIN_WIDTH);
  const min = Math.min(RESULT_RAIL_MIN_WIDTH, maxByContainer);
  const max = Math.max(min, Math.min(RESULT_RAIL_MAX_WIDTH, maxByContainer));
  return Math.round(Math.min(Math.max(nextWidth, min), max));
}

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
  headerContentScrolled = false,
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
      headerContentScrolled,
      mainDecoration,
      contentScrollMode,
      showTopHeader,
      mainClassName,
    });
  }, [currentPath, rightRail, currentRunLabel, headerContentScrolled, mainDecoration, contentScrollMode, showTopHeader, mainClassName, setShellMeta]);

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
      headerContentScrolled={meta.headerContentScrolled}
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
  headerContentScrolled = false,
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
  const [accountDialog, setAccountDialog] = useState<"profile" | "feedback" | null>(null);
  const [settingsPanel, setSettingsPanel] = useState<"profile" | "billing">("profile");
  const [avatarColor, setAvatarColor] = useState("#3b82f6");
  const [profileName, setProfileName] = useState<string | null>(null);
  const [editingProfileName, setEditingProfileName] = useState(false);
  const [profileNameDraft, setProfileNameDraft] = useState("");
  const [uuidCopied, setUuidCopied] = useState(false);
  const [selectedPlanCode, setSelectedPlanCode] = useState<string>("");
  const [billingCycle, setBillingCycle] = useState<"weekly" | "monthly" | "yearly">("monthly");
  const [billingView, setBillingView] = useState<"overview" | "orders" | "select">("overview");
  const [billingPaymentOpen, setBillingPaymentOpen] = useState(false);
  const [feedbackContent, setFeedbackContent] = useState("");
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState(false);
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
  const [ledgerItems, setLedgerItems] = useState<LedgerItem[]>([]);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [billingOrders, setBillingOrders] = useState<BillingOrder[]>([]);
  const [planSpecs, setPlanSpecs] = useState<UserPlanSpec[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<BillingOrder | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isResultRailDrawerViewport, setIsResultRailDrawerViewport] = useState(false);
  const [resultRailWidth, setResultRailWidth] = useState(RESULT_RAIL_DEFAULT_WIDTH);
  const [resizingResultRail, setResizingResultRail] = useState(false);
  const workspaceMainGridRef = useRef<HTMLDivElement | null>(null);
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
  const showDesktopRightRail = Boolean(rightRail && clientMounted && !isResultRailDrawerViewport);
  const showMobileRightRailDrawer = Boolean(rightRail && clientMounted && isResultRailDrawerViewport);
  const showRunHeader = showTopHeader || Boolean(currentRunLabel);
  const runHeaderInLeftPane = showDesktopRightRail && showRunHeader;
  const leftPaneUsesFlexLayout = childManagedScroll || runHeaderInLeftPane;

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
    if (!showDesktopRightRail) {
      setResizingResultRail(false);
      return;
    }
    const resize = () => {
      const rect = workspaceMainGridRef.current?.getBoundingClientRect();
      if (!rect) return;
      setResultRailWidth((current) => clampResultRailWidth(rect.width, current));
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [showDesktopRightRail]);

  const beginResultRailResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const grid = workspaceMainGridRef.current;
    if (!grid) return;
    event.preventDefault();
    const target = event.currentTarget;
    const pointerId = event.pointerId;
    target.setPointerCapture?.(pointerId);
    setResizingResultRail(true);

    const update = (clientX: number) => {
      const rect = grid.getBoundingClientRect();
      const rawRightWidth = rect.right - clientX - RESULT_RAIL_DIVIDER_WIDTH / 2;
      setResultRailWidth(clampResultRailWidth(rect.width, rawRightWidth));
    };

    update(event.clientX);

    const onMove = (moveEvent: PointerEvent) => {
      update(moveEvent.clientX);
    };
    const onEnd = () => {
      setResizingResultRail(false);
      if (target.hasPointerCapture?.(pointerId)) {
        target.releasePointerCapture?.(pointerId);
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  }, []);

  const resetResultRailWidth = useCallback(() => {
    const rect = workspaceMainGridRef.current?.getBoundingClientRect();
    setResultRailWidth((current) =>
      rect ? clampResultRailWidth(rect.width, RESULT_RAIL_DEFAULT_WIDTH) : current,
    );
  }, []);

  const workspaceMainGridStyle = useMemo<CSSProperties | undefined>(() => {
    if (!showDesktopRightRail) return undefined;
    return {
      gridTemplateColumns: `minmax(${RESULT_RAIL_MIN_MAIN_WIDTH}px,1fr) ${RESULT_RAIL_DIVIDER_WIDTH}px minmax(0,${resultRailWidth}px)`,
    };
  }, [resultRailWidth, showDesktopRightRail]);

  const renderRunHeader = (placement: "main" | "left-pane") => (
    <header
      data-testid="workspace-run-header"
      className={cn(
        "flex h-14.5 shrink-0 items-center bg-bg-surface px-3 sm:px-4 md:px-6",
        placement === "main" ? "sticky top-0 z-50" : "relative z-20",
        headerContentScrolled &&
          "after:pointer-events-none after:absolute after:left-0 after:right-0 after:top-full after:h-4 after:bg-[linear-gradient(180deg,#0f172a12,#0f172a00)] after:content-['']",
      )}
    >
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
    </header>
  );

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
  const accountDisplayName = profileName ?? headerAuth?.displayName ?? headerAuth?.userId ?? "账号与设置";
  const accountAvatar = useMemo(() => getAccountAvatarMeta(accountDisplayName), [accountDisplayName]);
  const accountUuid = headerAuth?.userId || "暂未获取";

  const loadBillingData = useCallback(async () => {
    if (!headerAuth) return;
    try {
      await platformAgent?.withFreshToken(async (token) => {
        const [summary, orderRes, planRes] = await Promise.all([
          fetchBillingSummary(token),
          fetchBillingOrders(token),
          fetchUserPlans(token),
        ]);
        setBillingSummary(summary);
        setBillingOrders(orderRes.orders ?? []);
        setPlanSpecs(planRes.plans ?? []);
      });
    } catch {
      // 忽略加载失败，界面保持空态
    }
  }, [headerAuth, platformAgent]);

  const loadLedgerPage = useCallback(
    async (page: number) => {
      if (!headerAuth) return;
      setLedgerLoading(true);
      try {
        await platformAgent?.withFreshToken(async (token) => {
          const res = await fetchEntitlementLedger(token, { page, page_size: 10 });
          setLedgerTotal(res.total);
          setLedgerPage(res.page);
          setLedgerItems((prev) => (res.page === 1 ? res.items : [...prev, ...res.items]));
        });
      } catch {
        // 忽略加载失败
      } finally {
        setLedgerLoading(false);
      }
    },
    [headerAuth, platformAgent],
  );

  useEffect(() => {
    if (accountDialog !== "profile") return;
    if (settingsPanel === "billing") {
      setLedgerItems([]);
      void loadLedgerPage(1);
    }
    void loadBillingData();
  }, [accountDialog, settingsPanel, loadLedgerPage, loadBillingData]);

  useEffect(() => {
    if (accountDialog !== "profile" || !headerAuth) return;
    let cancelled = false;
    void (async () => {
      try {
        await platformAgent?.withFreshToken(async (token) => {
          const next = await fetchProfile(token);
          if (cancelled) return;
          setProfile(next);
          if (next.display_name) setProfileName(next.display_name);
          if (next.avatar_color) setAvatarColor(next.avatar_color);
        });
      } catch {
        // 保留本地值
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountDialog, headerAuth, platformAgent]);

  useEffect(() => {
    if (searchParams.get("billing") !== "1") return;
    if (!showHeaderUserMenu) return;
    setSettingsPanel("billing");
    setAccountDialog("profile");
  }, [searchParams, showHeaderUserMenu]);

  const deriveOrderType = useCallback((): "new" | "renew" | "upgrade" => {
    if (!billingSummary?.has_active_cycle) return "new";
    const spec = planSpecs.find((p) => p.code === selectedPlanCode);
    if (spec && spec.code !== billingSummary.plan_code) return "upgrade";
    return "renew";
  }, [billingSummary, planSpecs, selectedPlanCode]);

  const handleCreateOrder = useCallback(async () => {
    const spec = planSpecs.find((p) => p.code === selectedPlanCode) ?? null;
    if (!headerAuth || !spec) return;
    setCreatingOrder(true);
    try {
      await platformAgent?.withFreshToken(async (token) => {
        const { order } = await createBillingOrder(token, {
          order_type: deriveOrderType(),
          plan_code: spec.code,
          billing_cycle: billingCycle,
          idempotency_key: crypto.randomUUID(),
        });
        setCreatedOrder(order);
        setBillingPaymentOpen(true);
      });
    } catch {
      // 创建失败保持弹窗关闭
    } finally {
      setCreatingOrder(false);
    }
  }, [headerAuth, planSpecs, selectedPlanCode, billingCycle, deriveOrderType, platformAgent]);

  useEffect(() => {
    if (!createdOrder || !headerAuth) return;
    void platformAgent?.withFreshToken(async (token) => {
      try {
        const res = await fetchBillingOrders(token);
        setBillingOrders(res.orders ?? []);
      } catch {
        // 忽略刷新失败
      }
    });
  }, [createdOrder, headerAuth, platformAgent]);

  useEffect(() => {
    if (planSpecs.length === 0) return;
    const available = planSpecs.filter((plan) => plan.billing_cycle === billingCycle);
    if (!available.some((plan) => plan.code === selectedPlanCode)) {
      setSelectedPlanCode(available[0]?.code ?? planSpecs[0]?.code ?? "");
    }
  }, [planSpecs, billingCycle, selectedPlanCode]);

  const handleSubmitFeedback = useCallback(async () => {
    if (!headerAuth) return;
    setSubmittingFeedback(true);
    setFeedbackError(false);
    try {
      await platformAgent?.withFreshToken(async (token) => {
        await submitFeedback(token, {
          message: feedbackContent,
          page_path: pathname ?? "/",
          client_version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
        });
      });
      setFeedbackSubmitted(true);
    } catch {
      setFeedbackError(true);
    } finally {
      setSubmittingFeedback(false);
    }
  }, [headerAuth, platformAgent, feedbackContent, pathname]);

  const handleProfileNameSave = useCallback(
    async (name: string) => {
      if (!headerAuth) return;
      try {
        await platformAgent?.withFreshToken(async (token) => {
          const res = await patchProfile(token, { display_name: name });
          setProfileName(res.display_name);
        });
      } catch {
        // 保存失败保持原值
      }
    },
    [headerAuth, platformAgent],
  );

  const handleAvatarColorSave = useCallback(
    async (color: string) => {
      if (!headerAuth) return;
      try {
        await platformAgent?.withFreshToken(async (token) => {
          await patchProfile(token, { avatar_color: color });
        });
      } catch {
        // 保存失败保持原色
      }
    },
    [headerAuth, platformAgent],
  );
  const accountEmail = profile?.email ?? "-";
  const accountPhone = profile?.phone ?? null;
  const selectedPlanSpec = planSpecs.find((p) => p.code === selectedPlanCode) ?? null;
  const selectedBillingPrice = selectedPlanSpec?.sale_price_cents ?? 0;
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
      setAccountDialog(null);
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
                    <Popover onOpenChange={(open) => { if (open) void loadBillingData(); }}>
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
                        <div className="px-3 pb-3 pt-4">
                          <div className="flex items-center gap-3 px-2 pb-3">
                            <span
                              aria-hidden="true"
                              className={cn(
                                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-body font-semibold text-primary-foreground",
                                accountAvatar.colorClass,
                              )}
                            >
                              {accountAvatar.initial}
                            </span>
                            <p className="min-w-0 flex-1 truncate text-body font-semibold leading-5 text-foreground">{accountDisplayName}</p>
                          </div>

                          <section aria-label="当前套餐与可用次数" className="rounded-xl bg-bg-subtle p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-caption leading-5 text-text-secondary">当前套餐</p>
                                <p className="mt-0.5 text-body font-semibold leading-5 text-foreground">{billingSummary?.plan_name ?? "未开通"}</p>
                              </div>
                              <button
                                type="button"
                                className="shrink-0 rounded-control px-3 py-1.5 text-caption font-medium transition-colors hover:bg-fill-hover"
                                style={{ backgroundColor: "var(--color-text-1)", color: "var(--color-bg-1)" }}
                                onClick={() => {
                                  setSettingsPanel("billing");
                                  setAccountDialog("profile");
                                }}
                              >
                                升级套餐
                              </button>
                            </div>
                            <div className="mt-3 grid grid-cols-2 divide-x divide-border border-t border-border pt-3">
                              <div className="pr-3">
                                <p className="text-caption leading-5 text-text-secondary">数据查询</p>
                                <p className="mt-1 text-body font-semibold leading-5 text-foreground">剩余 {billingSummary?.data_query_remaining ?? "-"} 次</p>
                              </div>
                              <div className="pl-3">
                                <p className="text-caption leading-5 text-text-secondary">调研报告</p>
                                <p className="mt-1 text-body font-semibold leading-5 text-foreground">剩余 {billingSummary?.research_report_remaining ?? "-"} 次</p>
                              </div>
                            </div>
                          </section>

                          <div className="mt-2 flex flex-col gap-0.5">
                              <button
                                type="button"
                                className="flex h-10 w-full items-center gap-3 rounded-lg px-2 text-left text-body font-medium leading-5 text-foreground transition hover:bg-fill-hover"
                                onClick={() => {
                                  setSettingsPanel("profile");
                                  setUuidCopied(false);
                                  setAccountDialog("profile");
                                }}
                              >
                                <UserRound className="h-5 w-5 shrink-0 text-text-secondary" strokeWidth={1.8} />
                                <span className="flex-1">个人中心</span>
                                <ChevronRight className="h-4 w-4 text-text-tertiary" strokeWidth={2} />
                              </button>
                              <Link
                                href="/help"
                                className="flex h-10 w-full items-center gap-3 rounded-lg px-2 text-left text-body font-medium leading-5 text-foreground transition hover:bg-fill-hover"
                              >
                                <BookOpen className="h-5 w-5 shrink-0 text-text-secondary" strokeWidth={1.8} />
                                <span className="flex-1">帮助文档</span>
                                <ChevronRight className="h-4 w-4 text-text-tertiary" strokeWidth={2} />
                              </Link>
                              <button
                                type="button"
                                className="flex h-10 w-full items-center gap-3 rounded-lg px-2 text-left text-body font-medium leading-5 text-foreground transition hover:bg-fill-hover"
                                onClick={() => {
                                  setFeedbackContent("");
                                  setFeedbackSubmitted(false);
                                  setAccountDialog("feedback");
                                }}
                              >
                                <MessageCircleMore className="h-5 w-5 shrink-0 text-text-secondary" strokeWidth={1.8} />
                                <span className="flex-1">问题反馈</span>
                                <ChevronRight className="h-4 w-4 text-text-tertiary" strokeWidth={2} />
                              </button>
                          </div>

                          <div className="mt-3 border-t border-border pt-3">
                            <button
                              type="button"
                              className="flex h-10 w-full items-center gap-3 rounded-lg px-2 text-left text-body font-medium leading-5 text-foreground transition hover:bg-fill-hover"
                              onClick={() => setLogoutConfirmOpen(true)}
                            >
                              <LogOut className="h-5 w-5 shrink-0 text-text-secondary" strokeWidth={1.8} />
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

        <Dialog open={accountDialog === "profile"} onOpenChange={(open) => !open && setAccountDialog(null)}>
          <DialogContent
            aria-describedby={undefined}
            className="h-[720px] max-h-[calc(100dvh-2rem)] w-[min(960px,calc(100vw-2rem))] max-w-none overflow-hidden rounded-panel border-border bg-bg-surface p-0 shadow-dialog"
          >
            <div className="flex h-full min-h-0">
              {accountDialog === "profile" ? (
                <>
                  <aside className="w-48 shrink-0 border-r border-border bg-bg-subtle px-3 py-6">
                    <p className="px-2 text-title-1 font-semibold text-foreground">设置</p>
                    <div className="mt-6 flex flex-col gap-1">
                      <button
                        type="button"
                        aria-pressed={settingsPanel === "profile"}
                        className={cn(
                          "flex h-10 w-full items-center gap-3 rounded-lg px-2 text-left text-body font-medium transition",
                          settingsPanel === "profile" ? "bg-fill-active text-foreground" : "text-text-secondary hover:bg-fill-hover hover:text-foreground",
                        )}
                        onClick={() => setSettingsPanel("profile")}
                      >
                        <UserRound className="h-5 w-5" strokeWidth={1.8} />
                        个人资料
                      </button>
                      <button
                        type="button"
                        aria-pressed={settingsPanel === "billing"}
                        className={cn(
                          "flex h-10 w-full items-center gap-3 rounded-lg px-2 text-left text-body font-medium transition",
                          settingsPanel === "billing" ? "bg-fill-active text-foreground" : "text-text-secondary hover:bg-fill-hover hover:text-foreground",
                        )}
                        onClick={() => setSettingsPanel("billing")}
                      >
                        <CreditCard className="h-5 w-5" strokeWidth={1.8} />
                        费用
                      </button>
                    </div>
                  </aside>

                  <div className="min-w-0 flex min-h-0 flex-1 flex-col">
                    <div className="shrink-0 px-8 pt-6">
                      <DialogTitle className="text-title-2 font-semibold leading-7 text-foreground">
                        {settingsPanel === "profile" ? "个人资料" : "费用"}
                      </DialogTitle>
                    </div>

                    {settingsPanel === "profile" ? (
                      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8 pt-5">
                        <section className="overflow-hidden rounded-xl border border-border bg-bg-surface">
                          <div className="flex items-center gap-3 px-5 py-4">
                            <span
                              aria-hidden="true"
                              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-semibold text-white"
                              style={{ backgroundColor: avatarColor }}
                            >
                              {accountAvatar.initial}
                            </span>
                            <div className="min-w-0 flex-1">
                              {editingProfileName ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    aria-label="名称"
                                    autoFocus
                                    value={profileNameDraft}
                                    onChange={(event) => setProfileNameDraft(event.target.value)}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") {
                                        const nextName = profileNameDraft.trim();
                                        if (nextName) void handleProfileNameSave(nextName);
                                        setEditingProfileName(false);
                                      }
                                      if (event.key === "Escape") setEditingProfileName(false);
                                    }}
                                    className="h-8 min-w-0 flex-1 rounded-control border border-border bg-bg-surface px-2 text-body font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                                  />
                                  <button
                                    type="button"
                                    className="shrink-0 rounded-control px-2 py-1 text-caption font-medium text-foreground hover:bg-fill-hover"
                                    onClick={() => {
                                      const nextName = profileNameDraft.trim();
                                      if (nextName) void handleProfileNameSave(nextName);
                                      setEditingProfileName(false);
                                    }}
                                  >
                                    完成
                                  </button>
                                </div>
                              ) : (
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <p className="truncate text-body font-semibold text-foreground">{accountDisplayName}</p>
                                  <button
                                    type="button"
                                    aria-label="编辑名称"
                                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-text-tertiary transition hover:bg-fill-hover hover:text-foreground"
                                    onClick={() => {
                                      setProfileNameDraft(accountDisplayName);
                                      setEditingProfileName(true);
                                    }}
                                  >
                                    <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
                                  </button>
                                </div>
                              )}
                              <p className="mt-0.5 truncate text-caption text-text-secondary">{accountEmail}</p>
                              <p className="mt-0.5 truncate text-caption text-text-secondary">{accountPhone ? `手机号 ${accountPhone}` : "手机号 未绑定"}</p>
                            </div>
                          </div>

                          <div className="border-t border-border px-5 py-4">
                            <p className="text-body font-medium text-foreground">头像背景色</p>
                            <div className="mt-3 flex flex-wrap gap-3">
                            {["#3b82f6", "#a855f7", "#6366f1", "#f59e0b", "#f97316", "#06b6d4", "#22c55e", "#94a3b8", "#ec4899"].map((color) => (
                              <button
                                key={color}
                                type="button"
                                aria-label={`选择头像背景色 ${color}`}
                                aria-pressed={avatarColor === color}
                                className="h-8 w-8 rounded-full border-2 border-white ring-2 transition focus:outline-none focus:ring-primary/40"
                                style={{ backgroundColor: color, boxShadow: avatarColor === color ? `0 0 0 2px ${color}` : "none" }}
                                onClick={() => { setAvatarColor(color); void handleAvatarColorSave(color); }}
                              />
                            ))}
                            </div>
                          </div>
                        </section>

                        <section className="mt-5 rounded-xl border border-border px-4 py-4">
                          <div className="flex items-center justify-between gap-5">
                            <div className="min-w-0">
                              <p className="text-body font-medium text-foreground">账号 UUID</p>
                              <p className="mt-1 text-caption leading-5 text-text-secondary">你的专属用户标识，可用于问题反馈与技术支持时快速定位账号</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className="max-w-40 truncate text-body font-medium text-foreground">{accountUuid}</span>
                              <span className="relative inline-flex">
                                <button
                                  type="button"
                                  aria-label="复制账号 UUID"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-control text-text-secondary transition hover:bg-fill-hover hover:text-foreground"
                                  onClick={() => {
                                    void navigator.clipboard?.writeText(accountUuid);
                                    setUuidCopied(true);
                                    window.setTimeout(() => setUuidCopied(false), 1600);
                                  }}
                                >
                                  <Copy className="h-4 w-4" strokeWidth={1.8} />
                                </button>
                                {uuidCopied ? (
                                  <span
                                    role="status"
                                    className="absolute right-0 top-9 z-10 whitespace-nowrap rounded-control px-2 py-1 text-caption shadow-popover"
                                    style={{ backgroundColor: "var(--color-text-1)", color: "var(--color-bg-1)" }}
                                  >
                                    已复制
                                  </span>
                                ) : null}
                              </span>
                            </div>
                          </div>
                        </section>

                        <section className="mt-5 flex items-center justify-between rounded-xl border border-border px-4 py-4">
                          <div>
                            <p className="text-body font-medium text-foreground">退出登录</p>
                            <p className="mt-1 text-caption text-text-secondary">在此设备退出登录，可随时重新登录。</p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 border-danger-border bg-bg-surface text-caption font-medium text-danger hover:bg-danger-bg hover:text-danger"
                            onClick={() => {
                              setAccountDialog(null);
                              setLogoutConfirmOpen(true);
                            }}
                          >
                            <LogOut className="mr-1 h-4 w-4" strokeWidth={1.8} />
                            退出登录
                          </Button>
                        </section>
                      </div>
                    ) : (
                      <div className="flex min-h-0 flex-1 flex-col">
                        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-8 pb-5 pt-5">
                          {billingView === "overview" ? (
                            <>
                              <div className="flex items-start justify-between border-b border-border pb-5">
                                <div><p className="text-title-2 font-semibold text-foreground">套餐与账单</p><p className="mt-3 text-body font-medium text-foreground">{billingSummary?.plan_name ?? "未开通"}{billingSummary?.has_active_cycle ? <span className="ml-2 text-success">· 生效中</span> : null}</p></div>
                                <button type="button" className="inline-flex items-center gap-2 text-body text-text-secondary hover:text-foreground" onClick={() => setBillingView("orders")}><CreditCard className="h-4 w-4" />订单记录</button>
                              </div>
                              <div className="grid grid-cols-2 gap-10 border-b border-border py-5">
                                <div className="grid grid-cols-2 gap-4">
                                  <section className="rounded-xl bg-bg-subtle p-4">
                                    <p className="text-caption text-text-secondary">数据查询剩余</p>
                                    <p className="mt-2 text-title-1 font-semibold leading-none text-foreground">{billingSummary?.data_query_remaining ?? "-"} 次</p>
                                  </section>
                                  <section className="rounded-xl bg-bg-subtle p-4">
                                    <p className="text-caption text-text-secondary">调研报告剩余</p>
                                    <p className="mt-2 text-title-1 font-semibold leading-none text-foreground">{billingSummary?.research_report_remaining ?? "-"} 次</p>
                                  </section>
                                </div>
                                <div className="border-l border-border pl-10"><p className="text-caption text-text-secondary">到期时间</p><p className="mt-3 text-title-3 font-medium text-foreground">{fmtBillingDate(billingSummary?.ends_at ?? null)}</p><div className="mt-8 flex gap-3"><Button variant="outline" type="button" onClick={() => setBillingView("select")}>续订</Button><Button type="button" onClick={() => { setSelectedPlanCode(planSpecs.find((p) => p.code === "paid_advanced")?.code ?? planSpecs[0]?.code ?? ""); setBillingView("select"); }}>升级套餐</Button></div></div>
                              </div>
                              <div className="flex min-h-0 flex-1 flex-col pt-5"><p className="text-title-3 font-semibold text-foreground">额度明细</p><div className="mt-3 min-h-0 flex-1 overflow-y-auto"><table className="w-full text-left text-body"><thead className="sticky top-0 bg-bg-surface text-caption text-text-secondary"><tr><th className="py-3 font-medium">时间</th><th className="font-medium">权益</th><th className="font-medium">事项</th><th className="font-medium">类型</th><th className="font-medium">变动</th><th className="text-right font-medium">该权益余额</th></tr></thead><tbody>{computeLedgerBalances(ledgerItems, billingSummary?.data_query_remaining ?? 0, billingSummary?.research_report_remaining ?? 0).map((item) => <tr key={item.id} className="border-t border-border"><td className="py-3">{fmtBillingDate(item.created_at)}</td><td>{item.entitlement_type === "data_query" ? "数据查询" : "调研报告"}</td><td>{ledgerTaskLabel(item.task_kind)}</td><td>{LEDGER_EVENT_LABELS[item.event_type] ?? item.event_type}</td><td className={item.delta > 0 ? "text-success" : ""}>{item.delta > 0 ? `+${item.delta}` : item.delta}</td><td className="text-right">{item.balance}</td></tr>)}</tbody></table>{ledgerLoading ? <p className="py-4 text-center text-caption text-text-secondary">加载中…</p> : ledgerItems.length < ledgerTotal ? <div className="pt-4 text-center"><Button variant="outline" size="sm" type="button" onClick={() => void loadLedgerPage(ledgerPage + 1)}>加载更多</Button></div> : null}</div></div>
                            </>
                          ) : billingView === "orders" ? (
                            <><div className="flex items-center justify-between"><button type="button" className="inline-flex items-center gap-2 text-title-2 font-semibold text-foreground" onClick={() => setBillingView("overview")}>← 订单记录</button><input aria-label="搜索订单号" placeholder="搜索订单号" className="h-9 w-44 rounded-control border border-border px-3 text-caption outline-none focus:border-primary" /></div><div className="mt-6 overflow-y-auto"><table className="w-full text-left text-caption"><thead className="border-b border-border text-text-secondary"><tr>{["订单号", "类型", "套餐", "金额", "状态", "创建时间"].map((column) => <th key={column} className="px-2 py-3 font-medium">{column}</th>)}</tr></thead><tbody>{billingOrders.map((order) => <tr key={order.id} className="border-b border-border"><td className="px-2 py-4 font-mono text-text-secondary">{order.order_no}</td><td className="px-2">{ORDER_TYPE_LABELS[order.order_type] ?? order.order_type}</td><td className="px-2">{order.plan_snapshot.name}</td><td className="px-2">{formatMoney(order.amount_cents)}</td><td className="px-2"><span className={order.status === "fulfilled" ? "text-success" : order.status === "created" ? "text-warning" : "text-text-secondary"}>{ORDER_STATUS_LABELS[order.status] ?? order.status}</span></td><td className="px-2 text-text-secondary">{fmtBillingDate(order.created_at)}</td></tr>)}</tbody></table>{billingOrders.length === 0 ? <p className="py-8 text-center text-caption text-text-secondary">暂无订单</p> : null}</div></>
                          ) : (
                            <>
                              <div className="flex items-center justify-between gap-4">
                                <div className="inline-flex items-center gap-2 text-title-2 font-semibold text-foreground">
                                  <button type="button" aria-label="返回套餐与账单" className="inline-flex h-8 w-8 items-center justify-center rounded-control transition-colors hover:bg-fill-hover hover:text-primary" onClick={() => setBillingView("overview")}><ArrowLeft className="h-5 w-5" strokeWidth={1.8} /></button>
                                  <span>选择套餐</span>
                                </div>
                                <div className="inline-flex items-center gap-2" role="group" aria-label="付费周期">
                                  <div className="inline-flex rounded-control bg-bg-subtle p-1">
                                  {[{ code: "weekly" as const, label: "周付" }, { code: "monthly" as const, label: "月付" }, { code: "yearly" as const, label: "年付" }].map((cycle) => (
                                    <button key={cycle.code} type="button" aria-pressed={billingCycle === cycle.code} className={cn("h-8 rounded-control px-4 text-caption font-medium transition-colors", billingCycle === cycle.code ? "bg-bg-surface text-foreground shadow-sm" : "text-text-secondary hover:bg-fill-hover hover:text-foreground")} onClick={() => setBillingCycle(cycle.code)}>
                                      <span>{cycle.label}</span>
                                    </button>
                                  ))}
                                  </div>
                                  {planSpecs.some((plan) => plan.campaign_label) ? <span className="rounded-control bg-[#fff3e8] px-2 py-1 text-caption font-medium text-[#e85d04]">限时优惠</span> : null}
                                </div>
                              </div>
                              <div className="mt-5 grid min-h-0 flex-1 grid-cols-2 gap-4 overflow-y-auto pb-3">
                                {planSpecs.filter((plan) => plan.billing_cycle === billingCycle).length === 0 ? <p className="col-span-2 py-16 text-center text-caption text-text-secondary">暂无可售套餐</p> : null}
                                {planSpecs.filter((plan) => plan.billing_cycle === billingCycle).map((plan) => {
                                  const cycleUnit = billingCycle === "weekly" ? "周" : billingCycle === "monthly" ? "月" : "年";
                                  const discountRate = plan.catalog_price_cents > plan.sale_price_cents ? Math.round(((plan.catalog_price_cents - plan.sale_price_cents) / plan.catalog_price_cents) * 100) : null;
                                  return <button key={plan.code} type="button" aria-pressed={selectedPlanCode === plan.code} onClick={() => setSelectedPlanCode(plan.code)} className={cn("relative rounded-card border bg-bg-surface p-5 text-left transition-colors", selectedPlanCode === plan.code ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-fill-hover")}>
                                    <p className="text-title-2 font-semibold text-foreground">{plan.name}</p><p className="mt-2 min-h-10 text-caption text-text-secondary">{plan.campaign_label ?? "按周期计费"}</p>
                                    <div className="mt-6 flex items-end gap-2"><span className="text-[34px] font-semibold leading-none">{formatMoney(plan.sale_price_cents)}</span><span className="mb-0.5 text-body text-text-secondary">/ {cycleUnit}</span>{discountRate ? <><span className="mb-0.5 text-body text-text-tertiary line-through">{formatMoney(plan.catalog_price_cents)}</span><span className="mb-0.5 rounded-control bg-[#fff3e8] px-1.5 py-0.5 text-caption text-[#e85d04]">省 {discountRate}%</span></> : null}</div>
                                    <div className="mt-5 border-t border-border pt-4"><p className="text-caption text-text-secondary">包含</p><p className="mt-1 text-body font-semibold">{plan.data_query_quota} 次数据查询</p><p className="mt-1 text-body font-semibold">{plan.research_report_quota} 次调研报告</p></div>
                                  </button>;
                                })}
                              </div>
                            </>
                          )}
                        </div>
                        {billingView === "select" ? <footer className="flex shrink-0 items-center justify-between border-t border-border bg-bg-surface px-8 py-4 shadow-[0_-8px_20px_rgba(15,23,42,0.04)]"><div><div className="flex items-baseline gap-3"><p className="text-caption text-text-secondary">应付</p><p className="text-[32px] font-semibold leading-none">{formatMoney(selectedBillingPrice)}</p></div><p className="mt-2 text-caption text-text-secondary">点击继续支付即同意《Alice 服务协议》</p></div><Button type="button" className="h-12 min-w-48 rounded-full bg-foreground px-7 text-body font-semibold text-primary-foreground hover:bg-foreground" disabled={creatingOrder || !selectedPlanSpec} onClick={() => void handleCreateOrder()}>{creatingOrder ? "创建中…" : "继续支付"}</Button></footer> : null}
                      </div>
                    )}
                  </div>
                </>
              ) : null}

            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={billingPaymentOpen} onOpenChange={(open) => { if (!open) setBillingPaymentOpen(false); }}>
          <DialogContent aria-describedby={undefined} className="w-[min(520px,calc(100vw-2rem))] rounded-card border-border bg-bg-surface p-6 shadow-dialog">
            <DialogTitle>订单已创建</DialogTitle>
            {createdOrder ? (
              <div className="mt-5 rounded-xl border border-border bg-bg-subtle p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-caption text-text-secondary">订单号</p>
                  <p className="font-mono text-body font-medium text-foreground">{createdOrder.order_no}</p>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-caption text-text-secondary">应付金额</p>
                  <p className="text-title-2 font-semibold text-foreground">{formatMoney(createdOrder.amount_cents)}</p>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-caption text-text-secondary">状态</p>
                  <p className="text-body font-medium text-foreground">{ORDER_STATUS_LABELS[createdOrder.status] ?? createdOrder.status}</p>
                </div>
              </div>
            ) : null}
            <p className="mt-5 text-body leading-6 text-text-secondary">请按以上金额完成线下转账，付款后联系客服或等待运营确认开通。订单记录中可随时查看状态。</p>
            <div className="mt-6 flex justify-end gap-3">
              <Button type="button" variant="outline" className="h-10 rounded-control" onClick={() => setBillingPaymentOpen(false)}>知道了</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={accountDialog === "feedback"} onOpenChange={(open) => !open && setAccountDialog(null)}>
          <DialogContent aria-describedby={undefined} className="w-[min(640px,calc(100vw-2rem))] rounded-panel border-border bg-bg-surface p-0 shadow-dialog">
            <div className="p-6 sm:p-7">
              <DialogTitle className="flex items-center gap-3 text-title-2 font-semibold leading-7 text-foreground">
                <MessageCircleMore className="h-6 w-6" strokeWidth={1.8} />
                问题反馈
              </DialogTitle>
              <p className="mt-3 max-w-xl text-body leading-6 text-text-secondary">告诉我们你遇到的问题或建议，帮助 Alice 持续改进。</p>

              {feedbackSubmitted ? (
                <div className="mt-6 rounded-xl border border-success-border bg-success-bg px-4 py-5">
                  <p className="text-body font-medium text-foreground">感谢你的反馈</p>
                  <p className="mt-1 text-caption leading-5 text-text-secondary">我们已记录，将尽快查看。</p>
                </div>
              ) : (
                <>
                  <section className="mt-5">
                    <textarea
                      id="feedback-content"
                      aria-label="问题反馈内容"
                      value={feedbackContent}
                      placeholder="请详细描述您遇到的问题或提出的建议…"
                      onChange={(event) => setFeedbackContent(event.target.value)}
                      className="min-h-36 w-full resize-none rounded-xl border border-border bg-bg-surface px-3 py-2.5 text-body leading-6 text-foreground outline-none placeholder:text-text-disabled focus:border-primary focus:ring-2 focus:ring-primary/15"
                    />
                  </section>
                  {feedbackError ? (
                    <p className="mt-2 text-caption text-destructive">提交失败，请稍后重试。你的输入内容已保留。</p>
                  ) : null}
                </>
              )}

              <div className="mt-5 flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-control border-border bg-bg-surface text-body font-medium text-text-secondary hover:bg-bg-surface hover:text-foreground"
                  onClick={() => setAccountDialog(null)}
                >
                  {feedbackSubmitted ? "关闭" : "取消"}
                </Button>
                {!feedbackSubmitted ? (
                  <Button
                    type="button"
                    className="h-10 rounded-control bg-primary text-body font-medium text-primary-foreground hover:bg-primary"
                    disabled={!feedbackContent.trim() || submittingFeedback}
                    onClick={() => void handleSubmitFeedback()}
                  >
                    {submittingFeedback ? "提交中…" : "提交反馈"}
                  </Button>
                ) : null}
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
                <div className="flex h-full items-center justify-center pb-8">
                  <EmptyState className="m-0 min-h-0" message="暂无消息" />
                </div>
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

          {showRunHeader && !runHeaderInLeftPane ? renderRunHeader("main") : null}

          <div
            ref={workspaceMainGridRef}
            data-testid={rightRail ? "workspace-main-grid" : undefined}
            style={workspaceMainGridStyle}
            className={cn(
              "min-h-0 flex-1",
              childManagedScroll && "overflow-hidden",
              !showTopHeader && !currentRunLabel && "pt-16 md:pt-0",
              showDesktopRightRail && "grid min-h-0 grid-cols-1 lg:grid-cols-[minmax(360px,1fr)_8px_minmax(0,760px)]",
              resizingResultRail && "select-none",
            )}
          >
            <div
              data-testid={rightRail ? "workspace-left-pane" : undefined}
              className={cn(
                "relative min-w-0",
                leftPaneUsesFlexLayout && "flex h-full min-h-0 flex-col overflow-hidden",
                !leftPaneUsesFlexLayout && contentScrollMode === "shell" && "overflow-visible",
                !leftPaneUsesFlexLayout && contentScrollMode !== "shell" && "overflow-hidden",
              )}
            >
              {mainDecoration ? <div className="pointer-events-none absolute inset-0">{mainDecoration}</div> : null}
              {runHeaderInLeftPane ? renderRunHeader("left-pane") : null}
              <div
                className={cn(
                  "relative z-1 min-h-0",
                  leftPaneUsesFlexLayout ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "h-full",
                )}
              >
                {children}
              </div>
            </div>
            {showDesktopRightRail ? (
              <button
                type="button"
                role="separator"
                aria-label="调整对话和结果宽度"
                aria-orientation="vertical"
                aria-valuemin={RESULT_RAIL_MIN_WIDTH}
                aria-valuemax={RESULT_RAIL_MAX_WIDTH}
                aria-valuenow={resultRailWidth}
                className={cn(
                  "group relative hidden h-full min-h-0 w-2 cursor-col-resize touch-none items-stretch justify-center bg-[#fff] lg:flex",
                )}
                onPointerDown={beginResultRailResize}
                onDoubleClick={resetResultRailWidth}
              >
                <span
                  className={cn(
                    "block h-full w-px bg-[var(--color-border-2)] transition-colors",
                    resizingResultRail ? "bg-[var(--color-border-2)]" : "group-hover:bg-[var(--color-border-2)]",
                  )}
                  aria-hidden
                />
              </button>
            ) : null}
            {showDesktopRightRail ? (
              <aside
                data-testid="workspace-right-rail"
                className={cn(
                  "flex min-h-0 min-w-0 flex-col bg-bg-surface",
                  childManagedScroll ? "overflow-hidden" : "overflow-visible",
                )}
              >
                {rightRail}
              </aside>
            ) : null}
          </div>
        </main>
      </div>

      {showMobileRightRailDrawer ? (
        <div
          className="fixed inset-0 z-modal flex items-end justify-center bg-overlay-bg backdrop-blur-soft"
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
