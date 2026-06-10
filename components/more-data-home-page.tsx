"use client";

import { useCallback, useEffect, useState } from "react";
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
  homeDataSourceItems,
} from "@/lib/home-capability-items";
import { AgentWorkspace } from "@/components/agent-workspace";
import { AssistantThreadFrame } from "@/components/assistant-thread-frame";
import { MoreDataShell, useMoreDataShellState } from "@/components/more-data-shell";
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

const PENDING_HOME_TASK_STORAGE_KEY = "mdata:pending-home-task-after-login";
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

function getCachedHomePromptCards(cacheKey: string) {
  return homePromptCardCache.get(cacheKey)?.cards ?? null;
}

function loadHomePromptCardsOnce(cacheKey: string, categoryId: string, capabilityId?: string) {
  const cached = homePromptCardCache.get(cacheKey);
  if (cached?.cards) return Promise.resolve(cached.cards);
  if (cached?.promise) return cached.promise;

  const promise = fetchHomePromptRecommendations(categoryId, capabilityId)
    .then(mapHomePromptCards)
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

export function MoreDataHomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const platformAgent = useOptionalPlatformAgent();
  const { refreshHistoryNow } = useMoreDataShellState();
  const [query, setQuery] = useState("");
  const [activeCapabilityId, setActiveCapabilityId] = useState("scenarios");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [promptCategories, setPromptCategories] = useState<PublicPromptCategory[]>([]);
  const userCachePrefix = platformAgent?.auth?.userId ?? (platformAgent?.authHydrated ? HOME_PROMPT_ANONYMOUS_CACHE_KEY : null);
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
        void refreshHistoryNow();
        const runId = workspaceActions.startPlatformTask({
          platformSessionId: sid,
          objective: nextQuery,
          mode: effectiveComposerMode === "深度模式" ? "专业模式" : "轻量模式",
          selectedCapabilities,
          pendingFiles: pending?.pendingFiles ?? pendingHomeFiles,
        });
        setPendingHomeFiles([]);
        setNotice("已连接 Data Agent Server，正在执行任务。");
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
    setActiveCapabilityId(selectedIds[0] ?? "scenarios");
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
      composerRoot?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      composerRoot?.querySelector<HTMLElement>('[data-testid="task-composer-editor"]')?.focus();
    });
  };

  if (activeRunId) {
    return <AgentWorkspace />;
  }

  return (
    <MoreDataShell currentPath="/" showTopHeader={false} mainClassName="bg-transparent">
      <div className="flex min-h-screen flex-col bg-[#f7f7f7] pb-10 sm:pb-14">
        <section className="mx-auto w-full max-w-[1040px] px-4 pt-[180px] sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 sm:gap-5">
            <Image
              src="/mdata-logo.png"
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
                  textareaClassName="min-h-[112px] max-h-[10em] min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words bg-transparent px-0 py-1.5 pr-2 text-[14px] font-normal leading-8 text-[#34322d] outline-none scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-zinc-300 sm:min-h-[136px]"
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
            {/* 数据库中的 Prompt 分类 */}
            {promptCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategoryId(cat.id)}
                className={cn(
                  "inline-flex items-center gap-2 p-1 font-medium transition",
                  activeCategoryId === cat.id ? "text-[#111111]" : "text-[#8b8c87] hover:text-[#34322d]",
                )}
              >
                <PlatformLogo
                  name="grid"
                  color={activeCategoryId === cat.id ? "#111111" : "#8b9bb0"}
                  className="h-[15px] w-[15px] shrink-0"
                />
                {cat.name}
              </button>
            ))}
          </div>

          <div className="pt-5 sm:pt-7">
            <div className="grid gap-3 pb-6 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
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

    </MoreDataShell>
  );
}
