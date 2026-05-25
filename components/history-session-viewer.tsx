"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { UserRound } from "@/components/ui/tabler-icons";

import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { formatAgentApiErrorForUser, listSessionMessages } from "@/lib/agent-api/client";
import {
  createStreamingAssistantMessage,
  isStreamingAssistantMessage,
  sendSessionMessageStream,
} from "@/lib/session-chat-send";
import type { ChatSendResult, SessionMessageItem } from "@/lib/agent-api/types";
import { safeRandomUUID } from "@/lib/random-uuid";
import { SimpleAssistantBubble } from "@/components/agent-workspace/chat-bubbles";
import { AssistantLoadingRow } from "@/components/assistant-loading-row";
import { MoreDataShell, useMoreDataShellState } from "@/components/more-data-shell";
import { compactText } from "@/components/agent-workspace-view-models";
import { AgentTaskResultPanel } from "@/components/agent-task-result-panel";
import { TaskComposer } from "@/components/task-composer";
import type { PlatformTaskArtifactRef } from "@/lib/agent-events";
import { TaskResultSummaryCard } from "@/components/task-result-summary-card";
import { TaskExecutionStepsAssistantBubble } from "@/components/task-execution-steps-assistant-bubble";
import { parseTaskExecutionStepsFromMeta } from "@/lib/task-execution-steps-meta";
import {
  isSupersededTaskExecutionStepsMessage,
  messageIdsEligibleForTaskResultCard,
} from "@/lib/session-task-result-card-visibility";
import { extractDecompositionLabelsFromMessages } from "@/lib/parse-decomposition-labels";
import { buildTaskStepsFromDecompositionLabels } from "@/lib/schedule-trial-execution-presentation";
import { shouldHideAssistantMessageBubble } from "@/lib/session-message-ui-filter";
import { hasTabularTaskResultFiles } from "@/lib/platform-task-artifacts";
import { useChatStickToBottom } from "@/lib/use-chat-stick-to-bottom";
import {
  enrichOrchestrationBundlesWithStepLabels,
  fetchTaskOrchestrationForResultPanel,
  mergeBundlesIntoPlatformSnapshots,
  pickBestOrchestrationAnchor,
  type TaskOrchestrationBundleRow,
} from "@/lib/merge-orchestration-task-artifacts";

const SIMPLE_CHAT_COLUMN_MAX = "max-w-[min(100%,800px)]";
const SIMPLE_CHAT_BUBBLE_MAX = "max-w-[min(100%,720px)]";

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function SimpleUserBubble({ text, datetime }: { text: string; datetime: string }) {
  return (
    <div className="flex w-full justify-end">
      <div className={`rounded-[18px] border border-[#e5e7eb] bg-white px-4 py-3 shadow-sm ${SIMPLE_CHAT_BUBBLE_MAX}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#475569]">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#0f172a] text-white">
              <UserRound className="h-3.5 w-3.5" />
            </span>
            你
          </div>
          <div className="text-[12px] text-[#858481]">{formatTime(datetime)}</div>
        </div>
        <div className="mt-2 whitespace-pre-wrap break-words text-sm text-[#0f172a]">{text}</div>
      </div>
    </div>
  );
}

function SimpleSystemBubble({ message }: { message: string }) {
  return (
    <div className="flex w-full justify-center">
      <div className={`rounded-[14px] border border-[#fee2e2] bg-[#fef2f2] px-4 py-3 text-sm text-[#991b1b] ${SIMPLE_CHAT_BUBBLE_MAX}`}>
        {message}
      </div>
    </div>
  );
}

export function HistorySessionViewer({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const platformAgent = useOptionalPlatformAgent();
  const { refreshHistory } = useMoreDataShellState();
  const isMounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<SessionMessageItem[]>([]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesInnerRef = useRef<HTMLDivElement>(null);
  const [showResultPanel, setShowResultPanel] = useState(false);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [orchestrationBundles, setOrchestrationBundles] = useState<TaskOrchestrationBundleRow[]>([]);
  const [panelSubtaskFocus, setPanelSubtaskFocus] = useState<{
    taskId: string;
    artifacts: PlatformTaskArtifactRef[];
  } | null>(null);
  const [currentBundleDownloadApi, setCurrentBundleDownloadApi] = useState<string | null>(null);
  const [currentBundleDownloadName, setCurrentBundleDownloadName] = useState<string | null>(null);
  const [currentTaskFinishedAt, setCurrentTaskFinishedAt] = useState<string | null>(null);

  const isLoggedIn = Boolean(
    platformAgent?.auth?.accessToken &&
    platformAgent?.authValidated,
  );

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, [sessionId]);

  const reload = useCallback(async () => {
    if (!platformAgent?.authValidated) return;
    setBusy(true);
    setError("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        const res = await listSessionMessages(token, sessionId, 200);
        setMessages(res.messages ?? []);
      });
    } catch (e) {
      setError(formatAgentApiErrorForUser(e));
    } finally {
      setBusy(false);
    }
  }, [platformAgent, sessionId]);

  useEffect(() => {
    // 切换会话时默认不展开右侧任务结果区
    setShowResultPanel(false);
    setFocusedTaskId(null);
    setOrchestrationBundles([]);
    setPanelSubtaskFocus(null);
    setCurrentTaskFinishedAt(null);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      router.replace("/");
      return;
    }
    if (!platformAgent) return;
    if (!platformAgent.authValidated) {
      platformAgent.openLogin("请先登录后查看历史对话。");
      router.replace("/");
      return;
    }
    platformAgent.setActivePlatformSession(sessionId);
    void reload();
  }, [platformAgent, reload, router, sessionId]);

  useChatStickToBottom(scrollRef, messagesInnerRef, [busy, messages, sending], { resetKey: sessionId });

  const title = useMemo(() => `历史对话`, []);

  const taskResultCardMessageIds = useMemo(() => messageIdsEligibleForTaskResultCard(messages), [messages]);

  const orchestrationAnchor = useMemo(() => pickBestOrchestrationAnchor(messages), [messages]);

  useEffect(() => {
    if (!orchestrationAnchor || !platformAgent?.authValidated || showResultPanel) return;
    let cancelled = false;
    void platformAgent.withFreshToken(async (token) => {
      const data = await fetchTaskOrchestrationForResultPanel(
        token,
        orchestrationAnchor.primaryTaskId,
        orchestrationAnchor.bundleTaskIds,
        { orchestrationId: orchestrationAnchor.orchestrationId },
      );
      if (!cancelled && isMounted.current) setOrchestrationBundles(data.bundles);
    });
    return () => {
      cancelled = true;
    };
  }, [orchestrationAnchor, platformAgent, showResultPanel]);

  const latestStepsMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]!;
      if (m.role !== "assistant") continue;
      const meta = m.meta && typeof m.meta === "object" ? (m.meta as Record<string, unknown>) : undefined;
      const steps = parseTaskExecutionStepsFromMeta(meta);
      if (steps && steps.length > 0) return m.id;
    }
    return null;
  }, [messages]);

  const firstAssistantIndex = useMemo(
    () => messages.findIndex((m) => m.role === "assistant"),
    [messages],
  );

  const decompositionFallbackSteps = useMemo(() => {
    if (latestStepsMessageId) return null;
    const labels = extractDecompositionLabelsFromMessages(messages);
    if (!labels.length) return null;
    const orchFailed = messages.some(
      (m) => m.role === "assistant" && /多步任务在执行过程中失败/.test(m.content || ""),
    );
    const orchCancelled = messages.some(
      (m) => m.role === "assistant" && /多步任务已由用户终止/.test(m.content || ""),
    );
    return buildTaskStepsFromDecompositionLabels(labels, sessionId, false, null, {
      multiStepOrchestration: labels.length > 1,
      orchestrationFinished: Boolean(orchestrationAnchor),
      orchestrationSuccess: !orchFailed && !orchCancelled,
    });
  }, [latestStepsMessageId, messages, orchestrationAnchor, sessionId]);

  const latestExecutionSteps = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]!;
      if (m.role !== "assistant") continue;
      const meta = m.meta && typeof m.meta === "object" ? (m.meta as Record<string, unknown>) : undefined;
      const steps = parseTaskExecutionStepsFromMeta(meta);
      if (steps && steps.length > 0) return steps;
    }
    return null;
  }, [messages]);

  const orchestrationBundlesForUi = useMemo(
    () => enrichOrchestrationBundlesWithStepLabels(orchestrationBundles, latestExecutionSteps),
    [orchestrationBundles, latestExecutionSteps],
  );

  /** 仅「有可预览表格/报告产物」的子任务才出现在底部 Sheet（无结果文件不占 tab） */
  const subtasksWithTabularPreview = useMemo(
    () =>
      orchestrationBundlesForUi
        .filter((s) => hasTabularTaskResultFiles(s.artifacts))
        .slice()
        .sort((a, b) => b.stepIndex - a.stepIndex),
    [orchestrationBundlesForUi],
  );

  const resolvedSubtaskTaskIdForPanel = useMemo(() => {
    if (subtasksWithTabularPreview.length === 0) return null;
    const fid = panelSubtaskFocus?.taskId;
    if (fid && subtasksWithTabularPreview.some((s) => s.taskId === fid)) return fid;
    return subtasksWithTabularPreview[0]!.taskId;
  }, [panelSubtaskFocus, subtasksWithTabularPreview]);

  const artifactsForTaskPanel = useMemo(() => {
    if (subtasksWithTabularPreview.length > 0) {
      const hit = subtasksWithTabularPreview.find((s) => s.taskId === resolvedSubtaskTaskIdForPanel);
      return hit?.artifacts ?? [];
    }
    const merged: PlatformTaskArtifactRef[] = [];
    for (const b of orchestrationBundles) merged.push(...b.artifacts);
    return merged;
  }, [orchestrationBundles, resolvedSubtaskTaskIdForPanel, subtasksWithTabularPreview]);

  const stepTimelineHighlightTaskId = useMemo(() => {
    if (panelSubtaskFocus?.taskId) return panelSubtaskFocus.taskId;
    if (subtasksWithTabularPreview.length > 0) return subtasksWithTabularPreview[0]!.taskId;
    const last =
      orchestrationBundlesForUi.length > 0
        ? orchestrationBundlesForUi[orchestrationBundlesForUi.length - 1]
        : undefined;
    return last?.taskId ?? null;
  }, [orchestrationBundlesForUi, panelSubtaskFocus, subtasksWithTabularPreview]);

  const setPanelVisibilityRecord = useCallback<Dispatch<SetStateAction<Record<string, boolean>>>>(
    (updater) => {
      setShowResultPanel((prevShow) => {
        const cur: Record<string, boolean> = { [sessionId]: prevShow };
        const next = typeof updater === "function" ? updater(cur) : updater;
        return Boolean(next[sessionId]);
      });
    },
    [sessionId],
  );

  const openTaskResultPanel = useCallback(
    async (taskId: string, bundleTaskIds?: string[], orchestrationId?: string | null) => {
      if (!platformAgent?.authValidated) {
        platformAgent?.openLogin("请先登录后再查看任务结果。");
        return;
      }
      const effectiveBundle =
        bundleTaskIds && bundleTaskIds.length > 0
          ? bundleTaskIds
          : orchestrationAnchor?.bundleTaskIds;
      setError("");
      try {
        await platformAgent.withFreshToken(async (token) => {
          const data = await fetchTaskOrchestrationForResultPanel(token, taskId, effectiveBundle, {
            orchestrationId: orchestrationId ?? undefined,
          });
          setOrchestrationBundles(data.bundles);
          setPanelSubtaskFocus(null);
          const ids = (effectiveBundle ?? []).map((x) => (x || "").trim()).filter(Boolean);
          const api =
            ids.length > 0
              ? `/api/tasks/download?` + ids.map((id) => `task_ids=${encodeURIComponent(id)}`).join("&")
              : `/api/tasks/${encodeURIComponent(taskId)}/download`;
          setCurrentBundleDownloadApi(api);
          setCurrentBundleDownloadName(ids.length > 1 ? `${taskId}.zip` : null);
          setCurrentTaskFinishedAt(data.finishedAt);
          setFocusedTaskId(taskId);
          setShowResultPanel(true);
        });
      } catch (e) {
        setError(formatAgentApiErrorForUser(e));
      }
    },
    [orchestrationAnchor, platformAgent],
  );

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    if (!platformAgent?.authValidated) {
      platformAgent?.openLogin("请先登录后再发送消息。");
      return;
    }
    setSending(true);
    setError("");
    const nowIso = new Date().toISOString();
    const optimisticUser: SessionMessageItem = {
      id: `optimistic_user_${safeRandomUUID()}`,
      role: "user",
      content: text,
      created_at: nowIso,
      message_index: 0,
      meta: {},
    };
    const mid = safeRandomUUID();
    const assistantStreamId = `streaming_assistant_${mid}`;
    setMessages((cur) => [
      ...cur,
      optimisticUser,
      createStreamingAssistantMessage(assistantStreamId, nowIso),
    ]);
    setDraft("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        const res: ChatSendResult = await sendSessionMessageStream(
          token,
          sessionId,
          text,
          mid,
          setMessages,
          assistantStreamId,
        );
        if (res.kind === "completed") {
          await reload();
          return;
        }
        if (res.kind === "accepted") {
          // 工具任务异步执行：先提示用户，再刷新一次消息（后端已写入 assistant 文本）
          setMessages((cur) => [
            ...cur,
            {
              id: `optimistic_sys_${safeRandomUUID()}`,
              role: "system",
              content: `任务已受理：${res.task_id}（后台执行中）`,
              created_at: new Date().toISOString(),
              message_index: 0,
              meta: {},
            },
          ]);
          await reload();
          return;
        }
        if (res.kind === "blocked") {
          await reload();
        }
      });
    } catch (e) {
      setError(formatAgentApiErrorForUser(e));
      // 即使 500，后端也会把“用户消息 + 错误提示”写入 session_messages，所以这里刷新即可看到真实落库结果
      await reload();
    } finally {
      setSending(false);
      void refreshHistory();
    }
  }, [draft, platformAgent, reload, refreshHistory, sending, sessionId]);

  return (
    <MoreDataShell
      currentPath={`/history/${sessionId}`}
      currentRunLabel={title}
      contentScrollMode="child"
      rightRail={
        showResultPanel && platformAgent?.withFreshToken ? (
          <AgentTaskResultPanel
            artifacts={artifactsForTaskPanel}
            withFreshToken={platformAgent.withFreshToken}
            bundleDownloadApi={currentBundleDownloadApi}
            bundleDownloadName={currentBundleDownloadName}
            taskId={resolvedSubtaskTaskIdForPanel ?? focusedTaskId}
            resultGeneratedAt={currentTaskFinishedAt}
            subtaskResultTabs={
              subtasksWithTabularPreview.length > 1
                ? subtasksWithTabularPreview.map((s) => ({
                    taskId: s.taskId,
                    label: compactText(s.label, 36),
                  }))
                : undefined
            }
            activeSubtaskTaskId={resolvedSubtaskTaskIdForPanel}
            onSubtaskSelect={(tid) => {
              const row = orchestrationBundlesForUi.find((s) => s.taskId === tid);
              if (row && hasTabularTaskResultFiles(row.artifacts)) {
                setPanelSubtaskFocus({ taskId: tid, artifacts: row.artifacts });
              }
            }}
            onClose={() => {
              setShowResultPanel(false);
              setFocusedTaskId(null);
              setPanelSubtaskFocus(null);
              setCurrentBundleDownloadApi(null);
              setCurrentBundleDownloadName(null);
              setCurrentTaskFinishedAt(null);
            }}
          />
        ) : undefined
      }
    >
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-transparent">
        <div ref={scrollRef} className="hide-scrollbar-y min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-4 pt-6 sm:px-6">
          <div ref={messagesInnerRef} className={`mx-auto w-full ${SIMPLE_CHAT_COLUMN_MAX}`}>
            <div className="space-y-5">
              {error ? <SimpleSystemBubble message={`加载/发送失败：${error}`} /> : null}
              {!isLoggedIn ? <SimpleSystemBubble message="未登录" /> : null}
              {busy ? <SimpleSystemBubble message="加载中…" /> : null}
              {!busy && isLoggedIn && messages.length === 0 ? <SimpleSystemBubble message="该会话暂无消息" /> : null}

              <div className="space-y-4">
                {messages.map((m, i) => {
                  const meta = m.meta && typeof m.meta === "object" ? (m.meta as Record<string, unknown>) : undefined;
                  const taskStepsFromMessage = parseTaskExecutionStepsFromMeta(meta);
                  if (
                    isSupersededTaskExecutionStepsMessage(m, latestStepsMessageId, taskStepsFromMessage)
                  ) {
                    return null;
                  }
                  const isThisOrchestrationTurn = m.role === "assistant" && i === firstAssistantIndex;
                  const taskSteps =
                    taskStepsFromMessage ??
                    (isThisOrchestrationTurn ? decompositionFallbackSteps : null);
                  const showTaskStepsBubble = Boolean(taskSteps && taskSteps.length > 0);
                  const rawTaskId = typeof meta?.task_id === "string" ? meta.task_id.trim() : "";
                  const rawBundle = Array.isArray(meta?.orchestration_step_task_ids)
                    ? (meta?.orchestration_step_task_ids as unknown[])
                    : [];
                  const bundleTaskIds = rawBundle
                    .map((x) => (typeof x === "string" ? x.trim() : ""))
                    .filter((x) => x.length > 0);
                  const orchIdMeta =
                    typeof meta?.orchestration_id === "string" && meta.orchestration_id.trim()
                      ? meta.orchestration_id.trim()
                      : null;
                  const taskId =
                    m.role === "assistant" && rawTaskId && taskResultCardMessageIds.has(m.id) ? rawTaskId : undefined;
                  const hideAssistantBubble = shouldHideAssistantMessageBubble(m);
                  const key = m.id;
                  return (
                    <div key={key} className="space-y-2">
                      {m.role === "user" ? (
                        <SimpleUserBubble text={m.content} datetime={m.created_at} />
                      ) : m.role === "assistant" ? (
                        showTaskStepsBubble ? (
                          <TaskExecutionStepsAssistantBubble
                            steps={taskSteps!}
                            datetime={m.created_at}
                            platformSubtasks={
                              (m.id === latestStepsMessageId || isThisOrchestrationTurn) &&
                              orchestrationBundlesForUi.length > 0
                                ? mergeBundlesIntoPlatformSnapshots(taskSteps!, orchestrationBundlesForUi)
                                : undefined
                            }
                            timelineRunId={sessionId}
                            activeHighlightTaskId={stepTimelineHighlightTaskId}
                            setPanelSubtaskFocus={setPanelSubtaskFocus}
                            setPanelVisibility={setPanelVisibilityRecord}
                          />
                        ) : hideAssistantBubble ? null : (
                          <SimpleAssistantBubble
                            body={m.content}
                            datetime={m.created_at}
                            streaming={isStreamingAssistantMessage(m)}
                          />
                        )
                      ) : (
                        <SimpleSystemBubble message={m.content} />
                      )}
                      {taskId ? (
                        <TaskResultSummaryCard
                          title="任务结果"
                          summary="该轮任务已完成，可在右侧查看任务结果与数据文件。"
                          expanded={showResultPanel && focusedTaskId === taskId}
                          onToggle={() => {
                            if (showResultPanel && focusedTaskId === taskId) {
                              setShowResultPanel(false);
                              setFocusedTaskId(null);
                              setPanelSubtaskFocus(null);
                              return;
                            }
                            void openTaskResultPanel(
                              taskId,
                              bundleTaskIds.length > 0
                                ? bundleTaskIds
                                : orchestrationAnchor?.bundleTaskIds,
                              orchIdMeta ?? orchestrationAnchor?.orchestrationId,
                            );
                          }}
                        />
                      ) : null}
                    </div>
                  );
                })}
                {sending && !messages.some(isStreamingAssistantMessage) ? (
                  <AssistantLoadingRow variant="thinking" />
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-transparent px-4 py-4 sm:px-6">
          <div className={`mx-auto w-full ${SIMPLE_CHAT_COLUMN_MAX}`}>
            <TaskComposer
              value={draft}
              onValueChange={setDraft}
              placeholder="您可以继续追问或者让我做其他工作哦～"
              mode="普通模式"
              onModeChange={() => {}}
              selectedSourceIds={[]}
              onToolSelect={() => {}}
              onSourceRemove={() => {}}
              onFilesSelected={() => {}}
              onSubmit={() => void send()}
              visualStyle="default"
              containerClassName="overflow-visible rounded-[18px] border border-[#e2e2df] bg-white shadow-[0_1px_2px_rgba(17,17,17,0.03)]"
              textareaClassName="min-h-[84px] max-h-[12em] min-w-[180px] flex-1 overflow-y-auto whitespace-pre-wrap break-words border-0 bg-transparent px-1 py-2 pr-2 text-[14px] leading-6 text-[#34322d] caret-[#34322d] outline-none shadow-none scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-zinc-300 focus-visible:outline-none focus-visible:ring-0 focus-visible:[box-shadow:none!important]"
              placeholderClassName="top-[8px] text-[14px] text-[#858481]"
            />
          </div>
        </div>
      </div>
    </MoreDataShell>
  );
}
