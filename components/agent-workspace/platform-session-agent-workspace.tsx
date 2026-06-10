"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
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
import type { PlatformTaskArtifactRef } from "@/lib/agent-events";
import { hasTabularTaskResultFiles } from "@/lib/platform-task-artifacts";
import {
  enrichOrchestrationBundlesWithStepLabels,
  fetchTaskOrchestrationForResultPanel,
  mergeBundlesIntoPlatformSnapshots,
  pickBestOrchestrationAnchor,
  resolveOrchestrationAnchorFromMessageMeta,
  type OrchestrationAnchor,
  type TaskOrchestrationBundleRow,
} from "@/lib/merge-orchestration-task-artifacts";
import { pollPlatformTaskUntilSettled } from "@/lib/poll-task-until-settled";
import {
  isTaskInFlight,
  SCHEDULE_TRIAL_SESSION_RELOAD_INTERVAL_MS,
  SCHEDULE_TRIAL_TASK_POLL_INTERVAL_MS,
} from "@/lib/task-status-poll";
import { cn } from "@/lib/utils";

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
  /** 从定时任务「试跑」进入：隐藏输入框，展示上一步/保存/终止。 */
  scheduleTrial?: boolean;
  /** 从定时任务「运行记录-查看过程」进入：只读回放，样式与正常对话一致，不可追问。 */
  scheduledRunRecord?: boolean;
  runLabel?: string;
  /** 运行记录 meta 中的 skill task_id，用于拉取编排产物（消息 meta 缺省时） */
  fallbackTaskId?: string;
}) {
  const platformAgent = useOptionalPlatformAgent();
  const { refreshHistory, refreshHistoryNow, setActiveSessionTitle } = useMoreDataShellState();
  const router = useRouter();
  const isMounted = useRef(true);
  const abortPollRef = useRef(false);
  const sseAbortRef = useRef<AbortController | null>(null);
  const sessionGenRef = useRef(0);
  /** manager 订阅已推送到 UI 的字符数（用于 chunk 兜底追赶起点） */
  const contentLenRef = useRef(0);
  const [busy, setBusy] = useState(false);
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
  const [orchestrationBundles, setOrchestrationBundles] = useState<TaskOrchestrationBundleRow[]>([]);
  const [supplementalBundlesById, setSupplementalBundlesById] = useState<Record<string, TaskOrchestrationBundleRow[]>>({});
  const fetchedSupplementalRef = useRef<Set<string>>(new Set());
  const [panelSubtaskFocus, setPanelSubtaskFocus] = useState<{
    taskId: string;
    artifacts: PlatformTaskArtifactRef[];
  } | null>(null);
  const [currentBundleDownloadApi, setCurrentBundleDownloadApi] = useState<string | null>(null);
  const [currentBundleDownloadName, setCurrentBundleDownloadName] = useState<string | null>(null);
  const [currentTaskFinishedAt, setCurrentTaskFinishedAt] = useState<string | null>(null);
  const [currentTaskError, setCurrentTaskError] = useState<string | null>(null);
  const [currentTaskStatus, setCurrentTaskStatus] = useState<string | null>(null);
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

  const _processStreamingMessages = (msgs: SessionMessageItem[]): SessionMessageItem[] => {
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
  };

  const reload = useCallback(async () => {
    if (!platformAgent?.auth) return;

    const cached = readSessionMessageCache(sessionId);
    if (cached) {
      setMessages(_processStreamingMessages(cached));
      setBusy(false);
      setError("");
    } else {
      setBusy(true);
      setError("");
    }

    try {
      await platformAgent.withFreshToken(async (token) => {
        const res = await listSessionMessages(token, sessionId, 100);
        const fresh = _processStreamingMessages(res.messages ?? []);
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
    }
  }, [platformAgent, sessionId]);

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
                await patchTaskExecutionSteps(token, sessionId, m.id as any, {
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
  }, [busy, messages, platformAgent, sessionId]);

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
    if (!platformAgent) return;
    if (!platformAgent.auth) return;
    platformAgent.setActivePlatformSession(sessionId);
    if (scheduleTrial && isScheduleTrialAwaitingFirstMessage(sessionId, loadScheduleTrialMeta())) {
      return;
    }
    void reload();
  }, [platformAgent, reload, sessionId, scheduleTrial]);

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
    // 在 reset effect 中同步检查缓存：缓存命中则立即展示，不依赖后续 effect 调用时序
    const cached = readSessionMessageCache(sessionId);
    setMessages(cached ?? []);
    setLiveOrchStepStatuses(null);

    setShowResultPanel(false);
    setFocusedTaskId(null);
    setOrchestrationBundles([]);
    setPanelSubtaskFocus(null);
    setCurrentTaskFinishedAt(null);
    setCurrentTaskError(null);
    setCurrentTaskStatus(null);
    setTrialOrchestrationDone(null);
    trialAutoOpenedPanelRef.current = false;
    scheduledRunAutoOpenedPanelRef.current = false;
    trialPrefetchAnchorRef.current = null;
    trialDoneReloadedRef.current = false;
    trialClarificationReloadedRef.current = false;
    setLiveOrchClarification(null);
    setSupplementalBundlesById({});
  }, [sessionId]);

  // 防御性守卫：只要 messages 非空，busy 就必须是 false
  // 避免 guard 阻止 reload() 后 busy 永远停留在 true
  useEffect(() => {
    if (messages.length > 0) {
      setBusy(false);
    }
  }, [messages]);

  const taskResultCardMessageIds = useMemo(() => messageIdsEligibleForTaskResultCard(messages), [messages]);

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
  }, [effectiveOrchestrationAnchor?.orchestrationId, platformAgent, scheduleTrial]);

  useEffect(() => {
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
  }, [effectiveOrchestrationAnchor, platformAgent, showResultPanel, scheduleTrial, trialRunInFlight]);

  const loadSupplementalBundlesForMessage = useCallback((messageId: string, meta: Record<string, unknown> | undefined) => {
    if (!platformAgent?.auth) return;
    if (supplementalBundlesById[messageId] || fetchedSupplementalRef.current.has(messageId)) return;
    const anchor = resolveOrchestrationAnchorFromMessageMeta(meta);
    if (!anchor) {
      fetchedSupplementalRef.current.add(messageId);
      return;
    }
    fetchedSupplementalRef.current.add(messageId);
    void platformAgent.withFreshToken(async (token) => {
      try {
        const data = await fetchTaskOrchestrationForResultPanel(
          token,
          anchor.primaryTaskId,
          anchor.bundleTaskIds.length > 0 ? anchor.bundleTaskIds : undefined,
          { orchestrationId: anchor.orchestrationId },
        );
        setSupplementalBundlesById((prev) => ({ ...prev, [messageId]: data.bundles }));
      } catch {
        // task/orchestration may have been deleted
      }
    });
  }, [platformAgent, supplementalBundlesById]);

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

  const openTaskResultPanel = useCallback(
    async (taskId: string, bundleTaskIds?: string[], orchestrationId?: string | null) => {
      if (!platformAgent?.auth) {
        platformAgent?.openLogin("请先登录后再查看任务结果。");
        return;
      }
      setError("");
      try {
        await platformAgent.withFreshToken(async (token) => {
          const data = await fetchTaskOrchestrationForResultPanel(token, taskId, bundleTaskIds, {
            orchestrationId: orchestrationId ?? undefined,
          });
          setOrchestrationBundles(data.bundles);
          setPanelSubtaskFocus(null);
          const ids = (bundleTaskIds ?? []).map((x) => (x || "").trim()).filter(Boolean);
          const api =
            ids.length > 0
              ? `/api/tasks/download?` + ids.map((id) => `task_ids=${encodeURIComponent(id)}`).join("&")
              : `/api/tasks/${encodeURIComponent(taskId)}/download`;
          setCurrentBundleDownloadApi(api);
          setCurrentBundleDownloadName(ids.length > 1 ? `${taskId}.zip` : null);
          setCurrentTaskFinishedAt(data.finishedAt);
          setCurrentTaskError(data.errorMessage ?? null);
          setCurrentTaskStatus(data.lastStatus ?? null);
          setFocusedTaskId(taskId);
          setShowResultPanel(true);
        });
      } catch (e) {
        setError(formatAgentApiErrorForUser(e));
      }
    },
    [platformAgent],
  );

  useEffect(() => {
    if (!scheduleTrial || trialRunInFlight || trialAutoOpenedPanelRef.current) return;
    if (subtasksWithTabularPreview.length === 0 || !effectiveOrchestrationAnchor) return;
    trialAutoOpenedPanelRef.current = true;
    void openTaskResultPanel(
      effectiveOrchestrationAnchor.primaryTaskId,
      effectiveOrchestrationAnchor.bundleTaskIds,
      effectiveOrchestrationAnchor.orchestrationId,
    );
  }, [
    scheduleTrial,
    trialRunInFlight,
    subtasksWithTabularPreview.length,
    effectiveOrchestrationAnchor,
    openTaskResultPanel,
  ]);

  useEffect(() => {
    if (!scheduledRunRecord || scheduledRunAutoOpenedPanelRef.current || busy) return;
    if (subtasksWithTabularPreview.length === 0 || !effectiveOrchestrationAnchor) return;
    scheduledRunAutoOpenedPanelRef.current = true;
    void openTaskResultPanel(
      effectiveOrchestrationAnchor.primaryTaskId,
      effectiveOrchestrationAnchor.bundleTaskIds,
      effectiveOrchestrationAnchor.orchestrationId,
    );
  }, [
    scheduledRunRecord,
    busy,
    subtasksWithTabularPreview.length,
    effectiveOrchestrationAnchor,
    openTaskResultPanel,
  ]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    const maxChars = getChatMessageMaxChars();
    if (text.length > maxChars) {
      setError(`消息过长（${text.length} 字），请控制在 ${maxChars} 字以内。`);
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
    const optimistic: SessionMessageItem = {
      id: `optimistic_user_${safeRandomUUID()}`,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
      message_index: 0,
      meta: {},
    };
    const mid = safeRandomUUID();
    const assistantStreamId = `streaming_assistant_${mid}`;
    const nowIso = new Date().toISOString();
    registerStream(sessionId, { abortController, assistantStreamId });
    contentLenRef.current = 0;
    setMessages((cur) => [...cur, optimistic, createStreamingAssistantMessage(assistantStreamId, nowIso)]);
    setDraft("");
    const filesToSend = pendingFiles;
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
  }, [draft, pendingFiles, platformAgent, reload, refreshHistoryNow, sending, sessionId]);

  return (
    <>
    {scheduleTrial ? (
      <Dialog open={saveConfirmOpen} onOpenChange={setSaveConfirmOpen}>
        <DialogContent className="max-w-[400px] rounded-[16px]">
          <DialogTitle>保存定时任务？</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-[#71717a]">
            试跑结束后不会自动写入定时任务列表。请确认试跑结果符合预期后再保存。
          </DialogDescription>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="rounded-[10px]"
              disabled={saveBusy}
              onClick={() => setSaveConfirmOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              className="rounded-[10px] bg-[#111111] text-white hover:bg-[#2a2a2a]"
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
        showResultPanel && platformAgent?.withFreshToken ? (
          <AgentTaskResultPanel
            artifacts={artifactsForTaskPanel}
            withFreshToken={platformAgent.withFreshToken}
            bundleDownloadApi={currentBundleDownloadApi}
            bundleDownloadName={currentBundleDownloadName}
            taskId={resolvedSubtaskTaskIdForPanel ?? focusedTaskId}
            resultGeneratedAt={currentTaskFinishedAt}
            errorMessage={currentTaskError}
            taskStatus={currentTaskStatus}
              subtaskResultTabs={
                subtasksWithTabularPreview.length > 1
                  ? subtasksWithTabularPreview.map((s) => ({
                      taskId: s.taskId,
                      label: compactText(s.label, 36),
                    }))
                  : undefined
              }
              activeSubtaskTaskId={resolvedSubtaskTaskIdForPanel}
              onSubtaskSelect={(taskId) => {
                const row = orchestrationBundlesForUi.find((s) => s.taskId === taskId);
                if (row && hasTabularTaskResultFiles(row.artifacts)) {
                  setPanelSubtaskFocus({ taskId, artifacts: row.artifacts });
                }
              }}
            onClose={() => {
              setShowResultPanel(false);
              setFocusedTaskId(null);
              setPanelSubtaskFocus(null);
              setCurrentBundleDownloadApi(null);
              setCurrentBundleDownloadName(null);
              setCurrentTaskFinishedAt(null);
              setCurrentTaskError(null);
              setCurrentTaskStatus(null);
            }}
          />
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
              {error ? <p className="text-sm text-red-600">加载/发送失败：{error}</p> : null}
              {busy ? <p className="text-sm text-[#71717a]">加载中…</p> : null}
              {!busy && !sending && messages.length === 0 && !scheduleTrial ? (
                <p className="text-sm text-[#71717a]">该会话暂无消息</p>
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
                            />
                          ) : null}
                          <SimpleUserBubble text={m.content} datetime={m.created_at} />
                          {showDeferredTaskSteps ? (
                            <TaskExecutionStepsAssistantBubble
                              steps={mergeTaskStepStatuses(
                                latestExecutionSteps!,
                                liveOrchStepStatuses,
                              )}
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
                              setPanelSubtaskFocus={setPanelSubtaskFocus}
                              setPanelVisibility={setPanelVisibilityRecord}
                            />
                          ) : null}
                        </>
                      ) : m.role === "assistant" ? (
                        showTaskStepsAtThisMessage ? (
                          <>
                            <TaskExecutionStepsAssistantBubble
                              steps={mergeTaskStepStatuses(
                                taskStepsToShow!,
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
                                    return mergeBundlesIntoPlatformSnapshots(taskStepsToShow!, supp);
                                  }
                                  if (m.id === stepsMessageIdForBundles && orchestrationBundlesForUi.length > 0) {
                                    return mergeBundlesIntoPlatformSnapshots(taskStepsToShow!, orchestrationBundlesForUi);
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
                              setPanelSubtaskFocus={setPanelSubtaskFocus}
                              setPanelVisibility={setPanelVisibilityRecord}
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
                          <div className="space-y-2">
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
                                scheduledRunRecord ? undefined : toggleGuidanceSuggestion
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
                      {taskId && meta?.has_artifacts === true ? (
                        <TaskResultSummaryCard
                          title="任务结果"
                          summary={
                            meta?.task_status === "FAILED" && typeof meta?.error_message === "string"
                              ? `任务执行失败：${meta!.error_message}`
                              : meta?.task_status === "FAILED"
                                ? "任务执行失败，可在右侧查看任务结果详情。"
                                : "该轮任务已完成，可在右侧查看任务结果与数据文件。"
                          }
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
                                : effectiveOrchestrationAnchor?.bundleTaskIds,
                              orchIdMeta ??
                                effectiveOrchestrationAnchor?.orchestrationId ??
                                orchestrationAnchor?.orchestrationId,
                            );
                          }}
                        />
                      ) : null}
                      {taskId && guidancePresentation.kind !== "none" ? (
                        <div className="space-y-2">
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
                              scheduledRunRecord ? undefined : toggleGuidanceSuggestion
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

        <div className="bg-transparent px-4 py-4 sm:px-6">
          <div className={cn("mx-auto w-full", SIMPLE_CHAT_COLUMN_MAX)}>
            {scheduledRunRecord ? (
              <p className="py-1 text-center text-xs text-[#a1a1aa]">此为定时任务执行记录，不支持继续追问。</p>
            ) : scheduleTrial ? (
              <div className="flex flex-col gap-3">
                {trialRunInFlight ? (
                  <p className="text-center text-xs text-[#a1a1aa]">试跑进行中，完成后可手动保存（不会自动写入定时任务）</p>
                ) : trialSaveReady ? (
                  <p className="text-center text-xs text-[#71717a]">试跑已结束，请确认结果后点击「保存」</p>
                ) : null}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full min-w-0 rounded-[10px] sm:w-auto"
                  disabled={scheduleControlsLocked}
                  onClick={goBackToSchedule}
                >
                  上一步
                </Button>
                <div className="flex w-full min-w-0 items-center justify-end gap-2 sm:max-w-[360px]">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 flex-1 rounded-[10px] text-[#a1a1aa] sm:flex-initial"
                    disabled={!terminateEnabled}
                    onClick={() => void onTerminateTrial()}
                  >
                    终止
                  </Button>
                  <Button
                    type="button"
                    className="h-11 min-w-[88px] flex-1 rounded-[10px] bg-[#111111] text-white hover:bg-[#2a2a2a] sm:flex-initial"
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
                containerClassName="overflow-visible rounded-[18px] border border-[#e2e2df] bg-white shadow-[0_1px_2px_rgba(17,17,17,0.03)]"
                textareaClassName="min-h-[84px] max-h-[12em] min-w-[180px] flex-1 overflow-y-auto whitespace-pre-wrap break-words border-0 bg-transparent px-1 py-2 pr-2 text-[14px] leading-6 text-[#34322d] caret-[#34322d] outline-none shadow-none scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-zinc-300 focus-visible:outline-none focus-visible:ring-0 focus-visible:[box-shadow:none!important]"
                placeholderClassName="top-[8px] text-[14px] text-[#858481]"
              />
            )}
          </div>
        </div>
      </div>
    </MoreDataShell>
    </>
  );
}
