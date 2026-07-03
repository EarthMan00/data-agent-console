"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatedArrowUpIcon } from "@/components/ui/animated-arrow-up-icon";
import { fetchPublicPromptCategories, type PublicPromptCategory } from "@/lib/agent-api/home-prompts";
import type { HomePromptCard } from "@/lib/workspace-domain-types";
import {
  getHomeCapabilityItem,
  type HomeCapabilityItem,
} from "@/lib/home-capability-items";
import { AgentWorkspace } from "@/components/agent-workspace";
import { AssistantThreadFrame } from "@/components/assistant-thread-frame";
import { AliceShell, useAliceShellState } from "@/components/alice-shell";
import { PlatformLogo } from "@/components/platform-logo";
import { sanitizeObjective } from "@/lib/agent-attachments";
import {
  parseComposerPrefillStorageValue,
  parseDatasourceMentions,
  type ComposerSourcePlacement,
} from "@/lib/composer-prefill";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { AGENT_COMPOSER_PREFILL_STORAGE_KEY } from "@/lib/agent-api/session";
import {
  isAgentRuntimeConfigured,
  isPlatformBackendEnabled,
} from "@/lib/agent-runtime";
import {
  getCachedHomePromptCards,
  HOME_PROMPT_ANONYMOUS_CACHE_KEY,
  loadHomePromptCardsOnce,
} from "@/lib/home-prompt-data-sources";
import {
  saveHomeSessionLaunchMeta,
  stashHomeSessionLaunchFiles,
} from "@/lib/home-session-launch";
import { useHomeDataSourceMenu } from "@/lib/use-home-data-source-menu";
import { cn } from "@/lib/utils";
import { NewConversationTaskComposer } from "@/components/new-conversation-task-composer";
import { ALICE_LOGO_SRC } from "@/lib/brand-assets";

const PENDING_HOME_TASK_STORAGE_KEY = "alice:pending-home-task-after-login";
const PENDING_HOME_TASK_MAX_AGE_MS = 30 * 60 * 1000;
type HomeComposerMode = "普通模式" | "深度模式";

type PendingHomeTask = {
  text: string;
  selectedSourceIds: string[];
  sourcePlacements: ComposerSourcePlacement[];
  activeCapabilityId: string;
  composerMode: HomeComposerMode;
  createdAt: number;
  pendingFiles?: File[];
};

function capabilityLabelFromId(capabilityId: string) {
  return capabilityId.trim().replace(/^@+/, "");
}

function resolvePromptCardCapabilitySourceIds(card: HomePromptCard, dataSourceItems: HomeCapabilityItem[]) {
  const sourceIds: string[] = [];
  card.capabilityIds.forEach((capabilityId) => {
    const label = capabilityLabelFromId(capabilityId);
    const exactIdItem = dataSourceItems.find(
      (source) =>
        source.id === capabilityId ||
        source.id === label,
    );
    const parentItem = dataSourceItems.find(
      (source) =>
        source.parentId === capabilityId ||
        source.parentId === label ||
        source.parentLabel === capabilityId ||
        source.parentLabel === label,
    );
    const idItem =
      parentItem && exactIdItem?.id === label && exactIdItem.label === label && exactIdItem.parentLabel !== label
        ? null
        : exactIdItem ?? getHomeCapabilityItem(label) ?? getHomeCapabilityItem(capabilityId);
    const labelItem = idItem || parentItem
      ? null
      : dataSourceItems.find(
        (source) =>
          source.label === capabilityId ||
          source.label === label,
      );
    const item = idItem ?? parentItem ?? labelItem;
    if (!item || item.id === "scenarios" || sourceIds.includes(item.id)) return;
    sourceIds.push(item.id);
  });
  return sourceIds;
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
      sourcePlacements: Array.isArray(parsed.sourcePlacements)
        ? parsed.sourcePlacements.filter(
          (placement): placement is ComposerSourcePlacement =>
            Boolean(
              placement &&
                typeof placement === "object" &&
                "sourceId" in placement &&
                typeof placement.sourceId === "string" &&
                "offset" in placement &&
                typeof placement.offset === "number",
            ),
        )
        : [],
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
    ? (hydratedAuth.displayName || hydratedAuth.userId || "伙伴").trim()
    : "伙伴";
  const greetingTitle = `你好，${greetingName}`;
  const homePromptCacheKey = userCachePrefix && activeCategoryId ? `${userCachePrefix}:cat:${activeCategoryId}` : null;
  const cachedPromptCards = homePromptCacheKey ? getCachedHomePromptCards(homePromptCacheKey) : null;
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [sourcePlacements, setSourcePlacements] = useState<ComposerSourcePlacement[]>([]);
  const [composerMode, setComposerMode] = useState<HomeComposerMode>("深度模式");
  const [pendingHomeFiles, setPendingHomeFiles] = useState<File[]>([]);
  const [notice, setNotice] = useState("");
  const [launching, setLaunching] = useState(false);
  const [appliedPromptId, setAppliedPromptId] = useState<string | null>(null);
  const [composerPulse, setComposerPulse] = useState(false);
  const [suppressTemplateCompletion, setSuppressTemplateCompletion] = useState(false);
  const [remotePromptCards, setRemotePromptCards] = useState<HomePromptCard[]>(() => cachedPromptCards ?? []);
  const [promptCardsLoading, setPromptCardsLoading] = useState(() => !cachedPromptCards);
  const {
    dataSourceGroups: composerDataSourceGroups,
    dataSourceItems: composerDataSourceItems,
    loaded: dataSourceMenuLoaded,
  } = useHomeDataSourceMenu({ logLabel: "[source-menu-capabilities]" });
  const promptGridScrollRef = useRef<HTMLDivElement | null>(null);
  const prevActiveRunIdRef = useRef<string | null>(null);

  const resetHomeComposer = useCallback(() => {
    setQuery("");
    setSelectedSourceIds([]);
    setSourcePlacements([]);
    setActiveCapabilityId("scenarios");
    setSuppressTemplateCompletion(false);
    setPendingHomeFiles([]);
    setNotice("");
  }, []);

  useEffect(() => {
    setCanPersonalizeGreeting(true);
  }, []);
  const activeRunId = searchParams.get("runId");

  // Return to the home page from a task view and clear the composer.
  useEffect(() => {
    const prev = prevActiveRunIdRef.current;
    prevActiveRunIdRef.current = activeRunId;
    if (prev && !activeRunId) {
      resetHomeComposer();
    }
  }, [activeRunId, resetHomeComposer]);

  useEffect(() => {
    if (!dataSourceMenuLoaded) return;
    if (typeof sessionStorage === "undefined") return;
    const raw = sessionStorage.getItem(AGENT_COMPOSER_PREFILL_STORAGE_KEY);
    if (raw) {
      const prefill = parseComposerPrefillStorageValue(raw, composerDataSourceItems);
      setQuery(prefill.text);
      setSelectedSourceIds(prefill.selectedSourceIds);
      setSourcePlacements(prefill.sourcePlacements);
      setActiveCapabilityId(prefill.selectedSourceIds[0] ?? "scenarios");
      sessionStorage.removeItem(AGENT_COMPOSER_PREFILL_STORAGE_KEY);
    }
  }, [composerDataSourceItems, dataSourceMenuLoaded]);

  // Load public prompt categories and select the first one by default.
  useEffect(() => {
    let cancelled = false;
    fetchPublicPromptCategories()
      .then((cats) => {
        if (!cancelled) {
          setPromptCategories(cats);
          if (cats.length > 0) {
            setActiveCategoryId((current) => current || cats[0].id);
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

  const cards = remotePromptCards;
  const composerCanSubmit = sanitizeObjective(query).length > 0 && !launching;

  const launchAgent = useCallback(async (seed?: string, pending?: PendingHomeTask) => {
    const nextQuery = sanitizeObjective(seed ?? pending?.text ?? query);
    if (!nextQuery) {
      setNotice("请先输入一个研究目标，或从下方示例任务中直接发起。");
      return;
    }
    const effectiveSelectedSourceIds = pending?.selectedSourceIds ?? selectedSourceIds;
    const effectiveActiveCapabilityId = pending?.activeCapabilityId ?? activeCapabilityId;
    const effectiveComposerMode = pending?.composerMode ?? composerMode;
    const selectedCapabilities = effectiveSelectedSourceIds.length > 0
      ? effectiveSelectedSourceIds
      : effectiveActiveCapabilityId === "scenarios"
        ? []
        : [effectiveActiveCapabilityId];

    if (!isPlatformBackendEnabled()) {
      setNotice("当前服务暂时不可用，请稍后重试或联系管理员。");
      return;
    }
    if (!isAgentRuntimeConfigured()) {
      setNotice("当前服务暂时不可用，请稍后重试或联系管理员。");
      return;
    }
    if (!platformAgent) {
      setNotice("当前平台认证尚未初始化，请稍后重试。");
      return;
    }
    if (!platformAgent.auth) {
      savePendingHomeTaskAfterLogin({
        text: nextQuery,
        selectedSourceIds: effectiveSelectedSourceIds,
        sourcePlacements: pending?.sourcePlacements ?? sourcePlacements,
        activeCapabilityId: effectiveActiveCapabilityId,
        composerMode: effectiveComposerMode,
        pendingFiles: pendingHomeFiles,
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
      saveHomeSessionLaunchMeta({
        v: 1,
        sessionId: sid,
        prompt: nextQuery,
        selectedSourceIds: selectedCapabilities,
        sourcePlacements: pending?.sourcePlacements ?? sourcePlacements,
        sendKind: "pending",
      });
      stashHomeSessionLaunchFiles(sid, pending?.pendingFiles ?? pendingHomeFiles);
      setPendingHomeFiles([]);
      resetHomeComposer();
      router.replace(`/agent?sessionId=${encodeURIComponent(sid)}`);
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
    sourcePlacements,
    upsertOptimisticHistorySession,
    resetHomeComposer,
  ]);

  useEffect(() => {
    if (!platformAgent?.auth || launching || activeRunId) return;
    const pending = consumePendingHomeTaskAfterLogin();
    if (!pending) return;
    setQuery(pending.text);
    setSelectedSourceIds(pending.selectedSourceIds);
    setSourcePlacements(pending.sourcePlacements);
    setActiveCapabilityId(pending.activeCapabilityId);
    setComposerMode(pending.composerMode);
    void launchAgent(pending.text, pending);
  }, [activeRunId, launching, launchAgent, platformAgent?.auth]);

  const applyComposerTool = (capabilityId: string) => {
    const item = composerDataSourceItems.find((source) => source.id === capabilityId) ?? getHomeCapabilityItem(capabilityId);
    if (!item || item.id === "scenarios") return;
    setSuppressTemplateCompletion(false);
    setSelectedSourceIds((current) => (current.includes(item.id) ? current : [...current, item.id]));
    setNotice(`已选择数据源「${item.label}」，可以继续补充要求后直接发送。`);
  };

  const removeComposerTool = (capabilityId: string) => {
    setSuppressTemplateCompletion(false);
    setSelectedSourceIds((current) => current.filter((id) => id !== capabilityId));
    setSourcePlacements((current) => current.filter((placement) => placement.sourceId !== capabilityId));
  };

  const syncPendingHomeFiles = useCallback((files: File[]) => {
    setPendingHomeFiles(files);
  }, []);

  const handleFilesSelected = (files: FileList) => {
    const picked = Array.from(files);
    if (picked.length === 0) return;
    setNotice(`已选择附件：${picked.map((file) => file.name).join("、")}。`);
  };

  const applyPromptCard = (card: HomePromptCard) => {
    const prefill = parseDatasourceMentions(card.prompt, composerDataSourceItems);
    const selectedSourceSet = new Set(prefill.selectedSourceIds);
    const resolvedSourceIds = resolvePromptCardCapabilitySourceIds(card, composerDataSourceItems);
    const fallbackSourceIds =
      prefill.selectedSourceIds.length === 0 || resolvedSourceIds.length > prefill.selectedSourceIds.length
        ? resolvedSourceIds.filter((sourceId) => !selectedSourceSet.has(sourceId))
        : [];
    setQuery(prefill.text);
    setSelectedSourceIds([...prefill.selectedSourceIds, ...fallbackSourceIds]);
    setSourcePlacements(
      fallbackSourceIds.length > 0
        ? [
          ...fallbackSourceIds.map((sourceId) => ({ sourceId, offset: 0 })),
          ...prefill.sourcePlacements,
        ]
        : prefill.sourcePlacements,
    );
    setSuppressTemplateCompletion(true);
    setNotice(`已载入示例任务「${card.title}」，可继续补充要求后发送。`);
  };

  const applyPromptLibraryPrompt = useCallback((promptText: string) => {
    const prefill = parseDatasourceMentions(promptText, composerDataSourceItems);
    setQuery(prefill.text);
    setSelectedSourceIds(prefill.selectedSourceIds);
    setSourcePlacements(prefill.sourcePlacements);
    setSuppressTemplateCompletion(true);
    setNotice("已载入提示词，可继续补充要求后发送。");
    setComposerPulse(true);
    window.setTimeout(() => setComposerPulse(false), 520);
    window.requestAnimationFrame(() => {
      const composerRoot = document.getElementById("sym:TaskComposer");
      composerRoot?.querySelector<HTMLElement>('[data-testid="task-composer-editor"]')?.focus();
    });
  }, [composerDataSourceItems]);

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
                你的跨境数据运营搭档，24h 随时在线
              </div>
            </div>
          </div>

          <div className="mt-5 sm:mt-7">
            <div id="sym:TaskComposer" className="transition">
              <AssistantThreadFrame>
                <NewConversationTaskComposer
                  value={query}
                  onValueChange={setQuery}
                  placeholder="需要分析亚马逊的流量来源？试试 @Sif-亚马逊 流量来源分析。"
                  mode={composerMode}
                  onModeChange={setComposerMode}
                  selectedSourceIds={selectedSourceIds}
                  sourcePlacements={sourcePlacements}
                  onSourcePlacementsChange={setSourcePlacements}
                  suppressTemplateCompletion={suppressTemplateCompletion}
                  dataSourceGroups={composerDataSourceGroups}
                  dataSourceItems={composerDataSourceItems}
                  onToolSelect={applyComposerTool}
                  onSourceRemove={removeComposerTool}
                  onPromptUse={applyPromptLibraryPrompt}
                  onFilesSelected={handleFilesSelected}
                  onAttachmentsChange={syncPendingHomeFiles}
                  onSubmit={() => {
                    if (!launching) {
                      void launchAgent();
                    }
                  }}
                  highlighted={composerPulse}
                  sendButtonActive={composerCanSubmit}
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
            {/* Prompt categories loaded from the backend */}
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
                      "active-scale-quiet group relative overflow-visible rounded-card border border-border-subtle bg-bg-surface/75 text-left shadow-surface outline-none transition-all duration-200 hover:z-20 hover:bg-bg-surface hover:shadow-card-hover focus-visible:z-20 focus-visible:bg-bg-surface focus-visible:shadow-card-hover sm:rounded-popover",
                      appliedPromptId === card.id &&
                        "scale-card-selected border-primary/20 bg-bg-surface shadow-card-active",
                    )}
                  >
                    <div className="flex min-h-28 flex-col px-4 py-4 sm:min-h-33 sm:px-5 sm:py-4">
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
                            {card.body.length > 78 ? `${card.body.slice(0, 78)}...` : card.body}
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

