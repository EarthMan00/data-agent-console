import {
  formatAgentApiErrorForUser,
  getTask,
  getToolOrchestration,
  listSessionMessages,
  patchTaskExecutionSteps,
  postTaskExecutionSteps,
  sendChatMessageStream,
  uploadSessionAttachments,
} from "@/lib/agent-api/client";
import { ChatStreamError } from "@/lib/agent-api/chat-stream";
import type { TaskResponse, ToolOrchestrationStatusApi } from "@/lib/agent-api/types";
import type { AgentRoundRuntimeEvent, TaskExecutionStepStatus } from "@/lib/agent-events";
import { humanizeTaskErrorMessage } from "@/lib/platform-task-error-copy";
import { humanizeStepLabelForUi } from "@/lib/humanize-step-label";

async function resolveOrchestrationFailureUserMessage(
  accessToken: string,
  lastOrch: ToolOrchestrationStatusApi | null,
  parentTask: TaskResponse,
): Promise<string> {
  const orchMsg = lastOrch?.failure_message?.trim();
  if (orchMsg) return humanizeTaskErrorMessage(orchMsg);

  if (lastOrch) {
    for (let i = lastOrch.steps.length - 1; i >= 0; i--) {
      const st = lastOrch.steps[i];
      if (st.status.toUpperCase() !== "FAILED" || !st.task_id) continue;
      try {
        const ft = await getTask(accessToken, st.task_id);
        const em = ft.error_message?.trim();
        if (em) return humanizeTaskErrorMessage(em);
      } catch {
        /* 单步任务详情拉取失败时继续兜底 */
      }
      break;
    }
  }

  return humanizeTaskErrorMessage(
    parentTask.error_message?.trim() || "多步任务中某一步执行失败",
  );
}
import { safeRandomUUID } from "@/lib/random-uuid";
import { streamSanitizeDeltaClient, stripModelThinkingForUi } from "@/lib/strip-model-thinking";
import { sanitizeClarificationForUserDisplay, formatAliceClarificationForStream } from "@/lib/alice-clarification";
import {
  buildTaskCompletionSummary,
  extractPostTaskGuidance,
} from "@/lib/task-chat-summary";

import { resolvePendingAliceClarificationFromSession } from "@/lib/agent-runtime/session-alice-clarification";
import type { SessionAliceClarification } from "@/lib/agent-runtime/session-alice-clarification";
import { PlatformAuthExpiredError } from "./auth";
import { capabilityLabelMap } from "./constants";
import { buildReportPatch, resolveCapabilityLabelsForApi } from "./report-helpers";
import { mapServerOrchestrationStepStatus, mapTaskResponseToSubtaskEvent } from "./task-mapping";
import {
  clearSplitRevealWait,
  isSplitStreamEndedInStore,
  notifySplitRevealComplete,
  registerSplitRevealWait,
  waitForSplitRevealComplete,
  yieldToUi,
} from "@/lib/split-reveal-gate";
import {
  createPollScheduler,
  ORCHESTRATION_STATUS_POLL_INTERVAL_MS,
  PollTimeoutError,
  TASK_STATUS_POLL_INTERVAL_MS,
} from "@/lib/task-status-poll";
import { sleep } from "./util";
import type { AgentRoundInput, StreamAgentRoundPlatformOptions } from "./types";

const TRANSIENT_FETCH_RETRIES = 3;
const TRANSIENT_FETCH_RETRY_DELAY_MS = 1200;

function isTransientFetchError(e: unknown): boolean {
  if (!(e instanceof TypeError)) return false;
  const m = e.message.trim().toLowerCase();
  return m === "failed to fetch" || m.includes("networkerror") || m.includes("load failed");
}

async function withTransientFetchRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= TRANSIENT_FETCH_RETRIES; attempt += 1) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt < TRANSIENT_FETCH_RETRIES && isTransientFetchError(e)) {
        await sleep(TRANSIENT_FETCH_RETRY_DELAY_MS);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

/** 右侧「下载全部文件」：多步聚合 zip API，否则单任务级下载 API */
function buildPlatformSnapshotZipDownloadApi(
  task: Pick<TaskResponse, "task_id">,
  orch: ToolOrchestrationStatusApi | null | undefined,
): string | null {
  const selfId = (task.task_id || "").trim();
  const ids = (orch?.steps ?? [])
    .map((s) => s.task_id)
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
  if (ids.length > 1) {
    return `/api/tasks/download?${ids.map((id) => `task_ids=${encodeURIComponent(id)}`).join("&")}`;
  }
  if (ids.length === 1) {
    return `/api/tasks/${encodeURIComponent(ids[0]!)}/download`;
  }
  if (selfId) {
    return `/api/tasks/${encodeURIComponent(selfId)}/download`;
  }
  return null;
}

async function resolvePostTaskGuidanceText(
  token: string,
  sessionId: string,
  task: Pick<TaskResponse, "task_id" | "response_summary" | "finished_at">,
): Promise<string | null> {
  const fromTask = extractPostTaskGuidance(task as TaskResponse);
  if (fromTask) return fromTask;

  const taskId = (task.task_id || "").trim();
  // 引导由后端异步写入；减少轮询次数，避免与侧栏历史刷新叠加压垮 dev 代理
  for (let i = 0; i < 10; i += 1) {
    await sleep(1000);
    if (taskId) {
      try {
        const latest = await getTask(token, taskId);
        const g = extractPostTaskGuidance(latest);
        if (g) return g;
      } catch {
        /* 单任务拉取失败时继续尝试会话消息 */
      }
    }
    if (i % 2 === 1) {
      try {
        const page = await listSessionMessages(token, sessionId, 50);
        const row = [...(page.messages ?? [])]
          .reverse()
          .find((m) => {
            const meta =
              m.meta && typeof m.meta === "object" && !Array.isArray(m.meta)
                ? (m.meta as Record<string, unknown>)
                : undefined;
            return m.role === "assistant" && meta?.kind === "post_task_guidance";
          });
        const content = row?.content?.trim();
        if (content) return content;
      } catch {
        /* 引导为增强能力，拉取失败不阻断主流程 */
      }
    }
  }
  return null;
}

async function emitPlatformTaskRoundOutcome(
  handlers: { onEvent: (event: AgentRoundRuntimeEvent) => void },
  input: AgentRoundInput,
  sourceLabels: string[],
  token: string,
  sessionId: string,
  task: TaskResponse,
) {
  const summary = buildTaskCompletionSummary(task);
  handlers.onEvent({ type: "final", roundId: input.roundId, text: summary });
  const guidance = await resolvePostTaskGuidanceText(token, sessionId, task);
  if (guidance) {
    handlers.onEvent({ type: "post_task_guidance", roundId: input.roundId, text: guidance });
  }
  handlers.onEvent({
    type: "report_updated",
    roundId: input.roundId,
    patch: buildReportPatch(input.prompt, sourceLabels, input.attachments),
  });
  handlers.onEvent({ type: "round_completed", roundId: input.roundId });
}

async function finishRoundAwaitingAliceClarification(input: {
  handlers: { onEvent: (event: AgentRoundRuntimeEvent) => void };
  roundInput: AgentRoundInput;
  clarify: SessionAliceClarification;
  stepDefs: Array<{ id: string; label: string }>;
  orchestrationId: string | null;
  rowStatuses: TaskExecutionStepStatus[];
  persistRows: (statuses: TaskExecutionStepStatus[], taskId?: string) => Promise<void>;
  parentTaskId: string;
  emitStep: (
    stepId: string,
    status: TaskExecutionStepStatus,
    runtimeHint?: string,
    runtimeStartedAt?: string,
  ) => void;
}) {
  const { handlers, roundInput, clarify, stepDefs, orchestrationId, rowStatuses, persistRows, parentTaskId, emitStep } =
    input;
  const clarifyMessage =
    clarify.message.trim() ||
    sanitizeClarificationForUserDisplay("为了继续完成当前任务，请直接在对话中补充所需信息。");
  handlers.onEvent({
    type: "alice_clarification_pending",
    roundId: roundInput.roundId,
    message: clarifyMessage,
    shareUrl: null,
    stepIndex: clarify.stepIndex,
    orchestrationId: (orchestrationId ?? clarify.orchestrationId ?? undefined) || undefined,
  });
  rowStatuses.forEach((st, idx) => {
    const def = stepDefs[idx];
    if (def) emitStep(def.id, st);
  });
  await persistRows(rowStatuses, parentTaskId);
  handlers.onEvent({
    type: "final",
    roundId: roundInput.roundId,
    text: clarifyMessage,
  });
  handlers.onEvent({ type: "round_completed", roundId: roundInput.roundId });
}

function buildClarificationStepStatuses(
  stepCount: number,
  stepIndex: number | null,
  priorStatuses?: TaskExecutionStepStatus[],
): TaskExecutionStepStatus[] {
  const idx = stepIndex ?? 0;
  if (priorStatuses && priorStatuses.length === stepCount) {
    return priorStatuses.map((st, i) => (i === idx ? "awaiting_input" : st));
  }
  return Array.from({ length: stepCount }, (_, i) => {
    if (i < idx) return "done" as const;
    if (i === idx) return "awaiting_input" as const;
    return "pending" as const;
  });
}

export async function runPlatformRound(
  input: AgentRoundInput,
  handlers: { onEvent: (event: AgentRoundRuntimeEvent) => void },
  chatSessionId: string,
  platformOptions: StreamAgentRoundPlatformOptions,
) {
  const { withFreshToken, shouldAbortPoll, onToolTaskAccepted } = platformOptions;
  const sourceLabels =
    input.selectedCapabilities.length > 0
      ? input.selectedCapabilities.map((id) => capabilityLabelMap.get(id) ?? id)
      : [];
  const capabilityIdsForApi = resolveCapabilityLabelsForApi(input.selectedCapabilities);

  const isClarificationResume = Boolean(platformOptions.clarificationResume?.orchestrationId);

  if (isClarificationResume) {
    handlers.onEvent({ type: "orchestration_resume", roundId: input.roundId });
  } else {
    handlers.onEvent({ type: "round_started", roundId: input.roundId });
    registerSplitRevealWait(input.roundId);
  }

  if (input.attachments.length > 0) {
    handlers.onEvent({
      type: "attachments_received",
      roundId: input.roundId,
      attachments: input.attachments.map((item) => ({ ...item, status: "accepted" as const })),
    });
  }

  try {
  await withFreshToken(async (token) => {
    const accessToken = token;
    const mid = safeRandomUUID();
    let hadStreamDelta = false;
    let hadSplitStreamSteps = false;
    let rawStreamAccum = "";
    let prevSanitizedStream = "";
    const attachmentFiles = input.attachmentFiles ?? [];
    let attachmentIds: string[] = [];
    if (attachmentFiles.length > 0) {
      const uploaded = await uploadSessionAttachments(accessToken, chatSessionId, attachmentFiles);
      attachmentIds = uploaded.map((item) => item.attachment_id);
    }
    const result = await sendChatMessageStream(
      accessToken,
      chatSessionId,
      input.prompt,
      mid,
      {
        onDelta: (text) => {
          if (!text) return;
          rawStreamAccum += text;
          const { display, delta } = streamSanitizeDeltaClient(prevSanitizedStream, rawStreamAccum);
          prevSanitizedStream = display;
          if (!delta) return;
          hadStreamDelta = true;
          if (!hadSplitStreamSteps) {
            handlers.onEvent({
              type: "round_ui_layout",
              roundId: input.roundId,
              layout: "simple_chat",
            });
          }
          handlers.onEvent({ type: "delta", roundId: input.roundId, text: delta });
        },
        onSplitDelta: (steps) => {
          if (steps.length === 0) return;
          hadSplitStreamSteps = true;
          handlers.onEvent({
            type: "round_ui_layout",
            roundId: input.roundId,
            layout: "tool_orchestration",
          });
          handlers.onEvent({
            type: "task_split_delta",
            roundId: input.roundId,
            steps,
          });
        },
        onAssistantComplete: (full) => {
          const cleaned = stripModelThinkingForUi(full);
          const finalText = cleaned === "（无回复）" ? "" : cleaned.trim();
          if (finalText) {
            if (finalText.length > prevSanitizedStream.length) {
              const tail = finalText.startsWith(prevSanitizedStream)
                ? finalText.slice(prevSanitizedStream.length)
                : finalText;
              if (tail) {
                hadStreamDelta = true;
                prevSanitizedStream = finalText;
                if (!hadSplitStreamSteps) {
                  handlers.onEvent({
                    type: "round_ui_layout",
                    roundId: input.roundId,
                    layout: "simple_chat",
                  });
                }
                handlers.onEvent({ type: "delta", roundId: input.roundId, text: tail });
              }
            } else if (!prevSanitizedStream.trim()) {
              hadStreamDelta = true;
              prevSanitizedStream = finalText;
              if (!hadSplitStreamSteps) {
                handlers.onEvent({
                  type: "round_ui_layout",
                  roundId: input.roundId,
                  layout: "simple_chat",
                });
              }
              handlers.onEvent({ type: "delta", roundId: input.roundId, text: finalText });
            }
          }
          if (hadSplitStreamSteps) {
            handlers.onEvent({ type: "task_split_stream_end", roundId: input.roundId });
          }
        },
      },
      { attachmentIds, capabilityIds: capabilityIdsForApi },
    );

    if (result.kind === "accepted") {
      onToolTaskAccepted?.({
        taskId: result.task_id,
        orchestrationId: result.orchestration_id,
      });
      if (result.orchestration_id) {
        handlers.onEvent({
          type: "platform_orchestration_bound",
          roundId: input.roundId,
          orchestrationId: result.orchestration_id,
        });
      }
      if (prevSanitizedStream.trim()) {
        handlers.onEvent({
          type: "final",
          roundId: input.roundId,
          text: prevSanitizedStream,
        });
      }
    }

    if (result.kind === "completed") {
      const clarificationResume = platformOptions.clarificationResume;
      const isClarificationResume = Boolean(clarificationResume?.orchestrationId);
      if (!isClarificationResume) {
        handlers.onEvent({
          type: "round_ui_layout",
          roundId: input.roundId,
          layout: "simple_chat",
        });
        const text = stripModelThinkingForUi(result.message || rawStreamAccum);
        const finalText = text === "（无回复）" ? "" : text;
        const resolvedFinal = (finalText || prevSanitizedStream).trim();
        if (hadStreamDelta && resolvedFinal && resolvedFinal.length > prevSanitizedStream.length) {
          const tail = resolvedFinal.startsWith(prevSanitizedStream)
            ? resolvedFinal.slice(prevSanitizedStream.length)
            : "";
          if (tail) {
            handlers.onEvent({ type: "delta", roundId: input.roundId, text: tail });
          }
        } else if (!hadStreamDelta && resolvedFinal) {
          handlers.onEvent({ type: "delta", roundId: input.roundId, text: resolvedFinal });
        }
        handlers.onEvent({
          type: "final",
          roundId: input.roundId,
          text: resolvedFinal,
        });
        handlers.onEvent({ type: "round_completed", roundId: input.roundId });
        return;
      }
    }

    if (result.kind === "blocked") {
      handlers.onEvent({
        type: "round_ui_layout",
        roundId: input.roundId,
        layout: "simple_chat",
      });
      handlers.onEvent({
        type: "error",
        roundId: input.roundId,
        message: result.message,
      });
      return;
    }

    try {
      const clarificationResume = platformOptions.clarificationResume;
      const isClarificationResume =
        result.kind === "completed" && Boolean(clarificationResume?.orchestrationId);

      let stepDefs: Array<{ id: string; label: string }>;
      let orchestrationId: string | null;
      let acceptedTaskId: string;

      if (isClarificationResume && clarificationResume) {
        orchestrationId = clarificationResume.orchestrationId;
        stepDefs = clarificationResume.stepDefs;
        acceptedTaskId = "";
        handlers.onEvent({ type: "alice_clarification_cleared", roundId: input.roundId });
        handlers.onEvent({
          type: "round_ui_layout",
          roundId: input.roundId,
          layout: "tool_orchestration",
        });
        let resumeOk = false;
        for (let attempt = 0; attempt < 40; attempt += 1) {
          const resumeCheck = await withTransientFetchRetry(() => getToolOrchestration(accessToken, orchestrationId!));
          if (!resumeCheck.awaiting_clarification) {
            resumeOk = true;
            break;
          }
          await sleep(500);
        }
        if (!resumeOk) {
          handlers.onEvent({
            type: "error",
            roundId: input.roundId,
            message: humanizeTaskErrorMessage(
              "未能恢复任务执行，请重新发送补充信息；若仍失败请刷新页面。",
            ),
          });
          return;
        }
        const resumeIdx = clarificationResume.clarificationStepIndex ?? 0;
        const resumeStep = stepDefs[resumeIdx];
        if (resumeStep) {
          handlers.onEvent({
            type: "task_execution_step_update",
            roundId: input.roundId,
            stepId: resumeStep.id,
            status: "running",
          });
        }
      } else {
        if (result.kind !== "accepted") {
          throw new Error("平台未接受工具任务");
        }
        const executionSteps = result.execution_steps ?? [];
        if (executionSteps.length === 0) {
          throw new Error("平台未返回 execution_steps，无法展示任务步骤");
        }
        const stepLabels = executionSteps.map((label) => humanizeStepLabelForUi(label));
        stepDefs = stepLabels.map((label, i) => ({
          id: `${input.roundId}-step-${i + 1}`,
          label,
        }));
        orchestrationId = result.orchestration_id;
        acceptedTaskId = result.task_id;

        handlers.onEvent({
          type: "round_ui_layout",
          roundId: input.roundId,
          layout: "tool_orchestration",
        });

        const finishSplitRevealUi = async () => {
          if (!isSplitStreamEndedInStore(input.roundId)) {
            handlers.onEvent({ type: "task_split_stream_end", roundId: input.roundId });
          }
          await waitForSplitRevealComplete(input.roundId, stepLabels);
          handlers.onEvent({ type: "split_reveal_complete", roundId: input.roundId });
          notifySplitRevealComplete(input.roundId);
        };

        registerSplitRevealWait(input.roundId);

        if (hadSplitStreamSteps) {
          handlers.onEvent({
            type: "task_execution_steps_init",
            roundId: input.roundId,
            steps: stepDefs.map((s) => ({ id: s.id, label: s.label })),
          });
          await finishSplitRevealUi();
        } else {
          handlers.onEvent({
            type: "task_execution_steps_init",
            roundId: input.roundId,
            steps: stepDefs.map((s) => ({ id: s.id, label: s.label })),
          });
          await yieldToUi();
          await finishSplitRevealUi();
        }

        if (stepDefs.length > 0) {
          handlers.onEvent({
            type: "task_execution_step_update",
            roundId: input.roundId,
            stepId: stepDefs[0]!.id,
            status: "running",
          });
        }
      }

      let taskExecutionStepsMessageId: string | null = null;
      if (!isClarificationResume && result.kind === "accepted") {
        taskExecutionStepsMessageId = await postTaskExecutionSteps(accessToken, chatSessionId, {
          round_id: input.roundId,
          task_id: result.task_id,
          steps: stepDefs.map((s) => ({
            id: s.id,
            label: s.label,
            status: "pending" as const,
          })),
          orchestration_id: orchestrationId,
        });
      }

      const persistTaskExecutionStepsRows = async (statuses: TaskExecutionStepStatus[], taskIdForMeta?: string) => {
        if (!taskExecutionStepsMessageId) return;
        const steps = stepDefs.map((s, i) => ({
          id: s.id,
          label: s.label,
          status: statuses[i] ?? ("pending" as TaskExecutionStepStatus),
        }));
        const body = {
          round_id: input.roundId,
          task_id: taskIdForMeta ?? acceptedTaskId,
          steps,
          orchestration_id: orchestrationId,
        };
        await patchTaskExecutionSteps(accessToken, chatSessionId, taskExecutionStepsMessageId, body);
      };

      const persistTaskExecutionStepsUniform = async (finalStatus: TaskExecutionStepStatus, taskIdForMeta?: string) => {
        await persistTaskExecutionStepsRows(stepDefs.map(() => finalStatus), taskIdForMeta);
      };

      const pushPlatformSnapshot = (t: Pick<TaskResponse, "task_id" | "artifacts" | "zip_download_api">) => {
        handlers.onEvent({
          type: "platform_task_snapshot",
          roundId: input.roundId,
          taskId: t.task_id,
          artifacts: (t.artifacts ?? []).map((a) => ({
            artifact_id: a.artifact_id,
            artifact_type: a.artifact_type,
            original_name: a.original_name,
            download_api: a.download_api,
          })),
          zipDownloadApi: t.zip_download_api ?? null,
        });
      };

      const emittedSubtaskTaskIds = new Set<string>();

      const emitFinishedOrchestrationSubtasks = async (orch: ToolOrchestrationStatusApi) => {
        for (let i = 0; i < orch.steps.length; i++) {
          const st = orch.steps[i]!;
          const tid = st.task_id;
          if (!tid || emittedSubtaskTaskIds.has(tid)) continue;
          const u = st.status.toUpperCase();
          if (u !== "SUCCESS" && u !== "FAILED") continue;
          emittedSubtaskTaskIds.add(tid);
          const def = stepDefs[i];
          const label = def?.label ?? st.label ?? `步骤 ${i + 1}`;
          const sid = def?.id ?? `${input.roundId}-step-${i + 1}`;
          const t = await getTask(accessToken, tid);
          handlers.onEvent(mapTaskResponseToSubtaskEvent(input.roundId, i, sid, label, t));
        }
      };

      const emitStep = (
        stepId: string,
        status: TaskExecutionStepStatus,
        runtimeHint?: string,
        runtimeStartedAt?: string,
      ) => {
        handlers.onEvent({
          type: "task_execution_step_update",
          roundId: input.roundId,
          stepId,
          status,
          ...(runtimeHint ? { runtimeHint } : {}),
          ...(runtimeStartedAt ? { runtimeStartedAt } : {}),
        });
      };

      const finalizeAllSteps = (status: TaskExecutionStepStatus) => {
        for (const s of stepDefs) {
          emitStep(s.id, status);
        }
      };

      let sharedTask: TaskResponse;
      if (acceptedTaskId) {
        sharedTask = await getTask(accessToken, acceptedTaskId);
      } else if (orchestrationId) {
        const orchSnap = await withTransientFetchRetry(() =>
          getToolOrchestration(accessToken, orchestrationId),
        );
        const firstTaskId = orchSnap.steps.map((s) => s.task_id).find((id) => id);
        if (!firstTaskId) {
          throw new Error("编排任务缺少 task_id");
        }
        sharedTask = await getTask(accessToken, firstTaskId);
      } else {
        throw new Error("平台未返回 task_id，无法继续执行");
      }
      const parentTaskId = acceptedTaskId || sharedTask.task_id;
      let orchFinished = false;
      let lastOrch: Awaited<ReturnType<typeof getToolOrchestration>> | null = null;
      let clarificationAnnounced = false;
      let orchAwaitingClarification = false;

      if (orchestrationId) {
        let userStopped = false;
        const orchScheduler = createPollScheduler({
          maxDurationMs: 30 * 60 * 1000,
          initialDelayMs: ORCHESTRATION_STATUS_POLL_INTERVAL_MS,
          maxDelayMs: 30_000,
        });
        while (true) {
          try {
            await orchScheduler.nextDelay();
          } catch (e) {
            if (e instanceof PollTimeoutError) break;
            throw e;
          }
          if (shouldAbortPoll?.()) {
            userStopped = true;
            break;
          }
          lastOrch = await withTransientFetchRetry(() =>
            getToolOrchestration(accessToken, orchestrationId),
          );
          lastOrch.steps.forEach((st, idx) => {
            const def = stepDefs[idx];
            if (!def) return;
            emitStep(
              def.id,
              mapServerOrchestrationStepStatus(st.status),
              st.runtime_hint ?? undefined,
              st.task_started_at ?? undefined,
            );
          });
          await emitFinishedOrchestrationSubtasks(lastOrch);
          const orchNeedsClarifyUi =
            Boolean(lastOrch.awaiting_clarification) ||
            lastOrch.steps.some((s) => s.status.toUpperCase() === "AWAITING_INPUT");
          if (orchNeedsClarifyUi && !clarificationAnnounced) {
            clarificationAnnounced = true;
            const clarifyMessage = sanitizeClarificationForUserDisplay(
              lastOrch.clarification_message?.trim() ||
                "为了继续完成当前任务，请直接在对话中补充所需信息。",
            );
            const clarifyText = formatAliceClarificationForStream(clarifyMessage, null);
            handlers.onEvent({
              type: "alice_clarification_pending",
              roundId: input.roundId,
              message: clarifyMessage,
              shareUrl: null,
              stepIndex: lastOrch.clarification_step_index ?? null,
              orchestrationId,
            });
            handlers.onEvent({
              type: "delta",
              roundId: input.roundId,
              text: `\n\n${clarifyText}\n\n`,
            });
          }
          if (orchNeedsClarifyUi) {
            orchAwaitingClarification = true;
            break;
          }
          if (lastOrch.finished) {
            orchFinished = true;
            break;
          }
        }

        if (userStopped) {
          finalizeAllSteps("error");
          await persistTaskExecutionStepsUniform("error");
          pushPlatformSnapshot({
            task_id: parentTaskId,
            artifacts: [],
            zip_download_api: null,
          });
          handlers.onEvent({
            type: "error",
            roundId: input.roundId,
            message: humanizeTaskErrorMessage("任务已终止。"),
          });
          return;
        }

        let summaryTaskId = parentTaskId;
        if (lastOrch) {
          if (lastOrch.success) {
            const lastWithId = [...lastOrch.steps].reverse().find((s) => s.task_id);
            if (lastWithId?.task_id) summaryTaskId = lastWithId.task_id;
          } else {
            const failed = lastOrch.steps.find((s) => s.status.toUpperCase() === "FAILED");
            summaryTaskId = failed?.task_id ?? parentTaskId;
          }
        }
        sharedTask = await getTask(accessToken, summaryTaskId);
      } else {
        if (stepDefs.length > 0) {
          emitStep(stepDefs[0]!.id, "running");
        }
        let userStoppedSingle = false;
        const taskScheduler = createPollScheduler({
          maxDurationMs: 15 * 60 * 1000,
          initialDelayMs: TASK_STATUS_POLL_INTERVAL_MS,
          maxDelayMs: 30_000,
        });
        while (!sharedTask.finished_at) {
          try {
            await taskScheduler.nextDelay();
          } catch (e) {
            if (e instanceof PollTimeoutError) break;
            throw e;
          }
          if (shouldAbortPoll?.()) {
            userStoppedSingle = true;
            break;
          }
          sharedTask = await getTask(accessToken, parentTaskId);
        }
        if (userStoppedSingle) {
          if (stepDefs.length > 0) {
            emitStep(stepDefs[0]!.id, "error");
          }
          finalizeAllSteps("error");
          await persistTaskExecutionStepsUniform("error", parentTaskId);
          handlers.onEvent({
            type: "error",
            roundId: input.roundId,
            message: humanizeTaskErrorMessage("任务已终止。"),
          });
          return;
        }
        if (stepDefs.length > 0) {
          if (!sharedTask.finished_at) {
            emitStep(stepDefs[0]!.id, "error");
          } else if (sharedTask.status !== "SUCCESS") {
            emitStep(stepDefs[0]!.id, "error");
          }
        }
        if (sharedTask.finished_at && stepDefs[0] && !emittedSubtaskTaskIds.has(sharedTask.task_id)) {
          emittedSubtaskTaskIds.add(sharedTask.task_id);
          handlers.onEvent(
            mapTaskResponseToSubtaskEvent(
              input.roundId,
              0,
              stepDefs[0]!.id,
              stepDefs[0]!.label,
              sharedTask,
            ),
          );
        }
      }

      const task = sharedTask;

      let pendingClarifyFromSession: SessionAliceClarification | null = null;
      if (!orchAwaitingClarification && task.finished_at && task.status === "SUCCESS") {
        pendingClarifyFromSession = await resolvePendingAliceClarificationFromSession(
          accessToken,
          chatSessionId,
          {
            taskId: parentTaskId,
            orchestrationId: orchestrationId ?? undefined,
            maxAttempts: orchestrationId ? 24 : 20,
          },
        );
        if (pendingClarifyFromSession && orchestrationId && !lastOrch) {
          try {
            lastOrch = await withTransientFetchRetry(() =>
            getToolOrchestration(accessToken, orchestrationId),
          );
          } catch {
            /* 编排快照拉取失败时仍可用 session 澄清文案 */
          }
        }
        if (pendingClarifyFromSession) {
          orchAwaitingClarification = true;
        }
      }

      if (orchestrationId) {
        if (orchAwaitingClarification) {
          const clarifyMessage = sanitizeClarificationForUserDisplay(
            pendingClarifyFromSession?.message ||
              lastOrch?.clarification_message?.trim() ||
              "为了继续完成当前任务，请直接在对话中补充所需信息。",
          );
          if (!clarificationAnnounced) {
            handlers.onEvent({
              type: "alice_clarification_pending",
              roundId: input.roundId,
              message: clarifyMessage,
              shareUrl: null,
              stepIndex:
                pendingClarifyFromSession?.stepIndex ??
                lastOrch?.clarification_step_index ??
                null,
              orchestrationId: orchestrationId ?? undefined,
            });
          }
          const rowStatuses: TaskExecutionStepStatus[] =
            lastOrch?.steps.map((s) => mapServerOrchestrationStepStatus(s.status)) ??
            buildClarificationStepStatuses(
              stepDefs.length,
              pendingClarifyFromSession?.stepIndex ?? lastOrch?.clarification_step_index ?? 0,
            );
          if (pendingClarifyFromSession) {
            const clarifyIdx =
              pendingClarifyFromSession.stepIndex ?? lastOrch?.clarification_step_index ?? 0;
            if (rowStatuses[clarifyIdx] !== "awaiting_input") {
              rowStatuses[clarifyIdx] = "awaiting_input";
            }
          }
          rowStatuses.forEach((st, idx) => {
            const def = stepDefs[idx];
            if (def) emitStep(def.id, st);
          });
          await persistTaskExecutionStepsRows(rowStatuses, parentTaskId);
          handlers.onEvent({
            type: "final",
            roundId: input.roundId,
            text: clarifyMessage,
          });
          handlers.onEvent({ type: "round_completed", roundId: input.roundId });
          return;
        }
        if (!orchFinished) {
          finalizeAllSteps("error");
          await persistTaskExecutionStepsUniform("error");
          pushPlatformSnapshot({
            task_id: parentTaskId,
            artifacts: [],
            zip_download_api: null,
          });
          handlers.onEvent({
            type: "error",
            roundId: input.roundId,
            message: humanizeTaskErrorMessage("多步任务等待超时，请稍后在任务列表中查看各步骤状态。"),
          });
          return;
        }

        const rowStatuses: TaskExecutionStepStatus[] =
          lastOrch?.steps.map((s) => mapServerOrchestrationStepStatus(s.status)) ??
          stepDefs.map(() => "error" as TaskExecutionStepStatus);
        await persistTaskExecutionStepsRows(rowStatuses, task.task_id);

        if (!lastOrch?.success) {
          if (lastOrch) {
            const rowStatuses: TaskExecutionStepStatus[] = lastOrch.steps.map((st) => {
              const mapped = mapServerOrchestrationStepStatus(st.status);
              return mapped === "pending" ? "error" : mapped;
            });
            rowStatuses.forEach((st, idx) => {
              const def = stepDefs[idx];
              if (def) emitStep(def.id, st);
            });
            await persistTaskExecutionStepsRows(rowStatuses, task.task_id);
          }
          handlers.onEvent({
            type: "error",
            roundId: input.roundId,
            message: await resolveOrchestrationFailureUserMessage(
              accessToken,
              lastOrch,
              task,
            ),
          });
          return;
        }

        pushPlatformSnapshot({
          ...task,
          zip_download_api: buildPlatformSnapshotZipDownloadApi(task, lastOrch),
        });

        await emitPlatformTaskRoundOutcome(
          handlers,
          input,
          sourceLabels,
          token,
          chatSessionId,
          task,
        );
        return;
      }

      if (!task.finished_at) {
        finalizeAllSteps("error");
        await persistTaskExecutionStepsUniform("error", task.task_id);
        pushPlatformSnapshot({
          task_id: parentTaskId,
          artifacts: [],
          zip_download_api: null,
        });
        handlers.onEvent({
          type: "error",
          roundId: input.roundId,
          message: humanizeTaskErrorMessage("等待任务结果超时，请稍后在任务列表中查看。"),
        });
        return;
      }

      if (task.status === "FAILED") {
        finalizeAllSteps("error");
        await persistTaskExecutionStepsUniform("error", task.task_id);
        handlers.onEvent({
          type: "error",
          roundId: input.roundId,
          message: humanizeTaskErrorMessage(task.error_message ?? "任务执行失败"),
        });
        return;
      }

      if (task.status !== "SUCCESS") {
        finalizeAllSteps("error");
        await persistTaskExecutionStepsUniform("error", task.task_id);
        await emitPlatformTaskRoundOutcome(
          handlers,
          input,
          sourceLabels,
          token,
          chatSessionId,
          task,
        );
        return;
      }

      if (pendingClarifyFromSession) {
        const rowStatuses = buildClarificationStepStatuses(
          stepDefs.length,
          pendingClarifyFromSession.stepIndex ?? 0,
        );
        await finishRoundAwaitingAliceClarification({
          handlers,
          roundInput: input,
          clarify: pendingClarifyFromSession,
          stepDefs,
          orchestrationId: null,
          rowStatuses,
          persistRows: persistTaskExecutionStepsRows,
          parentTaskId: task.task_id,
          emitStep,
        });
        return;
      }

      finalizeAllSteps("done");
      await persistTaskExecutionStepsUniform("done", task.task_id);

      pushPlatformSnapshot({
        ...task,
        zip_download_api: buildPlatformSnapshotZipDownloadApi(task, null),
      });

      await emitPlatformTaskRoundOutcome(
        handlers,
        input,
        sourceLabels,
        token,
        chatSessionId,
        task,
      );
    } catch (e) {
      if (e instanceof PlatformAuthExpiredError) {
        handlers.onEvent({
          type: "error",
          roundId: input.roundId,
          message: humanizeTaskErrorMessage("登录已失效，请重新登录后再试。"),
        });
        return;
      }
      throw e;
    }
  });
  } catch (e) {
    let message: string;
    try {
      if (e instanceof ChatStreamError) {
        message = e.message;
      } else {
        message = formatAgentApiErrorForUser(e);
      }
    } catch {
      message = "发生未知错误，请稍后重试。";
    }
    if (!message || message.trim().length === 0) {
      message = "发生未知错误，请稍后重试。";
    }
    handlers.onEvent({
      type: "error",
      roundId: input.roundId,
      message: humanizeTaskErrorMessage(message),
    });
    handlers.onEvent({ type: "round_completed", roundId: input.roundId });
  } finally {
    clearSplitRevealWait(input.roundId);
  }
}
