"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUp, Check, Copy } from "@/components/ui/tabler-icons";
import { fetchHomePromptRecommendations } from "@/lib/agent-api/home-prompts";
import type { HomePromptCard } from "@/lib/workspace-domain-types";
import { homeCapabilityItems } from "@/lib/home-capability-items";
import { AgentWorkspace } from "@/components/agent-workspace";
import { AssistantThreadFrame } from "@/components/assistant-thread-frame";
import { MoreDataShell } from "@/components/more-data-shell";
import { PlatformLogo } from "@/components/platform-logo";
import { sanitizeObjective } from "@/lib/agent-attachments";
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
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { copyTextToClipboard } from "@/lib/clipboard";

export function MoreDataHomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const platformAgent = useOptionalPlatformAgent();
  const [query, setQuery] = useState("");
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [activeCapabilityId, setActiveCapabilityId] = useState(homeCapabilityItems[0]?.id ?? "scenarios");
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [composerMode, setComposerMode] = useState<"普通模式" | "深度模式">("深度模式");
  const [notice, setNotice] = useState("");
  const [launching, setLaunching] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [remotePromptCards, setRemotePromptCards] = useState<HomePromptCard[]>([]);
  const activeRunId = searchParams.get("runId");

  useEffect(() => {
    if (typeof sessionStorage === "undefined") return;
    const raw = sessionStorage.getItem(AGENT_COMPOSER_PREFILL_STORAGE_KEY);
    if (raw) {
      setQuery(raw);
      sessionStorage.removeItem(AGENT_COMPOSER_PREFILL_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchHomePromptRecommendations()
      .then((rows) => {
        if (cancelled) return;
        setRemotePromptCards(
          rows.map((r) => ({
            id: r.id,
            title: r.title,
            body: r.description,
            prompt: r.prompt,
            meta: r.meta,
            capabilityIds: r.capability_ids,
            replayRunId: r.replay_run_id ?? undefined,
            replayShareId: r.replay_share_id ?? undefined,
          })),
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[home-prompt-recommendations]", msg);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = useMemo(() => {
    const source = remotePromptCards;
    if (!activeCapabilityId || activeCapabilityId === "scenarios") return source;
    const filtered = source.filter((card) => card.capabilityIds.includes(activeCapabilityId));
    return filtered.length > 0 ? filtered : source;
  }, [activeCapabilityId, remotePromptCards]);
  const composerCanSubmit = sanitizeObjective(query).length > 0 && !launching;

  const launchAgent = async (seed?: string) => {
    const nextQuery = sanitizeObjective(seed ?? query);
    if (!nextQuery) {
      setNotice("请先输入一个研究目标，或从下方示例任务中直接发起。");
      return;
    }
    const selectedCapabilities = selectedSourceIds.length > 0
      ? selectedSourceIds
      : activeCapabilityId === "scenarios"
        ? []
        : [activeCapabilityId];

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
        platformAgent.openLogin("请先登录再发起任务。");
        return;
      }
      setLaunching(true);
      try {
        const sid = await platformAgent.beginNewHomeTaskSession();
        if (!sid) return;
        const runId = workspaceActions.startPlatformTask({
          platformSessionId: sid,
          objective: nextQuery,
          mode: composerMode === "深度模式" ? "专业模式" : "轻量模式",
          selectedCapabilities,
        });
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
        mode: composerMode === "深度模式" ? "专业模式" : "轻量模式",
        selectedCapabilities,
      });
      workspaceActions.upsertRunSnapshot(snapshot.run, snapshot.report);
      router.replace(`/?runId=${snapshot.run.id}`);
    } finally {
      setLaunching(false);
    }
  };

  const applyBrowseCapability = (capabilityId: string) => {
    const item = homeCapabilityItems.find((entry) => entry.id === capabilityId);
    if (!item) return;
    setActiveCapabilityId(item.id);
    setNotice(`已切换首页浏览视角到「${item.label}」，可继续选择示例任务或直接输入需求。`);
  };

  const applyComposerTool = (capabilityId: string) => {
    const item = homeCapabilityItems.find((entry) => entry.id === capabilityId);
    if (!item || item.id === "scenarios") return;
    setSelectedSourceIds((current) => (current.includes(item.id) ? current : [...current, item.id]));
    setNotice(`已选择数据源「${item.label}」，可以继续补充要求后直接发送。`);
  };

  const removeComposerTool = (capabilityId: string) => {
    setSelectedSourceIds((current) => current.filter((id) => id !== capabilityId));
  };

  const handleFilesSelected = (files: FileList) => {
    const names = Array.from(files).map((file) => file.name).join("、");
    setNotice(`已添加附件：${names}。`);
  };

  const selectedPrompt = cards.find((card) => card.id === selectedPromptId) ?? null;

  const openPromptCard = (cardId: string) => {
    setPromptCopied(false);
    setSelectedPromptId(cardId);
  };

  const applyPromptCard = (card: HomePromptCard) => {
    setQuery(card.prompt);
    setSelectedSourceIds(card.capabilityIds);
    setActiveCapabilityId(card.capabilityIds[0] ?? "scenarios");
    setNotice(`已载入示例任务「${card.title}」，可继续补充要求后发送。`);
  };

  const usePromptCard = () => {
    if (!selectedPrompt) return;
    applyPromptCard(selectedPrompt);
    setSelectedPromptId(null);
  };

  const previewPromptRun = () => {
    if (!selectedPrompt) return;
    setSelectedPromptId(null);
    const runId = selectedPrompt.replayRunId;
    const shareId = selectedPrompt.replayShareId ?? selectedPrompt.replayRunId;
    if (!shareId) {
      setNotice("该推荐未配置回放或分享 ID。");
      return;
    }
    if (runId) {
      workspaceActions.setCurrentRun(runId);
    }
    window.open(`/share/${shareId}`, "_blank", "noopener,noreferrer");
  };

  const copyPromptCard = async () => {
    if (!selectedPrompt) return;
    const ok = await copyTextToClipboard(selectedPrompt.prompt);
    if (ok) {
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 1500);
    } else {
      setNotice("复制失败，请改为选中提示词后手动复制，或为站点启用 HTTPS。");
    }
  };

  if (activeRunId) {
    return <AgentWorkspace />;
  }

  return (
    <MoreDataShell
      currentPath="/"
      mainDecoration={
        <>
          <div className="absolute inset-0 z-0 bg-[#f7f7f7]" />
        </>
      }
    >
      <div className="flex flex-col pb-10 sm:pb-14">
        <section className="mx-auto w-full max-w-[1040px] px-4 pt-4 sm:px-6 sm:pt-8 lg:px-8 lg:pt-[56px]">
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
              <div className="mt-0.5 text-[15px] font-normal leading-6 text-[#34322d] sm:mt-1 sm:text-[18px] sm:leading-7">
                💬 你的跨境运营助手，24h随时在线
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
                  onSubmit={() => {
                    if (!launching) {
                      void launchAgent();
                    }
                  }}
                  visualStyle="heroMinimal"
                  containerClassName="relative z-30 w-full rounded-[20px] border border-[#e2e2df] bg-white shadow-[0_18px_44px_rgba(17,17,17,0.05)] sm:rounded-[24px]"
                  textareaClassName="min-h-[112px] max-h-[10em] min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words bg-transparent px-0 py-1.5 pr-2 text-[14px] font-normal leading-6 text-[#34322d] outline-none scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-zinc-300 sm:min-h-[136px]"
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
            {homeCapabilityItems.map((item) => {
              const active = item.id === activeCapabilityId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => applyBrowseCapability(item.id)}
                  className={cn(
                    "inline-flex items-center gap-2 font-medium transition",
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

          <div className="pt-5 sm:pt-7">
            <div className="grid gap-3 pb-6 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
              {cards.map((card) => {
                const capability = homeCapabilityItems.find((item) => card.capabilityIds.includes(item.id));
                return (
                  <div
                    key={card.id}
                    role="button"
                    tabIndex={0}
                    aria-haspopup="dialog"
                    aria-label={`打开示例任务 ${card.title}`}
                    onClick={() => openPromptCard(card.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openPromptCard(card.id);
                      }
                    }}
                    className="group relative overflow-hidden rounded-[14px] border border-white/70 bg-white/72 text-left shadow-[0_1px_2px_rgba(17,17,17,0.03)] outline-none transition duration-200 hover:bg-white hover:shadow-[0_10px_24px_rgba(17,17,17,0.06)] focus-visible:bg-white focus-visible:shadow-[0_10px_24px_rgba(17,17,17,0.06)] sm:rounded-[18px]"
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
                        <ArrowUp className="h-4 w-4 shrink-0 text-[#b1b2ae]" strokeWidth={1.8} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <Dialog open={Boolean(selectedPrompt)} onOpenChange={(open) => (!open ? setSelectedPromptId(null) : null)}>
        <DialogContent className="max-w-[608px] !rounded-[18px] border-[rgba(0,0,0,0.08)] bg-white p-0 shadow-[0_20px_48px_rgba(24,24,27,0.12)] sm:!rounded-[18px]">
          {selectedPrompt ? (
            <div className="p-5">
              <DialogTitle className="pr-8 text-[18px] font-normal leading-7 tracking-normal text-[#34322d]">
                {selectedPrompt.title}
              </DialogTitle>
              <DialogDescription className="mt-3 text-[13px] leading-6 text-[#858481]">
                {selectedPrompt.body}
              </DialogDescription>

              <div className="mt-5 overflow-hidden rounded-[14px] border border-[rgba(0,0,0,0.06)] bg-white">
                <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.06)] bg-[rgba(55,53,47,0.04)] px-4 py-3">
                  <div className="text-[13px] text-[#858481]">提示词(Prompt)</div>
                  <button
                    type="button"
                    onClick={copyPromptCard}
                    className="inline-flex items-center gap-1.5 text-[13px] text-[#34322d] transition hover:text-[#111111]"
                  >
                    {promptCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {promptCopied ? "已复制" : "复制"}
                  </button>
                </div>
                <div className="bg-white px-4 py-4 text-[13px] leading-7 text-[#34322d]">
                  <p className="whitespace-pre-wrap">{selectedPrompt.prompt}</p>
                </div>
              </div>

              <div className="mt-7 flex items-center justify-end gap-2.5">
                <Button type="button" variant="outline" size="sm" onClick={() => setSelectedPromptId(null)}>
                  取消
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={previewPromptRun}>
                  查看回放
                </Button>
                <Button type="button" size="sm" onClick={usePromptCard}>
                  使用
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </MoreDataShell>
  );
}
