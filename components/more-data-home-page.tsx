"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Copy } from "@/components/ui/tabler-icons";
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
        setNotice(
          "请配置 NEXT_PUBLIC_AGENT_API_ORIGIN，或设置 NEXT_PUBLIC_AGENT_API_USE_PROXY=1（局域网访问时推荐，避免访客机请求 127.0.0.1 导致 failed to fetch）。",
        );
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
          <div className="absolute inset-0 z-0 bg-[#f8f8f7]" />
        </>
      }
    >
      <div className="flex flex-col pb-10">
        <div className="px-[21px] pt-[15vh]">
          <div className="mx-auto w-full max-w-[768px]">
            <div className="mx-auto text-center">
              <Image
                src="/mdata-logo.png"
                alt="Mdata"
                width={42}
                height={42}
                className="mx-auto mb-3 h-[42px] w-[42px] object-contain"
                draggable={false}
                priority
              />
              <h1 className="font-serif text-[36px] font-normal leading-[54px] tracking-normal text-[#34322d]">
                跨境运营助手
              </h1>
              <p className="sr-only">数据、选品、调研、分析...</p>
          </div>

          <div className="mx-auto mt-[34px] max-w-[768px]">
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
                />
              </AssistantThreadFrame>
            </div>
            <p className="sr-only" aria-live="polite">
              {notice}
            </p>
          </div>
        </div>
      </div>

      <div
        id="sym:homeCapabilityItems"
        className="mx-auto mt-10 w-full max-w-[768px] rounded-[20px] bg-transparent px-2 py-2 opacity-95"
      >
        <div className="mx-auto flex w-full justify-center px-0">
          <div className="flex w-full max-w-[768px] flex-wrap items-center justify-center gap-2 text-[16px] text-[#34322d]">
            {homeCapabilityItems.map((item) => {
              const active = item.id === activeCapabilityId;
              return (
                <button
                  key={item.id}
                  onClick={() => applyBrowseCapability(item.id)}
                  className={`inline-flex h-10 items-center gap-2 rounded-full border border-[rgba(0,0,0,0.06)] bg-transparent px-[14px] text-[16px] font-normal leading-6 transition duration-200 ${
                    active
                      ? "text-[#34322d]"
                      : "text-[#34322d] hover:bg-[rgba(55,53,47,0.06)]"
                  }`}
                >
                  <span className="inline-flex h-4 w-4 items-center justify-center">
                    <PlatformLogo name={item.icon} color={item.accent} className="h-4 w-4" />
                  </span>
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="px-4 pt-12 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-[768px]">
          <div className="pb-2 text-center font-serif text-[15px] font-normal leading-6 text-[#34322d]">探索精选提示词</div>

          <div className="mt-4 grid gap-3 pb-6 md:grid-cols-2">
            {cards.map((card) => (
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
                className={`group relative overflow-hidden rounded-[18px] border text-left outline-none transition duration-200 ${
                  "border-[rgba(0,0,0,0.06)] bg-white/70 shadow-none hover:bg-white hover:shadow-[0_8px_24px_rgba(0,0,0,0.04)] focus-visible:bg-white focus-visible:shadow-[0_8px_24px_rgba(0,0,0,0.04)]"
                }`}
              >
                <div className="flex min-h-[118px] flex-col px-4 py-4">
                  <div className="min-w-0">
                    <div className="line-clamp-3 text-[13px] leading-5 text-[#858481]">
                      {card.body.length > 78 ? `${card.body.slice(0, 78)}…` : card.body}
                    </div>
                  </div>
                  <div className="mt-auto pt-3">
                    <div className="font-serif text-[15px] font-normal leading-6 tracking-normal text-[#34322d]">{card.title}</div>
                    <div className="mt-1 text-[13px] leading-[18px] text-[#858481]">{card.meta}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      </div>

      <Dialog open={Boolean(selectedPrompt)} onOpenChange={(open) => (!open ? setSelectedPromptId(null) : null)}>
        <DialogContent className="max-w-[608px] !rounded-[18px] border-[rgba(0,0,0,0.08)] bg-white p-0 shadow-[0_20px_48px_rgba(24,24,27,0.12)] sm:!rounded-[18px]">
          {selectedPrompt ? (
            <div className="p-5">
              <DialogTitle className="pr-8 font-serif text-[18px] font-normal leading-7 tracking-normal text-[#34322d]">
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
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-[10px] border-[rgba(0,0,0,0.08)] bg-white px-4 text-[13px] text-[#34322d] shadow-none hover:bg-[rgba(55,53,47,0.06)]"
                  onClick={() => setSelectedPromptId(null)}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-[10px] border-[rgba(0,0,0,0.08)] bg-white px-4 text-[13px] text-[#34322d] shadow-none hover:bg-[rgba(55,53,47,0.06)]"
                  onClick={previewPromptRun}
                >
                  查看回放
                </Button>
                <Button
                  type="button"
                  className="h-9 rounded-[10px] border border-[#34322d] bg-[#34322d] px-4 text-[13px] text-white shadow-none hover:bg-[#2f2d28]"
                  onClick={usePromptCard}
                >
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
