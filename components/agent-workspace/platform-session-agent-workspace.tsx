"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AgentTaskResultPanel } from "@/components/agent-task-result-panel";
import { AssistantLoadingRow } from "@/components/assistant-loading-row";
import { AliceShell, useAliceShellState } from "@/components/alice-shell";
import { compactText } from "@/lib/compact-text";
import { TaskComposer } from "@/components/task-composer";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatAgentApiErrorForUser, listSessionMessages } from "@/lib/agent-api/client";
import { getChatMessageMaxChars } from "@/lib/agent-api/config";
import { AGENT_COMPOSER_PREFILL_STORAGE_KEY } from "@/lib/agent-api/session";
import type {
  ChatRoundSnapshot,
  ChatRoundStatus,
  ChatRoundStep,
  SessionMessageItem,
} from "@/lib/agent-api/types";
import {
  insertDatasourceMentions,
  parseComposerPrefillStorageValue,
  type ComposerSourcePlacement,
} from "@/lib/composer-prefill";
import { safeRandomUUID } from "@/lib/random-uuid";
import {
  loadScheduleCreateDraft,
  loadScheduleTrialMeta,
} from "@/lib/schedule-create-draft";
import {
  resolveScheduleTrialRound,
  scheduleTrialCanSave,
  scheduleTrialCanTerminate,
} from "@/lib/schedule-trial-execution-presentation";
import { saveScheduleTasksWithDraft } from "@/lib/save-schedule-from-draft";
import { roundCanStop } from "@/lib/session-execution-stop";
import { stripInternalToolNamesForUi } from "@/lib/strip-internal-tool-names";
import { cn } from "@/lib/utils";
import { useChatStickToBottom } from "@/lib/use-chat-stick-to-bottom";
import { useHomeDataSourceMenu } from "@/lib/use-home-data-source-menu";
import {
  buildUserMessageAttachmentsFromFiles,
  parseUserMessageAttachments,
} from "@/lib/user-message-attachments";

import { ChatRoundProgress } from "./chat-round-progress";
import {
  SIMPLE_CHAT_COLUMN_MAX,
  SimpleAssistantBubble,
  SimpleUserBubble,
} from "./chat-bubbles";
import { useChatRounds } from "./use-chat-rounds";

const OPTIMISTIC_ROUND_USER_PREFIX = "optimistic-round-user:";
const TERMINAL_ROUND_STATUSES = new Set<ChatRoundStatus>([
  "SUCCEEDED",
  "PARTIAL_SUCCESS",
  "FAILED",
  "CANCELLED",
]);

type PendingSubmission = {
  signature: string;
  clientMessageId: string;
};

type DisplayMessage = {
  message: SessionMessageItem;
  round: ChatRoundSnapshot | null;
};

function isTerminal(status: ChatRoundStatus): boolean {
  return TERMINAL_ROUND_STATUSES.has(status);
}

function messageMeta(message: SessionMessageItem): Record<string, unknown> | undefined {
  return message.meta && typeof message.meta === "object" && !Array.isArray(message.meta)
    ? message.meta
    : undefined;
}

function messageClientId(message: SessionMessageItem): string | null {
  const direct = typeof message.message_id === "string" ? message.message_id.trim() : "";
  if (direct) return direct;
  const meta = messageMeta(message);
  const nested = typeof meta?.client_message_id === "string" ? meta.client_message_id.trim() : "";
  return nested || null;
}

function mergeCanonicalMessages(
  canonical: SessionMessageItem[],
  current: SessionMessageItem[],
): SessionMessageItem[] {
  const canonicalClientIds = new Set(
    canonical
      .filter((message) => message.role === "user")
      .map(messageClientId)
      .filter((value): value is string => Boolean(value)),
  );
  const canonicalIds = new Set(canonical.map((message) => message.id));
  const pending = current.filter((message) => {
    if (!message.id.startsWith(OPTIMISTIC_ROUND_USER_PREFIX)) return false;
    if (canonicalIds.has(message.id)) return false;
    const clientId = messageClientId(message);
    return !clientId || !canonicalClientIds.has(clientId);
  });
  return [...canonical, ...pending];
}

function fileSignature(files: File[]): string {
  return files
    .map((file) => `${file.name}:${file.size}:${file.lastModified}`)
    .sort()
    .join("|");
}

function submissionSignature(
  message: string,
  files: File[],
  roundId: string | null,
): string {
  return `${roundId ?? "new"}\n${message}\n${fileSignature(files)}`;
}

function publicRequestError(error: unknown, fallback: string): string {
  const formatted = formatAgentApiErrorForUser(error).trim();
  return formatted ? sanitizeAssistantContent(formatted) || fallback : fallback;
}

const INTERNAL_ASSIGNMENT_RE =
  /["']?(?:capability|tool_name|operation|raw_args|managed_path|provider|credential|api[_-]?key|access[_-]?token|password)["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;}\n]+)/gi;
const INTERNAL_TERM_RE =
  /run_(?:linkfox|chatexcel)_task|commerce_data\.collect|scheduled_task\.create|favorite_snapshot\.create|\b(?:capability|tool_name|operation|raw_args|managed_path|provider|credential)\b/gi;
const SECRET_VALUE_RE = /\b(?:Bearer\s+\S+|sk-[A-Za-z0-9_-]{8,}|atk_[A-Za-z0-9_-]+)\b/gi;
const MANAGED_WINDOWS_PATH_RE = /(?:[A-Za-z]:\\|%LOCALAPPDATA%\\)[^\s<>"'`]+/gi;

function sanitizeAssistantContent(content: string): string {
  return stripInternalToolNamesForUi(content)
    .replace(INTERNAL_ASSIGNMENT_RE, "")
    .replace(INTERNAL_TERM_RE, "")
    .replace(SECRET_VALUE_RE, "[受保护信息]")
    .replace(MANAGED_WINDOWS_PATH_RE, "[受保护路径]")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function publicRoundContent(snapshot: ChatRoundSnapshot): string {
  const content = sanitizeAssistantContent(snapshot.content);
  const businessFailure =
    snapshot.error_code === "BUSINESS_ACTION_FAILED" ||
    snapshot.error_code === "BUSINESS_VERIFICATION_FAILED" ||
    snapshot.steps.some(
      (step) =>
        step.status === "FAILED" &&
        (step.error_code === "BUSINESS_ACTION_FAILED" ||
          step.error_code === "BUSINESS_VERIFICATION_FAILED"),
    );
  return businessFailure ? content.replace(/已创建/g, "未能创建") : content;
}

function buildDisplayMessages(
  messages: SessionMessageItem[],
  snapshots: ReadonlyMap<string, ChatRoundSnapshot>,
): DisplayMessage[] {
  const snapshotsByAssistantId = new Map(
    [...snapshots.values()].map((snapshot) => [snapshot.assistant_message_id, snapshot]),
  );
  const result: DisplayMessage[] = [];
  const renderedAssistantIds = new Set<string>();

  for (const message of messages) {
    if (message.role === "user") {
      result.push({ message, round: null });
      continue;
    }
    if (message.role !== "assistant") continue;

    const meta = messageMeta(message);
    const snapshot = snapshotsByAssistantId.get(message.id) ?? null;
    if (snapshot) {
      if (renderedAssistantIds.has(snapshot.assistant_message_id)) continue;
      renderedAssistantIds.add(snapshot.assistant_message_id);
      result.push({
        message: { ...message, content: publicRoundContent(snapshot) },
        round: snapshot,
      });
      continue;
    }

    const roundId = typeof meta?.round_id === "string" ? meta.round_id : "";
    if (roundId) {
      const round = snapshots.get(roundId);
      // Never reinterpret a legacy helper or a non-canonical assistant as a
      // durable Round message. A missing canonical message is added below by
      // assistant_message_id.
      if (typeof meta?.kind === "string" || (round && round.assistant_message_id !== message.id)) {
        continue;
      }
      if (round) {
        if (renderedAssistantIds.has(round.assistant_message_id)) continue;
        renderedAssistantIds.add(round.assistant_message_id);
        result.push({
          message: { ...message, content: publicRoundContent(round) },
          round,
        });
        continue;
      }
    }

    result.push({
      message: { ...message, content: sanitizeAssistantContent(message.content) },
      round: null,
    });
  }

  for (const snapshot of snapshots.values()) {
    if (renderedAssistantIds.has(snapshot.assistant_message_id)) continue;
    renderedAssistantIds.add(snapshot.assistant_message_id);
    result.push({
      message: {
        id: snapshot.assistant_message_id,
        role: "assistant",
        content: publicRoundContent(snapshot),
        created_at: new Date().toISOString(),
        message_index: Number.MAX_SAFE_INTEGER,
        meta: { round_id: snapshot.round_id },
      },
      round: snapshot,
    });
  }
  return result;
}

export function PlatformSessionAgentWorkspace({
  sessionId,
  scheduleTrial = false,
  scheduledRunRecord = false,
  runLabel,
}: {
  sessionId: string;
  scheduleTrial?: boolean;
  scheduledRunRecord?: boolean;
  runLabel?: string;
}) {
  const platformAgent = useOptionalPlatformAgent();
  const { refreshHistoryNow, setActiveSessionTitle } = useAliceShellState();
  const router = useRouter();
  const generationRef = useRef(0);
  const pendingSubmissionRef = useRef<PendingSubmission | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const messagesInnerRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<SessionMessageItem[]>([]);
  const [messagesSessionId, setMessagesSessionId] = useState(sessionId);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [localError, setLocalError] = useState("");
  const [draft, setDraft] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [sourcePlacements, setSourcePlacements] = useState<ComposerSourcePlacement[]>([]);
  const [messagesScrolled, setMessagesScrolled] = useState(false);
  const [selectedResult, setSelectedResult] = useState<{
    roundId: string;
    stepId: string;
  } | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);

  const {
    dataSourceGroups: composerDataSourceGroups,
    dataSourceItems: composerDataSourceItems,
    loaded: composerDataSourceMenuLoaded,
  } = useHomeDataSourceMenu({ logLabel: "[session-source-menu]" });

  const withFreshToken = useCallback(
    <T,>(run: (token: string) => Promise<T>): Promise<T> => {
      if (!platformAgent?.auth) return Promise.reject(new Error("请先登录。"));
      return platformAgent.withFreshToken(run);
    },
    [platformAgent],
  );

  const roundController = useChatRounds({ sessionId, withFreshToken });
  const snapshots = useMemo<ReadonlyMap<string, ChatRoundSnapshot>>(
    () =>
      new Map(
        [...roundController.snapshots].filter(
          ([, snapshot]) => snapshot.session_id === sessionId,
        ),
      ),
    [roundController.snapshots, sessionId],
  );
  const activeRound =
    roundController.activeRound?.session_id === sessionId
      ? roundController.activeRound
      : null;
  const scheduleTrialMeta = useMemo(
    () => (scheduleTrial && sessionId ? loadScheduleTrialMeta() : null),
    [scheduleTrial, sessionId],
  );
  const scheduleTrialRound = useMemo(
    () => resolveScheduleTrialRound(scheduleTrialMeta, sessionId, snapshots),
    [scheduleTrialMeta, sessionId, snapshots],
  );

  const reloadMessages = useCallback(
    async (preserveOptimistic = true) => {
      if (!platformAgent?.auth) {
        setMessages([]);
        setMessagesSessionId(sessionId);
        setMessagesLoaded(true);
        return;
      }
      const generation = generationRef.current;
      setMessagesLoading(true);
      try {
        const page = await platformAgent.withFreshToken((token) =>
          listSessionMessages(token, sessionId, 100),
        );
        if (generation !== generationRef.current) return;
        setMessagesSessionId(sessionId);
        setMessages((current) =>
          preserveOptimistic
            ? mergeCanonicalMessages(page.messages ?? [], current)
            : (page.messages ?? []),
        );
        setLocalError("");
      } catch (error) {
        if (generation === generationRef.current) {
          setLocalError(publicRequestError(error, "加载会话失败，请稍后重试。"));
        }
      } finally {
        if (generation === generationRef.current) {
          setMessagesLoading(false);
          setMessagesLoaded(true);
        }
      }
    },
    [platformAgent, sessionId],
  );

  useEffect(() => {
    generationRef.current += 1;
    setMessages([]);
    setMessagesSessionId(sessionId);
    setMessagesLoaded(false);
    setMessagesScrolled(false);
    setSelectedResult(null);
    pendingSubmissionRef.current = null;
    if (platformAgent?.auth && !scheduledRunRecord) {
      platformAgent.setActivePlatformSession(sessionId);
    }
    void reloadMessages(false);
    return () => {
      // Display ownership ends here. useChatRounds aborts subscriptions for the
      // old Session; no cancel, task termination or Session release is issued.
      generationRef.current += 1;
    };
  }, [platformAgent, reloadMessages, scheduledRunRecord, sessionId]);

  useEffect(() => {
    setSelectedSourceIds([]);
    setSourcePlacements([]);
  }, [sessionId]);

  useEffect(() => {
    if (scheduleTrial || scheduledRunRecord || !composerDataSourceMenuLoaded) return;
    try {
      const raw = sessionStorage.getItem(AGENT_COMPOSER_PREFILL_STORAGE_KEY);
      if (!raw) return;
      const prefill = parseComposerPrefillStorageValue(raw, composerDataSourceItems);
      setDraft(prefill.text);
      setSelectedSourceIds(prefill.selectedSourceIds);
      setSourcePlacements(prefill.sourcePlacements);
      sessionStorage.removeItem(AGENT_COMPOSER_PREFILL_STORAGE_KEY);
    } catch {
      // A malformed local composer draft is not server data and is discarded.
    }
  }, [
    composerDataSourceItems,
    composerDataSourceMenuLoaded,
    scheduleTrial,
    scheduledRunRecord,
    sessionId,
  ]);

  const addComposerSource = useCallback(
    (sourceId: string) => {
      if (!composerDataSourceItems.some((item) => item.id === sourceId)) return;
      setSelectedSourceIds((current) =>
        current.includes(sourceId) ? current : [...current, sourceId],
      );
    },
    [composerDataSourceItems],
  );

  const removeComposerSource = useCallback((sourceId: string) => {
    setSelectedSourceIds((current) => current.filter((id) => id !== sourceId));
    setSourcePlacements((current) => current.filter((item) => item.sourceId !== sourceId));
  }, []);

  const firstUserMessageTitle = useMemo(() => {
    const first = messages.find(
      (message) => message.role === "user" && message.content.trim().length > 0,
    );
    return first ? compactText(first.content, 52) : "";
  }, [messages]);

  useEffect(() => {
    if (firstUserMessageTitle) setActiveSessionTitle(firstUserMessageTitle);
  }, [firstUserMessageTitle, setActiveSessionTitle]);

  const submitPreparedMessage = useCallback(
    async ({
      rawText,
      sourceIds,
      placements,
      files,
    }: {
      rawText: string;
      sourceIds: string[];
      placements: ComposerSourcePlacement[];
      files: File[];
    }): Promise<boolean> => {
      if (sending) return false;
      if (!platformAgent?.auth) {
        platformAgent?.openLogin("请先登录后再发送消息。");
        return false;
      }

      const trimmed = rawText.trim();
      if (!trimmed) return false;
      const message = insertDatasourceMentions(
        trimmed,
        sourceIds,
        placements,
        composerDataSourceItems,
      );
      const maxChars = getChatMessageMaxChars();
      if (message.length > maxChars) {
        setLocalError(`消息过长（${message.length} 字），请控制在 ${maxChars} 字以内。`);
        return false;
      }

      const waitingRound = activeRound?.status === "WAITING_INPUT" ? activeRound : null;
      if (activeRound && !waitingRound && !isTerminal(activeRound.status)) return false;

      const signature = submissionSignature(message, files, waitingRound?.round_id ?? null);
      const generation = generationRef.current;
      const pending = pendingSubmissionRef.current;
      const clientMessageId =
        pending?.signature === signature ? pending.clientMessageId : safeRandomUUID();
      pendingSubmissionRef.current = { signature, clientMessageId };
      const optimisticId = `${OPTIMISTIC_ROUND_USER_PREFIX}${clientMessageId}`;
      const optimisticAttachments = buildUserMessageAttachmentsFromFiles(files);
      const optimistic: SessionMessageItem = {
        id: optimisticId,
        role: "user",
        content: message,
        created_at: new Date().toISOString(),
        message_index: Number.MAX_SAFE_INTEGER,
        message_id: clientMessageId,
        meta: {
          client_message_id: clientMessageId,
          ...(waitingRound ? { round_id: waitingRound.round_id } : {}),
          ...(optimisticAttachments.length > 0 ? { attachments: optimisticAttachments } : {}),
        },
      };
      setMessages((current) =>
        current.some((item) => messageClientId(item) === clientMessageId)
          ? current
          : [...current, optimistic],
      );
      setSending(true);
      setLocalError("");
      try {
        if (waitingRound) {
          await roundController.resume(
            waitingRound.round_id,
            message,
            clientMessageId,
            files,
          );
        } else {
          const accepted = await roundController.send(message, clientMessageId, files);
          if (generation !== generationRef.current) return true;
          setMessages((current) =>
            current.map((item) =>
              item.id === optimisticId
                ? {
                    ...item,
                    meta: { ...messageMeta(item), round_id: accepted.round_id },
                  }
                : item,
            ),
          );
        }
        if (generation !== generationRef.current) return true;
        pendingSubmissionRef.current = null;
        setDraft("");
        setPendingFiles([]);
        setSelectedSourceIds([]);
        setSourcePlacements([]);
        await reloadMessages(true);
        void refreshHistoryNow();
        return true;
      } catch (error) {
        // Keep the optimistic user bubble and client_message_id. A retry of the
        // same visible request is idempotent even if the 202 response was lost.
        if (generation === generationRef.current) {
          setLocalError(publicRequestError(error, "发送失败，请重试。"));
        }
        return false;
      } finally {
        setSending(false);
      }
    },
    [
      activeRound,
      composerDataSourceItems,
      platformAgent,
      refreshHistoryNow,
      reloadMessages,
      roundController,
      sending,
    ],
  );

  const submitDraft = useCallback(
    () =>
      submitPreparedMessage({
        rawText: draft,
        sourceIds: selectedSourceIds,
        placements: sourcePlacements,
        files: pendingFiles,
      }),
    [draft, pendingFiles, selectedSourceIds, sourcePlacements, submitPreparedMessage],
  );

  const stopActiveRound = useCallback(async () => {
    const round = activeRound;
    if (!round || !roundCanStop(round.status)) return;
    const generation = generationRef.current;
    setLocalError("");
    try {
      await roundController.cancel(round.round_id);
    } catch (error) {
      if (generation === generationRef.current) {
        setLocalError(publicRequestError(error, "停止失败，请重试。"));
      }
    }
  }, [activeRound, roundController]);

  const displayMessages = useMemo(
    () =>
      buildDisplayMessages(
        messagesSessionId === sessionId ? messages : [],
        snapshots,
      ),
    [messages, messagesSessionId, sessionId, snapshots],
  );

  const selectedStep = useMemo<ChatRoundStep | null>(() => {
    if (!selectedResult) return null;
    return (
      snapshots
        .get(selectedResult.roundId)
        ?.steps.find((step) => step.step_id === selectedResult.stepId) ?? null
    );
  }, [selectedResult, snapshots]);

  useEffect(() => {
    if (selectedResult && (!selectedStep || selectedStep.artifacts.length === 0)) {
      setSelectedResult(null);
    }
  }, [selectedResult, selectedStep]);

  useChatStickToBottom(
    messagesScrollRef,
    messagesInnerRef,
    [displayMessages, messagesLoading, sending, localError],
    { resetKey: sessionId, followContentResize: true },
  );

  const headerLabel = scheduleTrial
    ? loadScheduleCreateDraft()?.title?.trim() || "试跑"
    : scheduledRunRecord
      ? runLabel?.trim() || "定时任务记录"
      : firstUserMessageTitle || "历史对话";

  const goBackToSchedule = useCallback(() => {
    const schedule = loadScheduleCreateDraft();
    const group = schedule?.createGroupIdFromUrl?.trim()
      ? `&groupId=${encodeURIComponent(schedule.createGroupIdFromUrl.trim())}`
      : "";
    const edit = schedule?.editingTaskId?.trim()
      ? `&edit=${encodeURIComponent(schedule.editingTaskId.trim())}`
      : "";
    router.push(`/schedules?create=1&restore=1${edit}${group}`);
  }, [router]);

  const saveSchedule = useCallback(async () => {
    if (!platformAgent) return;
    setSaveBusy(true);
    setLocalError("");
    try {
      await saveScheduleTasksWithDraft(platformAgent.withFreshToken, {
        requireEnabledNext: true,
      });
      router.push("/schedules");
    } catch (error) {
      setLocalError(publicRequestError(error, "保存失败。"));
    } finally {
      setSaveBusy(false);
    }
  }, [platformAgent, router]);

  const terminateTrial = useCallback(async () => {
    if (scheduleTrialRound && scheduleTrialCanTerminate(scheduleTrialRound)) {
      try {
        await roundController.cancel(scheduleTrialRound.round_id);
      } catch (error) {
        setLocalError(publicRequestError(error, "停止失败，请重试。"));
        return;
      }
    }
    goBackToSchedule();
  }, [goBackToSchedule, roundController, scheduleTrialRound]);

  const activeStatus = activeRound?.status ?? null;
  const waitingForInput = activeStatus === "WAITING_INPUT";
  const cancelRequested = activeStatus === "CANCEL_REQUESTED";
  const composerOwnsStop = roundCanStop(activeStatus) && !waitingForInput;
  const trialStatus = scheduleTrialRound?.status ?? null;
  const trialCancelRequested = trialStatus === "CANCEL_REQUESTED";
  const trialInFlight = Boolean(trialStatus && !isTerminal(trialStatus));
  const trialSaveReady = scheduleTrial && scheduleTrialCanSave(scheduleTrialRound) && !saveBusy;
  const combinedError = sanitizeAssistantContent(localError || roundController.error);

  const composer = (
    <TaskComposer
      value={draft}
      onValueChange={(value) => {
        setDraft(value);
        const pending = pendingSubmissionRef.current;
        if (pending && !pending.signature.includes(`\n${value.trim()}\n`)) {
          pendingSubmissionRef.current = null;
        }
      }}
      placeholder={waitingForInput ? "请补充所需信息" : "您可以继续追问或者让我做其他工作哦～"}
      mode="普通模式"
      onModeChange={() => undefined}
      selectedSourceIds={selectedSourceIds}
      sourcePlacements={sourcePlacements}
      onSourcePlacementsChange={setSourcePlacements}
      dataSourceGroups={composerDataSourceGroups}
      dataSourceItems={composerDataSourceItems}
      onToolSelect={addComposerSource}
      onSourceRemove={removeComposerSource}
      submitVariant={composerOwnsStop ? "stop" : "send"}
      onStop={() => void stopActiveRound()}
      showSubmitButton={!cancelRequested}
      onFilesSelected={(files) => {
        setPendingFiles((current) => {
          const next = [...current];
          const keys = new Set(current.map((file) => fileSignature([file])));
          for (const file of Array.from(files)) {
            const key = fileSignature([file]);
            if (!keys.has(key)) {
              keys.add(key);
              next.push(file);
            }
          }
          return next;
        });
        pendingSubmissionRef.current = null;
      }}
      onAttachmentsChange={(files) => {
        setPendingFiles(files);
        pendingSubmissionRef.current = null;
      }}
      onSubmit={() => void submitDraft()}
    />
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
                  void saveSchedule();
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
          selectedStep && selectedStep.artifacts.length > 0 ? (
            <AgentTaskResultPanel
              artifacts={selectedStep.artifacts}
              favoriteSourceTaskId={selectedStep.task_id}
              withFreshToken={withFreshToken}
              taskStatus={selectedStep.status}
              onClose={() => setSelectedResult(null)}
            />
          ) : undefined
        }
      >
        <div className="flex h-platform-session-main min-h-0 flex-1 flex-col overflow-hidden bg-bg-surface">
          <div
            ref={messagesScrollRef}
            className="hide-scrollbar-y min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-4 pt-6 sm:px-6"
            onScroll={() => setMessagesScrolled((messagesScrollRef.current?.scrollTop ?? 0) > 0)}
          >
            <div ref={messagesInnerRef} className={cn("mx-auto w-full", SIMPLE_CHAT_COLUMN_MAX)}>
              <div className="space-y-5">
                {combinedError ? (
                  <p className="text-sm text-danger">加载/发送失败：{combinedError}</p>
                ) : null}
                {messagesLoading || roundController.loading ? (
                  <p className="text-sm text-text-tertiary">加载中…</p>
                ) : null}
                {messagesLoaded &&
                !messagesLoading &&
                !sending &&
                displayMessages.length === 0 &&
                !scheduleTrial ? (
                  <p className="text-sm text-text-tertiary">该会话暂无消息</p>
                ) : null}
                <div className="space-y-3">
                  {displayMessages.map(({ message, round }) => (
                    <div key={message.id} className="space-y-2">
                      {message.role === "user" ? (
                        <SimpleUserBubble
                          text={message.content}
                          datetime={message.created_at}
                          attachments={parseUserMessageAttachments(messageMeta(message))}
                        />
                      ) : (
                        <>
                          <SimpleAssistantBubble
                            body={message.content}
                            datetime={message.created_at}
                            streaming={Boolean(round && !isTerminal(round.status))}
                          />
                          {round ? (
                            <ChatRoundProgress
                              status={round.status}
                              steps={round.steps}
                              onOpenStepResult={(step) =>
                                setSelectedResult({
                                  roundId: round.round_id,
                                  stepId: step.step_id,
                                })
                              }
                            />
                          ) : null}
                        </>
                      )}
                    </div>
                  ))}
                  {sending && !activeRound ? (
                    <AssistantLoadingRow variant="thinking" withIdentity />
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="shrink-0 bg-transparent px-4 py-4 sm:px-6">
            <div className={cn("mx-auto w-full", SIMPLE_CHAT_COLUMN_MAX)}>
              {scheduledRunRecord ? (
                <p className="py-1 text-center text-xs text-text-disabled">
                  此为定时任务执行记录，不支持继续追问。
                </p>
              ) : scheduleTrial ? (
                <div className="flex flex-col gap-3">
                  {trialInFlight ? (
                    <p className="text-center text-xs text-text-disabled">
                      试跑进行中，完成后可手动保存（不会自动写入定时任务）
                    </p>
                  ) : trialSaveReady ? (
                    <p className="text-center text-xs text-text-tertiary">
                      试跑已结束，请确认结果后点击「保存」
                    </p>
                  ) : null}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 w-full min-w-0 rounded-control sm:w-auto"
                      disabled={saveBusy || trialInFlight}
                      onClick={goBackToSchedule}
                    >
                      上一步
                    </Button>
                    <div className="flex w-full min-w-0 items-center justify-end gap-2 sm:max-w-sm">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-11 flex-1 rounded-control text-text-disabled sm:flex-initial"
                        disabled={!scheduleTrialCanTerminate(scheduleTrialRound) || saveBusy}
                        onClick={() => void terminateTrial()}
                      >
                        {trialCancelRequested ? "正在停止" : "终止"}
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
              ) : cancelRequested ? (
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">{composer}</div>
                  <Button type="button" className="h-11 rounded-control" aria-label="正在停止" disabled>
                    正在停止
                  </Button>
                </div>
              ) : waitingForInput ? (
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">{composer}</div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-control"
                    aria-label="停止任务"
                    onClick={() => void stopActiveRound()}
                  >
                    停止
                  </Button>
                </div>
              ) : (
                composer
              )}
            </div>
          </div>
        </div>
      </AliceShell>
    </>
  );
}
