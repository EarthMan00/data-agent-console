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
import { fetchHomePromptRecommendations } from "@/lib/agent-api/home-prompts";
import type { HomePromptCard } from "@/lib/workspace-domain-types";
import {
  getHomeCapabilityFilterIds,
  getHomeCapabilityGroup,
  getHomeCapabilityItem,
  homeCapabilityCategories,
  homeDataSourceItems,
} from "@/lib/home-capability-items";
import { AgentWorkspace } from "@/components/agent-workspace";
import { AssistantThreadFrame } from "@/components/assistant-thread-frame";
import { AliceShell } from "@/components/alice-shell";
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

function loadHomePromptCardsOnce(cacheKey: string, capabilityIds: string[]) {
  const cached = homePromptCardCache.get(cacheKey);
  if (cached?.cards) return Promise.resolve(cached.cards);
  if (cached?.promise) return cached.promise;

  const promise = fetchHomePromptRecommendations({ capabilityIds })
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
  const [activeCapabilityId, setActiveCapabilityId] = useState("scenarios");
  const activeCapabilityFilterIds = useMemo(
    () => getHomeCapabilityFilterIds(activeCapabilityId),
    [activeCapabilityId],
  );
  const homePromptCacheBaseKey = platformAgent?.auth?.userId ?? (platformAgent?.authHydrated ? HOME_PROMPT_ANONYMOUS_CACHE_KEY : null);
  const homePromptCacheKey = homePromptCacheBaseKey
    ? `${homePromptCacheBaseKey}:${getHomePromptCardFilterKey(activeCapabilityFilterIds)}`
    : null;
  const cachedPromptCards = homePromptCacheKey ? getCachedHomePromptCards(homePromptCacheKey) : null;
  const [query, setQuery] = useState("");
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [composerMode, setComposerMode] = useState<"普通模式" | "深度模式">("深度模式");
  const [pendingHomeFiles, setPendingHomeFiles] = useState<File[]>([]);
  const [notice, setNotice] = useState("");
  const [launching, setLaunching] = useState(false);
  const [appliedPromptId, setAppliedPromptId] = useState<string | null>(null);
  const [composerPulse, setComposerPulse] = useState(false);
  const [remotePromptCards, setRemotePromptCards] = useState<HomePromptCard[]>(() => cachedPromptCards ?? []);
  const [promptCardsLoading, setPromptCardsLoading] = useState(() => !cachedPromptCards);
  const promptGridScrollRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    if (!homePromptCacheKey) return;
    const cached = getCachedHomePromptCards(homePromptCacheKey);
    if (cached) {
      setRemotePromptCards(cached);
      setPromptCardsLoading(false);
      return;
    }

    let cancelled = false;
    setPromptCardsLoading(true);
    void loadHomePromptCardsOnce(homePromptCacheKey, activeCapabilityFilterIds)
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
  }, [activeCapabilityFilterIds, homePromptCacheKey]);

  const cards = remotePromptCards;
  const selectedCapabilityGroupIds = useMemo(
    () =>
      new Set(
        selectedSourceIds
          .map((id) => getHomeCapabilityGroup(id)?.id)
          .filter((id): id is string => Boolean(id)),
      ),
    [selectedSourceIds],
  );
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
          pendingFiles: pendingHomeFiles,
        });
        platformAgent.openLogin("登录后将继续发送当前任务。");
        return;
      }
      setLaunching(true);
      try {
        const sid = await platformAgent.beginNewHomeTaskSession();
        if (!sid) return;
        const runId = workspaceActions.startPlatformTask({
          platformSessionId: sid,
          objective: nextQuery,
          mode: effectiveComposerMode === "深度模式" ? "专业模式" : "轻量模式",
          selectedCapabilities,
          pendingFiles: pending?.pendingFiles ?? pendingHomeFiles,
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
  }, [activeCapabilityId, composerMode, pendingHomeFiles, platformAgent, query, router, selectedSourceIds]);

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

  const applyBrowseCapability = (capabilityId: string) => {
    const item = homeCapabilityCategories.find((entry) => entry.id === capabilityId);
    if (!item) return;
    setActiveCapabilityId(item.id);
    setNotice(`已切换首页浏览视角到「${item.label}」，可继续选择示例任务或直接输入需求。`);
  };

  const applyComposerTool = (capabilityId: string) => {
    const item = getHomeCapabilityItem(capabilityId);
    if (!item || item.id === "scenarios") return;
    setSelectedSourceIds((current) => (current.includes(item.id) ? current : [...current, item.id]));
    setNotice(`已选择数据源「${item.label}」，可以继续补充要求后直接发送。`);
  };

  const removeComposerTool = (capabilityId: string) => {
    setSelectedSourceIds((current) => current.filter((id) => id !== capabilityId));
  };

  const mergePendingHomeFiles = useCallback((incoming: File[]) => {
    if (incoming.length === 0) return;
    setPendingHomeFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}:${f.lastModified}`));
      const merged = [...prev];
      for (const f of incoming) {
        const key = `${f.name}:${f.size}:${f.lastModified}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(f);
        }
      }
      return merged;
    });
  }, []);

  const handleFilesSelected = (files: FileList) => {
    const picked = Array.from(files);
    if (picked.length === 0) return;
    mergePendingHomeFiles(picked);
    setNotice(`已选择附件：${picked.map((file) => file.name).join("、")}。`);
  };

  const applyPromptCard = (card: HomePromptCard) => {
    const prefill = parseDatasourceMentions(card.prompt);
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
    <AliceShell currentPath="/" showTopHeader={false} contentScrollMode="child" mainClassName="bg-transparent">
      <div className="h-full overflow-hidden bg-[#f7f7f7]" onWheel={handleHomeWheel}>
        <section className="mx-auto flex h-full w-full max-w-[1040px] flex-col px-4 pt-[180px] pb-10 sm:px-6 sm:pb-14 lg:px-8">
          <div className="flex items-center gap-3 sm:gap-5">
            <Image
              src="/alice-logo.png"
              alt="Alice"
              width={76}
              height={76}
              className="h-12 w-12 shrink-0 object-contain sm:h-[76px] sm:w-[76px]"
              draggable={false}
              priority
            />
            <div className="min-w-0">
              <h1 className="text-[32px] font-semibold leading-10 text-[#111111] sm:text-[38px] sm:leading-[46px]">
                Alice
              </h1>
              <div className="mt-0.5 text-[14px] font-normal leading-6 text-[#34322d] sm:mt-1 sm:text-[18px] sm:leading-7">
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
                  onToolSelect={applyComposerTool}
                  onSourceRemove={removeComposerTool}
                  onFilesSelected={handleFilesSelected}
                  onAttachmentsChange={mergePendingHomeFiles}
                  onSubmit={() => {
                    if (!launching) {
                      void launchAgent();
                    }
                  }}
                  visualStyle="heroMinimal"
                  containerClassName={cn(
                    "relative z-30 w-full rounded-[20px] border border-[#e2e2df] bg-white shadow-[0_18px_44px_rgba(17,17,17,0.05)] transition-[border-color,box-shadow,transform] duration-300 sm:rounded-[24px]",
                    composerPulse && "border-[#111111]/25 shadow-[0_20px_52px_rgba(17,17,17,0.1)]",
                  )}
                  editorRowClassName="min-h-[112px] items-start sm:min-h-[136px]"
                  textareaClassName="min-h-[112px] max-h-[10em] min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words bg-transparent px-0 py-1.5 pr-2 text-[14px] font-normal leading-[22px] text-[#1d2129] outline-none scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-zinc-300 sm:min-h-[136px]"
                  placeholderClassName="top-[6px] text-[14px] leading-[22px] text-[#86909c]"
                  sendButtonClassName={cn(
                    "h-10 w-10 min-w-0 rounded-full border border-transparent p-0 text-white shadow-none transition",
                    composerCanSubmit ? "bg-[#111111] hover:bg-[#2a2a2a]" : "bg-[#dededc] hover:bg-[#d1d1cf]",
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
            className="mt-7 flex w-full flex-wrap items-center gap-x-4 gap-y-2 text-[14px] leading-5 sm:mt-10 sm:gap-x-6 sm:gap-y-3 sm:text-[16px] sm:leading-6"
          >
            {homeCapabilityCategories.map((item) => {
              const activeGroup = getHomeCapabilityGroup(activeCapabilityId);
              const active =
                item.id === activeCapabilityId ||
                activeGroup?.id === item.id ||
                selectedCapabilityGroupIds.has(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => applyBrowseCapability(item.id)}
                  className={cn(
                    "inline-flex items-center gap-2 p-1 font-medium transition",
                    active ? "text-[#111111]" : "text-[#8b8c87] hover:text-[#34322d]",
                  )}
                >
                  <PlatformLogo
                    name={item.icon}
                    color={active ? "#111111" : item.accent}
                    className="h-[15px] w-[15px] shrink-0"
                  />
                  {item.label}
                </button>
              );
            })}
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
                    className="min-h-[112px] rounded-[14px] border border-white/70 bg-white/72 px-4 py-4 shadow-[0_1px_2px_rgba(17,17,17,0.03)] sm:min-h-[132px] sm:rounded-[18px] sm:px-5 sm:py-[18px]"
                    aria-hidden="true"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="mt-1 h-4 w-4 shrink-0 animate-pulse rounded-full bg-[#e8e8e5]" />
                      <div className="min-w-0 flex-1">
                        <div className="h-5 w-[76%] animate-pulse rounded-full bg-[#e9e9e6]" />
                        <div className="mt-4 h-4 w-full animate-pulse rounded-full bg-[#f0f0ee]" />
                        <div className="mt-2 h-4 w-[68%] animate-pulse rounded-full bg-[#f0f0ee]" />
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
                  card.capabilityIds.map((id) => getHomeCapabilityItem(id)).find(Boolean) ??
                  homeDataSourceItems.find((item) => card.capabilityIds.includes(item.parentId));
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
                      "group relative overflow-visible rounded-[14px] border border-white/70 bg-white/72 text-left shadow-[0_1px_2px_rgba(17,17,17,0.03)] outline-none transition-[transform,background-color,border-color,box-shadow] duration-200 hover:z-20 hover:bg-white hover:shadow-[0_10px_24px_rgba(17,17,17,0.06)] focus-visible:z-20 focus-visible:bg-white focus-visible:shadow-[0_10px_24px_rgba(17,17,17,0.06)] active:scale-[0.985] sm:rounded-[18px]",
                      appliedPromptId === card.id &&
                        "scale-[0.985] border-[#111111]/20 bg-white shadow-[0_14px_28px_rgba(17,17,17,0.08)]",
                    )}
                  >
                    <div className="flex min-h-[112px] flex-col px-4 py-4 sm:min-h-[132px] sm:px-5 sm:py-[18px]">
                      <div className="flex items-start gap-2.5">
                        <span className="mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center">
                          <PlatformLogo
                            name={capability?.icon ?? "grid"}
                            color={capability?.accent ?? "#8b9bb0"}
                            className="h-4 w-4"
                          />
                        </span>
                        <div className="min-w-0">
                          <div className="line-clamp-1 text-[16px] font-semibold leading-6 text-[#111111]">
                            {card.title}
                          </div>
                          <div className="mt-2 line-clamp-3 text-[14px] font-normal leading-6 text-[#747571]">
                            {card.body.length > 78 ? `${card.body.slice(0, 78)}…` : card.body}
                          </div>
                        </div>
                      </div>
                      <div className="mt-auto flex items-end justify-end pt-3">
                        <AnimatedArrowUpIcon className="shrink-0 text-[#b1b2ae]" size={16} />
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
