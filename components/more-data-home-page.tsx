"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { homeCapabilityItems, homePromptCards } from "@/lib/mock/demo-data";
import { AgentWorkspace } from "@/components/agent-workspace";
import { MoreDataShell } from "@/components/more-data-shell";
import { PlatformLogo } from "@/components/platform-logo";
import { sanitizeObjective } from "@/lib/agent-attachments";
import { demoActions, useDemoState } from "@/lib/mock/store";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import {
  createAgentRun,
  isAgentRuntimeConfigured,
  isMockRuntimeEnabled,
  isPlatformBackendEnabled,
} from "@/lib/agent-runtime";
import { TaskComposer } from "@/components/task-composer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FlickeringGrid } from "@/components/ui/flickering-grid";

export function MoreDataHomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const platformAgent = useOptionalPlatformAgent();
  const { templates } = useDemoState();
  const [query, setQuery] = useState("");
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [activeCapabilityId, setActiveCapabilityId] = useState(homeCapabilityItems[0]?.id ?? "scenarios");
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [composerMode, setComposerMode] = useState<"普通模式" | "深度模式">("深度模式");
  const [notice, setNotice] = useState("");
  const [launching, setLaunching] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const activeRunId = searchParams.get("runId");

  const cards = useMemo(() => {
    if (!activeCapabilityId || activeCapabilityId === "scenarios") return homePromptCards;
    const filtered = homePromptCards.filter((card) => card.capabilityIds.includes(activeCapabilityId));
    return filtered.length > 0 ? filtered : homePromptCards;
  }, [activeCapabilityId]);

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

    if (isMockRuntimeEnabled()) {
      setLaunching(true);
      try {
        const runId = demoActions.startTaskRun({
          objective: nextQuery,
          mode: composerMode === "深度模式" ? "专业模式" : "轻量模式",
          selectedCapabilities,
        });
        setNotice(`已进入 mock 演示会话：${nextQuery}`);
        router.replace(`/?runId=${runId}`);
      } finally {
        setLaunching(false);
      }
      return;
    }

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
        const runId = demoActions.startPlatformTask({
          platformSessionId: sid,
          objective: nextQuery,
          mode: composerMode === "深度模式" ? "专业模式" : "轻量模式",
          selectedCapabilities,
        });
        setNotice("已连接 Data Agent Server，正在执行任务。");
        router.replace(`/?runId=${runId}`);
      } catch (error) {
        console.error("[home] platform task launch failed", error);
        setNotice("发起任务失败，请稍后重试。");
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
      demoActions.upsertRunSnapshot(snapshot.run, snapshot.report);
      router.replace(`/?runId=${snapshot.run.id}`);
    } catch (error) {
      console.error("[home] agent run create failed", error);
      setNotice("发起任务失败，请检查会话后端配置或稍后重试。");
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

  const applyTemplate = (templateId: string) => {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setQuery(template.body);
    setNotice(`已从任务指令库载入「${template.title}」。`);
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

  const applyPromptCard = (card: (typeof homePromptCards)[number]) => {
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
    demoActions.setCurrentRun(selectedPrompt.replayRunId ?? "run-default");
    window.open(`/share/${selectedPrompt.replayShareId ?? selectedPrompt.replayRunId ?? "run-default"}`, "_blank", "noopener,noreferrer");
  };

  const copyPromptCard = async () => {
    if (!selectedPrompt) return;
    try {
      await navigator.clipboard.writeText(selectedPrompt.prompt);
      setPromptCopied(true);
      setNotice(`已复制示例任务「${selectedPrompt.title}」内容。`);
      window.setTimeout(() => setPromptCopied(false), 1500);
    } catch {
      setNotice("复制失败，请稍后重试。");
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
          <div className="absolute inset-0 z-0 bg-[linear-gradient(180deg,#ffffff_0%,#fdfdfd_52%,#fbfbfb_100%)]" />
          <div className="absolute left-1/2 top-[78px] z-0 h-[360px] w-[980px] -translate-x-1/2 overflow-hidden">
            <FlickeringGrid
              className="absolute inset-0 size-full opacity-[0.28] [mask-image:radial-gradient(circle_at_50%_42%,black_0%,black_34%,transparent_78%)]"
              squareSize={4}
              gridGap={6}
              color="#6B7280"
              maxOpacity={0.5}
              flickerChance={0.1}
              height={360}
              width={980}
            />
          </div>
          <div className="absolute left-1/2 top-[78px] z-0 h-[360px] w-[980px] -translate-x-1/2 bg-[radial-gradient(circle_at_50%_42%,rgba(0,0,0,0.02),transparent_58%)] opacity-20" />
          <div className="absolute left-1/2 top-[44px] z-0 h-[420px] w-[620px] -translate-x-1/2 opacity-[0.12]">
            <div className="absolute left-[82px] top-[12px] h-[46px] w-[148px] skew-x-[-34deg] rounded-[2px] border border-[#d6d9df]" />
            <div className="absolute left-[214px] top-[0] h-[322px] w-[156px] skew-x-[-34deg] rounded-[2px] border border-[#d6d9df]" />
            <div className="absolute left-[168px] top-[286px] h-[72px] w-[212px] skew-x-[-34deg] rounded-[2px] border border-[#e3e6ea]" />
          </div>
          <div className="absolute inset-0 z-[1] bg-[radial-gradient(circle_at_50%_-4%,rgba(255,255,255,0.96),rgba(255,255,255,0)_34%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.72)_74%,rgba(255,255,255,0.92)_100%)]" />
        </>
      }
    >
      <div className="px-8 pb-8 pt-8">
        <div className="mx-auto w-full max-w-[1180px] pt-4">
          <div className="mx-auto max-w-[760px] pt-18 text-center md:pt-24">
            <h1 className="font-[family:var(--font-jakarta)] text-[48px] font-semibold tracking-[-0.065em] text-[#18181b] md:text-[66px]">
              跨境运营助手
            </h1>
            <p className="mt-3 text-[15px] leading-[1.7] text-[#585d66] md:text-[16px]">数据、选品、调研、分析...</p>
          </div>

          <div className="mx-auto mt-12 max-w-[820px]">
            <TaskComposer
              value={query}
              onValueChange={setQuery}
              placeholder="需要分析亚马逊的流量来源？试试 @Sif-亚马逊-流量来源分析。"
              mode={composerMode}
              onModeChange={setComposerMode}
              templates={templates}
              selectedSourceIds={selectedSourceIds}
              onToolSelect={applyComposerTool}
              onSourceRemove={removeComposerTool}
              onTemplateSelect={applyTemplate}
              onFilesSelected={handleFilesSelected}
              onSubmit={() => {
                if (!launching) {
                  void launchAgent();
                }
              }}
              visualStyle="heroMinimal"
            />
            <p className="sr-only" aria-live="polite">
              {notice}
            </p>
          </div>

          <div className="mx-auto mt-10 flex max-w-[920px] flex-wrap items-center justify-center gap-x-1.5 gap-y-2 text-[12px] text-[#8f949d] opacity-70">
            {homeCapabilityItems.map((item) => {
              const active = item.id === activeCapabilityId;
              return (
                <button
                  key={item.id}
                  onClick={() => applyBrowseCapability(item.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] transition duration-300 ${
                    active
                      ? "border-[#d8dbe0] bg-[#f7f8fa] text-[#30343a] shadow-[0_6px_14px_rgba(15,23,42,0.04)]"
                      : "border-[#eceef2] bg-[rgba(255,255,255,0.86)] text-[#8b9099] hover:border-[#d8dbe0] hover:bg-white hover:text-[#30343a]"
                  }`}
                >
                  <span className="inline-flex h-3 w-3 items-center justify-center">
                    <PlatformLogo name={item.icon} color={item.accent} className="h-[10px] w-[10px]" />
                  </span>
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="mt-18 pb-2 text-center text-[12px] font-medium tracking-[0.02em] text-[#b1b5bc]">探索精选提示词</div>

          <div className="mt-5 grid gap-3 pb-6 md:grid-cols-2 xl:grid-cols-4">
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
                className={`group relative overflow-hidden rounded-[18px] border text-left outline-none transition duration-300 ${
                  "border-[#f0f1f3] bg-[linear-gradient(180deg,#ffffff,#fdfdfd)] shadow-[0_6px_14px_rgba(15,23,42,0.025)] hover:-translate-y-0.5 hover:border-[#e0e3e8] hover:bg-[linear-gradient(180deg,#ffffff,#fbfbfb)] hover:shadow-[0_14px_28px_rgba(15,23,42,0.055)] focus-visible:-translate-y-0.5 focus-visible:border-[#e0e3e8] focus-visible:bg-[linear-gradient(180deg,#ffffff,#fbfbfb)] focus-visible:shadow-[0_14px_28px_rgba(15,23,42,0.055)]"
                }`}
              >
                <div className="flex min-h-[148px] flex-col px-4 py-3.5">
                  <div className="min-w-0">
                    <div className="line-clamp-4 text-[12px] leading-5 text-[#7d828b]">
                      {card.body.length > 68 ? `${card.body.slice(0, 68)}…` : card.body}
                    </div>
                  </div>
                  <div className="mt-auto pt-3">
                    <div className="text-[13px] font-medium tracking-[-0.02em] text-[#24272d]">{card.title}</div>
                    <div className="mt-1 text-[12px] leading-4 text-[#b0b4bc]">{card.meta}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={Boolean(selectedPrompt)} onOpenChange={(open) => (!open ? setSelectedPromptId(null) : null)}>
        <DialogContent className="max-w-[608px] rounded-[14px] border-[#e3e1dc] bg-white p-0 shadow-[0_28px_80px_rgba(15,23,42,0.16)]">
          {selectedPrompt ? (
            <div className="p-5">
              <DialogTitle className="pr-8 text-[16px] font-semibold tracking-[-0.03em] text-[#222222]">
                {selectedPrompt.title}
              </DialogTitle>
              <DialogDescription className="mt-3 text-[13px] leading-6 text-[#7a7b80]">
                {selectedPrompt.body}
              </DialogDescription>

              <div className="mt-5 overflow-hidden rounded-[10px] border border-[#e8e8ea] bg-white">
                <div className="flex items-center justify-between border-b border-[#efeff1] bg-[#fafafb] px-4 py-3">
                  <div className="text-[13px] text-[#85868d]">提示词(Prompt)</div>
                  <button
                    type="button"
                    onClick={copyPromptCard}
                    className="inline-flex items-center gap-1.5 text-[13px] text-[#26272b] transition hover:text-[#111111]"
                  >
                    {promptCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {promptCopied ? "已复制" : "复制"}
                  </button>
                </div>
                <div className="bg-[#fdfdfd] px-4 py-4 text-[13px] leading-7 text-[#2b2d31]">
                  <p className="whitespace-pre-wrap">{selectedPrompt.prompt}</p>
                </div>
              </div>

              <div className="mt-7 flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-[9px] border-[#dadbdd] bg-white px-4 text-[13px] text-[#3d3f44]"
                  onClick={() => setSelectedPromptId(null)}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-[9px] border-[#dadbdd] bg-white px-4 text-[13px] text-[#2b2d31] hover:bg-[#f5f5f6]"
                  onClick={previewPromptRun}
                >
                  查看回放
                </Button>
                <Button
                  type="button"
                  className="h-9 rounded-[9px] border border-[#1d2a1e] bg-[#263126] px-4 text-[13px] text-white shadow-none hover:bg-[#1f2a20]"
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
