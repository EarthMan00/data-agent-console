"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AssistantLoadingRow } from "@/components/assistant-loading-row";
import { TaskExecutionStepsAssistantBubble } from "@/components/task-execution-steps-assistant-bubble";
import { AliceShell } from "@/components/alice-shell";
import { AgentTaskResultPanel } from "@/components/agent-task-result-panel";
import { TaskResultSummaryCard } from "@/components/task-result-summary-card";
import { TaskComposer } from "@/components/task-composer";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { useAliceShellState } from "@/components/alice-shell";
import { compactText } from "@/components/agent-workspace-view-models";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  deleteTaskSession,
  ensurePostTaskGuidance,
  formatAgentApiErrorForUser,
  getTask,
  getToolOrchestration,
  listSessionMessages,
  patchTaskExecutionSteps,
  postTaskTerminatedMessage,
  cancelToolOrchestration,
  cancelTask,
} from "@/lib/agent-api/client";
import { getChatMessageMaxChars } from "@/lib/agent-api/config";
import type { ChatSendResult, SessionMessageItem, TaskResponse, ToolOrchestrationStepApi } from "@/lib/agent-api/types";
import {
  createStreamingAssistantMessage,
  isStreamingAssistantMessage,
  mergeFreshMessagesWithLocalPending,
  OPTIMISTIC_USER_MESSAGE_ID_PREFIX,
  sendSessionMessageStream,
  STREAMING_ASSISTANT_MESSAGE_ID_PREFIX,
  sessionHasAssistantThinkingPlaceholder,
  sessionHasVisibleInFlightAssistant,
  shouldShowAssistantThinkingPlaceholder,
} from "@/lib/session-chat-send";
import { AGENT_COMPOSER_PREFILL_STORAGE_KEY } from "@/lib/agent-api/session";
import {
  appendToComposerDraft,
  composerDraftContainsSuggestion,
  type ComposerSourcePlacement,
  parseComposerPrefillStorageValue,
  removeFromComposerDraft,
} from "@/lib/composer-prefill";
import { useHomeDataSourceMenu } from "@/lib/use-home-data-source-menu";
import type { TaskExecutionStep, TaskExecutionStepStatus } from "@/lib/agent-events";
import { mapServerOrchestrationStepStatus } from "@/lib/agent-runtime/task-mapping";
import type { ScheduleTrialSendState } from "@/lib/schedule-create-draft";
import {
  isScheduleTrialAwaitingFirstMessage,
  loadScheduleCreateDraft,
  loadScheduleTrialMeta,
  saveScheduleTrialMeta,
  tryClaimScheduleTrialFirstSend,
} from "@/lib/schedule-create-draft";
import {
  isHomeSessionLaunchAwaitingFirstMessage,
  loadHomeSessionLaunchMeta,
  saveHomeSessionLaunchMeta,
  takeHomeSessionLaunchFiles,
  tryClaimHomeSessionLaunchFirstSend,
} from "@/lib/home-session-launch";
import { takeScheduleTrialAttachmentFiles } from "@/lib/schedule-trial-attachment-files";
import { saveScheduleTasksWithDraft } from "@/lib/save-schedule-from-draft";
import { buildTaskStepsFromDecompositionLabels } from "@/lib/schedule-trial-execution-presentation";
import { parseTaskExecutionStepsFromMeta } from "@/lib/task-execution-steps-meta";
import {
  buildLatestStepsMessageIdByTaskId,
  isSupersededTaskExecutionStepsMessage,
  messageIdsEligibleForTaskResultCard,
} from "@/lib/session-task-result-card-visibility";
import {
  extractDecompositionLabelsFromMessages,
  findLatestDecompositionAssistantIndex,
} from "@/lib/parse-decomposition-labels";
import { resolvePostTaskGuidancePresentation, resolveTaskTerminatedPresentation } from "@/lib/parse-post-task-guidance";
import {
  buildPostTaskGuidanceLeadingByMessageId,
  resolveInteractiveGuidanceMessageId,
  resolveRoundPostTaskGuidanceContent,
  resolveRoundTaskOutcomeSummary,
  shouldDeferPostTaskGuidanceToStepsBubble,
  shouldDeferTaskTerminatedToStepsBubble,
  shouldRenderGuidanceBubbleAtMessage,
  shouldSuppressPlainAssistantBubbleForGuidance,
  shouldSuppressStandaloneTaskResultCard,
} from "@/lib/guidance-interactivity";
import {
  isUserTerminatedTaskState,
  sessionHasTaskTerminatedForTask,
  sessionHasTaskTerminatedMessage,
  TASK_TERMINATED_GUIDANCE_BLOCK,
  TASK_TERMINATED_LEADING,
} from "@/lib/task-terminated-presentation";
import { shouldHideAssistantMessageBubble } from "@/lib/session-message-ui-filter";
import {
  analyzeSessionClarificationFlow,
  shouldSuppressSessionClarificationAt,
} from "@/lib/session-clarification-flow";
import { safeRandomUUID } from "@/lib/random-uuid";
import { hasTabularTaskResultFiles, shouldShowTaskResultEntryCard } from "@/lib/platform-task-artifacts";
import {
  alignStepsWithBundlesForReplay,
  buildBundleDownloadApiForPanel,
  enrichOrchestrationBundlesWithStepLabels,
  fetchTaskOrchestrationForResultPanel,
  filterOrchestrationBundlesForTaskIds,
  mergeBundlesIntoPlatformSnapshots,
  orchestrationBundlesForTaskResultCard,
  pickBestOrchestrationAnchor,
  resolvePanelAnchorForMessage,
  resolvePanelAnchorForStepsMessage,
  taskArtifactsFromSnapshot,
  type OrchestrationAnchor,
  type PanelOrchestrationAnchor,
  type ResultPanelContext,
  type TaskOrchestrationBundleRow,
} from "@/lib/merge-orchestration-task-artifacts";
import { pollAcceptedPlatformTaskInSession } from "@/lib/session-accepted-task-poll";
import {
  isTaskInFlight,
  SCHEDULE_TRIAL_SESSION_RELOAD_INTERVAL_MS,
  SCHEDULE_TRIAL_TASK_POLL_INTERVAL_MS,
} from "@/lib/task-status-poll";
import { cn } from "@/lib/utils";

import { buildUserMessageAttachmentsFromFiles, parseUserMessageAttachments } from "@/lib/user-message-attachments";
import { readSessionMessageCache, writeSessionMessageCache } from "@/lib/session-message-cache";
import {
  registerStream,
  updateStreamContent,
  completeStream,
  getStreamState,
  subscribe as subscribeToStream,
  releaseStream,
} from "@/lib/streaming-session-manager";
import {
  findLatestTaskExecutionStepsMessage,
  sessionExecutionCanStop,
} from "@/lib/session-execution-stop";

import { useChatStickToBottom } from "@/lib/use-chat-stick-to-bottom";
import { PostTaskGuidanceBubble } from "./post-task-guidance-bubble";
import {
  AssistantOutputFrame,
  AliceErrorBubble,
  AliceMessageBubble,
  SIMPLE_CHAT_COLUMN_MAX,
  SimpleAssistantBubble,
  SimpleUserBubble,
} from "./chat-bubbles";
import { sanitizeClarificationForUserDisplay } from "@/lib/alice-clarification";
import { sessionHasOrchestrationFailure } from "@/lib/orchestration-failure-message";
import {
  enrichStepsRuntimeFromBundles,
  hydrateTaskExecutionMessagesFromLiveState,
  enrichTaskExecutionStepsRuntime,
} from "@/lib/session-task-execution-step-resolver";
import { getLiveSessionPrimaryTaskPollStrategy } from "@/lib/session-live-status-poll";
import { sessionHasTaskCompletionSummaryMessage } from "@/lib/resolve-post-task-guidance-text";

function mergeTaskStepStatuses(
  steps: TaskExecutionStep[],
  overlay: TaskExecutionStepStatus[] | null,
): TaskExecutionStep[] {
  if (!overlay?.length) return steps;
  return steps.map((s, i) => (overlay[i] ? { ...s, status: overlay[i]! } : s));
}

function bundleTaskIdsExpectedForAnchor(
  anchor: OrchestrationAnchor | PanelOrchestrationAnchor | null,
  fallbackTaskId?: string,
): string[] | null {
  const fromBundle = (anchor?.bundleTaskIds ?? []).map((id) => id.trim()).filter(Boolean);
  if (fromBundle.length > 0) return fromBundle;
  const primary = (anchor?.primaryTaskId ?? fallbackTaskId ?? "").trim();
  return primary ? [primary] : null;
}

function sameTrimmedValue(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim() === (b ?? "").trim();
}

function resultPanelContextMatchesAnchor(
  context: ResultPanelContext | null | undefined,
  anchor: OrchestrationAnchor | PanelOrchestrationAnchor | null | undefined,
): boolean {
  if (!context || !anchor) return false;
  const contextOrchId = (context.orchestrationId ?? "").trim();
  const anchorOrchId = (anchor.orchestrationId ?? "").trim();
  if (contextOrchId || anchorOrchId) {
    return contextOrchId.length > 0 && contextOrchId === anchorOrchId;
  }
  return sameTrimmedValue(context.primaryTaskId, anchor.primaryTaskId);
}

function executionBubbleContextForMessage(
  messages: SessionMessageItem[],
  meta: Record<string, unknown> | undefined,
  orchestrationBundles: TaskOrchestrationBundleRow[],
  fallbackExpectedTaskIds: string[] | null,
): { bundles: TaskOrchestrationBundleRow[]; expectedTaskIds: string[] | null } {
  if (!meta || !parseTaskExecutionStepsFromMeta(meta)?.length) {
    return { bundles: orchestrationBundles, expectedTaskIds: fallbackExpectedTaskIds };
  }
  const anchor = resolvePanelAnchorForStepsMessage(messages, meta);
  const fallbackTaskId = typeof meta.task_id === "string" ? meta.task_id.trim() : undefined;
  const expected =
    bundleTaskIdsExpectedForAnchor(
      anchor
        ? {
            primaryTaskId: anchor.primaryTaskId,
            bundleTaskIds: anchor.bundleTaskIds,
            orchestrationId: anchor.orchestrationId,
          }
        : null,
      fallbackTaskId,
    ) ?? fallbackExpectedTaskIds;
  return {
    bundles: filterOrchestrationBundlesForTaskIds(orchestrationBundles, expected),
    expectedTaskIds: expected,
  };
}

function orchestrationBundlesAllTerminal(bundles: TaskOrchestrationBundleRow[]): boolean {
  if (bundles.length === 0) return false;
  return !bundles.some((b) => {
    const s = (b.taskStatus ?? "").toUpperCase();
    return s === "RUNNING" || s === "PENDING" || s === "QUEUED";
  });
}

function prepareExecutionStepsForBubble(
  steps: TaskExecutionStep[],
  options: {
    bundles: TaskOrchestrationBundleRow[];
    expectedTaskIds: string[] | null;
    liveOverlay: TaskExecutionStepStatus[] | null;
    orchestrationSteps?: ToolOrchestrationStepApi[] | null;
    inFlightTask?: TaskResponse | null;
  },
): TaskExecutionStep[] {
  const aligned =
    options.bundles.length > 0
      ? alignStepsWithBundlesForReplay(steps, options.bundles, options.expectedTaskIds)
      : steps;
  const merged = mergeTaskStepStatuses(aligned, options.liveOverlay);
  const withOrchRuntime = enrichTaskExecutionStepsRuntime(merged, {
    task: options.inFlightTask,
    orchestrationSteps: options.orchestrationSteps,
  });
  return enrichStepsRuntimeFromBundles(withOrchRuntime, options.bundles);
}

export function PlatformSessionAgentWorkspace({
  sessionId,
  scheduleTrial = false,
  scheduledRunRecord = false,
  runLabel,
  fallbackTaskId,
}: {
  sessionId: string;
  /** 从定时任务「试跑」进入：隐藏输入框，展示上一步/保存/终止。 */
  scheduleTrial?: boolean;
  /** 从定时任务「运行记录-查看过程」进入：只读回放，样式与正常对话一致，不可追问。 */
  scheduledRunRecord?: boolean;
  runLabel?: string;
  /** 运行记录 meta 中的 skill task_id，用于拉取编排产物（消息 meta 缺省时） */
  fallbackTaskId?: string;
}) {
  const platformAgent = useOptionalPlatformAgent();
  const { refreshHistoryNow, setActiveSessionTitle } = useAliceShellState();
  const router = useRouter();
  const isMounted = useRef(true);
  const abortPollRef = useRef(false);
  const sseAbortRef = useRef<AbortController | null>(null);
  const sessionGenRef = useRef(0);
  /** manager 订阅已推送到 UI 的字符数（用于 chunk 兜底追赶起点） */
  const contentLenRef = useRef(0);
  const [busy, setBusy] = useState(false);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [sourcePlacements, setSourcePlacements] = useState<ComposerSourcePlacement[]>([]);
  const {
    dataSourceGroups: composerDataSourceGroups,
    dataSourceItems: composerDataSourceItems,
    loaded: composerDataSourceMenuLoaded,
  } = useHomeDataSourceMenu({ logLabel: "[session-source-menu-capabilities]" });
  const toggleGuidanceSuggestion = useCallback((item: string) => {
    setDraft((current) =>
      composerDraftContainsSuggestion(current, item)
        ? removeFromComposerDraft(current, item)
        : appendToComposerDraft(current, item),
    );
  }, []);
  const [messages, setMessages] = useState<SessionMessageItem[]>([]);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const messagesInnerRef = useRef<HTMLDivElement>(null);
  const [messagesScrolled, setMessagesScrolled] = useState(false);
  const [showResultPanel, setShowResultPanel] = useState(false);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [resultPanelContext, setResultPanelContext] = useState<ResultPanelContext | null>(null);
  const [orchestrationBundles, setOrchestrationBundles] = useState<TaskOrchestrationBundleRow[]>([]);
  const [supplementalBundlesById, setSupplementalBundlesById] = useState<Record<string, TaskOrchestrationBundleRow[]>>({});
  const fetchedSupplementalRef = useRef<Set<string>>(new Set());
  const [lastTaskSnapshot, setLastTaskSnapshot] = useState<TaskResponse | null>(null);
  const [trialOrchestrationDone, setTrialOrchestrationDone] = useState<{
    finished: boolean;
    success: boolean;
  } | null>(null);
  const trialAutoOpenedPanelRef = useRef(false);
  const scheduledRunAutoOpenedPanelRef = useRef(false);
  /** 用户在本会话内 send 触发的任务完成后，自动展开右侧结果面板（与首页新建任务行为一致） */
  const pendingSessionResultAutoOpenRef = useRef(false);
  const sessionResultAutoFollowRef = useRef(false);
  const sessionResultAutoFollowInitializedRef = useRef(false);
  const trialPrefetchAnchorRef = useRef<string | null>(null);
  const trialDoneReloadedRef = useRef(false);
  const trialClarificationReloadedRef = useRef(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [trialRunInFlight, setTrialRunInFlight] = useState(() => {
    if (!scheduleTrial) return false;
    const m = loadScheduleTrialMeta();
    if (m && m.sendKind === "accepted" && m.taskId) return true;
    return false;
  });
  const [liveOrchClarification, setLiveOrchClarification] = useState<{
    message: string;
    shareUrl: string | null;
  } | null>(null);
  const [liveOrchStepStatuses, setLiveOrchStepStatuses] = useState<TaskExecutionStepStatus[] | null>(null);
  const [liveOrchestrationSteps, setLiveOrchestrationSteps] = useState<ToolOrchestrationStepApi[] | null>(null);
  const trialTaskId = scheduleTrial ? loadScheduleTrialMeta()?.taskId : null;

  const processStreamingMessages = useCallback((msgs: SessionMessageItem[]): SessionMessageItem[] => {
    const streamState = getStreamState(sessionId);
    return msgs.map((m) => {
      if (
        m.role === "assistant" &&
        m.meta &&
        typeof m.meta === "object" &&
        (m.meta as Record<string, unknown>).streaming === true
      ) {
        if (streamState && streamState.status === "streaming") {
          const liveContent = streamState.content || (m.content || "");
          return { ...m, content: liveContent, meta: { ...m.meta as Record<string, unknown>, streaming: true } };
        }
        const meta = { ...(m.meta as Record<string, unknown>) };
        delete (meta as Record<string, unknown>).streaming;
        const body = (m.content || "").trim();
        return { ...m, meta, content: body };
      }
      return m;
    });
  }, [sessionId]);

  const reload = useCallback(async () => {
    if (!platformAgent?.auth) return;

    setMessagesLoaded(false);
    const cached = readSessionMessageCache(sessionId);
    if (cached) {
      setMessages(processStreamingMessages(cached));
      setBusy(false);
      setError("");
    } else {
      setBusy(true);
      setError("");
    }

    try {
      await platformAgent.withFreshToken(async (token) => {
        const res = await listSessionMessages(token, sessionId, 100);
        const fresh = processStreamingMessages(res.messages ?? []);
        writeSessionMessageCache(sessionId, fresh);
        // 合并进行中的流式消息，避免 reload 冲掉 manager 推送的增量内容
        setMessages((cur) => {
          const streamState = getStreamState(sessionId);
          if (!streamState || streamState.status !== "streaming") return mergeFreshMessagesWithLocalPending(fresh, cur);
          const streamId = streamState.assistantStreamId;
          const curStreaming = cur.find((m) => m.id === streamId && isStreamingAssistantMessage(m));
          if (!curStreaming) return mergeFreshMessagesWithLocalPending(fresh, cur);
          // fresh 中无此流式条（服务端尚未落库）→ 将本地流式 + 乐观 user 追加到列表
          if (!fresh.some((m) => m.id === streamId)) {
            const userMsg = cur.find(
              (m) => m.role === "user" && m.id.startsWith(OPTIMISTIC_USER_MESSAGE_ID_PREFIX),
            );
            const tail = userMsg ? [userMsg, curStreaming] : [curStreaming];
            // 去重：避免与 fresh 中已存在的同 id 消息重复
            const freshIds = new Set(fresh.map((m) => m.id));
            const append = tail.filter((m) => !freshIds.has(m.id));
            return mergeFreshMessagesWithLocalPending([...fresh, ...append], cur);
          }
          return mergeFreshMessagesWithLocalPending(
            fresh.map((m) => (m.id === streamId ? curStreaming : m)),
            cur,
          );
        });
      });
    } catch (e) {
      if (!readSessionMessageCache(sessionId)) {
        setError(formatAgentApiErrorForUser(e));
      }
    } finally {
      setBusy(false);
      setMessagesLoaded(true);
    }
  }, [platformAgent, processStreamingMessages, sessionId]);

  useEffect(() => {
    setMessages((prev) =>
      hydrateTaskExecutionMessagesFromLiveState(prev, {
        task: lastTaskSnapshot,
        orchestrationSteps: liveOrchestrationSteps,
      }),
    );
  }, [lastTaskSnapshot, liveOrchestrationSteps]);

  // Resolve stale task_execution_steps in the background every time messages
  // are loaded, without blocking render or the session-list refresh.
  const resolveStaleRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (busy || messages.length === 0 || !platformAgent?.auth) return;
    let cancelled = false;

    const resolve = async () => {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (cancelled) return;
        const m = messages[i]!;
        if (m.role !== "assistant") continue;
        const meta =
          m.meta && typeof m.meta === "object" && !Array.isArray(m.meta)
            ? (m.meta as Record<string, unknown>)
            : undefined;
        if (!meta) continue;
        const steps = parseTaskExecutionStepsFromMeta(meta);
        if (!steps?.length) continue;
        if (steps.every((s) => s.status === "done" || s.status === "error")) continue;
        const tid = typeof meta.task_id === "string" ? meta.task_id.trim() : "";
        if (!tid) continue;
        // Skip messages we already resolved this session cycle
        if (resolveStaleRef.current.has(m.id)) continue;

        try {
          await platformAgent.withFreshToken(async (token) => {
            if (cancelled) return;
            let resolved: typeof steps | null = null;
            const orchId =
              typeof meta.orchestration_id === "string" && meta.orchestration_id.trim()
                ? meta.orchestration_id.trim()
                : null;

            if (orchId) {
              // 编排任务：按编排实际状态逐步骤映射，避免单 task 终态覆盖全部步骤
              try {
                const orch = await getToolOrchestration(token, orchId);
                if (cancelled) return;
                const orchStatuses = orch.steps.map((st) => st.status);
                if (orchStatuses.length === steps.length) {
                  const nowIso = new Date().toISOString();
                  resolved = steps.map((s, idx) => {
                    const newStatus = mapServerOrchestrationStepStatus(orchStatuses[idx]!);
                    const wasRunning = s.status === "running" || s.status === "awaiting_input";
                    const becomesRunning = newStatus === "running" || newStatus === "awaiting_input";
                    return {
                      ...s,
                      status: newStatus,
                      runtimeStartedAt:
                        s.runtimeStartedAt || (!wasRunning && becomesRunning ? nowIso : undefined),
                    };
                  });
                }
                // 始终将当前编排状态持久化，避免 reload 回退到过期状态
                try {
                  await patchTaskExecutionSteps(token, sessionId, m.id, {
                    round_id: (meta.round_id as string) || "",
                    task_id: tid,
                    steps: (resolved ?? steps).map((s) => ({
                      id: s.id,
                      label: s.label,
                      status: s.status,
                      ...(s.runtimeStartedAt ? { runtime_started_at: s.runtimeStartedAt } : {}),
                    })),
                    orchestration_id: orchId,
                  });
                } catch {
                  /* best-effort */
                }
              } catch {
                /* 编排可能已结束 */
              }
            } else {
              // 单任务：按 task 状态覆盖
              const task = await getTask(token, tid);
              if (cancelled) return;

              if (task.status === "SUCCESS") {
                resolved = steps.map((s) => ({ ...s, status: "done" as TaskExecutionStepStatus }));
              } else if (
                task.status === "FAILED" ||
                task.status === "CANCELLED" ||
                task.status === "TIMEOUT"
              ) {
                resolved = steps.map((s) => ({ ...s, status: "error" as TaskExecutionStepStatus }));
              } else if (task.status === "RUNNING") {
                resolved = steps.map((s, idx) => ({
                  ...s,
                  status: idx === 0 && s.status !== "error" ? ("running" as TaskExecutionStepStatus) : s.status,
                  runtimeStartedAt: s.runtimeStartedAt ?? (idx === 0 ? task.started_at : undefined),
                }));
              }

              if (!resolved) return;

              if (
                task.status === "SUCCESS" ||
                task.status === "FAILED" ||
                task.status === "CANCELLED" ||
                task.status === "TIMEOUT"
              ) {
                try {
                  await patchTaskExecutionSteps(token, sessionId, m.id, {
                    round_id: (meta.round_id as string) || "",
                    task_id: tid,
                    steps: resolved.map((s) => ({
                      id: s.id,
                      label: s.label,
                      status: s.status,
                    })),
                    orchestration_id: null,
                  });
                } catch {
                  /* best-effort */
                }
              }
            }

            if (cancelled) return;
            if (!resolved) return;
            resolveStaleRef.current.add(m.id);
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id === m.id && msg.meta && typeof msg.meta === "object") {
                  return {
                    ...msg,
                    meta: {
                      ...(msg.meta as Record<string, unknown>),
                      steps: resolved!.map((s) => {
                        const entry: Record<string, unknown> = {
                          id: s.id,
                          label: s.label,
                          status: s.status,
                        };
                        if (s.runtimeStartedAt) entry.runtime_started_at = s.runtimeStartedAt;
                        return entry;
                      }),
                    },
                  };
                }
                return msg;
              }),
            );
          });
        } catch {
          /* task may have been deleted */
        }
      }
    };

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [busy, messages, platformAgent, sessionId]);

  useEffect(() => {
    resolveStaleRef.current = new Set();
  }, [sessionId]);

  useEffect(() => {
    isMounted.current = true;
    abortPollRef.current = false;
    return () => {
      isMounted.current = false;
      abortPollRef.current = true;
      // SSE 流保持存活（跨会话切换不断流），交由 streaming-session-manager 管理生命周期
    };
  }, [sessionId]);

  useEffect(() => {
    if (!platformAgent) return;
    if (!platformAgent.auth) return;
    if (!scheduledRunRecord) {
      platformAgent.setActivePlatformSession(sessionId);
    }
    if (scheduleTrial && isScheduleTrialAwaitingFirstMessage(sessionId, loadScheduleTrialMeta())) {
      return;
    }
    if (!scheduleTrial && !scheduledRunRecord && isHomeSessionLaunchAwaitingFirstMessage(sessionId, loadHomeSessionLaunchMeta())) {
      return;
    }
    void reload();
  }, [platformAgent, reload, sessionId, scheduleTrial, scheduledRunRecord]);

  // 订阅 stream manager 更新：始终建立订阅（不因挂载时无流而跳过），
  // 有活跃流时立即 flush 同步首屏内容；后续 onDelta 写 manager 时自动推送。
  useEffect(() => {
    let rafId: number | null = null;
    let pending = false;

    const flush = () => {
      rafId = null;
      pending = false;
      const s = getStreamState(sessionId);
      if (!s || s.status !== "streaming") {
        if (s && s.status === "completed") {
          void reload();
        }
        return;
      }
      const targetId = s.assistantStreamId;
      const content = s.content;
      setMessages((cur) => {
        const existingMeta = (m: { meta?: Record<string, unknown> }) =>
          m.meta && typeof m.meta === "object" ? (m.meta as Record<string, unknown>) : {};
        const byId = cur.find((m) => m.id === targetId);
        if (byId) {
          return cur.map((m) =>
            m.id === targetId ? { ...m, content, meta: { ...existingMeta(m), streaming: true } } : m,
          );
        }
        const lastIdx = cur.reduce<number>((best, m, i) => (m.role === "assistant" ? i : best), -1);
        if (lastIdx === -1) return cur;
        return cur.map((m, i) =>
          i === lastIdx ? { ...m, content, meta: { ...existingMeta(m), streaming: true } } : m,
        );
      });
      contentLenRef.current = [...content].length;
    };

    const unsub = subscribeToStream(sessionId, () => {
      if (pending) return;
      pending = true;
      rafId = requestAnimationFrame(flush);
    });

    // 挂载时若已有活跃流（切回场景），立即同步首屏内容
    const initial = getStreamState(sessionId);
    if (initial && initial.status === "streaming" && initial.content) {
      flush();
    }

    return () => {
      unsub();
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [sessionId, reload]);

  /** 试跑首条在会话页发送：进入页面后再发，避免在定时页等接口导致进页时对话已过半。 */
  useEffect(() => {
    if (!scheduleTrial || !platformAgent?.auth) return;
    if (!tryClaimScheduleTrialFirstSend(sessionId)) return;
    const prompt = loadScheduleCreateDraft()?.prompt?.trim() ?? "";
    if (!prompt) {
      saveScheduleTrialMeta({ v: 1, sessionId, taskId: null, sendKind: "unknown" });
      return;
    }
    const userMid = `${OPTIMISTIC_USER_MESSAGE_ID_PREFIX}${safeRandomUUID()}`;
    const mid = safeRandomUUID();
    const trialAttachmentFiles = takeScheduleTrialAttachmentFiles(sessionId);
    const trialAttachments = buildUserMessageAttachmentsFromFiles(trialAttachmentFiles);
    const optimistic: SessionMessageItem = {
      id: userMid,
      role: "user",
      content: prompt,
      created_at: new Date().toISOString(),
      message_index: 0,
      message_id: mid,
      meta: trialAttachments.length > 0 ? { attachments: trialAttachments } : {},
    };
    setError("");
    setSending(true);
    const assistantStreamId = `${STREAMING_ASSISTANT_MESSAGE_ID_PREFIX}${mid}`;
    const nowIso = new Date().toISOString();
    // 与主 send() 对齐：注册 stream 以便 manager 接收 onDelta 推送
    releaseStream(sessionId);
    const trialAbort = new AbortController();
    registerStream(sessionId, { abortController: trialAbort, assistantStreamId });
    contentLenRef.current = 0;
    const trialSendGen = sessionGenRef.current;
    const isTrialSendActive = () => sessionGenRef.current === trialSendGen && isMounted.current;
    setMessages([optimistic, createStreamingAssistantMessage(assistantStreamId, nowIso)]);
    void (async () => {
      try {
        await platformAgent.withFreshToken(async (token) => {
          const result: ChatSendResult = await sendSessionMessageStream(
            token,
            sessionId,
            prompt,
            mid,
            setMessages,
            assistantStreamId,
            trialAttachmentFiles,
            trialAbort.signal,
            (content) => updateStreamContent(sessionId, content),
            () => contentLenRef.current,
            isTrialSendActive,
          );
          completeStream(sessionId);
          if (!isTrialSendActive()) return;
          let taskId: string | null = null;
          let sendKind: ScheduleTrialSendState = "unknown";
          let executionStepLabels: string[] | null = null;
          let orchestrationId: string | null = null;
          if (result.kind === "accepted") {
            taskId = result.task_id;
            sendKind = "accepted";
            const ex = result.execution_steps;
            executionStepLabels = Array.isArray(ex) && ex.length > 0 ? ex : null;
            orchestrationId = result.orchestration_id;
          } else if (result.kind === "completed") {
            taskId = null;
            sendKind = "completed";
          } else if (result.kind === "blocked") {
            taskId = result.task_id;
            sendKind = "blocked";
          } else {
            taskId = null;
            sendKind = "unknown";
          }
          saveScheduleTrialMeta({
            v: 1,
            sessionId,
            taskId,
            sendKind,
            executionStepLabels,
            orchestrationId,
          });
        });
        if (isTrialSendActive()) await reload();
      } catch (e) {
        completeStream(sessionId);
        saveScheduleTrialMeta({ v: 1, sessionId, taskId: null, sendKind: "unknown" });
        if (isTrialSendActive()) setError(formatAgentApiErrorForUser(e) || "发送失败");
        if (isTrialSendActive()) await reload();
      } finally {
        if (isTrialSendActive()) setSending(false);
      }
    })();
  }, [scheduleTrial, platformAgent, sessionId, reload]);

  /**
   * React Strict / 异常切页：首条已发出（in_flight）但本实例无乐观更新时，轮询历史直到拉取到消息。
   * 首条发完且 messages>0 时不会起 interval，避免与「助手思考中」的乐观态打架。
   */
  useEffect(() => {
    if (!scheduleTrial || !platformAgent?.auth) return;
    const m = loadScheduleTrialMeta();
    if (m?.sessionId !== sessionId || m.sendKind !== "in_flight" || messages.length > 0 || sending) return;
    const t = setInterval(() => {
      void reload();
    }, SCHEDULE_TRIAL_SESSION_RELOAD_INTERVAL_MS);
    return () => clearInterval(t);
  }, [scheduleTrial, platformAgent, sessionId, reload, messages.length, sending]);

  const trialMeta = scheduleTrial ? loadScheduleTrialMeta() : null;
  const trialOrchestrationId =
    trialMeta?.sessionId === sessionId ? (trialMeta.orchestrationId?.trim() || null) : null;
  const trialIsMultiStep = (trialMeta?.executionStepLabels?.length ?? 0) > 1;

  useEffect(() => {
    if (!scheduleTrial || !trialTaskId || !platformAgent) return;
    const tid = trialTaskId;
    const orchId = trialOrchestrationId;
    const multi = trialIsMultiStep && Boolean(orchId);
    let stop = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const clearPoll = () => {
      stop = true;
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const run = async () => {
      if (stop) return;
      try {
        let t: TaskResponse | null = null;
        let orchFinished = false;
        await platformAgent.withFreshToken(async (token) => {
          if (multi && orchId) {
            try {
              const orch = await getToolOrchestration(token, orchId);
              orchFinished = orch.finished;
              if (!stop && isMounted.current) {
                setTrialOrchestrationDone({ finished: orch.finished, success: orch.success });
              }
              if (orch.awaiting_clarification && !trialClarificationReloadedRef.current && isMounted.current) {
                trialClarificationReloadedRef.current = true;
                setLiveOrchStepStatuses(
                  orch.steps.map((s) => mapServerOrchestrationStepStatus(s.status)),
                );
                if (orch.clarification_message?.trim()) {
                  setLiveOrchClarification({
                    message: sanitizeClarificationForUserDisplay(orch.clarification_message.trim()),
                    shareUrl: null,
                  });
                }
                setTrialRunInFlight(false);
                await reload();
              }
              if (orch.finished) {
                const lastWithId = [...orch.steps].reverse().find((s) => s.task_id);
                const pollTaskId = (lastWithId?.task_id ?? tid).trim();
                if (pollTaskId) {
                  t = await getTask(token, pollTaskId);
                }
                if (!stop && isMounted.current && !trialDoneReloadedRef.current) {
                  trialDoneReloadedRef.current = true;
                  await reload();
                }
              }
            } catch {
              /* 编排可能已落库到消息 meta，忽略 404 */
            }
          } else {
            t = await getTask(token, tid);
          }
        });
        if (stop) return;
        setLastTaskSnapshot(t);
        const firstTaskDone = !t || !isTaskInFlight(t);
        const done = multi && orchId ? orchFinished : firstTaskDone;
        if (multi && orchId) {
          setTrialRunInFlight(!orchFinished);
        } else if (firstTaskDone) {
          setTrialRunInFlight(false);
          if (isMounted.current && !trialDoneReloadedRef.current) {
            trialDoneReloadedRef.current = true;
            void reload();
          }
        } else {
          setTrialRunInFlight(true);
        }
        if (done) {
          clearPoll();
        }
      } catch {
        if (!stop) {
          setTrialRunInFlight(false);
          setLastTaskSnapshot(null);
          clearPoll();
        }
      }
    };
    void run();
    intervalId = setInterval(() => void run(), SCHEDULE_TRIAL_TASK_POLL_INTERVAL_MS);
    return clearPoll;
  }, [scheduleTrial, trialTaskId, platformAgent, trialOrchestrationId, trialIsMultiStep, reload]);

  const aliceClarificationForSteps = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]!;
      if (m.role !== "assistant") continue;
      const meta =
        m.meta && typeof m.meta === "object" ? (m.meta as Record<string, unknown>) : undefined;
      if (meta?.kind === "linkfox_clarification") {
        return {
          message: sanitizeClarificationForUserDisplay(m.content),
          shareUrl: null,
        };
      }
    }
    return liveOrchClarification;
  }, [messages, liveOrchClarification]);

  const sessionClarificationFlow = useMemo(
    () => analyzeSessionClarificationFlow(messages),
    [messages],
  );

  const addComposerSource = useCallback((capabilityId: string) => {
    const item = composerDataSourceItems.find((entry) => entry.id === capabilityId);
    if (!item) return;
    setSelectedSourceIds((current) => (current.includes(item.id) ? current : [...current, item.id]));
  }, [composerDataSourceItems]);

  const removeComposerSource = useCallback((capabilityId: string) => {
    setSelectedSourceIds((current) => current.filter((id) => id !== capabilityId));
    setSourcePlacements((current) => current.filter((placement) => placement.sourceId !== capabilityId));
  }, []);

  const buildComposerMessage = useCallback((text: string, sourceIds: string[]) => {
    const sourceMentions = sourceIds
      .map((id) => composerDataSourceItems.find((item) => item.id === id)?.label)
      .filter((label): label is string => Boolean(label))
      .map((label) => `@${label}`)
      .join(" ");
    return [sourceMentions, text.trim()].filter(Boolean).join(" ").trim();
  }, [composerDataSourceItems]);

  useEffect(() => {
    setSelectedSourceIds([]);
    setSourcePlacements([]);
  }, [sessionId]);

  useEffect(() => {
    if (scheduleTrial || scheduledRunRecord || !composerDataSourceMenuLoaded) return;
    try {
      const raw = sessionStorage.getItem(AGENT_COMPOSER_PREFILL_STORAGE_KEY);
      if (raw) {
        const prefill = parseComposerPrefillStorageValue(raw, composerDataSourceItems);
        setDraft(prefill.text);
        setSelectedSourceIds(prefill.selectedSourceIds);
        setSourcePlacements(prefill.sourcePlacements);
        sessionStorage.removeItem(AGENT_COMPOSER_PREFILL_STORAGE_KEY);
      }
    } catch {
      /* ignore */
    }
  }, [
    sessionId,
    scheduleTrial,
    scheduledRunRecord,
    composerDataSourceItems,
    composerDataSourceMenuLoaded,
  ]);

  const firstUserMessageTitle = useMemo(() => {
    const firstUserMessage = [...messages]
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .find((message) => message.role === "user" && message.content.trim());
    return firstUserMessage ? compactText(firstUserMessage.content, 52) : "";
  }, [messages]);

  useEffect(() => {
    if (firstUserMessageTitle) {
      setActiveSessionTitle(firstUserMessageTitle);
    }
  }, [firstUserMessageTitle, setActiveSessionTitle]);

  const headerLabel = scheduleTrial
    ? (loadScheduleCreateDraft()?.title?.trim() || "试跑")
    : scheduledRunRecord
      ? (runLabel?.trim() || "定时任务记录")
      : firstUserMessageTitle || "历史对话";
  const scheduleControlsLocked = scheduleTrial && (busy || trialRunInFlight || saveBusy);
  /** 试跑须执行结束且会话已有内容后，才允许人工确认保存（不会试跑结束自动落库） */
  const trialSaveReady =
    scheduleTrial &&
    !busy &&
    !sending &&
    !trialRunInFlight &&
    !saveBusy &&
    messages.length > 0;
  /** 试跑页：除保存提交中外都允许点「终止」并回到配置，避免 404/轮询异常时无法离开 */
  const terminateEnabled = scheduleTrial && !saveBusy;

  const goBackToSchedule = useCallback(() => {
    const d = loadScheduleCreateDraft();
    const gq = d?.createGroupIdFromUrl?.trim()
      ? `&groupId=${encodeURIComponent(d.createGroupIdFromUrl.trim())}`
      : "";
    const editQ = d?.editingTaskId?.trim()
      ? `&edit=${encodeURIComponent(d.editingTaskId.trim())}`
      : "";
    router.push(`/schedules?create=1&restore=1${editQ}${gq}`);
  }, [router]);

  const onSaveSchedules = useCallback(async () => {
    if (!platformAgent) return;
    setSaveBusy(true);
    setError("");
    try {
      await saveScheduleTasksWithDraft(platformAgent.withFreshToken, { requireEnabledNext: true });
      router.push("/schedules");
    } catch (e) {
      setError(formatAgentApiErrorForUser(e) || "保存失败");
    } finally {
      setSaveBusy(false);
    }
  }, [platformAgent, router]);

  const onTerminateTrial = useCallback(async () => {
    if (!platformAgent) return;
    setError("");
    if (trialTaskId) {
      try {
        await platformAgent.withFreshToken(async (token) => {
          await deleteTaskSession(token, trialTaskId);
        });
      } catch (e) {
        setError(formatAgentApiErrorForUser(e) || "终止任务失败，仍将返回配置页。");
      }
    }
    setTrialRunInFlight(false);
    setLastTaskSnapshot(null);
    goBackToSchedule();
  }, [platformAgent, trialTaskId, goBackToSchedule]);

  useChatStickToBottom(messagesScrollRef, messagesInnerRef, [busy, error, messages, sending], {
    resetKey: sessionId,
  });

  useEffect(() => {
    setMessagesScrolled(false);
  }, [sessionId]);

  const handleMessagesScroll = useCallback(() => {
    setMessagesScrolled((messagesScrollRef.current?.scrollTop ?? 0) > 0);
  }, []);

  useEffect(() => {
    // 在 reset effect 中同步检查缓存：缓存命中则立即展示，不依赖后续 effect 调用时序
    const cached = readSessionMessageCache(sessionId);
    setMessages((current) => {
      if (cached) return cached;
      const homeLaunchPending =
        !scheduleTrial &&
        !scheduledRunRecord &&
        isHomeSessionLaunchAwaitingFirstMessage(sessionId, loadHomeSessionLaunchMeta());
      const scheduleTrialPending =
        scheduleTrial && isScheduleTrialAwaitingFirstMessage(sessionId, loadScheduleTrialMeta());
      if ((homeLaunchPending || scheduleTrialPending) && current.length > 0) {
        return current;
      }
      return [];
    });
    setMessagesLoaded(false);
    setLiveOrchStepStatuses(null);
    setLiveOrchestrationSteps(null);

    setShowResultPanel(false);
    setFocusedTaskId(null);
    setResultPanelContext(null);
    setOrchestrationBundles([]);
    setTrialOrchestrationDone(null);
    trialAutoOpenedPanelRef.current = false;
    scheduledRunAutoOpenedPanelRef.current = false;
    pendingSessionResultAutoOpenRef.current = false;
    sessionResultAutoFollowRef.current = false;
    sessionResultAutoFollowInitializedRef.current = false;
    trialPrefetchAnchorRef.current = null;
    trialDoneReloadedRef.current = false;
    trialClarificationReloadedRef.current = false;
    setLiveOrchClarification(null);
    setSupplementalBundlesById({});
  }, [scheduleTrial, scheduledRunRecord, sessionId]);

  // 防御性守卫：只要 messages 非空，busy 就必须是 false
  // 避免 guard 阻止 reload() 后 busy 永远停留在 true
  useEffect(() => {
    if (messages.length > 0) {
      setBusy(false);
    }
  }, [messages]);

  useEffect(() => {
    if (scheduleTrial || scheduledRunRecord) return;
    if (isHomeSessionLaunchAwaitingFirstMessage(sessionId, loadHomeSessionLaunchMeta())) return;
    if (!messagesLoaded || busy || sending || error) return;
    if (messages.length > 0) return;
    platformAgent?.clearActivePlatformSession();
    router.replace("/");
  }, [
    busy,
    error,
    messages.length,
    messagesLoaded,
    platformAgent,
    router,
    scheduleTrial,
    scheduledRunRecord,
    sessionId,
    sending,
  ]);

  const taskResultCardMessageIds = useMemo(() => messageIdsEligibleForTaskResultCard(messages), [messages]);

  const taskResultEntryVisibleByMessageId = useMemo(() => {
    const out = new Map<string, boolean>();
    for (const m of messages) {
      if (!taskResultCardMessageIds.has(m.id)) continue;
      const meta =
        m.meta && typeof m.meta === "object" && !Array.isArray(m.meta)
          ? (m.meta as Record<string, unknown>)
          : undefined;
      const rawTaskId = typeof meta?.task_id === "string" ? meta.task_id.trim() : "";
      const bundles = orchestrationBundlesForTaskResultCard(
        m.id,
        meta,
        messages,
        orchestrationBundles,
        supplementalBundlesById,
      );
      const extraArtifacts =
        rawTaskId && lastTaskSnapshot?.task_id === rawTaskId
          ? taskArtifactsFromSnapshot(lastTaskSnapshot)
          : undefined;
      out.set(m.id, shouldShowTaskResultEntryCard(bundles, extraArtifacts));
    }
    return out;
  }, [
    messages,
    taskResultCardMessageIds,
    orchestrationBundles,
    supplementalBundlesById,
    lastTaskSnapshot,
  ]);

  const orchestrationAnchor = useMemo(() => pickBestOrchestrationAnchor(messages), [messages]);

  const effectiveOrchestrationAnchor = useMemo((): OrchestrationAnchor | null => {
    if (orchestrationAnchor) return orchestrationAnchor;
    const runRecordTaskId = (fallbackTaskId ?? "").trim();
    if (scheduledRunRecord && runRecordTaskId) {
      return {
        messageId: "",
        primaryTaskId: runRecordTaskId,
        bundleTaskIds: undefined,
        orchestrationId: null,
      };
    }
    if (!scheduleTrial || trialMeta?.sessionId !== sessionId) return null;
    const trialTaskId = (trialMeta.taskId ?? "").trim();
    const trialOrchId = (trialMeta.orchestrationId ?? "").trim();
    if (!trialTaskId && !trialOrchId) return null;
    return {
      messageId: "",
      primaryTaskId: trialTaskId,
      bundleTaskIds: undefined,
      orchestrationId: trialOrchId || null,
    };
  }, [orchestrationAnchor, scheduleTrial, trialMeta, sessionId, scheduledRunRecord, fallbackTaskId]);

  const syncResultPanelContextFromAnchorData = useCallback(
    (
      anchor: PanelOrchestrationAnchor,
      data: Awaited<ReturnType<typeof fetchTaskOrchestrationForResultPanel>>,
    ) => {
      const dl = buildBundleDownloadApiForPanel(anchor.primaryTaskId, anchor.bundleTaskIds);
      setResultPanelContext((prev) => {
        if (!prev || !resultPanelContextMatchesAnchor(prev, anchor)) return prev;
        return {
          ...prev,
          primaryTaskId: anchor.primaryTaskId,
          bundleTaskIds: anchor.bundleTaskIds,
          orchestrationId: anchor.orchestrationId ?? null,
          bundles: data.bundles,
          finishedAt: data.finishedAt,
          errorMessage: data.errorMessage,
          lastStatus: data.lastStatus,
          bundleDownloadApi: dl.api,
          bundleDownloadName: dl.name,
        };
      });
    },
    [],
  );

  useEffect(() => {
    const orchId = effectiveOrchestrationAnchor?.orchestrationId?.trim();
    if (!orchId || !platformAgent?.auth) {
      setLiveOrchClarification(null);
      setLiveOrchStepStatuses(null);
      setLiveOrchestrationSteps(null);
      return;
    }
    let stop = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const clearPoll = () => {
      stop = true;
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const tick = async () => {
      if (stop) return;
      try {
        await platformAgent.withFreshToken(async (token) => {
          const orch = await getToolOrchestration(token, orchId);
          if (stop) return;
          setLiveOrchestrationSteps(orch.steps);
          setLiveOrchStepStatuses(orch.steps.map((s) => mapServerOrchestrationStepStatus(s.status)));
          if (orch.awaiting_clarification && orch.clarification_message?.trim()) {
            setLiveOrchClarification({
              message: sanitizeClarificationForUserDisplay(orch.clarification_message.trim()),
              shareUrl: null,
            });
            if (scheduleTrial) setTrialRunInFlight(false);
          } else if (!orch.awaiting_clarification) {
            setLiveOrchClarification(null);
          }
          if (orch.finished && !orch.awaiting_clarification) {
            clearPoll();
          }
        });
      } catch {
        /* 编排可能已结束 */
      }
    };
    void tick();
    intervalId = setInterval(() => void tick(), SCHEDULE_TRIAL_TASK_POLL_INTERVAL_MS);
    return clearPoll;
  }, [effectiveOrchestrationAnchor?.orchestrationId, platformAgent, scheduleTrial]);

  useEffect(() => {
    if (!effectiveOrchestrationAnchor || !platformAgent?.auth) {
      return;
    }
    if (scheduleTrial && trialRunInFlight) return;
    if (
      scheduledRunRecord ||
      (!scheduleTrial && Boolean(effectiveOrchestrationAnchor.orchestrationId?.trim()))
    ) {
      return;
    }

    let cancelled = false;
    void platformAgent.withFreshToken(async (token) => {
      try {
        const data = await fetchTaskOrchestrationForResultPanel(
          token,
          effectiveOrchestrationAnchor.primaryTaskId,
          effectiveOrchestrationAnchor.bundleTaskIds,
          { orchestrationId: effectiveOrchestrationAnchor.orchestrationId },
        );
        if (!cancelled) {
          setOrchestrationBundles(data.bundles);
          syncResultPanelContextFromAnchorData(
            {
              primaryTaskId: effectiveOrchestrationAnchor.primaryTaskId,
              bundleTaskIds: effectiveOrchestrationAnchor.bundleTaskIds,
              orchestrationId: effectiveOrchestrationAnchor.orchestrationId,
            },
            data,
          );
        }
      } catch {
        // task/orchestration may have been deleted
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    effectiveOrchestrationAnchor,
    platformAgent,
    scheduleTrial,
    scheduledRunRecord,
    syncResultPanelContextFromAnchorData,
    trialRunInFlight,
  ]);

  /** live 多步任务：执行中持续刷新 bundles，结果文件一出现即可驱动右侧查看态与后续自动跟随。 */
  useEffect(() => {
    if (scheduleTrial || scheduledRunRecord || !effectiveOrchestrationAnchor || !platformAgent?.auth) return;
    const orchId = effectiveOrchestrationAnchor.orchestrationId?.trim();
    if (!orchId) return;

    let stop = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const clearPoll = () => {
      stop = true;
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const tick = async () => {
      if (stop) return;
      try {
        let allTerminal = true;
        await platformAgent.withFreshToken(async (token) => {
          const data = await fetchTaskOrchestrationForResultPanel(
            token,
            effectiveOrchestrationAnchor.primaryTaskId,
            effectiveOrchestrationAnchor.bundleTaskIds,
            { orchestrationId: effectiveOrchestrationAnchor.orchestrationId },
          );
          if (stop) return;
          setOrchestrationBundles(data.bundles);
          syncResultPanelContextFromAnchorData(
            {
              primaryTaskId: effectiveOrchestrationAnchor.primaryTaskId,
              bundleTaskIds: effectiveOrchestrationAnchor.bundleTaskIds,
              orchestrationId: effectiveOrchestrationAnchor.orchestrationId,
            },
            data,
          );
          allTerminal = !data.bundles.some((b) => {
            const s = (b.taskStatus ?? "").toUpperCase();
            return s === "RUNNING" || s === "PENDING" || s === "QUEUED";
          });
        });
        if (stop) return;
        if (allTerminal) {
          clearPoll();
        }
      } catch {
        /* task/orchestration may have been deleted */
      }
    };

    void tick();
    intervalId = setInterval(() => void tick(), SCHEDULE_TRIAL_TASK_POLL_INTERVAL_MS);
    return clearPoll;
  }, [
    effectiveOrchestrationAnchor,
    platformAgent,
    scheduleTrial,
    scheduledRunRecord,
    syncResultPanelContextFromAnchorData,
  ]);

  /** scheduledRunRecord 模式：任务仍在执行时周期性刷新 bundle 状态，直到全部终态为止。 */
  useEffect(() => {
    if (!scheduledRunRecord || !effectiveOrchestrationAnchor || !platformAgent?.auth) return;

    let stop = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const clearPoll = () => {
      stop = true;
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const tick = async () => {
      if (stop) return;
      try {
        let allTerminal = true;
        await platformAgent.withFreshToken(async (token) => {
          const data = await fetchTaskOrchestrationForResultPanel(
            token,
            effectiveOrchestrationAnchor.primaryTaskId,
            effectiveOrchestrationAnchor.bundleTaskIds,
            { orchestrationId: effectiveOrchestrationAnchor.orchestrationId },
          );
          if (stop) return;
          setOrchestrationBundles(data.bundles);
          syncResultPanelContextFromAnchorData(
            {
              primaryTaskId: effectiveOrchestrationAnchor.primaryTaskId,
              bundleTaskIds: effectiveOrchestrationAnchor.bundleTaskIds,
              orchestrationId: effectiveOrchestrationAnchor.orchestrationId,
            },
            data,
          );
          allTerminal = !data.bundles.some((b) => {
            const s = (b.taskStatus ?? "").toUpperCase();
            return s === "RUNNING" || s === "PENDING" || s === "QUEUED";
          });
        });
        if (stop) return;
        if (allTerminal) {
          clearPoll();
        }
      } catch {
        /* 任务可能已结束或删除 */
      }
    };

    void tick();
    intervalId = setInterval(() => void tick(), SCHEDULE_TRIAL_TASK_POLL_INTERVAL_MS);
    return clearPoll;
  }, [scheduledRunRecord, effectiveOrchestrationAnchor, platformAgent, syncResultPanelContextFromAnchorData]);

  const loadSupplementalBundlesForMessage = useCallback((messageId: string, meta: Record<string, unknown> | undefined) => {
    if (!platformAgent?.auth) return;
    if (supplementalBundlesById[messageId] || fetchedSupplementalRef.current.has(messageId)) return;
    const anchor = resolvePanelAnchorForMessage(messages, meta);
    if (!anchor) {
      fetchedSupplementalRef.current.add(messageId);
      return;
    }
    fetchedSupplementalRef.current.add(messageId);
    if (!platformAgent?.auth) return;
    void platformAgent.withFreshToken(async (token) => {
      try {
        const data = await fetchTaskOrchestrationForResultPanel(
          token,
          anchor.primaryTaskId,
          anchor.bundleTaskIds,
          { orchestrationId: anchor.orchestrationId, expandOrchestration: false },
        );
        setSupplementalBundlesById((prev) => ({ ...prev, [messageId]: data.bundles }));
      } catch {
        // task/orchestration may have been deleted
      }
    });
  }, [messages, platformAgent, supplementalBundlesById]);

  useEffect(() => {
    fetchedSupplementalRef.current = new Set();
    setSupplementalBundlesById({});
  }, [sessionId]);

  const firstAssistantIndex = useMemo(
    () => messages.findIndex((m) => m.role === "assistant"),
    [messages],
  );

  const latestDecompositionAssistantIndex = useMemo(
    () => findLatestDecompositionAssistantIndex(messages),
    [messages],
  );

  const latestDecompositionTailMessages = useMemo(
    () => (latestDecompositionAssistantIndex >= 0 ? messages.slice(latestDecompositionAssistantIndex) : []),
    [latestDecompositionAssistantIndex, messages],
  );

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

  const latestStepsByTaskId = useMemo(
    () => buildLatestStepsMessageIdByTaskId(messages),
    [messages],
  );

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

  const { postTaskGuidanceLeadingByMessageId, mergedPostTaskGuidanceLeadingMessageIds } = useMemo(() => {
    const leadingByMessageId = buildPostTaskGuidanceLeadingByMessageId(messages, {
      taskSnapshot: lastTaskSnapshot,
    });
    return {
      postTaskGuidanceLeadingByMessageId: leadingByMessageId,
      mergedPostTaskGuidanceLeadingMessageIds: new Set(
        [...leadingByMessageId.values()].map((value) => value.sourceMessageId),
      ),
    };
  }, [messages, lastTaskSnapshot]);

  const syntheticTerminatedGuidanceMessageId = useMemo(() => {
    if (!latestStepsMessageId) return null;
    const stepsMsg = messages.find((m) => m.id === latestStepsMessageId);
    if (!stepsMsg) return null;
    const meta =
      stepsMsg.meta && typeof stepsMsg.meta === "object" && !Array.isArray(stepsMsg.meta)
        ? (stepsMsg.meta as Record<string, unknown>)
        : undefined;
    const steps = parseTaskExecutionStepsFromMeta(meta);
    if (!steps?.length) return null;
    const rawTaskId = typeof meta?.task_id === "string" ? meta.task_id.trim() : "";
    const matchingBundle = rawTaskId
      ? orchestrationBundles.find((b) => b.taskId === rawTaskId) ?? orchestrationBundles[0]
      : orchestrationBundles[0];
    const terminated =
      sessionHasTaskTerminatedForTask(messages, rawTaskId) ||
      isUserTerminatedTaskState({
        steps,
        task:
          lastTaskSnapshot && lastTaskSnapshot.task_id === rawTaskId ? lastTaskSnapshot : null,
        bundle: matchingBundle ?? null,
      });
    return terminated ? latestStepsMessageId : null;
  }, [messages, latestStepsMessageId, orchestrationBundles, lastTaskSnapshot]);

  const interactiveGuidanceMessageId = useMemo(() => {
    const fromMessages = resolveInteractiveGuidanceMessageId(messages, {
      syntheticTerminatedMessageId: syntheticTerminatedGuidanceMessageId,
    });
    if (fromMessages) return fromMessages;
    if (!latestStepsMessageId) return null;
    const stepsIdx = messages.findIndex((m) => m.id === latestStepsMessageId);
    if (stepsIdx < 0) return null;
    const stepsMeta =
      messages[stepsIdx]?.meta && typeof messages[stepsIdx]?.meta === "object"
        ? (messages[stepsIdx]!.meta as Record<string, unknown>)
        : undefined;
    const stepsTaskId = typeof stepsMeta?.task_id === "string" ? stepsMeta.task_id.trim() : "";
    const roundGuidance = resolveRoundPostTaskGuidanceContent(messages, stepsIdx, {
      taskId: stepsTaskId,
      taskSnapshot: lastTaskSnapshot,
    });
    if (!roundGuidance) return null;
    for (let j = stepsIdx + 1; j < messages.length; j += 1) {
      if (messages[j]?.role === "user") return null;
    }
    return roundGuidance.messageId.startsWith("task_guidance_")
      ? latestStepsMessageId
      : roundGuidance.messageId;
  }, [messages, syntheticTerminatedGuidanceMessageId, latestStepsMessageId, lastTaskSnapshot]);

  const guidanceBackfillAttemptedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (scheduleTrial || scheduledRunRecord || !platformAgent) {
      return;
    }
    if (!latestStepsMessageId) return;

    const stepsIdx = messages.findIndex((m) => m.id === latestStepsMessageId);
    if (stepsIdx < 0) return;

    const stepsMsg = messages[stepsIdx]!;
    const stepsMeta =
      stepsMsg.meta && typeof stepsMsg.meta === "object" && !Array.isArray(stepsMsg.meta)
        ? (stepsMsg.meta as Record<string, unknown>)
        : undefined;
    const stepsTaskId = typeof stepsMeta?.task_id === "string" ? stepsMeta.task_id.trim() : "";
    if (!stepsTaskId) return;

    const steps = parseTaskExecutionStepsFromMeta(stepsMeta);
    if (!steps?.length || !steps.every((s) => s.status === "done" || s.status === "error")) {
      return;
    }

    const roundGuidance = resolveRoundPostTaskGuidanceContent(messages, stepsIdx, {
      taskId: stepsTaskId,
      taskSnapshot: lastTaskSnapshot?.task_id === stepsTaskId ? lastTaskSnapshot : null,
    });
    if (roundGuidance) return;

    if (guidanceBackfillAttemptedRef.current.has(stepsTaskId)) return;
    guidanceBackfillAttemptedRef.current.add(stepsTaskId);

    let cancelled = false;
    void platformAgent.withFreshToken(async (token) => {
      try {
        const result = await ensurePostTaskGuidance(token, stepsTaskId);
        if (!cancelled && result.post_task_guidance?.trim()) {
          await reload();
        }
      } catch {
        /* 引导为增强能力，回填失败不阻断主流程 */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    lastTaskSnapshot,
    latestStepsMessageId,
    messages,
    platformAgent,
    reload,
    scheduleTrial,
    scheduledRunRecord,
  ]);

  const [sessionStreamActive, setSessionStreamActive] = useState(
    () => getStreamState(sessionId)?.status === "streaming",
  );

  useEffect(() => {
    const sync = () => setSessionStreamActive(getStreamState(sessionId)?.status === "streaming");
    sync();
    return subscribeToStream(sessionId, sync);
  }, [sessionId]);

  const sessionAwaitingUserInput = useMemo(() => {
    if (latestExecutionSteps?.some((s) => s.status === "awaiting_input")) return true;
    if (sessionClarificationFlow.supplementUserMessageId) return false;
    return Boolean(aliceClarificationForSteps);
  }, [latestExecutionSteps, sessionClarificationFlow.supplementUserMessageId, aliceClarificationForSteps]);

  const composerShowsStop = useMemo(
    () =>
      !scheduledRunRecord &&
      sessionExecutionCanStop({
        sending,
        streamActive: sessionStreamActive,
        awaitingUserInput: sessionAwaitingUserInput,
        executionSteps: latestExecutionSteps,
        orchestrationBundles,
        lastTaskSnapshot,
      }),
    [
      scheduledRunRecord,
      sending,
      sessionStreamActive,
      sessionAwaitingUserInput,
      latestExecutionSteps,
      orchestrationBundles,
      lastTaskSnapshot,
    ],
  );

  const liveSessionPrimaryTaskPollStrategy = useMemo(
    () =>
      getLiveSessionPrimaryTaskPollStrategy({
        scheduleTrial,
        scheduledRunRecord,
        composerShowsStop,
        sending,
        orchestrationId: effectiveOrchestrationAnchor?.orchestrationId,
      }),
    [
      composerShowsStop,
      effectiveOrchestrationAnchor?.orchestrationId,
      scheduleTrial,
      scheduledRunRecord,
      sending,
    ],
  );

  const stopCurrentSessionTask = useCallback(async () => {
    if (!platformAgent?.auth) return;
    abortPollRef.current = true;
    sessionGenRef.current += 1;
    if (sseAbortRef.current) {
      sseAbortRef.current.abort();
      sseAbortRef.current = null;
    }
    releaseStream(sessionId);
    completeStream(sessionId);

    const orchId = effectiveOrchestrationAnchor?.orchestrationId?.trim();
    if (orchId) {
      try {
        await platformAgent.withFreshToken((token) => cancelToolOrchestration(token, orchId));
      } catch {
        /* 终止以本地轮询与步骤落库为准；编排可能已结束或进程重启后不在内存 */
      }
    }

    const stepsAnchor = findLatestTaskExecutionStepsMessage(messages);
    if (stepsAnchor) {
      const { message: stepsMsg, meta } = stepsAnchor;
      const taskId = typeof meta.task_id === "string" ? meta.task_id.trim() : "";
      const roundId = typeof meta.round_id === "string" ? meta.round_id.trim() : sessionId;
      const orchIdMeta =
        typeof meta.orchestration_id === "string" && meta.orchestration_id.trim()
          ? meta.orchestration_id.trim()
          : null;
      const steps = parseTaskExecutionStepsFromMeta(meta);
      if (taskId && steps?.length) {
        try {
          await platformAgent.withFreshToken(async (token) => {
            await cancelTask(token, taskId);
            await patchTaskExecutionSteps(token, sessionId, stepsMsg.id, {
              round_id: roundId,
              task_id: taskId,
              steps: steps.map((s) => ({
                id: s.id,
                label: s.label,
                status: "error" as const,
              })),
              orchestration_id: orchIdMeta,
            });
            await postTaskTerminatedMessage(token, sessionId, {
              round_id: roundId,
              task_id: taskId,
              orchestration_id: orchIdMeta,
            });
          });
        } catch {
          /* best-effort */
        }
      }
    }

    setSending(false);
    setTrialRunInFlight(false);
    await reload();
    void refreshHistoryNow();
  }, [
    effectiveOrchestrationAnchor?.orchestrationId,
    messages,
    platformAgent,
    refreshHistoryNow,
    reload,
    sessionId,
  ]);

  /** 历史会话重进：单任务没有 orchestration 快照时，继续轮询主 task。 */
  useEffect(() => {
    if (liveSessionPrimaryTaskPollStrategy !== "primary-task") return;
    if (!effectiveOrchestrationAnchor?.primaryTaskId || !platformAgent?.auth) return;

    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        await platformAgent.withFreshToken(async (token) => {
          const primary = effectiveOrchestrationAnchor.primaryTaskId.trim();
          if (!primary) return;
          const t = await getTask(token, primary);
          if (stop) return;
          setLastTaskSnapshot(t);
          setOrchestrationBundles((current) => [
            {
              taskId: t.task_id,
              stepIndex: 0,
              label: current[0]?.label ?? "步骤 1",
              artifacts: taskArtifactsFromSnapshot(t),
              taskStatus: t.status,
              startedAt: t.started_at || undefined,
              finishedAt: t.finished_at ?? null,
            },
          ]);
        });
      } catch {
        /* task may have been deleted */
      }
    };

    void tick();
    const id = setInterval(() => void tick(), SCHEDULE_TRIAL_TASK_POLL_INTERVAL_MS);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [
    effectiveOrchestrationAnchor,
    liveSessionPrimaryTaskPollStrategy,
    platformAgent,
  ]);

  const trialExecutionStepsForLabels = useMemo(() => {
    if (!scheduleTrial || trialMeta?.sessionId !== sessionId) return null;
    const labels = trialMeta.executionStepLabels;
    if (!labels?.length) return null;
    return buildTaskStepsFromDecompositionLabels(
      labels,
      "trial-labels",
      trialRunInFlight,
      lastTaskSnapshot,
      {
        multiStepOrchestration: labels.length > 1,
        orchestrationFinished: trialOrchestrationDone?.finished ?? Boolean(orchestrationAnchor),
        orchestrationSuccess: trialOrchestrationDone?.success ?? true,
      },
    );
  }, [
    scheduleTrial,
    trialMeta,
    sessionId,
    trialRunInFlight,
    lastTaskSnapshot,
    trialOrchestrationDone,
    orchestrationAnchor,
  ]);

  const pendingDecompositionRecovery = useMemo(() => {
    if (latestStepsMessageId) return false;
    if (latestDecompositionAssistantIndex < 0) return false;
    if (sessionHasOrchestrationFailure(latestDecompositionTailMessages)) return false;
    if (sessionHasTaskTerminatedMessage(latestDecompositionTailMessages)) return false;
    if (sessionHasTaskCompletionSummaryMessage(latestDecompositionTailMessages, null)) return false;
    for (let i = latestDecompositionAssistantIndex + 1; i < messages.length; i += 1) {
      if (messages[i]?.role === "user") return false;
    }
    return extractDecompositionLabelsFromMessages(messages).length > 0;
  }, [
    latestDecompositionAssistantIndex,
    latestDecompositionTailMessages,
    latestStepsMessageId,
    messages,
  ]);

  const decompositionFallbackSteps = useMemo(() => {
    if (latestStepsMessageId) return null;
    const labels = extractDecompositionLabelsFromMessages(messages);
    if (!labels.length) return null;
    const orchFailed = sessionHasOrchestrationFailure(latestDecompositionTailMessages);
    const orchCancelled =
      sessionHasTaskTerminatedMessage(latestDecompositionTailMessages) ||
      latestDecompositionTailMessages.some(
        (m) => m.role === "assistant" && /多步任务已由用户终止/.test(m.content || ""),
      );
    return buildTaskStepsFromDecompositionLabels(labels, sessionId, pendingDecompositionRecovery, lastTaskSnapshot, {
      multiStepOrchestration: labels.length > 1,
      orchestrationFinished: !pendingDecompositionRecovery && Boolean(orchestrationAnchor),
      orchestrationSuccess: !orchFailed && !orchCancelled,
    });
  }, [
    latestStepsMessageId,
    latestDecompositionTailMessages,
    messages,
    orchestrationAnchor,
    pendingDecompositionRecovery,
    sessionId,
    lastTaskSnapshot,
  ]);

  const runRecordExecutionStepsForLabels = useMemo(() => {
    if (!scheduledRunRecord) return null;
    const labels = extractDecompositionLabelsFromMessages(messages);
    if (!labels.length) return null;
    const orchFailed = sessionHasOrchestrationFailure(messages);
    const orchCancelled =
      sessionHasTaskTerminatedMessage(messages) ||
      messages.some(
        (m) => m.role === "assistant" && /多步任务已由用户终止/.test(m.content || ""),
      );
    // 若 bundle 中有仍在执行的任务，编排未结束 → 首步保持 running 而非全部 done
    const anyTaskInFlight = orchestrationBundles.some((b) => {
      const s = (b.taskStatus ?? "").toUpperCase();
      return s === "RUNNING" || s === "PENDING" || s === "QUEUED";
    });
    const finished = orchestrationBundles.length > 0 ? !anyTaskInFlight : true;
    return buildTaskStepsFromDecompositionLabels(labels, sessionId, false, null, {
      multiStepOrchestration: labels.length > 1,
      orchestrationFinished: finished,
      orchestrationSuccess: !orchFailed && !orchCancelled,
    });
  }, [scheduledRunRecord, messages, sessionId, orchestrationBundles]);

  const executionStepsForBundleLabels =
    latestExecutionSteps ?? trialExecutionStepsForLabels ?? runRecordExecutionStepsForLabels;

  useEffect(() => {
    if (!platformAgent?.auth) return;
    if (!pendingDecompositionRecovery) return;

    const t = setInterval(() => {
      void reload();
    }, SCHEDULE_TRIAL_SESSION_RELOAD_INTERVAL_MS);

    return () => clearInterval(t);
  }, [pendingDecompositionRecovery, platformAgent, reload]);

  const orchestrationBundlesForUi = useMemo(
    () => enrichOrchestrationBundlesWithStepLabels(orchestrationBundles, executionStepsForBundleLabels),
    [orchestrationBundles, executionStepsForBundleLabels],
  );

  const expectedBundleTaskIds = useMemo(
    () => bundleTaskIdsExpectedForAnchor(effectiveOrchestrationAnchor, fallbackTaskId),
    [effectiveOrchestrationAnchor, fallbackTaskId],
  );

  const bundlesAllTerminal = useMemo(
    () => orchestrationBundlesAllTerminal(orchestrationBundles),
    [orchestrationBundles],
  );

  const inFlightTaskForRuntime = useMemo((): TaskResponse | null => {
    if (lastTaskSnapshot && isTaskInFlight(lastTaskSnapshot)) return lastTaskSnapshot;
    const hit = orchestrationBundles.find((bundle) => {
      const status = (bundle.taskStatus ?? "").toUpperCase();
      return (status === "RUNNING" || status === "PENDING" || status === "QUEUED") && bundle.startedAt;
    });
    if (!hit?.startedAt) return null;
    return {
      task_id: hit.taskId,
      tool_name: "",
      status: hit.taskStatus ?? "RUNNING",
      started_at: hit.startedAt,
      finished_at: null,
      zip_download_api: null,
      events: [],
      artifacts: [],
    };
  }, [lastTaskSnapshot, orchestrationBundles]);

  const executionStepsRuntimeOptions = useMemo(
    () => ({
      orchestrationSteps: liveOrchestrationSteps,
      inFlightTask: inFlightTaskForRuntime,
    }),
    [liveOrchestrationSteps, inFlightTaskForRuntime],
  );

  const stepsMessageIdForBundles = useMemo(() => {
    if (latestStepsMessageId) return latestStepsMessageId;
    if ((scheduleTrial || scheduledRunRecord) && firstAssistantIndex >= 0) {
      const m = messages[firstAssistantIndex];
      if (m?.role === "assistant") return m.id;
    }
    return null;
  }, [latestStepsMessageId, scheduleTrial, scheduledRunRecord, firstAssistantIndex, messages]);

  const subtasksWithTabularPreview = useMemo(
    () =>
      orchestrationBundlesForUi
        .filter((s) => hasTabularTaskResultFiles(s.artifacts))
        .slice()
        .sort((a, b) => b.stepIndex - a.stepIndex),
    [orchestrationBundlesForUi],
  );

  const executionStepsForPanelMessage = useMemo(() => {
    if (!resultPanelContext?.sourceMessageId) return executionStepsForBundleLabels;
    const m = messages.find((x) => x.id === resultPanelContext.sourceMessageId);
    const meta = m?.meta && typeof m.meta === "object" ? (m.meta as Record<string, unknown>) : undefined;
    return parseTaskExecutionStepsFromMeta(meta) ?? executionStepsForBundleLabels;
  }, [resultPanelContext, messages, executionStepsForBundleLabels]);

  const panelBundlesForUi = useMemo(
    () =>
      resultPanelContext
        ? enrichOrchestrationBundlesWithStepLabels(resultPanelContext.bundles, executionStepsForPanelMessage)
        : [],
    [resultPanelContext, executionStepsForPanelMessage],
  );

  const panelSubtasksWithTabular = useMemo(
    () =>
      panelBundlesForUi
        .filter((s) => hasTabularTaskResultFiles(s.artifacts))
        .slice()
        .sort((a, b) => b.stepIndex - a.stepIndex),
    [panelBundlesForUi],
  );

  const resolvedPanelSubtaskId = useMemo(() => {
    if (!resultPanelContext) return null;
    const focus = resultPanelContext.focusedSubtaskId;
    if (focus && panelSubtasksWithTabular.some((s) => s.taskId === focus)) return focus;
    if (panelSubtasksWithTabular.some((s) => s.taskId === resultPanelContext.primaryTaskId)) {
      return resultPanelContext.primaryTaskId;
    }
    return panelSubtasksWithTabular[0]?.taskId ?? resultPanelContext.primaryTaskId;
  }, [resultPanelContext, panelSubtasksWithTabular]);

  const artifactsForTaskPanel = useMemo(() => {
    if (!resultPanelContext) return [];
    if (panelSubtasksWithTabular.length > 0) {
      const hit = panelSubtasksWithTabular.find((s) => s.taskId === resolvedPanelSubtaskId);
      if (hit) return hit.artifacts;
    }
    return panelBundlesForUi.flatMap((b) => b.artifacts);
  }, [resultPanelContext, panelSubtasksWithTabular, panelBundlesForUi, resolvedPanelSubtaskId]);

  const stepTimelineHighlightTaskId = useMemo(() => {
    if (showResultPanel && resultPanelContext) {
      return resultPanelContext.focusedSubtaskId ?? resultPanelContext.primaryTaskId;
    }
    if (subtasksWithTabularPreview.length > 0) return subtasksWithTabularPreview[0]!.taskId;
    const last =
      orchestrationBundlesForUi.length > 0
        ? orchestrationBundlesForUi[orchestrationBundlesForUi.length - 1]
        : undefined;
    return last?.taskId ?? null;
  }, [showResultPanel, resultPanelContext, orchestrationBundlesForUi, subtasksWithTabularPreview]);

  const showTrialRunFooterLine = useMemo(() => {
    if (!scheduleTrial || !trialRunInFlight || sending) return false;
    const t = loadScheduleTrialMeta();
    if (t && t.sessionId === sessionId && t.executionStepLabels && t.executionStepLabels.length > 0) {
      return false;
    }
    if (firstAssistantIndex < 0) return true;
    const firstA = messages[firstAssistantIndex]!;
    const m = firstA.meta && typeof firstA.meta === "object" ? (firstA.meta as Record<string, unknown>) : undefined;
    if (parseTaskExecutionStepsFromMeta(m)) return false;
    return true;
  }, [scheduleTrial, trialRunInFlight, sending, messages, firstAssistantIndex, sessionId]);

  const stopSessionResultAutoFollow = useCallback(() => {
    sessionResultAutoFollowRef.current = false;
    pendingSessionResultAutoOpenRef.current = false;
  }, []);

  const closeResultPanel = useCallback(() => {
    stopSessionResultAutoFollow();
    setShowResultPanel(false);
    setFocusedTaskId(null);
    setResultPanelContext(null);
  }, [stopSessionResultAutoFollow]);

  const applyPanelFetchToContext = useCallback(
    (
      messageId: string | null,
      anchor: PanelOrchestrationAnchor,
      data: Awaited<ReturnType<typeof fetchTaskOrchestrationForResultPanel>>,
      focusedSubtaskId?: string | null,
    ) => {
      const dl = buildBundleDownloadApiForPanel(anchor.primaryTaskId, anchor.bundleTaskIds);
      const focus =
        (focusedSubtaskId ?? "").trim() ||
        anchor.primaryTaskId;
      setResultPanelContext({
        sourceMessageId: messageId,
        primaryTaskId: anchor.primaryTaskId,
        bundleTaskIds: anchor.bundleTaskIds,
        orchestrationId: anchor.orchestrationId ?? null,
        bundles: data.bundles,
        finishedAt: data.finishedAt,
        errorMessage: data.errorMessage,
        lastStatus: data.lastStatus,
        bundleDownloadApi: dl.api,
        bundleDownloadName: dl.name,
        focusedSubtaskId: focus,
      });
      setFocusedTaskId(anchor.primaryTaskId);
      setShowResultPanel(true);
    },
    [],
  );

  const openResultPanelFromAnchor = useCallback(
    async (
      anchor: PanelOrchestrationAnchor,
      messageId: string | null = null,
      options?: { focusedSubtaskId?: string | null },
    ) => {
      if (!platformAgent?.auth) {
        platformAgent?.openLogin("请先登录后再查看任务结果。");
        return;
      }
      setError("");
      try {
        await platformAgent.withFreshToken(async (token) => {
          const data = await fetchTaskOrchestrationForResultPanel(
            token,
            anchor.primaryTaskId,
            anchor.bundleTaskIds,
            {
              orchestrationId: anchor.orchestrationId ?? undefined,
              expandOrchestration: false,
            },
          );
          applyPanelFetchToContext(messageId, anchor, data, options?.focusedSubtaskId);
        });
      } catch (e) {
        setError(formatAgentApiErrorForUser(e));
      }
    },
    [applyPanelFetchToContext, platformAgent],
  );

  const openResultPanelForMessage = useCallback(
    async (
      meta: Record<string, unknown> | undefined,
      messageId: string | null,
      options?: { focusedSubtaskId?: string | null },
    ) => {
      const anchor = resolvePanelAnchorForMessage(messages, meta);
      if (!anchor) return;
      await openResultPanelFromAnchor(anchor, messageId, options);
    },
    [messages, openResultPanelFromAnchor],
  );

  const openResultPanelForMessageManually = useCallback(
    async (
      meta: Record<string, unknown> | undefined,
      messageId: string | null,
      options?: { focusedSubtaskId?: string | null },
    ) => {
      stopSessionResultAutoFollow();
      await openResultPanelForMessage(meta, messageId, options);
    },
    [openResultPanelForMessage, stopSessionResultAutoFollow],
  );

  const withFreshTokenForResultPanel = useCallback(
    async (run: (token: string) => Promise<void>) => {
      if (!platformAgent?.withFreshToken) return;
      await platformAgent.withFreshToken(run);
    },
    [platformAgent],
  );

  useEffect(() => {
    if (scheduleTrial || scheduledRunRecord) return;
    if (sessionResultAutoFollowInitializedRef.current) return;
    if (!effectiveOrchestrationAnchor) return;
    if (!composerShowsStop && !sending) return;
    sessionResultAutoFollowInitializedRef.current = true;
    sessionResultAutoFollowRef.current = true;
    pendingSessionResultAutoOpenRef.current = true;
  }, [composerShowsStop, effectiveOrchestrationAnchor, scheduleTrial, scheduledRunRecord, sending]);

  useEffect(() => {
    if (!scheduleTrial || trialRunInFlight || trialAutoOpenedPanelRef.current) return;
    if (subtasksWithTabularPreview.length === 0 || !effectiveOrchestrationAnchor) return;
    trialAutoOpenedPanelRef.current = true;
    void openResultPanelFromAnchor(
      {
        primaryTaskId: effectiveOrchestrationAnchor.primaryTaskId,
        bundleTaskIds: effectiveOrchestrationAnchor.bundleTaskIds,
        orchestrationId: effectiveOrchestrationAnchor.orchestrationId,
      },
      effectiveOrchestrationAnchor.messageId || null,
    );
  }, [
    scheduleTrial,
    trialRunInFlight,
    subtasksWithTabularPreview.length,
    effectiveOrchestrationAnchor,
    openResultPanelFromAnchor,
  ]);

  useEffect(() => {
    if (!scheduledRunRecord || scheduledRunAutoOpenedPanelRef.current || busy) return;
    if (subtasksWithTabularPreview.length === 0 || !effectiveOrchestrationAnchor) return;
    scheduledRunAutoOpenedPanelRef.current = true;
    void openResultPanelFromAnchor(
      {
        primaryTaskId: effectiveOrchestrationAnchor.primaryTaskId,
        bundleTaskIds: effectiveOrchestrationAnchor.bundleTaskIds,
        orchestrationId: effectiveOrchestrationAnchor.orchestrationId,
      },
      effectiveOrchestrationAnchor.messageId || null,
    );
  }, [
    scheduledRunRecord,
    busy,
    subtasksWithTabularPreview.length,
    effectiveOrchestrationAnchor,
    openResultPanelFromAnchor,
  ]);

  useEffect(() => {
    if (scheduleTrial || scheduledRunRecord) return;
    if (!pendingSessionResultAutoOpenRef.current && !sessionResultAutoFollowRef.current) return;
    if (!effectiveOrchestrationAnchor) return;

    const latestSubtaskTaskId = subtasksWithTabularPreview[0]?.taskId ?? null;
    if (latestSubtaskTaskId) {
      pendingSessionResultAutoOpenRef.current = false;
      if (
        !showResultPanel ||
        !resultPanelContext ||
        !resultPanelContextMatchesAnchor(resultPanelContext, effectiveOrchestrationAnchor)
      ) {
        void openResultPanelFromAnchor(
          {
            primaryTaskId: effectiveOrchestrationAnchor.primaryTaskId,
            bundleTaskIds: effectiveOrchestrationAnchor.bundleTaskIds,
            orchestrationId: effectiveOrchestrationAnchor.orchestrationId,
          },
          effectiveOrchestrationAnchor.messageId || null,
          { focusedSubtaskId: latestSubtaskTaskId },
        );
        return;
      }
      if (resolvedPanelSubtaskId !== latestSubtaskTaskId) {
        setResultPanelContext((prev) =>
          prev && resultPanelContextMatchesAnchor(prev, effectiveOrchestrationAnchor)
            ? { ...prev, focusedSubtaskId: latestSubtaskTaskId }
            : prev,
        );
      }
      return;
    }

    if (bundlesAllTerminal && orchestrationBundlesForUi.length > 0) {
      pendingSessionResultAutoOpenRef.current = false;
      sessionResultAutoFollowRef.current = false;
    }
  }, [
    bundlesAllTerminal,
    effectiveOrchestrationAnchor,
    openResultPanelFromAnchor,
    orchestrationBundlesForUi.length,
    resolvedPanelSubtaskId,
    resultPanelContext,
    scheduleTrial,
    scheduledRunRecord,
    showResultPanel,
    subtasksWithTabularPreview,
  ]);

  const sendPreparedMessage = useCallback(async ({
    rawText,
    sourceIds,
    files,
  }: {
    rawText: string;
    sourceIds: string[];
    files: File[];
  }) => {
    const trimmedText = rawText.trim();
    const text = buildComposerMessage(trimmedText, sourceIds);
    const filesToSend = files;
    if ((!trimmedText && filesToSend.length === 0) || sending) return false;
    const maxChars = getChatMessageMaxChars();
    if (text.length > maxChars) {
      setError(`\u6d88\u606f\u8fc7\u957f\uff08${text.length} \u5b57\uff09\uff0c\u8bf7\u63a7\u5236\u5728 ${maxChars} \u5b57\u4ee5\u5185\u3002`);
      return false;
    }
    if (!platformAgent?.auth) {
      platformAgent?.openLogin("\u8bf7\u5148\u767b\u5f55\u540e\u518d\u53d1\u9001\u6d88\u606f\u3002");
      return false;
    }
    // Release the current session stream before starting a new one.
    releaseStream(sessionId);
    if (sseAbortRef.current) {
      sseAbortRef.current.abort();
    }
    const sendGen = sessionGenRef.current;
    abortPollRef.current = false;
    const abortController = new AbortController();
    sseAbortRef.current = abortController;
    setSending(true);
    setError("");
    const mid = safeRandomUUID();
    const isActiveSend = () => sessionGenRef.current === sendGen && isMounted.current;
    const optimisticAttachments = buildUserMessageAttachmentsFromFiles(filesToSend);
    const optimistic: SessionMessageItem = {
      id: `${OPTIMISTIC_USER_MESSAGE_ID_PREFIX}${safeRandomUUID()}`,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
      message_index: 0,
      message_id: mid,
      meta: optimisticAttachments.length > 0 ? { attachments: optimisticAttachments } : {},
    };
    const assistantStreamId = `${STREAMING_ASSISTANT_MESSAGE_ID_PREFIX}${mid}`;
    const nowIso = new Date().toISOString();
    registerStream(sessionId, { abortController, assistantStreamId });
    contentLenRef.current = 0;
    setMessages((cur) => [...cur, optimistic, createStreamingAssistantMessage(assistantStreamId, nowIso)]);
    setDraft("");
    setPendingFiles([]);
    setSelectedSourceIds([]);
    setSourcePlacements([]);
    try {
      await platformAgent.withFreshToken(async (token) => {
        const sendResult: ChatSendResult = await sendSessionMessageStream(
          token,
          sessionId,
          text,
          mid,
          setMessages,
          assistantStreamId,
          filesToSend,
          abortController.signal,
          (streamContent) => updateStreamContent(sessionId, streamContent),
          () => contentLenRef.current,
          isActiveSend,
        );
        completeStream(sessionId);
        if (!isActiveSend()) return;
        void refreshHistoryNow();
        if (sendResult.kind === "accepted") {
          setOrchestrationBundles([]);
          const pollResult = await pollAcceptedPlatformTaskInSession(
            (fn) => platformAgent.withFreshToken(fn),
            sessionId,
            mid,
            sendResult,
            {
              shouldAbort: () => abortPollRef.current || !isActiveSend(),
              onReload: async () => {
                if (isActiveSend()) await reload();
              },
              onTaskUpdate: (task) => {
                if (isActiveSend() && task) setLastTaskSnapshot(task);
              },
            },
          );
          const settledTaskId =
            pollResult.lastTask?.task_id?.trim() || sendResult.task_id?.trim() || "";
          if (settledTaskId && isActiveSend()) {
            await platformAgent.withFreshToken(async (token) => {
              const latest = await getTask(token, settledTaskId);
              setLastTaskSnapshot(latest);
            });
          }
          if (!scheduleTrial && !scheduledRunRecord && isActiveSend()) {
            pendingSessionResultAutoOpenRef.current = true;
            sessionResultAutoFollowRef.current = true;
            sessionResultAutoFollowInitializedRef.current = true;
          }
        }
      });
      if (isActiveSend()) {
        await reload();
      }
    } catch (e) {
      completeStream(sessionId);
      if (isActiveSend()) {
        setError(formatAgentApiErrorForUser(e));
        await reload();
        void refreshHistoryNow();
      }
    } finally {
      if (isActiveSend()) {
        setSending(false);
      }
    }
    return true;
  }, [
    buildComposerMessage,
    platformAgent,
    reload,
    refreshHistoryNow,
    scheduleTrial,
    scheduledRunRecord,
    sending,
    sessionId,
  ]);

  const send = useCallback(async (textOverride?: string) => {
    await sendPreparedMessage({
      rawText: textOverride ?? draft,
      sourceIds: textOverride === undefined ? selectedSourceIds : [],
      files: textOverride === undefined ? pendingFiles : [],
    });
  }, [draft, pendingFiles, selectedSourceIds, sendPreparedMessage]);

  useEffect(() => {
    if (scheduleTrial || scheduledRunRecord || !platformAgent?.auth) return;
    const homeLaunchMeta = tryClaimHomeSessionLaunchFirstSend(sessionId);
    if (!homeLaunchMeta) return;
    const launchFiles = takeHomeSessionLaunchFiles(sessionId);
    void (async () => {
      try {
        await sendPreparedMessage({
          rawText: homeLaunchMeta.prompt,
          sourceIds: homeLaunchMeta.selectedSourceIds,
          files: launchFiles,
        });
      } finally {
        saveHomeSessionLaunchMeta({ ...homeLaunchMeta, sendKind: "done" });
      }
    })();
  }, [platformAgent, scheduleTrial, scheduledRunRecord, sendPreparedMessage, sessionId]);

  useEffect(() => {
    if (scheduleTrial || scheduledRunRecord || !platformAgent?.auth) return;
    const homeLaunchMeta = loadHomeSessionLaunchMeta();
    if (
      homeLaunchMeta?.sessionId !== sessionId ||
      homeLaunchMeta.sendKind !== "in_flight" ||
      messages.length > 0 ||
      sending
    ) {
      return;
    }
    const t = setInterval(() => {
      void reload();
    }, SCHEDULE_TRIAL_SESSION_RELOAD_INTERVAL_MS);
    return () => clearInterval(t);
  }, [messages.length, platformAgent, reload, scheduleTrial, scheduledRunRecord, sending, sessionId]);

  const submitGuidanceSuggestion = useCallback((item: string) => {
    void send(item);
  }, [send]);

  const guidanceSuggestionToggleForMessage = useCallback(
    (messageId: string) => {
      if (scheduledRunRecord || scheduleTrial) return undefined;
      if (messageId !== interactiveGuidanceMessageId) return undefined;
      return submitGuidanceSuggestion;
    },
    [interactiveGuidanceMessageId, scheduledRunRecord, scheduleTrial, submitGuidanceSuggestion],
  );

  return (
    <>
    {scheduleTrial ? (
      <Dialog open={saveConfirmOpen} onOpenChange={setSaveConfirmOpen}>
        <DialogContent className="max-w-md rounded-panel">
          <DialogTitle>保存定时任务？</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-text-tertiary">
            试跑结束后不会自动写入定时任务列表。请确认试跑结果符合预期后再保存。
          </DialogDescription>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="rounded-control"
              disabled={saveBusy}
              onClick={() => setSaveConfirmOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              className="rounded-control bg-primary text-primary-foreground hover:bg-primary/85"
              disabled={saveBusy}
              onClick={() => {
                setSaveConfirmOpen(false);
                void onSaveSchedules();
              }}
            >
              确认保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    ) : null}
    <AliceShell
      currentPath="/agent/history"
      contentScrollMode="child"
      currentRunLabel={headerLabel}
      headerContentScrolled={messagesScrolled}
      rightRail={
        showResultPanel && resultPanelContext && platformAgent?.withFreshToken ? (
          <AgentTaskResultPanel
            artifacts={artifactsForTaskPanel}
            withFreshToken={withFreshTokenForResultPanel}
            bundleDownloadApi={resultPanelContext.bundleDownloadApi}
            bundleDownloadName={resultPanelContext.bundleDownloadName}
            taskId={resolvedPanelSubtaskId ?? resultPanelContext.primaryTaskId}
            resultGeneratedAt={resultPanelContext.finishedAt}
            errorMessage={resultPanelContext.errorMessage}
            taskStatus={resultPanelContext.lastStatus}
              subtaskResultTabs={
                panelSubtasksWithTabular.length > 1
                  ? panelSubtasksWithTabular.map((s) => ({
                      taskId: s.taskId,
                      label: compactText(s.label, 36),
                    }))
                  : undefined
              }
              activeSubtaskTaskId={resolvedPanelSubtaskId}
              onSubtaskSelect={(taskId) => {
                const row = panelBundlesForUi.find((s) => s.taskId === taskId);
                if (row && hasTabularTaskResultFiles(row.artifacts)) {
                  stopSessionResultAutoFollow();
                  setResultPanelContext((prev) =>
                    prev ? { ...prev, focusedSubtaskId: taskId } : null,
                  );
                }
              }}
            onClose={closeResultPanel}
          />
        ) : undefined
      }
    >
      <div className="flex h-platform-session-main min-h-0 flex-1 flex-col overflow-hidden bg-bg-surface">
        <div
          ref={messagesScrollRef}
          className="hide-scrollbar-y min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-4 pt-6 sm:px-6"
          onScroll={handleMessagesScroll}
        >
          <div ref={messagesInnerRef} className={cn("mx-auto w-full", SIMPLE_CHAT_COLUMN_MAX)}>
            <div className="space-y-5">
              {error ? <p className="text-sm text-danger">加载/发送失败：{error}</p> : null}
              {busy ? <p className="text-sm text-text-tertiary">加载中…</p> : null}
              {!busy && !sending && messages.length === 0 && !scheduleTrial ? (
                <p className="text-sm text-text-tertiary">该会话暂无消息</p>
              ) : null}
              <div className="space-y-3">
                {messages.map((m, i) => {
                  if (m.role !== "user" && m.role !== "assistant") return null;
                  const meta = m.meta && typeof m.meta === "object" ? (m.meta as Record<string, unknown>) : undefined;
                  const taskStepsFromMessage = parseTaskExecutionStepsFromMeta(meta);
                  const tmeta = loadScheduleTrialMeta();
                  const trialLabels =
                    scheduleTrial && tmeta?.sessionId === sessionId ? tmeta.executionStepLabels : undefined;
                  const isThisOrchestrationTurn =
                    m.role === "assistant" && i === firstAssistantIndex;
                  const isLatestDecompositionTurn =
                    m.role === "assistant" && i === latestDecompositionAssistantIndex;
                  const syntheticForTrial =
                    scheduleTrial &&
                    isThisOrchestrationTurn &&
                    !taskStepsFromMessage &&
                    Array.isArray(trialLabels) &&
                    trialLabels.length > 0
                      ? buildTaskStepsFromDecompositionLabels(
                          trialLabels,
                          m.id,
                          trialRunInFlight,
                          lastTaskSnapshot,
                          {
                            multiStepOrchestration: trialLabels.length > 1,
                            orchestrationFinished:
                              trialOrchestrationDone?.finished ?? Boolean(orchestrationAnchor),
                            orchestrationSuccess: trialOrchestrationDone?.success ?? true,
                          },
                        )
                      : null;
                  const syntheticForRunRecord =
                    scheduledRunRecord &&
                    isLatestDecompositionTurn &&
                    !taskStepsFromMessage &&
                    !latestStepsMessageId &&
                    runRecordExecutionStepsForLabels?.length
                      ? runRecordExecutionStepsForLabels
                      : null;
                  if (
                    isSupersededTaskExecutionStepsMessage(m, latestStepsByTaskId, taskStepsFromMessage)
                  ) {
                    return null;
                  }
                  const taskStepsToShow =
                    taskStepsFromMessage ??
                    syntheticForTrial ??
                    syntheticForRunRecord ??
                    (isLatestDecompositionTurn ? decompositionFallbackSteps : null);
                  const bubbleContext = executionBubbleContextForMessage(
                    messages,
                    meta,
                    orchestrationBundles,
                    expectedBundleTaskIds,
                  );
                  const messageOrchId =
                    meta && typeof meta.orchestration_id === "string" ? meta.orchestration_id.trim() : "";
                  const liveOrchMatchesMessage =
                    !messageOrchId ||
                    messageOrchId === (effectiveOrchestrationAnchor?.orchestrationId?.trim() ?? "");
                  const shouldOverlayLiveOrchStatuses =
                    (m.id === latestStepsMessageId || isThisOrchestrationTurn) &&
                    Boolean(liveOrchStepStatuses) &&
                    !bundlesAllTerminal &&
                    liveOrchMatchesMessage;
                  const stepsForExecutionBubble = taskStepsToShow
                    ? prepareExecutionStepsForBubble(taskStepsToShow, {
                        bundles: bubbleContext.bundles,
                        expectedTaskIds: bubbleContext.expectedTaskIds,
                        liveOverlay: shouldOverlayLiveOrchStatuses ? liveOrchStepStatuses : null,
                        ...executionStepsRuntimeOptions,
                      })
                    : null;
                  const showTaskStepsBubble = Boolean(stepsForExecutionBubble && stepsForExecutionBubble.length > 0);
                  const deferStepsToUserId = sessionClarificationFlow.supplementUserMessageId;
                  const showTaskStepsAtThisMessage = showTaskStepsBubble && !deferStepsToUserId;
                  const showDeferredTaskSteps =
                    Boolean(deferStepsToUserId && m.id === deferStepsToUserId && m.role === "user") &&
                    Boolean(latestExecutionSteps?.length);
                  const archivedClarifyText =
                    sessionClarificationFlow.archivedClarification ??
                    aliceClarificationForSteps?.message ??
                    null;
                  const rawTaskId = typeof meta?.task_id === "string" ? meta.task_id.trim() : "";
                  const trialResultOnFirstAssistant =
                    scheduleTrial &&
                    isThisOrchestrationTurn &&
                    effectiveOrchestrationAnchor &&
                    !trialRunInFlight &&
                    subtasksWithTabularPreview.length > 0;
                  const taskIdFromMeta =
                    m.role === "assistant" && rawTaskId && taskResultCardMessageIds.has(m.id) ? rawTaskId : undefined;
                  const taskId = taskIdFromMeta ?? (trialResultOnFirstAssistant ? effectiveOrchestrationAnchor!.primaryTaskId : undefined);
                  const hasArtifactsForResultCard = taskResultEntryVisibleByMessageId.get(m.id) === true;
                  const hideAssistantBubble = shouldHideAssistantMessageBubble(m);
                  const msgKind =
                    meta && typeof meta.kind === "string" ? (meta.kind as string).trim() : "";
                  const isLinkfoxClarification = msgKind === "linkfox_clarification";
                  const isOrchestrationFailure = msgKind === "orchestration_failure";
                  const isTaskTerminated = msgKind === "task_terminated";
                  const isTaskError =
                    m.role === "assistant" &&
                    meta?.task_status === "FAILED" &&
                    typeof meta?.error_message === "string" &&
                    !sessionHasTaskTerminatedForTask(messages, rawTaskId);
                  const matchingBundle = rawTaskId
                    ? orchestrationBundles.find((b) => b.taskId === rawTaskId) ?? orchestrationBundles[0]
                    : orchestrationBundles[0];
                  const stepsTerminated = Boolean(
                    stepsForExecutionBubble &&
                      (sessionHasTaskTerminatedForTask(messages, rawTaskId) ||
                        isUserTerminatedTaskState({
                          steps: stepsForExecutionBubble,
                          task:
                            lastTaskSnapshot && lastTaskSnapshot.task_id === rawTaskId
                              ? lastTaskSnapshot
                              : null,
                          bundle: matchingBundle ?? null,
                        })),
                  );
                  const showTerminatedGuidanceOnSteps =
                    showTaskStepsAtThisMessage &&
                    m.id === latestStepsMessageId &&
                    stepsTerminated;
                  const deferTaskTerminatedToSteps =
                    isTaskTerminated &&
                    shouldDeferTaskTerminatedToStepsBubble(messages, i, latestStepsMessageId);
                  const suppressStandaloneTaskResultCard = shouldSuppressStandaloneTaskResultCard(
                    messages,
                    i,
                    {
                      latestStepsMessageId,
                      taskResultCardMessageIds,
                      taskResultEntryVisibleByMessageId,
                      deferTaskTerminatedToSteps,
                    },
                  );
                  const guidancePresentation =
                    m.role === "assistant" &&
                    !showTaskStepsAtThisMessage &&
                    !hideAssistantBubble &&
                    !isTaskTerminated
                      ? resolvePostTaskGuidancePresentation(m, meta)
                      : ({ kind: "none" } as const);
                  const taskTerminatedPresentation =
                    m.role === "assistant" && isTaskTerminated
                      ? resolveTaskTerminatedPresentation(m, meta)
                      : ({ kind: "none" } as const);
                  const showThinkingPlaceholder =
                    m.role === "assistant" &&
                    !hideAssistantBubble &&
                    shouldShowAssistantThinkingPlaceholder(
                      m,
                      messages,
                      i,
                      sending,
                    );
                  const showGuidanceBubble = shouldRenderGuidanceBubbleAtMessage(messages, i);
                  const deferGuidanceToStepsBubble = shouldDeferPostTaskGuidanceToStepsBubble(
                    messages,
                    i,
                    latestStepsMessageId,
                  );
                  const roundGuidanceForSteps =
                    showTaskStepsAtThisMessage && m.id === latestStepsMessageId
                      ? resolveRoundPostTaskGuidanceContent(messages, i, {
                          taskId: rawTaskId || taskId,
                          taskSnapshot:
                            lastTaskSnapshot &&
                            (rawTaskId || taskId) &&
                            lastTaskSnapshot.task_id === (rawTaskId || taskId)
                              ? lastTaskSnapshot
                              : null,
                        })
                      : null;
                  const roundTaskOutcomeSummaryForSteps =
                    showTaskStepsAtThisMessage && m.id === latestStepsMessageId
                      ? resolveRoundTaskOutcomeSummary(messages, i, {
                          taskId: rawTaskId || taskId,
                          taskSnapshot:
                            lastTaskSnapshot &&
                            (rawTaskId || taskId) &&
                            lastTaskSnapshot.task_id === (rawTaskId || taskId)
                              ? lastTaskSnapshot
                              : null,
                        })
                      : null;
                  const dedicatedGuidanceLeading =
                    guidancePresentation.kind === "dedicated"
                      ? postTaskGuidanceLeadingByMessageId.get(m.id)?.text
                      : undefined;
                  const mergedGuidanceLeading =
                    guidancePresentation.kind === "embedded"
                      ? guidancePresentation.leading
                      : dedicatedGuidanceLeading;
                  const suppressMessageAsMergedGuidanceLeading =
                    mergedPostTaskGuidanceLeadingMessageIds.has(m.id) ||
                    roundGuidanceForSteps?.leadingMessageId === m.id;
                  const taskResultCard =
                    taskId && hasArtifactsForResultCard ? (
                      <TaskResultSummaryCard
                        title="任务结果"
                        summary=""
                        expanded={showResultPanel && focusedTaskId === taskId}
                        onToggle={() => {
                          if (showResultPanel && focusedTaskId === taskId) {
                            closeResultPanel();
                            return;
                          }
                          void openResultPanelForMessageManually(meta, m.id);
                        }}
                      />
                    ) : null;
                  const taskResultCardInline =
                    Boolean(taskResultCard) &&
                    m.role === "assistant" &&
                    (showTaskStepsAtThisMessage ||
                      (!isLinkfoxClarification &&
                        !isOrchestrationFailure &&
                        !isTaskError &&
                        !hideAssistantBubble &&
                        !showThinkingPlaceholder));
                  const key = m.id;
                  return (
                    <div key={key} className="space-y-2">
                      {m.role === "user" ? (
                        <>
                          {showDeferredTaskSteps && archivedClarifyText ? (
                            <AliceMessageBubble
                              body={archivedClarifyText}
                              datetime={
                                messages.find((item) => item.id === sessionClarificationFlow.clarificationMessageId)
                                  ?.created_at ?? m.created_at
                              }
                              composerDraft={m.content}
                              onSuggestionToggle={
                                scheduleTrial || scheduledRunRecord ? undefined : toggleGuidanceSuggestion
                              }
                            />
                          ) : null}
                          <SimpleUserBubble
                            text={m.content}
                            datetime={m.created_at}
                            attachments={parseUserMessageAttachments(
                              m.meta && typeof m.meta === "object" ? (m.meta as Record<string, unknown>) : undefined,
                            )}
                          />
                          {showDeferredTaskSteps ? (
                            <TaskExecutionStepsAssistantBubble
                              steps={prepareExecutionStepsForBubble(latestExecutionSteps!, {
                                ...executionBubbleContextForMessage(
                                  messages,
                                  (() => {
                                    const stepsMsg = latestStepsMessageId
                                      ? messages.find((x) => x.id === latestStepsMessageId)
                                      : undefined;
                                    return stepsMsg?.meta && typeof stepsMsg.meta === "object"
                                      ? (stepsMsg.meta as Record<string, unknown>)
                                      : undefined;
                                  })(),
                                  orchestrationBundles,
                                  expectedBundleTaskIds,
                                ),
                                liveOverlay:
                                  liveOrchStepStatuses && !bundlesAllTerminal ? liveOrchStepStatuses : null,
                                ...executionStepsRuntimeOptions,
                              })}
                              datetime={m.created_at}
                              platformSubtasks={
                                (() => {
                                  const supp = supplementalBundlesById[m.id];
                                  if (supp && supp.length > 0) {
                                    return mergeBundlesIntoPlatformSnapshots(latestExecutionSteps!, supp);
                                  }
                                  if (stepsMessageIdForBundles && orchestrationBundlesForUi.length > 0) {
                                    return mergeBundlesIntoPlatformSnapshots(latestExecutionSteps!, orchestrationBundlesForUi);
                                  }
                                  return undefined;
                                })()
                              }
                              timelineRunId={sessionId}
                              activeHighlightTaskId={stepTimelineHighlightTaskId}
                              onOpenSubtaskResult={(subtaskTaskId) => {
                                const stepsMsg = latestStepsMessageId
                                  ? messages.find((x) => x.id === latestStepsMessageId)
                                  : undefined;
                                const stepsMeta =
                                  stepsMsg?.meta && typeof stepsMsg.meta === "object"
                                    ? (stepsMsg.meta as Record<string, unknown>)
                                    : undefined;
                                void openResultPanelForMessageManually(stepsMeta, stepsMsg?.id ?? null, {
                                  focusedSubtaskId: subtaskTaskId,
                                });
                              }}
                            />
                          ) : null}
                        </>
                      ) : m.role === "assistant" ? (
                        showTaskStepsAtThisMessage ? (
                          <>
                            <TaskExecutionStepsAssistantBubble
                              steps={stepsForExecutionBubble!}
                              datetime={m.created_at}
                              terminated={stepsTerminated}
                              platformSubtasks={
                                (() => {
                                  const supp = supplementalBundlesById[m.id];
                                  if (supp && supp.length > 0) {
                                    return mergeBundlesIntoPlatformSnapshots(stepsForExecutionBubble!, supp);
                                  }
                                  if (m.id === stepsMessageIdForBundles && orchestrationBundlesForUi.length > 0) {
                                    return mergeBundlesIntoPlatformSnapshots(stepsForExecutionBubble!, orchestrationBundlesForUi);
                                  }
                                  if (stepsForExecutionBubble && stepsForExecutionBubble.length > 0 && m.id !== stepsMessageIdForBundles) {
                                    const meta2 = m.meta && typeof m.meta === "object" ? (m.meta as Record<string, unknown>) : undefined;
                                    loadSupplementalBundlesForMessage(m.id, meta2);
                                  }
                                  return undefined;
                                })()
                              }
                              timelineRunId={sessionId}
                              activeHighlightTaskId={stepTimelineHighlightTaskId}
                              onOpenSubtaskResult={(subtaskTaskId) => {
                                void openResultPanelForMessageManually(meta, m.id, {
                                  focusedSubtaskId: subtaskTaskId,
                                });
                              }}
                              afterExecution={taskResultCard}
                            />
                            {showTerminatedGuidanceOnSteps ? (
                              <>
                                <AliceMessageBubble body={TASK_TERMINATED_LEADING} datetime={m.created_at} />
                                <PostTaskGuidanceBubble
                                  content={TASK_TERMINATED_GUIDANCE_BLOCK}
                                  datetime={m.created_at}
                                  composerDraft={draft}
                                  onSuggestionToggle={guidanceSuggestionToggleForMessage(m.id)}
                                />
                              </>
                            ) : null}
                            {isOrchestrationFailure ? (
                              <AliceErrorBubble
                                body={m.content}
                                datetime={m.created_at}
                                composerDraft={scheduleTrial || scheduledRunRecord ? "" : draft}
                                onSuggestionToggle={
                                  scheduleTrial || scheduledRunRecord ? undefined : toggleGuidanceSuggestion
                                }
                              />
                            ) : null}
                            {(m.id === latestStepsMessageId || isThisOrchestrationTurn) &&
                            aliceClarificationForSteps &&
                            !deferStepsToUserId &&
                            !messages.some(
                              (item) =>
                                item.role === "assistant" &&
                                item.meta &&
                                typeof item.meta === "object" &&
                                (item.meta as Record<string, unknown>).kind === "linkfox_clarification",
                            ) ? (
                              <AliceMessageBubble
                                body={aliceClarificationForSteps.message}
                                datetime={m.created_at}
                                composerDraft={draft}
                                onSuggestionToggle={scheduledRunRecord ? undefined : toggleGuidanceSuggestion}
                              />
                            ) : null}
                          </>
                        ) : isLinkfoxClarification &&
                          !shouldSuppressSessionClarificationAt(sessionClarificationFlow, m.id) ? (
                          <AliceMessageBubble
                            body={m.content}
                            datetime={m.created_at}
                            streaming={isStreamingAssistantMessage(m)}
                            composerDraft={
                              shouldSuppressSessionClarificationAt(sessionClarificationFlow, m.id)
                                ? ""
                                : draft
                            }
                            onSuggestionToggle={
                              shouldSuppressSessionClarificationAt(sessionClarificationFlow, m.id) ||
                              scheduledRunRecord
                                ? undefined
                                : toggleGuidanceSuggestion
                            }
                          />
                        ) : isLinkfoxClarification ? null : taskTerminatedPresentation.kind !== "none" &&
                          showGuidanceBubble &&
                          !deferTaskTerminatedToSteps ? (
                          <>
                            <AliceMessageBubble body={taskTerminatedPresentation.leading} datetime={m.created_at} />
                            <PostTaskGuidanceBubble
                              content={taskTerminatedPresentation.guidanceBlock}
                              datetime={m.created_at}
                              composerDraft={draft}
                              onSuggestionToggle={guidanceSuggestionToggleForMessage(m.id)}
                            />
                          </>
                        ) : guidancePresentation.kind !== "none" &&
                          !taskId &&
                          showGuidanceBubble &&
                          !deferGuidanceToStepsBubble ? (
                          <>
                            {mergedGuidanceLeading ? (
                              <AliceMessageBubble body={mergedGuidanceLeading} datetime={m.created_at} />
                            ) : null}
                            <PostTaskGuidanceBubble
                              content={
                                guidancePresentation.kind === "dedicated"
                                  ? guidancePresentation.content
                                  : guidancePresentation.guidanceBlock
                              }
                              datetime={m.created_at}
                              composerDraft={draft}
                              onSuggestionToggle={guidanceSuggestionToggleForMessage(m.id)}
                            />
                          </>
                        ) : isOrchestrationFailure && !suppressMessageAsMergedGuidanceLeading ? (
                          <AliceErrorBubble
                            body={m.content}
                            datetime={m.created_at}
                            composerDraft={scheduleTrial || scheduledRunRecord ? "" : draft}
                            onSuggestionToggle={
                              scheduleTrial || scheduledRunRecord ? undefined : toggleGuidanceSuggestion
                            }
                          />
                        ) : isTaskError && !suppressMessageAsMergedGuidanceLeading ? (
                          <AliceErrorBubble
                            body={m.content}
                            datetime={m.created_at}
                            composerDraft={scheduleTrial || scheduledRunRecord ? "" : draft}
                            onSuggestionToggle={
                              scheduleTrial || scheduledRunRecord ? undefined : toggleGuidanceSuggestion
                            }
                          />
                        ) : suppressMessageAsMergedGuidanceLeading ||
                          hideAssistantBubble ||
                          shouldSuppressPlainAssistantBubbleForGuidance(guidancePresentation) ? null : showThinkingPlaceholder ? (
                          <AssistantLoadingRow variant="thinking" withIdentity />
                        ) : (
                          <SimpleAssistantBubble
                            body={m.content}
                            datetime={m.created_at}
                            streaming={isStreamingAssistantMessage(m)}
                            after={taskResultCard}
                          />
                        )
                      ) : null}
                      {taskResultCard && !taskResultCardInline && !suppressStandaloneTaskResultCard ? (
                        <AssistantOutputFrame datetime={m.created_at} wide>
                          {taskResultCard}
                        </AssistantOutputFrame>
                      ) : null}
                      {roundTaskOutcomeSummaryForSteps &&
                      !showTerminatedGuidanceOnSteps &&
                      !roundGuidanceForSteps?.leading ? (
                        <AliceMessageBubble body={roundTaskOutcomeSummaryForSteps.text} datetime={m.created_at} />
                      ) : null}
                      {roundGuidanceForSteps && !showTerminatedGuidanceOnSteps ? (
                        <>
                          {roundGuidanceForSteps.leading ? (
                            <AliceMessageBubble body={roundGuidanceForSteps.leading} datetime={m.created_at} />
                          ) : null}
                          <PostTaskGuidanceBubble
                            content={roundGuidanceForSteps.content}
                            datetime={m.created_at}
                            composerDraft={draft}
                            onSuggestionToggle={guidanceSuggestionToggleForMessage(
                              roundGuidanceForSteps.messageId.startsWith("task_guidance_")
                                ? m.id
                                : roundGuidanceForSteps.messageId,
                            )}
                          />
                        </>
                      ) : taskId && guidancePresentation.kind !== "none" && showGuidanceBubble ? (
                        <>
                          {mergedGuidanceLeading ? (
                            <AliceMessageBubble body={mergedGuidanceLeading} datetime={m.created_at} />
                          ) : null}
                          <PostTaskGuidanceBubble
                            content={
                              guidancePresentation.kind === "dedicated"
                                ? guidancePresentation.content
                                : guidancePresentation.guidanceBlock
                            }
                            datetime={m.created_at}
                            composerDraft={draft}
                            onSuggestionToggle={guidanceSuggestionToggleForMessage(m.id)}
                          />
                        </>
                      ) : null}
                    </div>
                  );
                })}
                {sending &&
                !sessionHasVisibleInFlightAssistant(messages) &&
                !sessionHasAssistantThinkingPlaceholder(messages, sending) ? (
                  <AssistantLoadingRow variant="thinking" withIdentity />
                ) : null}
                {showTrialRunFooterLine ? <AssistantLoadingRow variant="task" /> : null}
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 bg-transparent px-4 py-4 sm:px-6">
          <div className={cn("mx-auto w-full", SIMPLE_CHAT_COLUMN_MAX)}>
            {scheduledRunRecord ? (
              <p className="py-1 text-center text-xs text-text-disabled">此为定时任务执行记录，不支持继续追问。</p>
            ) : scheduleTrial ? (
              <div className="flex flex-col gap-3">
                {trialRunInFlight ? (
                  <p className="text-center text-xs text-text-disabled">试跑进行中，完成后可手动保存（不会自动写入定时任务）</p>
                ) : trialSaveReady ? (
                  <p className="text-center text-xs text-text-tertiary">试跑已结束，请确认结果后点击「保存」</p>
                ) : null}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full min-w-0 rounded-control sm:w-auto"
                  disabled={scheduleControlsLocked}
                  onClick={goBackToSchedule}
                >
                  上一步
                </Button>
                <div className="flex w-full min-w-0 items-center justify-end gap-2 sm:max-w-sm">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 flex-1 rounded-control text-text-disabled sm:flex-initial"
                    disabled={!terminateEnabled}
                    onClick={() => void onTerminateTrial()}
                  >
                    终止
                  </Button>
                  <Button
                    type="button"
                    className="h-11 min-w-22 flex-1 rounded-control bg-primary text-primary-foreground hover:bg-primary/85 sm:flex-initial"
                    disabled={!trialSaveReady}
                    onClick={() => setSaveConfirmOpen(true)}
                  >
                    保存
                  </Button>
                </div>
                </div>
              </div>
            ) : (
              <TaskComposer
                value={draft}
                onValueChange={setDraft}
                placeholder="您可以继续追问或者让我做其他工作哦～"
                mode="普通模式"
                onModeChange={() => {}}
                selectedSourceIds={selectedSourceIds}
                sourcePlacements={sourcePlacements}
                dataSourceGroups={composerDataSourceGroups}
                dataSourceItems={composerDataSourceItems}
                onToolSelect={addComposerSource}
                onSourceRemove={removeComposerSource}
                submitVariant={composerShowsStop ? "stop" : "send"}
                onStop={() => void stopCurrentSessionTask()}
                onFilesSelected={(files) => {
                  setPendingFiles((prev) => {
                    const picked = Array.from(files);
                    if (picked.length === 0) return prev;
                    const seen = new Set(prev.map((f) => `${f.name}:${f.size}:${f.lastModified}`));
                    const merged = [...prev];
                    for (const f of picked) {
                      const key = `${f.name}:${f.size}:${f.lastModified}`;
                      if (!seen.has(key)) {
                        seen.add(key);
                        merged.push(f);
                      }
                    }
                    return merged;
                  });
                }}
                onAttachmentsChange={(files) => {
                  setPendingFiles(files);
                }}
                onSubmit={() => void send()}
              />
            )}
          </div>
        </div>
      </div>
    </AliceShell>
    </>
  );
}
