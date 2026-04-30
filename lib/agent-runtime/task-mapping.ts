import type { TaskResponse } from "@/lib/agent-api/types";
import type { AgentRoundRuntimeEvent, TaskExecutionStepStatus } from "@/lib/agent-events";

export function mapServerOrchestrationStepStatus(status: string): TaskExecutionStepStatus {
  const s = (status || "").toUpperCase();
  if (s === "SUCCESS") return "done";
  if (s === "FAILED") return "error";
  if (s === "RUNNING") return "running";
  return "pending";
}

export function mapTaskResponseToSubtaskEvent(
  roundId: string,
  stepIndex: number,
  stepId: string,
  label: string,
  task: TaskResponse,
): AgentRoundRuntimeEvent {
  return {
    type: "platform_subtask_snapshot",
    roundId,
    stepIndex,
    stepId,
    label,
    taskId: task.task_id,
    outcome: task.status === "SUCCESS" ? "success" : "failed",
    taskStatus: task.status,
    errorMessage: task.error_message ?? null,
    artifacts: (task.artifacts ?? []).map((a) => ({
      artifact_id: a.artifact_id,
      artifact_type: a.artifact_type,
      original_name: a.original_name,
      download_api: a.download_api,
    })),
    zipDownloadApi: task.zip_download_api ?? `/api/tasks/${encodeURIComponent(task.task_id)}/download`,
  };
}
