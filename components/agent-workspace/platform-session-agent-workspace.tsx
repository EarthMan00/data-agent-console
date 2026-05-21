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
import {
  deleteTaskSession,
  formatAgentApiErrorForUser,
  getTask,
  getToolOrchestration,
  listSessionMessages,
  sendChatMessage,
} from "@/lib/agent-api/client";
import { AGENT_COMPOSER_PREFILL_STORAGE_KEY } from "@/lib/agent-api/session";
import type { ChatSendResult, SessionMessageItem, TaskResponse } from "@/lib/agent-api/types";
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
import { messageIdsEligibleForTaskResultCard } from "@/lib/session-task-result-card-visibility";
import { shouldHideAssistantMessageBubble } from "@/lib/session-message-ui-filter";
import { extractDecompositionLabelsFromMessages } from "@/lib/parse-decomposition-labels";
import { safeRandomUUID } from "@/lib/random-uuid";
import type { PlatformTaskArtifactRef } from "@/lib/agent-events";
import { hasTabularTaskResultFiles } from "@/lib/platform-task-artifacts";
import {
  enrichOrchestrationBundlesWithStepLabels,
  fetchTaskOrchestrationForResultPanel,
  mergeBundlesIntoPlatformSnapshots,
  pickBestOrchestrationAnchor,
  type OrchestrationAnchor,
  type TaskOrchestrationBundleRow,
} from "@/lib/merge-orchestration-task-artifacts";
import { cn } from "@/lib/utils";

import { SIMPLE_CHAT_COLUMN_MAX, SimpleAssistantBubble, SimpleSystemBubble, SimpleUserBubble } from "./chat-bubbles";

function taskInFlight(t: TaskResponse) {
  if (t.finished_at) return false;
  const s = (t.status || "").toUpperCase();
  if (s === "RUNNING" || s === "PENDING" || s === "QUEUED") return true;
  if (s === "SUCCESS" || s === "SUCCEEDED" || s === "FAILED" || s === "CANCELLED" || s === "CANCEL" || s === "TIMEOUT") {
    return false;
  }
  return s.includes("RUNN");
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
  const { refreshHistory } = useMoreDataShellState();
  const router = useRouter();
  const isMounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<SessionMessageItem[]>([]);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
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
  const [lastTaskSnapshot, setLastTaskSnapshot] = useState<TaskResponse | null>(null);
  const [trialOrchestrationDone, setTrialOrchestrationDone] = useState<{
    finished: boolean;
    success: boolean;
  } | null>(null);
  const trialAutoOpenedPanelRef = useRef(false);
  const scheduledRunAutoOpenedPanelRef = useRef(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [trialRunInFlight, setTrialRunInFlight] = useState(() => {
    if (!scheduleTrial) return false;
    const m = loadScheduleTrialMeta();
    if (m && m.sendKind === "accepted" && m.taskId) return true;
    return false;
  });
  const trialTaskId = scheduleTrial ? loadScheduleTrialMeta()?.taskId : null;

  const reload = useCallback(async () => {
    if (!platformAgent?.auth) return;
    if (isMounted.current) {
      setBusy(true);
      setError("");
    }
    try {
      await platformAgent.withFreshToken(async (token) => {
        const res = await listSessionMessages(token, sessionId, 100);
        if (isMounted.current) setMessages(res.messages ?? []);
      });
    } catch (e) {
      if (isMounted.current) setError(formatAgentApiErrorForUser(e));
    } finally {
      if (isMounted.current) setBusy(false);
    }
  }, [platformAgent, sessionId]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
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
    setMessages([optimistic]);
    setSending(true);
    const mid = safeRandomUUID();
    void (async () => {
      try {
        await platformAgent.withFreshToken(async (token) => {
          const result: ChatSendResult = await sendChatMessage(token, sessionId, prompt, mid);
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
    }, 2000);
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
    const run = async () => {
      try {
        let t: TaskResponse | null = null;
        let orchFinished = false;
        await platformAgent.withFreshToken(async (token) => {
          t = await getTask(token, tid);
          if (multi && orchId) {
            try {
              const orch = await getToolOrchestration(token, orchId);
              orchFinished = orch.finished;
              if (!stop && isMounted.current) {
                setTrialOrchestrationDone({ finished: orch.finished, success: orch.success });
              }
              if (orch.finished && isMounted.current) {
                await reload();
              }
            } catch {
              /* 编排可能已落库到消息 meta，忽略 404 */
            }
          }
        });
        if (stop) return;
        setLastTaskSnapshot(t);
        const firstTaskDone = !t || !taskInFlight(t);
        if (multi && orchId) {
          setTrialRunInFlight(!orchFinished);
        } else if (firstTaskDone) {
          setTrialRunInFlight(false);
          if (isMounted.current) void reload();
        } else {
          setTrialRunInFlight(true);
        }
      } catch {
        if (!stop) {
          setTrialRunInFlight(false);
          setLastTaskSnapshot(null);
        }
      }
    };
    void run();
    const h = setInterval(() => void run(), 2000);
    return () => {
      stop = true;
      clearInterval(h);
    };
  }, [scheduleTrial, trialTaskId, platformAgent, trialOrchestrationId, trialIsMultiStep, reload]);

  useEffect(() => {
    if (scheduleTrial || scheduledRunRecord) return;
    try {
      const raw = sessionStorage.getItem(AGENT_COMPOSER_PREFILL_STORAGE_KEY);
      if (raw) {
        setDraft(raw);
        sessionStorage.removeItem(AGENT_COMPOSER_PREFILL_STORAGE_KEY);
      }
    } catch {
      /* ignore */
    }
  }, [sessionId, scheduleTrial, scheduledRunRecord]);

  const headerLabel = scheduleTrial
    ? (loadScheduleCreateDraft()?.title?.trim() || "试跑")
    : scheduledRunRecord
      ? (runLabel?.trim() || "定时任务记录")
      : "对话";
  const scheduleControlsLocked = scheduleTrial && (busy || trialRunInFlight || saveBusy);
  /** 试跑页：除保存提交中外都允许点「终止」并回到配置，避免 404/轮询异常时无法离开 */
  const terminateEnabled = scheduleTrial && !saveBusy;

  const goBackToSchedule = useCallback(() => {
    const d = loadScheduleCreateDraft();
    const gq = d?.createGroupIdFromUrl?.trim()
      ? `&groupId=${encodeURIComponent(d.createGroupIdFromUrl.trim())}`
      : "";
    router.push(`/schedules?create=1&restore=1${gq}`);
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
  }, [busy, error, messages, sending]);

  useEffect(() => {
    setShowResultPanel(false);
    setFocusedTaskId(null);
    setOrchestrationBundles([]);
    setPanelSubtaskFocus(null);
    setCurrentTaskFinishedAt(null);
    setTrialOrchestrationDone(null);
    trialAutoOpenedPanelRef.current = false;
    scheduledRunAutoOpenedPanelRef.current = false;
  }, [sessionId]);

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
    if (!effectiveOrchestrationAnchor || !platformAgent?.auth || showResultPanel) return;
    let cancelled = false;
    void platformAgent.withFreshToken(async (token) => {
      const data = await fetchTaskOrchestrationForResultPanel(
        token,
        effectiveOrchestrationAnchor.primaryTaskId,
        effectiveOrchestrationAnchor.bundleTaskIds,
        { orchestrationId: effectiveOrchestrationAnchor.orchestrationId },
      );
      if (!cancelled && isMounted.current) setOrchestrationBundles(data.bundles);
    });
    return () => {
      cancelled = true;
    };
  }, [effectiveOrchestrationAnchor, platformAgent, showResultPanel]);

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

  const runRecordExecutionStepsForLabels = useMemo(() => {
    if (!scheduledRunRecord) return null;
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
    if (!platformAgent?.auth) {
      platformAgent?.openLogin("请先登录后再发送消息。");
      return;
    }
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
    setMessages((cur) => [...cur, optimistic]);
    setDraft("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        const mid = safeRandomUUID();
        await sendChatMessage(token, sessionId, text, mid);
      });
      await reload();
      void refreshHistory();
    } catch (e) {
      setError(formatAgentApiErrorForUser(e));
      await reload();
      void refreshHistory();
    } finally {
      setSending(false);
    }
  }, [draft, platformAgent, reload, refreshHistory, sending, sessionId]);

  return (
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
                  const taskStepsToShow = taskStepsFromMessage ?? syntheticForTrial ?? syntheticForRunRecord;
                  const showTaskStepsBubble = Boolean(taskStepsToShow && taskStepsToShow.length > 0);
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
                  const key = m.id;
                  return (
                    <div key={key} className="space-y-2">
                      {m.role === "user" ? (
                        <SimpleUserBubble text={m.content} datetime={m.created_at} />
                      ) : m.role === "assistant" ? (
                        showTaskStepsBubble ? (
                          <TaskExecutionStepsAssistantBubble
                            steps={taskStepsToShow!}
                            datetime={m.created_at}
                            platformSubtasks={
                              m.id === stepsMessageIdForBundles && orchestrationBundlesForUi.length > 0
                                ? mergeBundlesIntoPlatformSnapshots(taskStepsToShow!, orchestrationBundlesForUi)
                                : undefined
                            }
                            timelineRunId={sessionId}
                            activeHighlightTaskId={stepTimelineHighlightTaskId}
                            setPanelSubtaskFocus={setPanelSubtaskFocus}
                            setPanelVisibility={setPanelVisibilityRecord}
                          />
                        ) : hideAssistantBubble ? null : (
                          <SimpleAssistantBubble body={m.content} datetime={m.created_at} />
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
                                : effectiveOrchestrationAnchor?.bundleTaskIds,
                              orchIdMeta ??
                                effectiveOrchestrationAnchor?.orchestrationId ??
                                orchestrationAnchor?.orchestrationId,
                            );
                          }}
                        />
                      ) : null}
                    </div>
                  );
                })}
                {sending ? <AssistantLoadingRow variant="thinking" /> : null}
                {showTrialRunFooterLine ? <AssistantLoadingRow variant="task" /> : null}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[rgba(255,255,255,0.86)] px-4 py-4 backdrop-blur-xl sm:px-6">
          <div className={cn("mx-auto w-full", SIMPLE_CHAT_COLUMN_MAX)}>
            {scheduledRunRecord ? (
              <p className="py-1 text-center text-xs text-[#a1a1aa]">此为定时任务执行记录，不支持继续追问。</p>
            ) : scheduleTrial ? (
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
                    className="h-11 min-w-[88px] flex-1 rounded-[10px] bg-[#18181b] text-white hover:bg-[#27272a] sm:flex-initial"
                    disabled={scheduleControlsLocked}
                    onClick={() => void onSaveSchedules()}
                  >
                    保存
                  </Button>
                </div>
              </div>
            ) : (
              <TaskComposer
                value={draft}
                onValueChange={setDraft}
                placeholder="基于历史对话继续追问…"
                mode="普通模式"
                onModeChange={() => {}}
                selectedSourceIds={[]}
                onToolSelect={() => {}}
                onSourceRemove={() => {}}
                onFilesSelected={() => {}}
                onSubmit={() => void send()}
                visualStyle="default"
              />
            )}
          </div>
        </div>
      </div>
    </MoreDataShell>
  );
}
