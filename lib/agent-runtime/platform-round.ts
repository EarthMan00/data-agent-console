import {
  getTask,
  getToolOrchestration,
  patchTaskExecutionSteps,
  postTaskExecutionSteps,
  sendChatMessage,
} from "@/lib/agent-api/client";
import type { TaskResponse, ToolOrchestrationStatusApi } from "@/lib/agent-api/types";
import type { AgentRoundRuntimeEvent, TaskExecutionStepStatus } from "@/lib/agent-events";
import { humanizeTaskErrorMessage } from "@/lib/platform-task-error-copy";
import { safeRandomUUID } from "@/lib/random-uuid";
import { stripModelThinkingForUi } from "@/lib/strip-model-thinking";
import { buildTaskCompletionSummary } from "@/lib/task-chat-summary";

import { PlatformAuthExpiredError } from "./auth";
import { capabilityLabelMap } from "./constants";
import { buildReportPatch } from "./report-helpers";
import { mapServerOrchestrationStepStatus, mapTaskResponseToSubtaskEvent } from "./task-mapping";
import { sleep } from "./util";
import type { AgentRoundInput, StreamAgentRoundPlatformOptions } from "./types";

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

  handlers.onEvent({ type: "round_started", roundId: input.roundId });

  if (input.attachments.length > 0) {
    handlers.onEvent({
      type: "attachments_received",
      roundId: input.roundId,
      attachments: input.attachments.map((item) => ({ ...item, status: "accepted" as const })),
    });
  }

  await withFreshToken(async (token) => {
    const accessToken = token;
    const mid = safeRandomUUID();
    const result = await sendChatMessage(accessToken, chatSessionId, input.prompt, mid);

    if (result.kind === "accepted") {
      onToolTaskAccepted?.({
        taskId: result.task_id,
        orchestrationId: result.orchestration_id,
      });
    }

    if (result.kind === "completed") {
      handlers.onEvent({
        type: "round_ui_layout",
        roundId: input.roundId,
        layout: "simple_chat",
      });
      const text = stripModelThinkingForUi(result.message);
      handlers.onEvent({ type: "final", roundId: input.roundId, text });
      handlers.onEvent({
        type: "report_updated",
        roundId: input.roundId,
        patch: buildReportPatch(input.prompt, sourceLabels, input.attachments),
      });
      handlers.onEvent({ type: "round_completed", roundId: input.roundId });
      return;
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
      const executionSteps = result.execution_steps ?? [];
      if (executionSteps.length === 0) {
        throw new Error("平台未返回 execution_steps，无法展示任务步骤");
      }
      const stepLabels = executionSteps;

      const stepDefs = stepLabels.map((label, i) => ({
        id: `${input.roundId}-step-${i + 1}`,
        label,
      }));

      handlers.onEvent({
        type: "round_ui_layout",
        roundId: input.roundId,
        layout: "tool_orchestration",
      });

      handlers.onEvent({
        type: "task_execution_steps_init",
        roundId: input.roundId,
        steps: stepDefs.map((s) => ({ id: s.id, label: s.label })),
      });

      const taskExecutionStepsMessageId = await postTaskExecutionSteps(accessToken, chatSessionId, {
        round_id: input.roundId,
        task_id: result.task_id,
        steps: stepDefs.map((s) => ({
          id: s.id,
          label: s.label,
          status: "pending" as const,
        })),
      });

      const persistTaskExecutionStepsRows = async (statuses: TaskExecutionStepStatus[], taskIdForMeta?: string) => {
        if (!taskExecutionStepsMessageId) return;
        const steps = stepDefs.map((s, i) => ({
          id: s.id,
          label: s.label,
          status: statuses[i] ?? ("pending" as TaskExecutionStepStatus),
        }));
        const body = {
          round_id: input.roundId,
          task_id: taskIdForMeta ?? result.task_id,
          steps,
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

      const emitStep = (stepId: string, status: TaskExecutionStepStatus) => {
        handlers.onEvent({
          type: "task_execution_step_update",
          roundId: input.roundId,
          stepId,
          status,
        });
      };

      const finalizeAllSteps = (status: TaskExecutionStepStatus) => {
        for (const s of stepDefs) {
          emitStep(s.id, status);
        }
      };

      const orchestrationId = result.orchestration_id;
      let sharedTask: TaskResponse = await getTask(accessToken, result.task_id);
      let orchFinished = false;
      let lastOrch: Awaited<ReturnType<typeof getToolOrchestration>> | null = null;

      if (orchestrationId) {
        let userStopped = false;
        for (let polls = 0; polls < 4500; polls += 1) {
          await sleep(800);
          if (shouldAbortPoll?.()) {
            userStopped = true;
            break;
          }
          lastOrch = await getToolOrchestration(accessToken, orchestrationId);
          lastOrch.steps.forEach((st, idx) => {
            const def = stepDefs[idx];
            if (!def) return;
            emitStep(def.id, mapServerOrchestrationStepStatus(st.status));
          });
          await emitFinishedOrchestrationSubtasks(lastOrch);
          if (lastOrch.finished) {
            orchFinished = true;
            break;
          }
        }

        if (userStopped) {
          finalizeAllSteps("error");
          await persistTaskExecutionStepsUniform("error");
          pushPlatformSnapshot({
            task_id: result.task_id,
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

        let summaryTaskId = result.task_id;
        if (lastOrch) {
          if (lastOrch.success) {
            const lastWithId = [...lastOrch.steps].reverse().find((s) => s.task_id);
            if (lastWithId?.task_id) summaryTaskId = lastWithId.task_id;
          } else {
            const failed = lastOrch.steps.find((s) => s.status.toUpperCase() === "FAILED");
            summaryTaskId = failed?.task_id ?? result.task_id;
          }
        }
        sharedTask = await getTask(accessToken, summaryTaskId);
      } else {
        if (stepDefs.length > 0) {
          emitStep(stepDefs[0]!.id, "running");
        }
        let polls = 0;
        let userStoppedSingle = false;
        while (!sharedTask.finished_at && polls < 600) {
          await sleep(1000);
          if (shouldAbortPoll?.()) {
            userStoppedSingle = true;
            break;
          }
          sharedTask = await getTask(accessToken, result.task_id);
          polls += 1;
        }
        if (userStoppedSingle) {
          if (stepDefs.length > 0) {
            emitStep(stepDefs[0]!.id, "error");
          }
          finalizeAllSteps("error");
          await persistTaskExecutionStepsUniform("error", result.task_id);
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
          } else if (sharedTask.status === "SUCCESS") {
            emitStep(stepDefs[0]!.id, "done");
          } else {
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

      if (orchestrationId) {
        if (!orchFinished) {
          finalizeAllSteps("error");
          await persistTaskExecutionStepsUniform("error");
          pushPlatformSnapshot({
            task_id: result.task_id,
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
            message: humanizeTaskErrorMessage(task.error_message ?? "多步任务中某一步执行失败"),
          });
          return;
        }

        pushPlatformSnapshot({
          ...task,
          zip_download_api: buildPlatformSnapshotZipDownloadApi(task, lastOrch),
        });

        const summary = buildTaskCompletionSummary(task);
        handlers.onEvent({ type: "final", roundId: input.roundId, text: summary });
        handlers.onEvent({
          type: "report_updated",
          roundId: input.roundId,
          patch: buildReportPatch(input.prompt, sourceLabels, input.attachments),
        });
        handlers.onEvent({ type: "round_completed", roundId: input.roundId });
        return;
      }

      if (!task.finished_at) {
        finalizeAllSteps("error");
        await persistTaskExecutionStepsUniform("error", task.task_id);
        pushPlatformSnapshot({
          task_id: result.task_id,
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
        const summary = buildTaskCompletionSummary(task);
        handlers.onEvent({ type: "final", roundId: input.roundId, text: summary });
        handlers.onEvent({
          type: "report_updated",
          roundId: input.roundId,
          patch: buildReportPatch(input.prompt, sourceLabels, input.attachments),
        });
        handlers.onEvent({ type: "round_completed", roundId: input.roundId });
        return;
      }

      finalizeAllSteps("done");
      await persistTaskExecutionStepsUniform("done", task.task_id);

      pushPlatformSnapshot({
        ...task,
        zip_download_api: buildPlatformSnapshotZipDownloadApi(task, null),
      });

      const summary = buildTaskCompletionSummary(task);
      handlers.onEvent({ type: "final", roundId: input.roundId, text: summary });
      handlers.onEvent({
        type: "report_updated",
        roundId: input.roundId,
        patch: buildReportPatch(input.prompt, sourceLabels, input.attachments),
      });
      handlers.onEvent({ type: "round_completed", roundId: input.roundId });
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
}
