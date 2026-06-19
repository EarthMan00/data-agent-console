"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type WheelEvent,
} from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatedArrowUpIcon } from "@/components/ui/animated-arrow-up-icon";
import {
  fetchHomePromptRecommendations,
  fetchPublicPromptCategories,
  type PublicPromptCategory,
} from "@/lib/agent-api/home-prompts";
import type { HomePromptCard } from "@/lib/workspace-domain-types";
import {
  getHomeCapabilityItem,
  homeCapabilityGroups,
  homeDataSourceItems,
  type HomeCapabilityGroup,
  type HomeCapabilityItem,
} from "@/lib/home-capability-items";
import { AgentWorkspace } from "@/components/agent-workspace";
import { AssistantThreadFrame } from "@/components/assistant-thread-frame";
import { AliceShell, useAliceShellState } from "@/components/alice-shell";
import { PlatformLogo } from "@/components/platform-logo";
import { sanitizeObjective } from "@/lib/agent-attachments";
import { parseComposerPrefillStorageValue, parseDatasourceMentions } from "@/lib/composer-prefill";
import { workspaceActions } from "@/lib/workspace-store";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { AGENT_COMPOSER_PREFILL_STORAGE_KEY } from "@/lib/agent-api/session";
import {
  createAgentRun,
  isAgentRuntimeConfigured,
  isPlatformBackendEnabled,
} from "@/lib/agent-runtime";
import { cn } from "@/lib/utils";
import { TaskComposer } from "@/components/task-composer";

const PENDING_HOME_TASK_STORAGE_KEY = "alice:pending-home-task-after-login";
const PENDING_HOME_TASK_MAX_AGE_MS = 30 * 60 * 1000;

type PendingHomeTask = {
  text: string;
  selectedSourceIds: string[];
  activeCapabilityId: string;
  composerMode: "普通模式" | "深度模式";
  createdAt: number;
  pendingFiles?: File[];
};

type HomePromptCacheEntry = {
  cards: HomePromptCard[] | null;
  promise: Promise<HomePromptCard[]> | null;
};

const HOME_PROMPT_ANONYMOUS_CACHE_KEY = "__anonymous__";
const homePromptCardCache = new Map<string, HomePromptCacheEntry>();

function mapHomePromptCards(rows: Awaited<ReturnType<typeof fetchHomePromptRecommendations>>): HomePromptCard[] {
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.description,
    prompt: r.prompt,
    meta: r.meta,
    capabilityIds: r.capability_ids,
    replayRunId: r.replay_run_id ?? undefined,
    replayShareId: r.replay_share_id ?? undefined,
  }));
}

function getHomePromptCardFilterKey(capabilityIds: string[]) {
  return capabilityIds.length > 0 ? capabilityIds.slice().sort().join(",") : "all";
}

function filterHomePromptCardsByCapability(cards: HomePromptCard[], capabilityIds: string[]) {
  if (capabilityIds.length === 0) return cards;
  const filterSet = new Set(capabilityIds);
  return cards.filter((card) => card.capabilityIds.some((id) => filterSet.has(id)));
}

function getCachedHomePromptCards(cacheKey: string) {
  return homePromptCardCache.get(cacheKey)?.cards ?? null;
}

function loadHomePromptCardsOnce(
  cacheKey: string,
  categoryId: string,
  capabilityId?: string,
  capabilityIds: string[] = [],
) {
  const cached = homePromptCardCache.get(cacheKey);
  if (cached?.cards) return Promise.resolve(cached.cards);
  if (cached?.promise) return cached.promise;

  const promise = fetchHomePromptRecommendations(categoryId, capabilityId)
    .then(mapHomePromptCards)
    .then((cards) => filterHomePromptCardsByCapability(cards, capabilityIds))
    .then((cards) => {
      homePromptCardCache.set(cacheKey, { cards, promise: null });
      return cards;
    })
    .catch((error) => {
      homePromptCardCache.delete(cacheKey);
      throw error;
    });

  homePromptCardCache.set(cacheKey, { cards: null, promise });
  return promise;
}

function capabilityLabelFromId(capabilityId: string) {
  return capabilityId.trim().replace(/^@+/, "");
}

function staticCapabilityMeta(categoryName: string, capabilityLabel: string) {
  const staticItem = homeDataSourceItems.find(
    (item) => item.id === capabilityLabel || item.label === capabilityLabel,
  );
  const staticGroup = homeCapabilityGroups.find((group) => group.label === categoryName);
  return {
    icon: staticItem?.icon ?? staticGroup?.icon ?? "grid",
    accent: staticItem?.accent ?? staticGroup?.accent ?? "var(--color-accent-neutral)",
  };
}

function buildDataSourceGroupsFromPromptCards(
  categories: PublicPromptCategory[],
  cardsByCategoryId: Record<string, HomePromptCard[]>,
): HomeCapabilityGroup[] {
  const groupsByCategoryId = new Map<string, HomeCapabilityGroup>();
  const itemsByCapabilityId = new Map<string, HomeCapabilityItem>();
  const promptsByCapabilityId = new Map<string, Set<string>>();

  categories.filter((category) => category.name !== "应用场景").forEach((category) => {
    const cards = cardsByCategoryId[category.id] ?? [];

    for (const card of cards) {
      const prompt = card.prompt.trim();
      for (const rawId of card.capabilityIds) {
        const capabilityId = rawId.trim();
        const label = capabilityLabelFromId(capabilityId);
        if (!capabilityId || !label) continue;

        let item = itemsByCapabilityId.get(capabilityId);
        if (!item) {
          const meta = staticCapabilityMeta(category.name, label);
          const groupMeta = staticCapabilityMeta(category.name, "");
          let group = groupsByCategoryId.get(category.id);
          if (!group) {
            group = {
              id: category.id,
              label: category.name,
              accent: groupMeta.accent,
              icon: groupMeta.icon,
              items: [],
            };
            groupsByCategoryId.set(category.id, group);
          }

          item = {
            id: capabilityId,
            label,
            promptHint: category.name,
            parentId: category.id,
            parentLabel: category.name,
            accent: meta.accent,
            icon: meta.icon,
            promptTemplates: [],
          };
          itemsByCapabilityId.set(capabilityId, item);
          group.items.push(item);
        }

        if (prompt) {
          const existingPrompts = promptsByCapabilityId.get(capabilityId) ?? new Set<string>();
          if (!existingPrompts.has(prompt)) {
            existingPrompts.add(prompt);
            promptsByCapabilityId.set(capabilityId, existingPrompts);
            item.promptTemplates = [...(item.promptTemplates ?? []), prompt];
            item.promptTemplate ??= prompt;
          }
        }
      }
    }
  });

  return categories
    .map((category) => groupsByCategoryId.get(category.id))
    .filter((group): group is HomeCapabilityGroup => Boolean(group && group.items.length > 0));
}

function savePendingHomeTaskAfterLogin(task: Omit<PendingHomeTask, "createdAt">) {
  try {
    sessionStorage.setItem(
      PENDING_HOME_TASK_STORAGE_KEY,
      JSON.stringify({ ...task, createdAt: Date.now() } satisfies PendingHomeTask),
    );
  } catch {
    // If sessionStorage is unavailable, the in-memory login prompt still preserves the typed text on screen.
  }
}

function consumePendingHomeTaskAfterLogin(): PendingHomeTask | null {
  try {
    const raw = sessionStorage.getItem(PENDING_HOME_TASK_STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_HOME_TASK_STORAGE_KEY);
    const parsed = JSON.parse(raw) as Partial<PendingHomeTask>;
    if (!parsed.text || typeof parsed.text !== "string") return null;
    if (!parsed.createdAt || Date.now() - parsed.createdAt > PENDING_HOME_TASK_MAX_AGE_MS) return null;
    return {
      text: parsed.text,
      selectedSourceIds: Array.isArray(parsed.selectedSourceIds) ? parsed.selectedSourceIds.filter((id) => typeof id === "string") : [],
      activeCapabilityId: typeof parsed.activeCapabilityId === "string" ? parsed.activeCapabilityId : "scenarios",
      composerMode: parsed.composerMode === "普通模式" ? "普通模式" : "深度模式",
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

export function AliceHomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const platformAgent = useOptionalPlatformAgent();
  const {
    refreshHistoryNow,
    setActiveSessionTitle,
    upsertOptimisticHistorySession,
  } = useAliceShellState();
  const [query, setQuery] = useState("");
  const [activeCapabilityId, setActiveCapabilityId] = useState("scenarios");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [promptCategories, setPromptCategories] = useState<PublicPromptCategory[]>([]);
  const [canPersonalizeGreeting, setCanPersonalizeGreeting] = useState(false);
  const hydratedAuth = canPersonalizeGreeting && platformAgent?.authHydrated ? platformAgent.auth : null;
  const userCachePrefix = hydratedAuth?.userId ?? (platformAgent?.authHydrated ? HOME_PROMPT_ANONYMOUS_CACHE_KEY : null);
  const greetingName = hydratedAuth
    ? (hydratedAuth.displayName || hydratedAuth.userId || "Boss 👋").trim()
    : "Boss 👋";
  const greetingTitle = `你好，${greetingName}`;
  const homePromptCacheKey = userCachePrefix && activeCategoryId ? `${userCachePrefix}:cat:${activeCategoryId}` : null;
  const cachedPromptCards = homePromptCacheKey ? getCachedHomePromptCards(homePromptCacheKey) : null;
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [composerMode, setComposerMode] = useState<"普通模式" | "深度模式">("深度模式");
  const [pendingHomeFiles, setPendingHomeFiles] = useState<File[]>([]);
  const [notice, setNotice] = useState("");
  const [launching, setLaunching] = useState(false);
  const [appliedPromptId, setAppliedPromptId] = useState<string | null>(null);
  const [composerPulse, setComposerPulse] = useState(false);
  const [remotePromptCards, setRemotePromptCards] = useState<HomePromptCard[]>(() => cachedPromptCards ?? []);
  const [promptCardsLoading, setPromptCardsLoading] = useState(() => !cachedPromptCards);
  const [dynamicDataSourceGroups, setDynamicDataSourceGroups] = useState<HomeCapabilityGroup[]>([]);
  const promptGridScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCanPersonalizeGreeting(true);
  }, []);
  const activeRunId = searchParams.get("runId");

  useEffect(() => {
    if (typeof sessionStorage === "undefined") return;
    const raw = sessionStorage.getItem(AGENT_COMPOSER_PREFILL_STORAGE_KEY);
    if (raw) {
      const prefill = parseComposerPrefillStorageValue(raw);
      setQuery(prefill.text);
      setSelectedSourceIds(prefill.selectedSourceIds);
      setActiveCapabilityId(prefill.selectedSourceIds[0] ?? "scenarios");
      sessionStorage.removeItem(AGENT_COMPOSER_PREFILL_STORAGE_KEY);
    }
  }, []);

  // 加载公开的 prompt 分类列表，默认选中第一个
  useEffect(() => {
    let cancelled = false;
    fetchPublicPromptCategories()
      .then((cats) => {
        if (!cancelled) {
          setPromptCategories(cats);
          if (cats.length > 0 && !activeCategoryId) {
            setActiveCategoryId(cats[0].id);
          }
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) console.warn("[prompt-categories]", err);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!userCachePrefix || !activeCategoryId) return;
    const cacheKey = `${userCachePrefix}:cat:${activeCategoryId}`;

    const cached = getCachedHomePromptCards(cacheKey);
    if (cached) {
      setRemotePromptCards(cached);
      setPromptCardsLoading(false);
      return;
    }

    let cancelled = false;
    setPromptCardsLoading(true);
    void loadHomePromptCardsOnce(cacheKey, activeCategoryId)
      .then((cards) => {
        if (cancelled) return;
        setRemotePromptCards(cards);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[home-prompt-recommendations]", msg);
      })
      .finally(() => {
        if (!cancelled) setPromptCardsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userCachePrefix, activeCategoryId]);

  useEffect(() => {
    if (promptCategories.length === 0) return;
    let cancelled = false;
    void Promise.all(
      promptCategories.map(async (category) => {
        const cards = await loadHomePromptCardsOnce(`source-menu:cat:${category.id}`, category.id);
        return [category.id, cards] as const;
      }),
    )
      .then((entries) => {
        if (cancelled) return;
        const cardsByCategoryId = Object.fromEntries(entries);
        setDynamicDataSourceGroups(buildDataSourceGroupsFromPromptCards(promptCategories, cardsByCategoryId));
      })
      .catch((err: unknown) => {
        if (!cancelled) console.warn("[source-menu-capabilities]", err);
      });
    return () => {
      cancelled = true;
    };
  }, [promptCategories]);

  const cards = remotePromptCards;
  const dynamicDataSourceItems = useMemo(
    () => dynamicDataSourceGroups.flatMap((group) => group.items),
    [dynamicDataSourceGroups],
  );
  const composerDataSourceGroups = dynamicDataSourceGroups.length > 0 ? dynamicDataSourceGroups : homeCapabilityGroups;
  const composerDataSourceItems = dynamicDataSourceItems.length > 0 ? dynamicDataSourceItems : homeDataSourceItems;
  const composerCanSubmit = sanitizeObjective(query).length > 0 && !launching;

  const launchAgent = useCallback(async (seed?: string, pending?: PendingHomeTask, attachmentFilesOverride?: File[]) => {
    const nextQuery = sanitizeObjective(seed ?? pending?.text ?? query);
    if (!nextQuery) {
      setNotice("请先输入一个研究目标，或从下方示例任务中直接发起。");
      return;
    }
    const effectiveSelectedSourceIds = pending?.selectedSourceIds ?? selectedSourceIds;
    const effectiveActiveCapabilityId = pending?.activeCapabilityId ?? activeCapabilityId;
    const effectiveComposerMode = pending?.composerMode ?? composerMode;
    const effectivePendingFiles = attachmentFilesOverride ?? pending?.pendingFiles ?? pendingHomeFiles;
    const selectedCapabilities = effectiveSelectedSourceIds.length > 0
      ? effectiveSelectedSourceIds
      : effectiveActiveCapabilityId === "scenarios"
        ? []
        : [effectiveActiveCapabilityId];

    if (isPlatformBackendEnabled()) {
      if (!isAgentRuntimeConfigured()) {
        setNotice("当前服务暂时不可用，请稍后重试或联系管理员。");
        return;
      }
      if (!platformAgent) {
        setNotice("平台联调未启用或 Provider 未挂载。");
        return;
      }
      if (!platformAgent.auth) {
        savePendingHomeTaskAfterLogin({
          text: nextQuery,
          selectedSourceIds: effectiveSelectedSourceIds,
          activeCapabilityId: effectiveActiveCapabilityId,
          composerMode: effectiveComposerMode,
          pendingFiles: effectivePendingFiles,
        });
        platformAgent.openLogin("登录后将继续发送当前任务。");
        return;
      }
      setLaunching(true);
      try {
        const sid = await platformAgent.beginNewHomeTaskSession();
        if (!sid) return;
        upsertOptimisticHistorySession(sid);
        platformAgent.setActivePlatformSession(sid);
        setActiveSessionTitle(nextQuery);
        void refreshHistoryNow();
        const runId = workspaceActions.startPlatformTask({
          platformSessionId: sid,
          objective: nextQuery,
          mode: effectiveComposerMode === "深度模式" ? "专业模式" : "轻量模式",
          selectedCapabilities,
          pendingFiles: effectivePendingFiles,
        });
        setPendingHomeFiles([]);
        setNotice("已连接 Alice 后端服务，正在执行任务。");
        router.replace(`/?runId=${runId}`);
      } finally {
        setLaunching(false);
      }
      return;
    }

    if (!isAgentRuntimeConfigured()) {
      setNotice("会话后端接口未配置。请先设置 NEXT_PUBLIC_AGENT_API_BASE_URL。");
      return;
    }
    setLaunching(true);
    try {
      const snapshot = await createAgentRun({
        objective: nextQuery,
        mode: effectiveComposerMode === "深度模式" ? "专业模式" : "轻量模式",
        selectedCapabilities,
      });
      workspaceActions.upsertRunSnapshot(snapshot.run, snapshot.report);
      router.replace(`/?runId=${snapshot.run.id}`);
    } finally {
      setLaunching(false);
    }
  }, [
    activeCapabilityId,
    composerMode,
    pendingHomeFiles,
    platformAgent,
    query,
    refreshHistoryNow,
    router,
    selectedSourceIds,
    setActiveSessionTitle,
    upsertOptimisticHistorySession,
  ]);

  useEffect(() => {
    if (!platformAgent?.auth || launching || activeRunId) return;
    const pending = consumePendingHomeTaskAfterLogin();
    if (!pending) return;
    setQuery(pending.text);
    setSelectedSourceIds(pending.selectedSourceIds);
    setActiveCapabilityId(pending.activeCapabilityId);
    setComposerMode(pending.composerMode);
    void launchAgent(pending.text, pending);
  }, [activeRunId, launching, launchAgent, platformAgent?.auth]);

  const applyComposerTool = (capabilityId: string) => {
    const item = composerDataSourceItems.find((source) => source.id === capabilityId);
    if (!item || item.id === "scenarios") return;
    setSelectedSourceIds((current) => (current.includes(item.id) ? current : [...current, item.id]));
    setNotice(`已选择数据源「${item.label}」，可以继续补充要求后直接发送。`);
  };

  const removeComposerTool = (capabilityId: string) => {
    setSelectedSourceIds((current) => current.filter((id) => id !== capabilityId));
  };

  const syncPendingHomeFiles = useCallback((incoming: File[]) => {
    setPendingHomeFiles(incoming);
  }, []);

  const handleFilesSelected = (files: FileList) => {
    const picked = Array.from(files);
    if (picked.length === 0) return;
    setNotice(`已选择附件：${picked.map((file) => file.name).join("、")}。`);
  };

  const applyPromptCard = (card: HomePromptCard) => {
    const prefill = parseDatasourceMentions(card.prompt, composerDataSourceItems);
    const selectedIds = Array.from(new Set([...card.capabilityIds, ...prefill.selectedSourceIds]));
    setQuery(prefill.text);
    setSelectedSourceIds(selectedIds);
    setNotice(`已载入示例任务「${card.title}」，可继续补充要求后发送。`);
  };

  const handlePromptCardClick = (card: HomePromptCard) => {
    applyPromptCard(card);
    setAppliedPromptId(card.id);
    setComposerPulse(true);
    window.setTimeout(() => {
      setAppliedPromptId((current) => (current === card.id ? null : current));
    }, 420);
    window.setTimeout(() => setComposerPulse(false), 520);
    window.requestAnimationFrame(() => {
      const composerRoot = document.getElementById("sym:TaskComposer");
      if (typeof composerRoot?.scrollIntoView === "function") {
        composerRoot.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
      composerRoot?.querySelector<HTMLElement>('[data-testid="task-composer-editor"]')?.focus();
    });
  };

  const handleHomeWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    const grid = promptGridScrollRef.current;
    if (!grid || event.deltaY === 0) return;

    const target = event.target;
    if (target instanceof Node && grid.contains(target)) return;

    let current = target instanceof Element ? target : null;
    while (current && current !== event.currentTarget) {
      const style = window.getComputedStyle(current);
      const canScrollY =
        (style.overflowY === "auto" || style.overflowY === "scroll") &&
        current.scrollHeight > current.clientHeight;
      if (canScrollY) return;
      current = current.parentElement;
    }

    const maxScrollTop = grid.scrollHeight - grid.clientHeight;
    if (maxScrollTop <= 0) return;

    const deltaY =
      event.deltaMode === 1
        ? event.deltaY * 16
        : event.deltaMode === 2
          ? event.deltaY * grid.clientHeight
          : event.deltaY;
    const nextScrollTop = Math.max(0, Math.min(maxScrollTop, grid.scrollTop + deltaY));
    if (nextScrollTop === grid.scrollTop) return;

    event.preventDefault();
    grid.scrollTop = nextScrollTop;
  }, []);

  if (activeRunId) {
    return <AgentWorkspace />;
  }

  return (
    <AliceShell currentPath="/" showTopHeader={false} mainClassName="bg-transparent">
      <div className="flex min-h-screen flex-col bg-background pb-10 sm:pb-14">
        <section className="mx-auto w-full max-w-page-content px-4 pt-44 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 sm:gap-5">
            <Image
              src="/alice-logo.png"
              alt="Alice"
              width={76}
              height={76}
              className="h-12 w-12 shrink-0 object-contain sm:h-20 sm:w-20"
              draggable={false}
              priority
            />
            <div className="flex min-w-0 flex-col gap-2">
              <h1 className="mdata-home-title m-0 truncate font-semibold text-foreground">
                {greetingTitle}
              </h1>
              <div className="text-title-2 font-normal text-text-secondary">
                💬 你的跨境运营助理，24h随时在线
              </div>
            </div>
          </div>

          <div className="mt-5 sm:mt-7">
            <div id="sym:TaskComposer" className="transition">
              <AssistantThreadFrame>
                <TaskComposer
                  value={query}
                  onValueChange={setQuery}
                  placeholder="需要分析亚马逊的流量来源？试试 @Sif-亚马逊-流量来源分析。"
                  mode={composerMode}
                  onModeChange={setComposerMode}
                  selectedSourceIds={selectedSourceIds}
                  dataSourceGroups={composerDataSourceGroups}
                  dataSourceItems={composerDataSourceItems}
                  onToolSelect={applyComposerTool}
                  onSourceRemove={removeComposerTool}
                  onFilesSelected={handleFilesSelected}
                  onAttachmentsChange={syncPendingHomeFiles}
                  onSubmit={(files) => {
                    if (!launching) {
                      void launchAgent(undefined, undefined, files);
                    }
                  }}
                  visualStyle="heroMinimal"
                  containerClassName={cn(
                    "relative z-30 w-full rounded-composer border border-border bg-bg-surface shadow-popover transition-all duration-300 sm:rounded-hero",
                    composerPulse && "border-primary/25 shadow-popover-strong",
                  )}
                  textareaClassName="min-h-28 max-h-composer-home min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words bg-transparent px-0 py-1.5 pr-2 text-body font-normal leading-6 text-foreground outline-none scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-zinc-300 sm:min-h-34"
                  placeholderClassName="top-1.5 text-body leading-6 text-text-tertiary"
                  sendButtonClassName={cn(
                    "h-10 w-10 min-w-0 rounded-full border border-transparent p-0 text-primary-foreground shadow-none transition",
                    composerCanSubmit ? "bg-primary hover:bg-primary/85" : "bg-fill-active hover:bg-fill-active",
                  )}
                />
              </AssistantThreadFrame>
            </div>
            <p className="sr-only" aria-live="polite">
              {notice}
            </p>
          </div>

          <div
            id="sym:homeCapabilityItems"
            className="mt-7 flex w-full flex-wrap items-center gap-x-4 gap-y-2 text-body leading-5 sm:mt-10 sm:gap-x-6 sm:gap-y-3 sm:text-title-1 sm:leading-6"
          >
            {/* 数据库中的 Prompt 分类 */}
            {promptCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategoryId(cat.id)}
                className={cn(
                  "inline-flex items-center gap-2 p-1 font-medium transition",
                  activeCategoryId === cat.id ? "text-foreground" : "text-text-tertiary hover:text-text-secondary",
                )}
              >
                <PlatformLogo
                  name="grid"
                  color={activeCategoryId === cat.id ? "rgb(var(--primary-6))" : "rgb(var(--gray-6))"}
                  className="h-4 w-4 shrink-0"
                />
                {cat.name}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 pt-5 sm:pt-7">
            <div
              ref={promptGridScrollRef}
              className="grid h-full content-start gap-3 overflow-y-auto pr-1 pb-6 scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-zinc-300 sm:gap-5 md:grid-cols-2 xl:grid-cols-3"
            >
              {promptCardsLoading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className="min-h-28 rounded-card border border-border-subtle bg-bg-surface/75 px-4 py-4 shadow-surface sm:min-h-33 sm:rounded-popover sm:px-5 sm:py-4"
                    aria-hidden="true"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="mt-1 h-4 w-4 shrink-0 animate-pulse rounded-full bg-fill-active" />
                      <div className="min-w-0 flex-1">
                        <div className="h-5 w-skeleton-mid animate-pulse rounded-full bg-fill-active" />
                        <div className="mt-4 h-4 w-full animate-pulse rounded-full bg-bg-subtle" />
                        <div className="mt-2 h-4 w-skeleton-compact animate-pulse rounded-full bg-bg-subtle" />
                      </div>
                    </div>
                  </div>
                ))
              ) : cards.length === 0 ? (
                <div className="col-span-full flex min-h-[132px] items-center justify-center rounded-[18px] border border-dashed border-[#dededc] bg-white/60 px-5 text-center text-[14px] leading-6 text-[#8b8c87]">
                  当前分类暂无示例任务。
                </div>
              ) : cards.map((card) => {
                const capability =
                  card.capabilityIds.map((id) => composerDataSourceItems.find((item) => item.id === id)).find(Boolean) ??
                  composerDataSourceItems.find((item) => card.capabilityIds.includes(item.parentId)) ??
                  card.capabilityIds.map((id) => getHomeCapabilityItem(capabilityLabelFromId(id))).find(Boolean);
                return (
                  <div
                    key={card.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`使用示例任务 ${card.title}`}
                    onClick={(event) => {
                      event.currentTarget.blur();
                      handlePromptCardClick(card);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.currentTarget.blur();
                        handlePromptCardClick(card);
                      }
                    }}
                    className={cn(
                      "active-scale-quiet group relative h-full overflow-visible rounded-card border border-border-subtle bg-bg-surface/75 text-left shadow-surface outline-none transition-all duration-200 hover:z-20 hover:bg-bg-surface hover:shadow-card-hover focus-visible:z-20 focus-visible:bg-bg-surface focus-visible:shadow-card-hover sm:rounded-popover",
                      appliedPromptId === card.id &&
                        "scale-card-selected border-primary/20 bg-bg-surface shadow-card-active",
                    )}
                  >
                    <div className="flex h-full min-h-28 flex-col px-4 py-4 sm:min-h-33 sm:px-5 sm:py-4">
                      <div className="flex items-start gap-2.5">
                        <span className="mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center">
                          <PlatformLogo
                            name={capability?.icon ?? "grid"}
                            color={capability?.accent ?? "var(--color-accent-neutral)"}
                            className="h-4 w-4"
                          />
                        </span>
                        <div className="min-w-0">
                          <div className="line-clamp-1 text-title-1 font-semibold leading-6 text-foreground">
                            {card.title}
                          </div>
                          <div className="mt-2 line-clamp-3 text-body font-normal leading-6 text-text-tertiary">
                            {card.body.length > 78 ? `${card.body.slice(0, 78)}…` : card.body}
                          </div>
                        </div>
                      </div>
                      <div className="mt-auto flex items-end justify-end pt-3">
                        <AnimatedArrowUpIcon className="shrink-0 text-text-disabled" size={16} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

    </AliceShell>
  );
}
