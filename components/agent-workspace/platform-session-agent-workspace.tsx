"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AssistantLoadingRow } from "@/components/assistant-loading-row";
import { TaskExecutionStepsAssistantBubble } from "@/components/task-execution-steps-assistant-bubble";
import { MoreDataShell } from "@/components/more-data-shell";
import { AgentTaskResultPanel } from "@/components/agent-task-result-panel";
import { TaskResultSummaryCard } from "@/components/task-result-summary-card";
import { TaskComposer } from "@/components/task-composer";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { useMoreDataShellState } from "@/components/more-data-shell";
import { compactText } from "@/components/agent-workspace-view-models";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  deleteTaskSession,
  formatAgentApiErrorForUser,
  getTask,
  getToolOrchestration,
  listSessionMessages,
  patchTaskExecutionSteps,
} from "@/lib/agent-api/client";
import { getChatMessageMaxChars } from "@/lib/agent-api/config";
import type { ChatSendResult, SessionMessageItem, TaskResponse } from "@/lib/agent-api/types";
import {
  createStreamingAssistantMessage,
  isStreamingAssistantMessage,
  sendSessionMessageStream,
  sessionHasAssistantThinkingPlaceholder,
  sessionHasVisibleInFlightAssistant,
  shouldShowAssistantThinkingPlaceholder,
} from "@/lib/session-chat-send";
import { AGENT_COMPOSER_PREFILL_STORAGE_KEY } from "@/lib/agent-api/session";
import {
  appendToComposerDraft,
  composerDraftContainsSuggestion,
  parseComposerPrefillStorageValue,
  removeFromComposerDraft,
} from "@/lib/composer-prefill";
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
import { saveScheduleTasksWithDraft } from "@/lib/save-schedule-from-draft";
import { buildTaskStepsFromDecompositionLabels } from "@/lib/schedule-trial-execution-presentation";
import { parseTaskExecutionStepsFromMeta } from "@/lib/task-execution-steps-meta";
import {
  buildLatestStepsMessageIdByTaskId,
  buildTaskResultHintsByTaskId,
  isSupersededTaskExecutionStepsMessage,
  messageIdsEligibleForTaskResultCard,
} from "@/lib/session-task-result-card-visibility";
import { extractDecompositionLabelsFromMessages } from "@/lib/parse-decomposition-labels";
import { resolvePostTaskGuidancePresentation } from "@/lib/parse-post-task-guidance";
import { shouldHideAssistantMessageBubble } from "@/lib/session-message-ui-filter";
import {
  analyzeSessionClarificationFlow,
  shouldSuppressSessionClarificationAt,
} from "@/lib/session-clarification-flow";
import { safeRandomUUID } from "@/lib/random-uuid";
import { hasTabularTaskResultFiles } from "@/lib/platform-task-artifacts";
import {
  buildBundleDownloadApiForPanel,
  enrichOrchestrationBundlesWithStepLabels,
  fetchTaskOrchestrationForResultPanel,
  alignStepStatusesWithOrchestrationBundles,
  buildPlatformSubtasksForExecutionSteps,
  pickBestOrchestrationAnchor,
  resolvePanelAnchorForStepsMessage,
  type OrchestrationAnchor,
  type PanelOrchestrationAnchor,
  type ResultPanelContext,
  type TaskOrchestrationBundleRow,
} from "@/lib/merge-orchestration-task-artifacts";
import {
  getFrontendMockOrchestrationBundles,
  getFrontendMockResultPanelData,
  getFrontendMockSessionMessages,
  isFrontendMockSessionId,
} from "@/lib/frontend-mock-session";
import { pollPlatformTaskUntilSettled } from "@/lib/poll-task-until-settled";
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

import { useChatStickToBottom } from "@/lib/use-chat-stick-to-bottom";
import { PostTaskGuidanceBubble } from "./post-task-guidance-bubble";
import {
  AliceErrorBubble,
  AliceMessageBubble,
  SIMPLE_CHAT_COLUMN_MAX,
  SimpleAssistantBubble,
  SimpleSystemBubble,
  SimpleUserBubble,
} from "./chat-bubbles";
import { sanitizeClarificationForUserDisplay } from "@/lib/linkfox-clarification";
import { humanizeTaskErrorMessage } from "@/lib/platform-task-error-copy";
import { sessionHasOrchestrationFailure } from "@/lib/orchestration-failure-message";

function mergeTaskStepStatuses(
  steps: TaskExecutionStep[],
  overlay: TaskExecutionStepStatus[] | null,
): TaskExecutionStep[] {
  if (!overlay?.length) return steps;
  return steps.map((s, i) => (overlay[i] ? { ...s, status: overlay[i]! } : s));
}

export function PlatformSessionAgentWorkspace({
  sessionId,
  scheduleTrial = false,
  scheduledRunRecord = false,
  runLabel,
  fallbackTaskId,
}: {
  sessionId: string;
  /** 从定时任务立即运行进入：隐藏输入框，展示保存/终止。 */
  scheduleTrial?: boolean;
  /** 从定时任务「运行记录-查看过程」进入：只读回放，样式与正常对话一致，不可追问。 */
  scheduledRunRecord?: boolean;
  runLabel?: string;
  /** 运行记录 meta 中的 skill task_id，用于拉取编排产物（消息 meta 缺省时） */
  fallbackTaskId?: string;
}) {
  const platformAgent = useOptionalPlatformAgent();
  const { refreshHistoryNow, setActiveSessionTitle, bumpHistorySessionActivity } = useMoreDataShellState();
  const router = useRouter();
  const frontendMockSession = isFrontendMockSessionId(sessionId);
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
    if (frontendMockSession) {
      setMessagesLoaded(false);
      const cached = readSessionMessageCache(sessionId);
      const baseMessages = getFrontendMockSessionMessages();
      const source = cached && cached.length >= baseMessages.length ? cached : baseMessages;
      const fresh = processStreamingMessages(source);
      writeSessionMessageCache(sessionId, fresh);
      setMessages(fresh);
      setOrchestrationBundles(getFrontendMockOrchestrationBundles());
      setBusy(false);
      setError("");
      setMessagesLoaded(true);
      return;
    }

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
          if (!streamState || streamState.status !== "streaming") return fresh;
          const streamId = streamState.assistantStreamId;
          const curStreaming = cur.find((m) => m.id === streamId && isStreamingAssistantMessage(m));
          if (!curStreaming) return fresh;
          // fresh 中无此流式条（服务端尚未落库）→ 将本地流式 + 乐观 user 追加到列表
          if (!fresh.some((m) => m.id === streamId)) {
            const userMsg = cur.find((m) => m.role === "user" && m.id.startsWith("optimistic_user_"));
            const tail = userMsg ? [userMsg, curStreaming] : [curStreaming];
            // 去重：避免与 fresh 中已存在的同 id 消息重复
            const freshIds = new Set(fresh.map((m) => m.id));
            const append = tail.filter((m) => !freshIds.has(m.id));
            return [...fresh, ...append];
          }
          return fresh.map((m) =>
            m.id === streamId ? curStreaming : m,
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
  }, [frontendMockSession, platformAgent, processStreamingMessages, sessionId]);

  // Resolve stale task_execution_steps in the background every time messages
  // are loaded, without blocking render or the session-list refresh.
  const resolveStaleRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (frontendMockSession) return;
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
            const task = await getTask(token, tid);
            if (cancelled) return;
            let resolved: typeof steps | null = null;

            if (task.status === "SUCCESS") {
              resolved = steps.map((s) => ({ ...s, status: "done" as TaskExecutionStepStatus }));
            } else if (task.status === "FAILED") {
              resolved = steps.map((s) => ({ ...s, status: "error" as TaskExecutionStepStatus }));
            } else if (task.status === "RUNNING" && steps[0]?.status === "pending") {
              resolved = steps.map((s, idx) => ({
                ...s,
                status: idx === 0 ? ("running" as TaskExecutionStepStatus) : s.status,
              }));
            }

            if (!resolved) return;

            if (task.status === "SUCCESS" || task.status === "FAILED") {
              const orchId =
                typeof meta.orchestration_id === "string" && meta.orchestration_id.trim()
                  ? meta.orchestration_id.trim()
                  : null;
              try {
                await patchTaskExecutionSteps(token, sessionId, m.id, {
                  round_id: (meta.round_id as string) || "",
                  task_id: tid,
                  steps: resolved.map((s) => ({
                    id: s.id,
                    label: s.label,
                    status: s.status,
                  })),
                  orchestration_id: orchId,
                });
              } catch {
                /* best-effort */
              }
            }

            if (cancelled) return;
            resolveStaleRef.current.add(m.id);
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id === m.id && msg.meta && typeof msg.meta === "object") {
                  return {
                    ...msg,
                    meta: {
                      ...(msg.meta as Record<string, unknown>),
                      steps: resolved!.map((s) => ({
                        id: s.id,
                        label: s.label,
                        status: s.status,
                      })),
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
  }, [busy, frontendMockSession, messages, platformAgent, sessionId]);

  useEffect(() => {
    resolveStaleRef.current = new Set();
  }, [sessionId]);

  useEffect(() => {
    isMounted.current = true;
    abortPollRef.current = false;
    sessionGenRef.current += 1;
    return () => {
      isMounted.current = false;
      abortPollRef.current = true;
      // SSE 流保持存活（跨会话切换不断流），交由 streaming-session-manager 管理生命周期
    };
  }, [sessionId]);

  useEffect(() => {
    if (frontendMockSession) {
      platformAgent?.setActivePlatformSession(sessionId);
      void reload();
      return;
    }
    if (!platformAgent) return;
    if (!platformAgent.auth) return;
    platformAgent.setActivePlatformSession(sessionId);
    if (scheduleTrial && isScheduleTrialAwaitingFirstMessage(sessionId, loadScheduleTrialMeta())) {
      return;
    }
    void reload();
  }, [frontendMockSession, platformAgent, reload, sessionId, scheduleTrial]);

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

  /** 立即运行首条在会话页发送：进入页面后再发，避免在定时页等接口导致进页时对话已过半。 */
  useEffect(() => {
    if (!scheduleTrial || !platformAgent?.auth) return;
    if (!tryClaimScheduleTrialFirstSend(sessionId)) return;
    const prompt = loadScheduleCreateDraft()?.prompt?.trim() ?? "";
    if (!prompt) {
      saveScheduleTrialMeta({ v: 1, sessionId, taskId: null, sendKind: "unknown" });
      return;
    }
    const userMid = `optimistic_user_${safeRandomUUID()}`;
    const optimistic: SessionMessageItem = {
      id: userMid,
      role: "user",
      content: prompt,
      created_at: new Date().toISOString(),
      message_index: 0,
      meta: {},
    };
    setError("");
    setSending(true);
    const mid = safeRandomUUID();
    const assistantStreamId = `streaming_assistant_${mid}`;
    const nowIso = new Date().toISOString();
    // 与主 send() 对齐：注册 stream 以便 manager 接收 onDelta 推送
    releaseStream(sessionId);
    const trialAbort = new AbortController();
    registerStream(sessionId, { abortController: trialAbort, assistantStreamId });
    contentLenRef.current = 0;
    const trialSendGen = sessionGenRef.current;
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
            [],    // files
            trialAbort.signal,
            (content) => updateStreamContent(sessionId, content),
            () => contentLenRef.current,
            () => sessionGenRef.current === trialSendGen && isMounted.current,
          );
          completeStream(sessionId);
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
        if (isMounted.current) await reload();
      } catch (e) {
        completeStream(sessionId);
        saveScheduleTrialMeta({ v: 1, sessionId, taskId: null, sendKind: "unknown" });
        if (isMounted.current) setError(formatAgentApiErrorForUser(e) || "发送失败");
        if (isMounted.current) await reload();
      } finally {
        if (isMounted.current) setSending(false);
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

  const linkfoxClarificationForSteps = useMemo(() => {
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

  useEffect(() => {
    if (scheduleTrial || scheduledRunRecord) return;
    try {
      const raw = sessionStorage.getItem(AGENT_COMPOSER_PREFILL_STORAGE_KEY);
      if (raw) {
        setDraft(parseComposerPrefillStorageValue(raw).text);
        sessionStorage.removeItem(AGENT_COMPOSER_PREFILL_STORAGE_KEY);
      }
    } catch {
      /* ignore */
    }
  }, [sessionId, scheduleTrial, scheduledRunRecord]);

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
    ? (loadScheduleCreateDraft()?.title?.trim() || "立即运行")
    : scheduledRunRecord
      ? (runLabel?.trim() || "定时任务记录")
      : firstUserMessageTitle || "历史对话";
  /** 立即运行须执行结束且会话已有内容后，才允许人工确认保存（不会运行结束自动落库） */
  const trialSaveReady =
    scheduleTrial &&
    !busy &&
    !sending &&
    !trialRunInFlight &&
    !saveBusy &&
    messages.length > 0;
  /** 立即运行页：除保存提交中外都允许点「终止」，避免 404/轮询异常时无法离开 */
  const terminateEnabled = scheduleTrial && !saveBusy;

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
    router.push("/schedules");
  }, [platformAgent, router, trialTaskId]);

  useChatStickToBottom(messagesScrollRef, messagesInnerRef, [busy, error, messages, sending], {
    resetKey: sessionId,
  });

  useEffect(() => {
    // 在 reset effect 中同步检查缓存：缓存命中则立即展示，不依赖后续 effect 调用时序
    const cached = readSessionMessageCache(sessionId);
    if (frontendMockSession) {
      const baseMessages = getFrontendMockSessionMessages();
      const mockMessages = cached && cached.length >= baseMessages.length ? cached : baseMessages;
      setMessages(processStreamingMessages(mockMessages));
      setMessagesLoaded(true);
      setBusy(false);
      setError("");
    } else {
      setMessages(cached ?? []);
      setMessagesLoaded(false);
    }
    setLiveOrchStepStatuses(null);

    setShowResultPanel(false);
    setFocusedTaskId(null);
    setResultPanelContext(null);
    setOrchestrationBundles(frontendMockSession ? getFrontendMockOrchestrationBundles() : []);
    setTrialOrchestrationDone(null);
    trialAutoOpenedPanelRef.current = false;
    scheduledRunAutoOpenedPanelRef.current = false;
    trialPrefetchAnchorRef.current = null;
    trialDoneReloadedRef.current = false;
    trialClarificationReloadedRef.current = false;
    setLiveOrchClarification(null);
    setSupplementalBundlesById({});
  }, [frontendMockSession, processStreamingMessages, sessionId]);

  // 防御性守卫：只要 messages 非空，busy 就必须是 false
  // 避免 guard 阻止 reload() 后 busy 永远停留在 true
  useEffect(() => {
    if (messages.length > 0) {
      setBusy(false);
    }
  }, [messages]);

  useEffect(() => {
    if (scheduleTrial || scheduledRunRecord) return;
    if (frontendMockSession) return;
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
    sending,
    frontendMockSession,
  ]);

  const taskResultCardMessageIds = useMemo(() => messageIdsEligibleForTaskResultCard(messages), [messages]);
  const taskResultHintsByTaskId = useMemo(() => buildTaskResultHintsByTaskId(messages), [messages]);

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

  useEffect(() => {
    if (frontendMockSession) {
      setLiveOrchClarification(null);
      setLiveOrchStepStatuses(null);
      return;
    }
    const orchId = effectiveOrchestrationAnchor?.orchestrationId?.trim();
    if (!orchId || !platformAgent?.auth) {
      setLiveOrchClarification(null);
      setLiveOrchStepStatuses(null);
      return;
    }
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        await platformAgent.withFreshToken(async (token) => {
          const orch = await getToolOrchestration(token, orchId);
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
        });
      } catch {
        /* 编排可能已结束 */
      }
    };
    void tick();
    const id = setInterval(() => void tick(), SCHEDULE_TRIAL_TASK_POLL_INTERVAL_MS);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [effectiveOrchestrationAnchor?.orchestrationId, frontendMockSession, platformAgent, scheduleTrial]);

  useEffect(() => {
    if (frontendMockSession) {
      if (effectiveOrchestrationAnchor && !showResultPanel) {
        setOrchestrationBundles(getFrontendMockOrchestrationBundles());
      }
      return;
    }
    if (!effectiveOrchestrationAnchor || !platformAgent?.auth || showResultPanel) {
      return;
    }
    if (scheduleTrial && trialRunInFlight) return;

    let cancelled = false;
    void platformAgent.withFreshToken(async (token) => {
      try {
        const data = await fetchTaskOrchestrationForResultPanel(
          token,
          effectiveOrchestrationAnchor.primaryTaskId,
          effectiveOrchestrationAnchor.bundleTaskIds,
          { orchestrationId: effectiveOrchestrationAnchor.orchestrationId },
        );
        if (!cancelled) setOrchestrationBundles(data.bundles);
      } catch {
        // task/orchestration may have been deleted
      }
    });
    return () => {
      cancelled = true;
    };
  }, [effectiveOrchestrationAnchor, frontendMockSession, platformAgent, showResultPanel, scheduleTrial, trialRunInFlight]);

  const loadSupplementalBundlesForMessage = useCallback((messageId: string, meta: Record<string, unknown> | undefined) => {
    if (!frontendMockSession && !platformAgent?.auth) return;
    if (supplementalBundlesById[messageId] || fetchedSupplementalRef.current.has(messageId)) return;
    const panelAnchor = resolvePanelAnchorForStepsMessage(messages, meta);
    if (!panelAnchor) {
      fetchedSupplementalRef.current.add(messageId);
      return;
    }
    fetchedSupplementalRef.current.add(messageId);
    if (frontendMockSession) {
      setSupplementalBundlesById((prev) => ({
        ...prev,
        [messageId]: getFrontendMockOrchestrationBundles(),
      }));
      return;
    }
    if (!platformAgent?.auth) return;
    void platformAgent.withFreshToken(async (token) => {
      try {
        const expandOrchestration =
          !panelAnchor.bundleTaskIds || panelAnchor.bundleTaskIds.length <= 1;
        const data = await fetchTaskOrchestrationForResultPanel(
          token,
          panelAnchor.primaryTaskId,
          panelAnchor.bundleTaskIds,
          {
            orchestrationId: panelAnchor.orchestrationId,
            expandOrchestration,
          },
        );
        setSupplementalBundlesById((prev) => ({ ...prev, [messageId]: data.bundles }));
      } catch {
        // task/orchestration may have been deleted
      }
    });
  }, [frontendMockSession, platformAgent, supplementalBundlesById, messages]);

  useEffect(() => {
    fetchedSupplementalRef.current = new Set();
    setSupplementalBundlesById({});
  }, [sessionId]);

  const firstAssistantIndex = useMemo(
    () => messages.findIndex((m) => m.role === "assistant"),
    [messages],
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

  const decompositionFallbackSteps = useMemo(() => {
    if (latestStepsMessageId) return null;
    const labels = extractDecompositionLabelsFromMessages(messages);
    if (!labels.length) return null;
    const orchFailed = sessionHasOrchestrationFailure(messages);
    const orchCancelled = messages.some(
      (m) => m.role === "assistant" && /多步任务已由用户终止/.test(m.content || ""),
    );
    return buildTaskStepsFromDecompositionLabels(labels, sessionId, false, null, {
      multiStepOrchestration: labels.length > 1,
      orchestrationFinished: Boolean(orchestrationAnchor),
      orchestrationSuccess: !orchFailed && !orchCancelled,
    });
  }, [latestStepsMessageId, messages, orchestrationAnchor, sessionId]);

  const runRecordExecutionStepsForLabels = useMemo(() => {
    if (!scheduledRunRecord) return null;
    const labels = extractDecompositionLabelsFromMessages(messages);
    if (!labels.length) return null;
    const orchFailed = sessionHasOrchestrationFailure(messages);
    const orchCancelled = messages.some(
      (m) => m.role === "assistant" && /多步任务已由用户终止/.test(m.content || ""),
    );
    return buildTaskStepsFromDecompositionLabels(labels, sessionId, false, null, {
      multiStepOrchestration: labels.length > 1,
      orchestrationFinished: true,
      orchestrationSuccess: !orchFailed && !orchCancelled,
    });
  }, [scheduledRunRecord, messages, sessionId]);

  const executionStepsForBundleLabels =
    latestExecutionSteps ?? trialExecutionStepsForLabels ?? runRecordExecutionStepsForLabels;

  const orchestrationBundlesForUi = useMemo(
    () => enrichOrchestrationBundlesWithStepLabels(orchestrationBundles, executionStepsForBundleLabels),
    [orchestrationBundles, executionStepsForBundleLabels],
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

  const closeResultPanel = useCallback(() => {
    setShowResultPanel(false);
    setFocusedTaskId(null);
    setResultPanelContext(null);
  }, []);

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
      if (frontendMockSession) {
        setError("");
        applyPanelFetchToContext(messageId, anchor, getFrontendMockResultPanelData(), options?.focusedSubtaskId);
        return;
      }
      if (!platformAgent?.auth) {
        platformAgent?.openLogin("请先登录后再查看任务结果。");
        return;
      }
      setError("");
      try {
        await platformAgent.withFreshToken(async (token) => {
        const expandOrchestration = !anchor.bundleTaskIds || anchor.bundleTaskIds.length <= 1;
          const data = await fetchTaskOrchestrationForResultPanel(
            token,
            anchor.primaryTaskId,
            anchor.bundleTaskIds,
            {
              orchestrationId: anchor.orchestrationId ?? undefined,
              expandOrchestration,
            },
          );
          applyPanelFetchToContext(messageId, anchor, data, options?.focusedSubtaskId);
        });
      } catch (e) {
        setError(formatAgentApiErrorForUser(e));
      }
    },
    [applyPanelFetchToContext, frontendMockSession, platformAgent],
  );

  const openResultPanelForMessage = useCallback(
    async (
      meta: Record<string, unknown> | undefined,
      messageId: string | null,
      options?: { focusedSubtaskId?: string | null },
    ) => {
      const anchor = resolvePanelAnchorForStepsMessage(messages, meta);
      if (!anchor) return;
      await openResultPanelFromAnchor(anchor, messageId, options);
    },
    [messages, openResultPanelFromAnchor],
  );

  const withFreshTokenForResultPanel = useCallback(
    async (run: (token: string) => Promise<void>) => {
      if (frontendMockSession) {
        await run("__frontend_mock_token__");
        return;
      }
      if (!platformAgent?.withFreshToken) return;
      await platformAgent.withFreshToken(run);
    },
    [frontendMockSession, platformAgent],
  );

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

  const send = useCallback(async (textOverride?: string) => {
    const text = (textOverride ?? draft).trim();
    const filesToSend = textOverride === undefined ? pendingFiles : [];
    if ((!text && filesToSend.length === 0) || sending) return;
    const maxChars = getChatMessageMaxChars();
    if (text.length > maxChars) {
      setError(`消息过长（${text.length} 字），请控制在 ${maxChars} 字以内。`);
      return;
    }
    if (frontendMockSession) {
      const now = new Date().toISOString();
      const optimisticAttachments = buildUserMessageAttachmentsFromFiles(filesToSend);
      const userMessage: SessionMessageItem = {
        id: `mock_user_${safeRandomUUID()}`,
        role: "user",
        content: text,
        created_at: now,
        message_index: messages.length,
        meta: optimisticAttachments.length > 0 ? { attachments: optimisticAttachments } : {},
      };
      const assistantMessage: SessionMessageItem = {
        id: `mock_assistant_${safeRandomUUID()}`,
        role: "assistant",
        content:
          `已收到你的本地 mock 追问：${text}\n\n` +
          "这里不会请求后端，用于检查发送按钮、输入框清空、附件展示、消息气泡、滚动定位和后续追问交互。",
        created_at: now,
        message_index: messages.length + 1,
        meta: {},
      };
      const nextMessages = processStreamingMessages([...messages, userMessage, assistantMessage]);
      writeSessionMessageCache(sessionId, nextMessages);
      setMessages(nextMessages);
      setDraft("");
      setPendingFiles([]);
      setError("");
      setBusy(false);
      setMessagesLoaded(true);
      return;
    }
    if (!platformAgent?.auth) {
      platformAgent?.openLogin("请先登录后再发送消息。");
      return;
    }
    // 释放当前会话的上一个流（如有），避免新旧流并存
    releaseStream(sessionId);
    if (sseAbortRef.current) {
      sseAbortRef.current.abort();
    }
    const sendGen = sessionGenRef.current;
    const abortController = new AbortController();
    sseAbortRef.current = abortController;
    setSending(true);
    setError("");
    bumpHistorySessionActivity(sessionId);
    const optimisticAttachments = buildUserMessageAttachmentsFromFiles(filesToSend);
    const optimistic: SessionMessageItem = {
      id: `optimistic_user_${safeRandomUUID()}`,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
      message_index: 0,
      meta: optimisticAttachments.length > 0 ? { attachments: optimisticAttachments } : {},
    };
    const mid = safeRandomUUID();
    const assistantStreamId = `streaming_assistant_${mid}`;
    const nowIso = new Date().toISOString();
    registerStream(sessionId, { abortController, assistantStreamId });
    contentLenRef.current = 0;
    setMessages((cur) => [...cur, optimistic, createStreamingAssistantMessage(assistantStreamId, nowIso)]);
    setDraft("");
    setPendingFiles([]);
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
          (content) => updateStreamContent(sessionId, content),
          () => contentLenRef.current,
          () => sessionGenRef.current === sendGen,
        );
        completeStream(sessionId);
        if (sessionGenRef.current !== sendGen) return;
        void refreshHistoryNow();
        if (sendResult.kind === "accepted") {
          await pollPlatformTaskUntilSettled(
            (fn) => platformAgent.withFreshToken(fn),
            sendResult,
            () => abortPollRef.current || sessionGenRef.current !== sendGen,
          );
        }
      });
      if (sessionGenRef.current === sendGen) {
        await reload();
      }
    } catch (e) {
      completeStream(sessionId);
      if (sessionGenRef.current === sendGen) {
        setError(formatAgentApiErrorForUser(e));
        await reload();
        void refreshHistoryNow();
      }
    } finally {
      if (sessionGenRef.current === sendGen) {
        setSending(false);
      }
    }
  }, [
    draft,
    frontendMockSession,
    messages,
    pendingFiles,
    platformAgent,
    processStreamingMessages,
    reload,
    refreshHistoryNow,
    bumpHistorySessionActivity,
    sending,
    sessionId,
  ]);

  const submitGuidanceSuggestion = useCallback((item: string) => {
    void send(item);
  }, [send]);

  return (
    <>
    {scheduleTrial ? (
      <Dialog open={saveConfirmOpen} onOpenChange={setSaveConfirmOpen}>
        <DialogContent className="max-w-md rounded-panel">
          <DialogTitle>保存定时任务？</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-text-tertiary">
            立即运行结束后不会自动写入定时任务列表。请确认运行结果符合预期后再保存。
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
              className="rounded-control bg-primary text-primary-foreground hover:bg-link-hover"
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
    <MoreDataShell
      currentPath="/agent/history"
      contentScrollMode="child"
      currentRunLabel={headerLabel}
      rightRail={
        showResultPanel && resultPanelContext && (frontendMockSession || platformAgent?.withFreshToken) ? (
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
                  const meta = m.meta && typeof m.meta === "object" ? (m.meta as Record<string, unknown>) : undefined;
                  const taskStepsFromMessage = parseTaskExecutionStepsFromMeta(meta);
                  const tmeta = loadScheduleTrialMeta();
                  const trialLabels =
                    scheduleTrial && tmeta?.sessionId === sessionId ? tmeta.executionStepLabels : undefined;
                  const isThisOrchestrationTurn =
                    m.role === "assistant" && i === firstAssistantIndex;
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
                    isThisOrchestrationTurn &&
                    !taskStepsFromMessage &&
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
                    (isThisOrchestrationTurn ? decompositionFallbackSteps : null);
                  const showTaskStepsBubble = Boolean(taskStepsToShow && taskStepsToShow.length > 0);
                  const deferStepsToUserId = sessionClarificationFlow.supplementUserMessageId;
                  const showTaskStepsAtThisMessage = showTaskStepsBubble && !deferStepsToUserId;
                  const showDeferredTaskSteps =
                    Boolean(deferStepsToUserId && m.id === deferStepsToUserId && m.role === "user") &&
                    Boolean(latestExecutionSteps?.length);
                  const archivedClarifyText =
                    sessionClarificationFlow.archivedClarification ??
                    linkfoxClarificationForSteps?.message ??
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
                  const hideAssistantBubble = shouldHideAssistantMessageBubble(m);
                  const msgKind =
                    meta && typeof meta.kind === "string" ? (meta.kind as string).trim() : "";
                  const isLinkfoxClarification = msgKind === "linkfox_clarification";
                  const isOrchestrationFailure = msgKind === "orchestration_failure";
                  const isTaskError =
                    m.role === "assistant" &&
                    meta?.task_status === "FAILED" &&
                    typeof meta?.error_message === "string";
                  const guidancePresentation =
                    m.role === "assistant" && !showTaskStepsAtThisMessage && !hideAssistantBubble
                      ? resolvePostTaskGuidancePresentation(m, meta)
                      : ({ kind: "none" } as const);
                  const key = m.id;
                  return (
                    <div key={key} className="space-y-3.5">
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
                              onSuggestionToggle={scheduledRunRecord ? undefined : toggleGuidanceSuggestion}
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
                              steps={mergeTaskStepStatuses(
                                alignStepStatusesWithOrchestrationBundles(
                                  latestExecutionSteps!,
                                  supplementalBundlesById[m.id]?.length
                                    ? supplementalBundlesById[m.id]!
                                    : orchestrationBundlesForUi,
                                ),
                                liveOrchStepStatuses,
                              )}
                              datetime={m.created_at}
                              platformSubtasks={
                                (() => {
                                  const supp = supplementalBundlesById[m.id];
                                  if (supp && supp.length > 0) {
                                    return buildPlatformSubtasksForExecutionSteps(latestExecutionSteps!, supp);
                                  }
                                  if (stepsMessageIdForBundles && orchestrationBundlesForUi.length > 0) {
                                    return buildPlatformSubtasksForExecutionSteps(
                                      latestExecutionSteps!,
                                      orchestrationBundlesForUi,
                                    );
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
                                void openResultPanelForMessage(stepsMeta, stepsMsg?.id ?? null, {
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
                              steps={mergeTaskStepStatuses(
                                alignStepStatusesWithOrchestrationBundles(
                                  taskStepsToShow!,
                                  supplementalBundlesById[m.id]?.length
                                    ? supplementalBundlesById[m.id]!
                                    : m.id === stepsMessageIdForBundles
                                      ? orchestrationBundlesForUi
                                      : [],
                                ),
                                (m.id === latestStepsMessageId || isThisOrchestrationTurn) &&
                                  liveOrchStepStatuses
                                  ? liveOrchStepStatuses
                                  : null,
                              )}
                              datetime={m.created_at}
                              platformSubtasks={
                                (() => {
                                  const supp = supplementalBundlesById[m.id];
                                  if (supp && supp.length > 0) {
                                    return buildPlatformSubtasksForExecutionSteps(taskStepsToShow!, supp);
                                  }
                                  if (m.id === stepsMessageIdForBundles && orchestrationBundlesForUi.length > 0) {
                                    return buildPlatformSubtasksForExecutionSteps(
                                      taskStepsToShow!,
                                      orchestrationBundlesForUi,
                                    );
                                  }
                                  if (taskStepsToShow && taskStepsToShow.length > 0 && m.id !== stepsMessageIdForBundles) {
                                    const meta2 = m.meta && typeof m.meta === "object" ? (m.meta as Record<string, unknown>) : undefined;
                                    loadSupplementalBundlesForMessage(m.id, meta2);
                                  }
                                  return undefined;
                                })()
                              }
                              timelineRunId={sessionId}
                              activeHighlightTaskId={stepTimelineHighlightTaskId}
                              onOpenSubtaskResult={(subtaskTaskId) => {
                                void openResultPanelForMessage(meta, m.id, {
                                  focusedSubtaskId: subtaskTaskId,
                                });
                              }}
                            />
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
                            linkfoxClarificationForSteps &&
                            !deferStepsToUserId &&
                            !messages.some(
                              (item) =>
                                item.role === "assistant" &&
                                item.meta &&
                                typeof item.meta === "object" &&
                                (item.meta as Record<string, unknown>).kind === "linkfox_clarification",
                            ) ? (
                              <AliceMessageBubble
                                body={linkfoxClarificationForSteps.message}
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
                        ) : guidancePresentation.kind !== "none" && !taskId ? (
                          <div className="space-y-3.5">
                            {guidancePresentation.kind === "embedded" &&
                            guidancePresentation.leading ? (
                              <SimpleAssistantBubble
                                body={guidancePresentation.leading}
                                datetime={m.created_at}
                                streaming={isStreamingAssistantMessage(m)}
                              />
                            ) : null}
                            <PostTaskGuidanceBubble
                              content={
                                guidancePresentation.kind === "dedicated"
                                  ? guidancePresentation.content
                                  : guidancePresentation.guidanceBlock
                              }
                              datetime={m.created_at}
                              composerDraft={draft}
                              onSuggestionToggle={
                                scheduledRunRecord ? undefined : submitGuidanceSuggestion
                              }
                            />
                          </div>
                        ) : isOrchestrationFailure ? (
                          <AliceErrorBubble
                            body={m.content}
                            datetime={m.created_at}
                            composerDraft={scheduleTrial || scheduledRunRecord ? "" : draft}
                            onSuggestionToggle={
                              scheduleTrial || scheduledRunRecord ? undefined : toggleGuidanceSuggestion
                            }
                          />
                        ) : isTaskError ? (
                          <AliceErrorBubble
                            body={m.content}
                            datetime={m.created_at}
                            composerDraft={scheduleTrial || scheduledRunRecord ? "" : draft}
                            onSuggestionToggle={
                              scheduleTrial || scheduledRunRecord ? undefined : toggleGuidanceSuggestion
                            }
                          />
                        ) : hideAssistantBubble ? null : shouldShowAssistantThinkingPlaceholder(
                            m,
                            messages,
                            i,
                            sending,
                          ) ? (
                          <AssistantLoadingRow variant="thinking" />
                        ) : (
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
                          className="ml-12 w-[calc(100%-3rem)]"
                          summary={(() => {
                            const hints = taskResultHintsByTaskId.get(taskId);
                            const taskStatus =
                              hints?.taskStatus ??
                              (typeof meta?.task_status === "string" ? meta.task_status : undefined);
                            const errorMessage =
                              hints?.errorMessage ??
                              (typeof meta?.error_message === "string" ? meta.error_message : undefined);
                            if (taskStatus === "FAILED" && errorMessage) {
                              return `任务执行失败：${humanizeTaskErrorMessage(errorMessage)}`;
                            }
                            if (taskStatus === "FAILED") {
                              return "任务执行失败，可在右侧查看任务结果详情。";
                            }
                            return "该轮任务已完成，可在右侧查看任务结果与数据文件。";
                          })()}
                          expanded={showResultPanel && focusedTaskId === taskId}
                          onToggle={() => {
                            if (showResultPanel && focusedTaskId === taskId) {
                              closeResultPanel();
                              return;
                            }
                            void openResultPanelForMessage(meta, m.id);
                          }}
                        />
                      ) : null}
                      {taskId && guidancePresentation.kind !== "none" ? (
                        <div className="space-y-3.5">
                          {guidancePresentation.kind === "embedded" &&
                          guidancePresentation.leading ? (
                            <SimpleAssistantBubble
                              body={guidancePresentation.leading}
                              datetime={m.created_at}
                              streaming={isStreamingAssistantMessage(m)}
                            />
                          ) : null}
                          <PostTaskGuidanceBubble
                            content={
                              guidancePresentation.kind === "dedicated"
                                ? guidancePresentation.content
                                : guidancePresentation.guidanceBlock
                            }
                            datetime={m.created_at}
                            composerDraft={draft}
                            onSuggestionToggle={
                              scheduledRunRecord ? undefined : submitGuidanceSuggestion
                            }
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {sending &&
                !sessionHasVisibleInFlightAssistant(messages) &&
                !sessionHasAssistantThinkingPlaceholder(messages, sending) ? (
                  <AssistantLoadingRow variant="thinking" />
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
                  <p className="text-center text-xs text-text-disabled">立即运行中，完成后可手动保存（不会自动写入定时任务）</p>
                ) : trialSaveReady ? (
                  <p className="text-center text-xs text-text-tertiary">立即运行已结束，请确认结果后点击「保存」</p>
                ) : null}
                <div className="flex w-full min-w-0 items-center justify-end gap-2">
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
                    className="h-11 min-w-22 flex-1 rounded-control bg-primary text-primary-foreground hover:bg-link-hover sm:flex-initial"
                    disabled={!trialSaveReady}
                    onClick={() => setSaveConfirmOpen(true)}
                  >
                    保存
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <TaskComposer
                  value={draft}
                  onValueChange={setDraft}
                  placeholder="您可以继续追问或者让我做其他工作哦～"
                  mode="普通模式"
                  onModeChange={() => {}}
                  selectedSourceIds={[]}
                  onToolSelect={() => {}}
                  onSourceRemove={() => {}}
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
                  visualStyle="default"
                  containerClassName="overflow-visible rounded-popover border border-border bg-bg-surface shadow-surface"
                  textareaClassName="min-h-composer max-h-composer-chat min-w-44 flex-1 overflow-y-auto whitespace-pre-wrap break-words border-0 bg-transparent px-1 py-2 pr-2 text-body leading-6 text-foreground caret-foreground outline-none shadow-none scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-zinc-300 focus-visible:outline-none focus-visible:ring-0 focus-ring-none-important"
                  placeholderClassName="top-2 text-body text-text-tertiary"
                />
                <div className="mt-3 text-center text-xs text-text-tertiary">
                  AI 可能产生不准确的信息。请核实重要细节。
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </MoreDataShell>
    </>
  );
}
