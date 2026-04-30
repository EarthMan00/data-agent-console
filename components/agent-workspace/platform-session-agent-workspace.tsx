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
import { Button } from "@/components/ui/button";
import {
  deleteTaskSession,
  formatAgentApiErrorForUser,
  getTask,
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
import { safeRandomUUID } from "@/lib/random-uuid";
import type { PlatformTaskArtifactRef } from "@/lib/agent-events";
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
}: {
  sessionId: string;
  /** 从定时任务「试跑」进入：隐藏输入框，展示上一步/保存/终止。 */
  scheduleTrial?: boolean;
}) {
  const platformAgent = useOptionalPlatformAgent();
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
  const [currentArtifacts, setCurrentArtifacts] = useState<PlatformTaskArtifactRef[] | null>(null);
  const [currentBundleDownloadApi, setCurrentBundleDownloadApi] = useState<string | null>(null);
  const [currentBundleDownloadName, setCurrentBundleDownloadName] = useState<string | null>(null);
  const [lastTaskSnapshot, setLastTaskSnapshot] = useState<TaskResponse | null>(null);
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
          if (result.kind === "accepted") {
            taskId = result.task_id;
            sendKind = "accepted";
            const ex = result.execution_steps;
            executionStepLabels = Array.isArray(ex) && ex.length > 0 ? ex : null;
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
          saveScheduleTrialMeta({ v: 1, sessionId, taskId, sendKind, executionStepLabels });
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

  useEffect(() => {
    if (!scheduleTrial || !trialTaskId || !platformAgent) return;
    const tid = trialTaskId;
    let stop = false;
    const run = async () => {
      try {
        let t: TaskResponse | null = null;
        await platformAgent.withFreshToken(async (token) => {
          t = await getTask(token, tid);
        });
        if (stop) return;
        setLastTaskSnapshot(t);
        if (!t || !taskInFlight(t)) {
          setTrialRunInFlight(false);
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
  }, [scheduleTrial, trialTaskId, platformAgent]);

  useEffect(() => {
    if (scheduleTrial) return;
    try {
      const raw = sessionStorage.getItem(AGENT_COMPOSER_PREFILL_STORAGE_KEY);
      if (raw) {
        setDraft(raw);
        sessionStorage.removeItem(AGENT_COMPOSER_PREFILL_STORAGE_KEY);
      }
    } catch {
      /* ignore */
    }
  }, [sessionId, scheduleTrial]);

  const headerLabel = scheduleTrial ? (loadScheduleCreateDraft()?.title?.trim() || "试跑") : "对话";
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
    setCurrentArtifacts(null);
  }, [sessionId]);

  const taskResultCardMessageIds = useMemo(() => messageIdsEligibleForTaskResultCard(messages), [messages]);

  /** 试跑/平台会话中「拆解+工具」那轮通常是第一条 assistant；此前仅限 isLast，结束后若有多条 assistant 会退回「助手」Markdown 气泡。 */
  const firstAssistantIndex = useMemo(
    () => messages.findIndex((m) => m.role === "assistant"),
    [messages],
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
    async (taskId: string, bundleTaskIds?: string[]) => {
      if (!platformAgent?.auth) {
        platformAgent?.openLogin("请先登录后再查看任务结果。");
        return;
      }
      setError("");
      try {
        await platformAgent.withFreshToken(async (token) => {
          const task = await getTask(token, taskId);
          const artifacts: PlatformTaskArtifactRef[] = (task.artifacts ?? []).map((a) => ({
            artifact_id: a.artifact_id,
            artifact_type: a.artifact_type,
            original_name: a.original_name,
            download_api: a.download_api,
          }));
          setCurrentArtifacts(artifacts);
          const ids = (bundleTaskIds ?? []).map((x) => (x || "").trim()).filter(Boolean);
          const api =
            ids.length > 0
              ? `/api/tasks/download?` + ids.map((id) => `task_ids=${encodeURIComponent(id)}`).join("&")
              : `/api/tasks/${encodeURIComponent(taskId)}/download`;
          setCurrentBundleDownloadApi(api);
          setCurrentBundleDownloadName(ids.length > 1 ? `${taskId}.zip` : null);
          setFocusedTaskId(taskId);
          setShowResultPanel(true);
        });
      } catch (e) {
        setError(formatAgentApiErrorForUser(e));
      }
    },
    [platformAgent],
  );

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
    } catch (e) {
      setError(formatAgentApiErrorForUser(e));
      await reload();
    } finally {
      setSending(false);
    }
  }, [draft, platformAgent, reload, sending, sessionId]);

  return (
    <MoreDataShell
      currentPath="/agent/history"
      contentScrollMode="child"
      currentRunLabel={headerLabel}
      rightRail={
        showResultPanel && currentArtifacts && platformAgent?.withFreshToken ? (
          <AgentTaskResultPanel
            artifacts={currentArtifacts}
            withFreshToken={platformAgent.withFreshToken}
            bundleDownloadApi={currentBundleDownloadApi}
            bundleDownloadName={currentBundleDownloadName}
            taskId={focusedTaskId}
            onClose={() => {
              setShowResultPanel(false);
              setFocusedTaskId(null);
              setCurrentBundleDownloadApi(null);
              setCurrentBundleDownloadName(null);
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
                        )
                      : null;
                  const taskStepsToShow = taskStepsFromMessage ?? syntheticForTrial;
                  const rawTaskId = typeof meta?.task_id === "string" ? meta.task_id.trim() : "";
                  const rawBundle = Array.isArray(meta?.orchestration_step_task_ids)
                    ? (meta?.orchestration_step_task_ids as unknown[])
                    : [];
                  const bundleTaskIds = rawBundle
                    .map((x) => (typeof x === "string" ? x.trim() : ""))
                    .filter((x) => x.length > 0);
                  const taskId =
                    m.role === "assistant" && rawTaskId && taskResultCardMessageIds.has(m.id) ? rawTaskId : undefined;
                  const key = m.id;
                  return (
                    <div key={key} className="space-y-2">
                      {m.role === "user" ? (
                        <SimpleUserBubble text={m.content} datetime={m.created_at} />
                      ) : m.role === "assistant" ? (
                        taskStepsToShow && taskStepsToShow.length > 0 ? (
                          <TaskExecutionStepsAssistantBubble steps={taskStepsToShow} datetime={m.created_at} />
                        ) : (
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
                              return;
                            }
                            void openTaskResultPanel(taskId, bundleTaskIds.length > 0 ? bundleTaskIds : undefined);
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
            {scheduleTrial ? (
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
