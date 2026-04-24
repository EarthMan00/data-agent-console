"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, UserRound } from "lucide-react";

import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { formatAgentApiErrorForUser, getTask, listSessionMessages, sendChatMessage } from "@/lib/agent-api/client";
import type { ChatSendResult, SessionMessageItem } from "@/lib/agent-api/types";
import { safeRandomUUID } from "@/lib/random-uuid";
import { ChatMarkdown } from "@/components/chat-markdown";
import { AssistantLoadingRow } from "@/components/assistant-loading-row";
import { MoreDataShell } from "@/components/more-data-shell";
import { AgentTaskResultPanel } from "@/components/agent-task-result-panel";
import { Button } from "@/components/ui/button";
import { TaskComposer } from "@/components/task-composer";
import type { PlatformTaskArtifactRef } from "@/lib/agent-events";
import { TaskResultSummaryCard } from "@/components/task-result-summary-card";
import { TaskExecutionStepsAssistantBubble } from "@/components/task-execution-steps-assistant-bubble";
import { parseTaskExecutionStepsFromMeta } from "@/lib/task-execution-steps-meta";
import { messageIdsEligibleForTaskResultCard } from "@/lib/session-task-result-card-visibility";
import { stripModelThinkingForUi } from "@/lib/strip-model-thinking";

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
          <div className="text-[11px] text-[#94a3b8]">{formatTime(datetime)}</div>
        </div>
        <div className="mt-2 whitespace-pre-wrap break-words text-sm text-[#0f172a]">{text}</div>
      </div>
    </div>
  );
}

function SimpleAssistantBubble({ body, datetime }: { body: string; datetime: string }) {
  return (
    <div className="flex w-full justify-start">
      <div className={`rounded-[18px] border border-[#e5e7eb] bg-white px-4 py-3 shadow-sm ${SIMPLE_CHAT_BUBBLE_MAX}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#475569]">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#171717] text-white">
              <Bot className="h-3.5 w-3.5" />
            </span>
            LinkData
          </div>
          <div className="text-[11px] text-[#94a3b8]">{formatTime(datetime)}</div>
        </div>
        <div className="mt-2 text-sm text-[#0f172a]">
          <ChatMarkdown>{stripModelThinkingForUi(body)}</ChatMarkdown>
        </div>
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
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<SessionMessageItem[]>([]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showResultPanel, setShowResultPanel] = useState(false);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [currentArtifacts, setCurrentArtifacts] = useState<PlatformTaskArtifactRef[] | null>(null);

  const isLoggedIn = Boolean(
    platformAgent?.auth?.accessToken &&
    platformAgent?.authValidated,
  );

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
    setCurrentArtifacts(null);
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

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [busy, messages, sending]);

  const title = useMemo(() => `历史对话`, []);

  const taskResultCardMessageIds = useMemo(() => messageIdsEligibleForTaskResultCard(messages), [messages]);

  const openTaskResultPanel = useCallback(
    async (taskId: string) => {
      if (!platformAgent?.authValidated) {
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
    setMessages((cur) => [...cur, optimisticUser]);
    setDraft("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        const mid = safeRandomUUID();
        const res: ChatSendResult = await sendChatMessage(token, sessionId, text, mid);
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
    }
  }, [draft, platformAgent, reload, sending, sessionId]);

  return (
    <MoreDataShell
      currentPath={`/history/${sessionId}`}
      currentRunLabel={title}
      contentScrollMode="child"
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
        <div ref={scrollRef} className="hide-scrollbar-y min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-4 pt-6 sm:px-6">
          <div className={`mx-auto w-full ${SIMPLE_CHAT_COLUMN_MAX}`}>
            <div className="space-y-5">
              {error ? <SimpleSystemBubble message={`加载/发送失败：${error}`} /> : null}
              {!isLoggedIn ? <SimpleSystemBubble message="未登录" /> : null}
              {busy ? <SimpleSystemBubble message="加载中…" /> : null}
              {!busy && isLoggedIn && messages.length === 0 ? <SimpleSystemBubble message="该会话暂无消息" /> : null}

              <div className="space-y-4">
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
          <div className={`mx-auto w-full ${SIMPLE_CHAT_COLUMN_MAX}`}>
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
          </div>
        </div>
      </div>
    </MoreDataShell>
  );
}

