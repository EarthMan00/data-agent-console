"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AssistantLoadingRow } from "@/components/assistant-loading-row";
import { InlineNotice } from "@/components/inline-notice";
import { TaskExecutionStepsAssistantBubble } from "@/components/task-execution-steps-assistant-bubble";
import { MoreDataShell } from "@/components/more-data-shell";
import { AgentTaskResultPanel } from "@/components/agent-task-result-panel";
import { TaskResultSummaryCard } from "@/components/task-result-summary-card";
import { TaskComposer } from "@/components/task-composer";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { formatAgentApiErrorForUser, getTask, listSessionMessages, sendChatMessage } from "@/lib/agent-api/client";
import type { SessionMessageItem } from "@/lib/agent-api/types";
import { parseTaskExecutionStepsFromMeta } from "@/lib/task-execution-steps-meta";
import { messageIdsEligibleForTaskResultCard } from "@/lib/session-task-result-card-visibility";
import { safeRandomUUID } from "@/lib/random-uuid";
import type { PlatformTaskArtifactRef } from "@/lib/agent-events";
import { cn } from "@/lib/utils";

import { SIMPLE_CHAT_COLUMN_MAX, SimpleAssistantBubble, SimpleSystemBubble, SimpleUserBubble } from "./chat-bubbles";

export function PlatformSessionAgentWorkspace({ sessionId }: { sessionId: string }) {
  const platformAgent = useOptionalPlatformAgent();
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

  const reload = useCallback(async () => {
    if (!platformAgent?.auth) return;
    setBusy(true);
    setError("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        const res = await listSessionMessages(token, sessionId, 100);
        setMessages(res.messages ?? []);
      });
    } catch (e) {
      setError(formatAgentApiErrorForUser(e));
    } finally {
      setBusy(false);
    }
  }, [platformAgent, sessionId]);

  useEffect(() => {
    if (!platformAgent) return;
    if (!platformAgent.auth) return;
    platformAgent.setActivePlatformSession(sessionId);
    void reload();
  }, [platformAgent, reload, sessionId]);

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

  const openTaskResultPanel = useCallback(
    async (taskId: string) => {
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
      currentPath="/agent"
      contentScrollMode="child"
      currentRunLabel="对话"
      rightRail={
        showResultPanel && currentArtifacts && platformAgent?.withFreshToken ? (
          <AgentTaskResultPanel
            artifacts={currentArtifacts}
            withFreshToken={platformAgent.withFreshToken}
            onClose={() => {
              setShowResultPanel(false);
              setFocusedTaskId(null);
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
              {error ? <InlineNotice message={`加载/发送失败：${error}`} /> : null}
              {busy ? <InlineNotice message="加载中…" /> : null}
              {!busy && messages.length === 0 ? <InlineNotice message="该会话暂无消息" /> : null}
              <div className="space-y-3">
                {messages.map((m) => {
                  const meta = m.meta && typeof m.meta === "object" ? (m.meta as Record<string, unknown>) : undefined;
                  const taskSteps = parseTaskExecutionStepsFromMeta(meta);
                  const rawTaskId = typeof meta?.task_id === "string" ? meta.task_id.trim() : "";
                  const taskId =
                    m.role === "assistant" && rawTaskId && taskResultCardMessageIds.has(m.id) ? rawTaskId : undefined;
                  const key = m.id;
                  return (
                    <div key={key} className="space-y-2">
                      {m.role === "user" ? (
                        <SimpleUserBubble text={m.content} datetime={m.created_at} />
                      ) : m.role === "assistant" ? (
                        taskSteps ? (
                          <TaskExecutionStepsAssistantBubble steps={taskSteps} datetime={m.created_at} />
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
                            void openTaskResultPanel(taskId);
                          }}
                        />
                      ) : null}
                    </div>
                  );
                })}
                {sending ? <AssistantLoadingRow variant="thinking" /> : null}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[rgba(255,255,255,0.86)] px-4 py-4 backdrop-blur-xl sm:px-6">
          <div className={cn("mx-auto w-full", SIMPLE_CHAT_COLUMN_MAX)}>
            <TaskComposer
              value={draft}
              onValueChange={setDraft}
              placeholder="基于历史对话继续追问…"
              mode="普通模式"
              onModeChange={() => {}}
              templates={[]}
              selectedSourceIds={[]}
              onToolSelect={() => {}}
              onSourceRemove={() => {}}
              onTemplateSelect={() => {}}
              onFilesSelected={() => {}}
              onSubmit={() => void send()}
              visualStyle="default"
            />
          </div>
        </div>
      </div>
    </MoreDataShell>
  );
}
