"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bot, ChevronDown, ListRestart, MessageCircleMore, ThumbsDown, ThumbsUp } from "lucide-react";
import type {
  AgentAttachment,
  DataSourceChain,
  PlatformSubtaskSnapshot,
  PlatformTaskArtifactRef,
  TaskExecutionStep,
} from "@/lib/agent-events";
import { MoreDataShell } from "@/components/more-data-shell";
import { AgentTaskResultPanel } from "@/components/agent-task-result-panel";
import { AssistantLoadingRow } from "@/components/assistant-loading-row";
import { TaskResultSummaryCard } from "@/components/task-result-summary-card";
import { buildAttachmentItems, toTdAttachments } from "@/components/agent-workspace/attachment-utils";
import {
  CollapsedStatusRow,
  ConversationBubble,
  SIMPLE_CHAT_BUBBLE_MAX,
  SIMPLE_CHAT_COLUMN_MAX,
  SimpleAssistantBubble,
  SimpleSystemBubble,
  SimpleUserBubble,
  ToolCard,
} from "@/components/agent-workspace/chat-bubbles";
import { PlatformRoundStepTimeline } from "@/components/agent-workspace/platform-step-views";
import { PlatformSessionAgentWorkspace } from "@/components/agent-workspace/platform-session-agent-workspace";
import { ReportPreviewPanel } from "@/components/report-preview-panel";
import { TaskComposer } from "@/components/task-composer";
import { Button } from "@/components/ui/button";
import { sanitizeObjective } from "@/lib/agent-attachments";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { isPlatformBackendEnabled, streamAgentRound } from "@/lib/agent-runtime";
import { homeCapabilityItems } from "@/lib/mock/demo-data";
import { demoActions, useDemoState } from "@/lib/mock/store";
import { hasTabularTaskResultFiles } from "@/lib/platform-task-artifacts";
import { cn } from "@/lib/utils";
import { formatAgentApiErrorForUser } from "@/lib/agent-api/client";
import {
  buildAcknowledgement,
  buildRoundViewModels,
  compactText,
  type RoundViewModel,
  type TaskRunLike,
  toCapabilitySafeTitle,
} from "@/components/agent-workspace-view-models";

const ChatAttachments = dynamic(
  () => import("@tdesign-react/aigc").then((mod) => mod.ChatAttachments),
  { ssr: false },
);

export { buildAcknowledgement, buildRoundViewModels, toCapabilitySafeTitle };
export type { RoundViewModel, TaskRunLike };

export function AgentWorkspace() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const platformAgent = useOptionalPlatformAgent();
  const historySessionId = searchParams.get("sessionId") ?? "";
  const { currentRunId, reports, runs, templates } = useDemoState();
  const runId = searchParams.get("runId") ?? currentRunId;
  const run = runs.find((item) => item.id === runId) ?? runs[0];
  const report = reports.find((item) => item.id === run?.reportId) ?? reports[0];
  const isPlatformSession = isPlatformBackendEnabled() && Boolean(platformAgent) && Boolean(historySessionId);

  useEffect(() => {
    // 仅在既没有 runId、也没有 sessionId 时，才认为是误打开 /agent，需要跳回首页。
    const hasRunId = Boolean(searchParams.get("runId"));
    const hasSessionId = Boolean(historySessionId);
    if (pathname === "/agent" && !hasRunId && !hasSessionId) {
      router.replace("/");
    }
  }, [pathname, router, searchParams, historySessionId]);

  const [previewOverrides, setPreviewOverrides] = useState<Record<string, string | null>>({});
  const [panelVisibility, setPanelVisibility] = useState<Record<string, boolean>>({});
  /** 右侧任务结果区：点击某张步骤结果卡片时锁定该步产物；新一轮步骤快照到达时自动清除以跟随最新一步 */
  const [panelSubtaskFocus, setPanelSubtaskFocus] = useState<{
    taskId: string;
    artifacts: PlatformTaskArtifactRef[];
  } | null>(null);
  const [composerModes, setComposerModes] = useState<Record<string, "普通模式" | "深度模式">>({});
  const [selectedSourceOverrides, setSelectedSourceOverrides] = useState<Record<string, string[]>>({});
  const [queuedAttachments, setQueuedAttachments] = useState<Record<string, AgentAttachment[]>>({});
  const [composerVersion, setComposerVersion] = useState<Record<string, number>>({});
  const [executionCardExpandedByRound, setExecutionCardExpandedByRound] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const executingRoundsRef = useRef<Set<string>>(new Set());
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const messagesInnerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (run && currentRunId !== run.id) {
      demoActions.setCurrentRun(run.id);
    }
  }, [currentRunId, run]);

  const composerMode = composerModes[run.id] ?? (run.mode === "专业模式" ? "深度模式" : "普通模式");
  const selectedSourceIds = selectedSourceOverrides[run.id] ?? [];
  const currentComposerVersion = composerVersion[run.id] ?? 0;

  const roundModels = useMemo(
    () =>
      buildRoundViewModels({
        startedAt: run.startedAt,
        objective: run.objective,
        selectedCapabilities: run.selectedCapabilities,
        timeline: run.timeline,
        chains: run.chains,
        roundUiLayouts: run.roundUiLayouts,
        status: run.status,
        latestRoundId: run.latestRoundId,
        taskExecutionStepsByRound: run.taskExecutionStepsByRound,
        platformSubtasksByRound: run.platformSubtasksByRound,
        platformTaskArtifacts: run.platformTaskArtifacts,
      }),
    [
      run.chains,
      run.latestRoundId,
      run.objective,
      run.platformSubtasksByRound,
      run.platformTaskArtifacts,
      run.roundUiLayouts,
      run.selectedCapabilities,
      run.startedAt,
      run.status,
      run.taskExecutionStepsByRound,
      run.timeline,
    ],
  );

  const previewBaseId = previewOverrides[run.id] ?? run.activePreviewId ?? report.previewKey;

  const latestRoundModel = roundModels.length > 0 ? roundModels[roundModels.length - 1] : undefined;
  const latestHasPlatformSteps = Boolean(latestRoundModel?.executionSteps?.length);
  const latestRoundIdForPanel = latestRoundModel?.roundId;
  const latestPlatformSubtasks = latestRoundIdForPanel
    ? (run.platformSubtasksByRound?.[latestRoundIdForPanel] ?? [])
    : [];
  const anySubtaskTabular = latestPlatformSubtasks.some((s) => hasTabularTaskResultFiles(s.artifacts));
  const effectivePanelArtifacts = panelSubtaskFocus?.artifacts ?? run.platformTaskArtifacts;
  /** 分步任务：任一步产生可表格化产物即可展开右侧；执行中（running）也可预览已完成的步骤 */
  const latestRoundWantsTaskPanel = Boolean(
    latestRoundModel?.uiLayout === "tool_orchestration" &&
      latestHasPlatformSteps &&
      (run.status === "success" || run.status === "running") &&
      (hasTabularTaskResultFiles(effectivePanelArtifacts) || anySubtaskTabular) &&
      !latestRoundModel?.errorMessage,
  );

  const pv = panelVisibility[run.id];
  const showTaskResultPanel = latestRoundWantsTaskPanel && pv === true;
  const showLegacyReportPreview =
    !latestRoundWantsTaskPanel && pv === true && Boolean(previewBaseId);
  const showRightRail = showTaskResultPanel || showLegacyReportPreview;

  const prevWantsTaskPanelRef = useRef(false);
  const taskPanelRunIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (taskPanelRunIdRef.current !== run.id) {
      taskPanelRunIdRef.current = run.id;
      prevWantsTaskPanelRef.current = false;
    }
    if (!latestRoundWantsTaskPanel) {
      setPanelVisibility((c) => ({ ...c, [run.id]: false }));
      prevWantsTaskPanelRef.current = false;
      return;
    }
    if (!prevWantsTaskPanelRef.current) {
      setPanelVisibility((c) => ({ ...c, [run.id]: true }));
      prevWantsTaskPanelRef.current = true;
    }
  }, [latestRoundWantsTaskPanel, run.id]);

  const latestSubtasksCount = latestPlatformSubtasks.length;
  const prevLatestSubtasksCountRef = useRef(0);
  useEffect(() => {
    setPanelSubtaskFocus(null);
    prevLatestSubtasksCountRef.current = 0;
  }, [run.id]);
  useEffect(() => {
    if (latestSubtasksCount > prevLatestSubtasksCountRef.current) {
      setPanelSubtaskFocus(null);
    }
    prevLatestSubtasksCountRef.current = latestSubtasksCount;
  }, [latestSubtasksCount]);

  const taskPanelOpen = showTaskResultPanel;

  useEffect(() => {
    const outer = messagesScrollRef.current;
    const inner = messagesInnerRef.current;
    if (!outer || !inner) return;
    const scrollToBottom = () => {
      requestAnimationFrame(() => {
        outer.scrollTop = outer.scrollHeight;
      });
    };
    scrollToBottom();
    const ro = new ResizeObserver(scrollToBottom);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [
    executionCardExpandedByRound,
    notice,
    roundModels,
    run.chains,
    run.latestRoundId,
    run.platformSubtasksByRound,
    run.platformTaskArtifacts,
    run.status,
    run.taskExecutionStepsByRound,
    run.timeline,
  ]);

  const executeRound = useCallback(async (input: {
    roundId: string;
    prompt: string;
    selectedCapabilities: string[];
    attachments: AgentAttachment[];
    isInitialRound?: boolean;
  }) => {
    if (executingRoundsRef.current.has(input.roundId)) return;
    executingRoundsRef.current.add(input.roundId);
    try {
      await streamAgentRound(
        {
          roundId: input.roundId,
          runId: run.id,
          prompt: input.prompt,
          mode: composerMode,
          selectedCapabilities: input.selectedCapabilities,
          attachments: input.attachments,
          objective: run.objective,
          isInitialRound: input.isInitialRound,
          platformChatSessionId: run.platformSessionId,
        },
        {
          onEvent: (event) => {
            demoActions.applyRuntimeEvent(run.id, event);
          },
        },
        isPlatformBackendEnabled() && platformAgent && run.platformSessionId
          ? { platform: { withFreshToken: platformAgent.withFreshToken } }
          : undefined,
      );
      setQueuedAttachments((current) => ({ ...current, [run.id]: [] }));
      setComposerVersion((current) => ({ ...current, [run.id]: (current[run.id] ?? 0) + 1 }));
    } catch (error) {
      const errText = formatAgentApiErrorForUser(error);
      demoActions.applyRuntimeEvent(run.id, {
        type: "error",
        roundId: input.roundId,
        message: errText,
      });
      // 错误已在会话区内展示（系统气泡 / 任务区提示），勿再写入顶部 notice，避免重复白框
      setNotice("");
    } finally {
      executingRoundsRef.current.delete(input.roundId);
    }
  }, [composerMode, platformAgent, run.id, run.objective, run.platformSessionId]);

  useEffect(() => {
  if (run.status !== "queued" || !run.latestRoundId) return;
    void executeRound({
      roundId: run.latestRoundId,
      prompt: run.objective,
      selectedCapabilities: run.selectedCapabilities,
      attachments: [],
      isInitialRound: true,
    });
  }, [executeRound, run.id, run.latestRoundId, run.objective, run.selectedCapabilities, run.status]);

  const appendNote = async () => {
    const value = sanitizeObjective(draft);
    if (!value || run.status === "running") return;
    const attachments = queuedAttachments[run.id] ?? [];
    const roundId = demoActions.queueFollowupRound(run.id, {
      prompt: value,
      selectedCapabilities: selectedSourceIds,
      attachments,
    });
    setDraft("");
    setPanelVisibility((current) => {
      const next = { ...current };
      delete next[run.id];
      return next;
    });
    setNotice(`已发起新一轮多数据源分析：${value}`);
    await executeRound({
      roundId,
      prompt: value,
      selectedCapabilities: selectedSourceIds,
      attachments,
    });
  };

  const applyCapability = (capabilityId: string) => {
    const item = homeCapabilityItems.find((entry) => entry.id === capabilityId);
    if (!item) return;
    setSelectedSourceOverrides((current) => {
      const currentSources = current[run.id] ?? [];
      return {
        ...current,
        [run.id]: currentSources.includes(item.id) ? currentSources : [...currentSources, item.id],
      };
    });
    setNotice(`本轮已加入数据源「${item.label}」。`);
  };

  const removeCapability = (capabilityId: string) => {
    setSelectedSourceOverrides((current) => ({
      ...current,
      [run.id]: (current[run.id] ?? []).filter((id) => id !== capabilityId),
    }));
  };

  const applyTemplate = (templateId: string) => {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setDraft(template.body);
    setNotice(`已载入任务指令「${template.title}」。`);
  };

  const handleFilesSelected = (files: FileList) => {
    const attachmentItems = buildAttachmentItems(files);
    setQueuedAttachments((current) => ({
      ...current,
      [run.id]: attachmentItems,
    }));
    setNotice(`已添加附件：${attachmentItems.map((item) => item.name).join("、")}。`);
  };

  const handleFeedback = (kind: "喜欢" | "不喜欢" | "需要继续") => {
    setNotice(`已记录反馈：${kind}。`);
  };

  if (isPlatformSession) {
    return <PlatformSessionAgentWorkspace sessionId={historySessionId} />;
  }

  return (
    <MoreDataShell
      currentPath="/agent"
      contentScrollMode="child"
      currentRunLabel={run.title}
      rightRail={
        showRightRail ? (
          showTaskResultPanel ? (
            <AgentTaskResultPanel
              artifacts={effectivePanelArtifacts ?? []}
              withFreshToken={platformAgent?.withFreshToken}
              onClose={() =>
                setPanelVisibility((current) => ({
                  ...current,
                  [run.id]: false,
                }))
              }
            />
          ) : (
            <ReportPreviewPanel
              previewId={previewBaseId!}
              reportTitle={run.title}
              report={report}
              onClose={() =>
                setPanelVisibility((current) => ({
                  ...current,
                  [run.id]: false,
                }))
              }
            />
          )
        ) : undefined
      }
    >
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white">
        <div
          ref={messagesScrollRef}
          className="hide-scrollbar-y min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-4 pt-6 sm:px-6"
        >
          <div ref={messagesInnerRef} className={cn("mx-auto w-full", SIMPLE_CHAT_COLUMN_MAX)}>
            <div className="space-y-5">
              {isPlatformBackendEnabled() && !run.platformSessionId ? (
                <p className="text-sm leading-relaxed text-[#92400e]">
                  当前为内置演示任务，消息不会发往 Data Agent Server。请打开首页重新输入并发送以创建真实会话；避免使用地址栏 /agent（无 runId）或侧栏中的演示历史对话。
                </p>
              ) : null}
              {notice ? <p className="text-sm text-[#52525b]">{notice}</p> : null}

            <div className="space-y-7">
              {roundModels.map((round, index) => {
                const executionExpanded =
                  executionCardExpandedByRound[round.roundId] ?? !round.collapseExecution;

                return (
                <div key={round.roundId} className="space-y-3">
                  {round.userMessage ? (
                    round.uiLayout === "simple_chat" ? (
                      <SimpleUserBubble text={round.userMessage} datetime={round.createdAt} />
                    ) : (
                      <div className="flex justify-end">
                        <div className="w-full max-w-[780px]" data-testid="agent-user-input-card">
                          <ConversationBubble role="user" title="你" datetime={round.createdAt} body={compactText(round.userMessage, 220)} />
                        </div>
                      </div>
                    )
                  ) : null}

                  {round.attachments.length > 0 ? (
                    <div
                      className={cn(
                        "w-full",
                        round.uiLayout === "simple_chat" ? "flex justify-end" : "max-w-[780px]",
                      )}
                    >
                      <div
                        className={cn(
                          "rounded-[16px] border border-[#e5e7eb] bg-white px-3 py-3",
                          round.uiLayout === "simple_chat" && cn("w-full", SIMPLE_CHAT_BUBBLE_MAX),
                        )}
                      >
                        <ChatAttachments items={toTdAttachments(round.attachments)} overflow="wrap" />
                      </div>
                    </div>
                  ) : null}

                  {round.uiLayout === "simple_chat" ? (
                    <div className="w-full space-y-3">
                      {round.errorMessage ? (
                        <SimpleSystemBubble message={round.errorMessage} />
                      ) : round.assistantPending ? (
                        <AssistantLoadingRow variant="thinking" />
                      ) : (
                        <SimpleAssistantBubble body={round.resultSummary} datetime={round.createdAt} />
                      )}
                    </div>
                  ) : (
                  <div className="w-full max-w-[780px]">
                    <div className="space-y-3.5">
                      <div className="flex items-center gap-3 text-[14px] font-medium text-[#303734]">
                        <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#171717] text-white shadow-[0_14px_32px_rgba(23,23,23,0.18)]">
                          <Bot className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="text-[15px] font-semibold text-[#1f2421]">LinkData</div>
                        </div>
                      </div>

                      {round.assistantPending &&
                      round.executionGroups.length === 0 &&
                      !round.executionSteps?.length ? (
                        <AssistantLoadingRow variant="task" />
                      ) : null}

                      <div className="space-y-2 px-1" data-testid="agent-split-section">
                        <div className="text-[14px] font-semibold text-[#202124]">任务拆分</div>
                        <div className="space-y-2 text-[13px] leading-6.5 text-[#4f5753]">
                          {round.splitItems.map((item, itemIndex) => (
                            <div key={item} className="flex gap-2">
                              <span className="pt-[1px] text-[#9aa39e]">{itemIndex + 1}.</span>
                              <p className="min-w-0 flex-1">{item.replace(/^\d+[）)]\s*/, "")}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {executionExpanded ? (
                        <div className="rounded-[20px] border border-[#eceef1] bg-[#fcfcfd] px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.03)]" data-testid="agent-execution-panel">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <div className="text-[16px] font-semibold tracking-[-0.02em] text-[#1f2421]">任务执行</div>
                            </div>
                            <div className="flex items-center">
                              {round.collapseExecution ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExecutionCardExpandedByRound((current) => ({
                                      ...current,
                                      [round.roundId]: false,
                                    }))
                                  }
                                  aria-label="收起任务执行"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#e5e7eb] bg-white text-[#303734]"
                                >
                                  <ChevronDown className="h-4 w-4" />
                                </button>
                              ) : null}
                            </div>
                          </div>

                          <div className="mt-4 space-y-3">
                            {round.executionSteps?.length ? (
                              <PlatformRoundStepTimeline
                                executionSteps={round.executionSteps}
                                platformSubtasks={round.platformSubtasks}
                                panelSubtaskFocus={panelSubtaskFocus}
                                runId={run.id}
                                setPanelSubtaskFocus={setPanelSubtaskFocus}
                                setPanelVisibility={setPanelVisibility}
                              />
                            ) : (
                              <>
                                {round.executionGroups.map((group) => (
                                  <div key={group.id} className="space-y-2.5">
                                    {group.tools.map((tool) => (
                                      <ToolCard
                                        key={tool.id}
                                        title={tool.title}
                                        detail={tool.detail}
                                        tone={tool.tone}
                                        onAction={
                                          tool.previewId
                                            ? () => {
                                                demoActions.setActivePreview(run.id, tool.previewId!);
                                                setPreviewOverrides((current) => ({
                                                  ...current,
                                                  [run.id]: tool.previewId!,
                                                }));
                                                setPanelVisibility((current) => ({ ...current, [run.id]: true }));
                                              }
                                            : undefined
                                        }
                                      />
                                    ))}
                                  </div>
                                ))}
                                {round.executionGroups.length === 0 && !round.assistantPending ? (
                                  <div className="rounded-[18px] border border-dashed border-[#e5e7eb] bg-[#fcfcfd] px-4 py-5 text-[13px] leading-7 text-[#6c7571]">
                                    正在为这轮任务准备执行节点，稍后会把关键过程同步到这里。
                                  </div>
                                ) : null}
                              </>
                            )}
                          </div>
                        </div>
                      ) : (
                        <>
                          <CollapsedStatusRow
                            title={round.errorMessage ? "任务执行失败" : "任务已完成"}
                            expanded={false}
                            onClick={() =>
                              setExecutionCardExpandedByRound((current) => ({
                                ...current,
                                [round.roundId]: true,
                              }))
                            }
                            testId="agent-execution-summary-bar"
                          />
                          {round.executionSteps?.length ? (
                            <div className="mt-3 px-1">
                              <PlatformRoundStepTimeline
                                executionSteps={round.executionSteps}
                                platformSubtasks={round.platformSubtasks}
                                panelSubtaskFocus={panelSubtaskFocus}
                                runId={run.id}
                                setPanelSubtaskFocus={setPanelSubtaskFocus}
                                setPanelVisibility={setPanelVisibility}
                              />
                            </div>
                          ) : null}
                        </>
                      )}

                      {round.errorMessage ? <p className="text-sm text-red-600">{round.errorMessage}</p> : null}

                      {round.showTaskResultInChat && (run.activePreviewId || latestRoundWantsTaskPanel) ? (
                        <TaskResultSummaryCard
                          title={compactText(round.resultTitle, 48)}
                          summary={compactText(round.resultSummary, 220)}
                          hasResult={round.hasResult}
                          expanded={taskPanelOpen}
                          onToggle={() => {
                            if (!latestRoundWantsTaskPanel && !run.activePreviewId) return;
                            const currentOpen = panelVisibility[run.id] ?? false;
                            const next = !currentOpen;
                            if (next && run.activePreviewId) {
                              demoActions.setActivePreview(run.id, run.activePreviewId);
                              setPreviewOverrides((current) => ({ ...current, [run.id]: run.activePreviewId! }));
                            }
                            setPanelVisibility((current) => ({ ...current, [run.id]: next }));
                          }}
                        />
                      ) : null}
                    </div>
                  </div>
                  )}

                  {index < roundModels.length - 1 ? <div className="border-b border-dashed border-[#e5e7eb]" /> : null}
                </div>
                );
              })}
            </div>

            <div className="flex items-center gap-1 text-[#8a97a8]">
                <Button aria-label="继续追问" variant="ghost" size="icon" className="h-8 w-8 rounded-[10px]" onClick={() => handleFeedback("需要继续")}>
                  <ListRestart className="h-4 w-4" />
                </Button>
                <Button aria-label="反馈喜欢" variant="ghost" size="icon" className="h-8 w-8 rounded-[10px]" onClick={() => handleFeedback("喜欢")}>
                  <ThumbsUp className="h-4 w-4" />
                </Button>
                <Button aria-label="反馈不喜欢" variant="ghost" size="icon" className="h-8 w-8 rounded-[10px]" onClick={() => handleFeedback("不喜欢")}>
                  <ThumbsDown className="h-4 w-4" />
                </Button>
                <Button aria-label="添加会话备注" variant="ghost" size="icon" className="h-8 w-8 rounded-[10px]" onClick={() => setNotice("评论接口入口已预留。")}>
                  <MessageCircleMore className="h-4 w-4" />
                </Button>
            </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 bg-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
          <div className={cn("mx-auto w-full", SIMPLE_CHAT_COLUMN_MAX)}>
            <TaskComposer
              key={`${run.id}-${currentComposerVersion}`}
              value={draft}
              onValueChange={setDraft}
              placeholder="继续追问，或通过 @ 选择要执行的数据源"
              mode={composerMode}
              onModeChange={(mode) =>
                setComposerModes((current) => ({
                  ...current,
                  [run.id]: mode,
                }))
              }
              templates={templates}
              selectedSourceIds={selectedSourceIds}
              onToolSelect={applyCapability}
              onSourceRemove={removeCapability}
              onTemplateSelect={applyTemplate}
              onFilesSelected={handleFilesSelected}
              onSubmit={() => {
                if (run.status !== "running") {
                  void appendNote();
                }
              }}
              containerClassName="overflow-visible rounded-[18px] border border-[#dde4ef] bg-[rgba(255,255,255,0.98)] shadow-[0_16px_36px_rgba(163,177,198,0.12)]"
              textareaClassName="min-h-[84px] max-h-[12em] min-w-[180px] flex-1 overflow-y-auto whitespace-pre-wrap break-words border-0 bg-transparent px-1 py-2 pr-2 text-[15px] leading-7 text-[#324357] caret-[#324357] outline-none shadow-none scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-zinc-300 focus-visible:outline-none focus-visible:ring-0 focus-visible:[box-shadow:none!important]"
              sendButtonClassName="h-9 w-9 rounded-[10px]"
            />

            <div className="mt-3 text-center text-xs text-[#92a0b2]">内容由 AI 大模型生成，请仔细甄别</div>
          </div>
        </div>
      </div>
    </MoreDataShell>
  );
}
