"use client";

import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";

import { PlatformRoundStepTimeline } from "@/components/agent-workspace/platform-step-views";
import { TaskOrchestrationBlock } from "@/components/agent-workspace/task-orchestration-block";
import { ExecutionStepsHistoryList } from "@/components/execution-steps-monitor";
import type { PlatformSubtaskSnapshot, PlatformTaskArtifactRef, TaskExecutionStep } from "@/lib/agent-events";
import { cn } from "@/lib/utils";

function hasActiveExecutionStep(steps: TaskExecutionStep[]) {
  return steps.some((step) => {
    const status = (step.status ?? "").toLowerCase();
    return status === "queued" || status === "running" || status === "pending";
  });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

const WRAP = "w-full max-w-[min(100%,780px)]";

/**
 * 平台/历史会话中持久化的 `task_execution_steps`：与主会话内「任务拆分 + 任务执行」卡片区视觉对齐。
 */
export function TaskExecutionStepsAssistantBubble({
  steps,
  datetime,
  platformSubtasks,
  timelineRunId,
  activeHighlightTaskId,
  setPanelSubtaskFocus,
  setPanelVisibility,
}: {
  steps: TaskExecutionStep[];
  datetime: string;
  /** 自后端任务拉取后的子任务快照；有则使用与新建对话一致的步骤时间线 */
  platformSubtasks?: PlatformSubtaskSnapshot[];
  timelineRunId?: string;
  activeHighlightTaskId?: string | null;
  setPanelSubtaskFocus?: Dispatch<SetStateAction<{ taskId: string; artifacts: PlatformTaskArtifactRef[] } | null>>;
  setPanelVisibility?: Dispatch<SetStateAction<Record<string, boolean>>>;
}) {
  const ordered = [...steps].sort((a, b) => a.order - b.order);
  const executionActive = hasActiveExecutionStep(ordered);
  const [manualExecutionExpanded, setManualExecutionExpanded] = useState(false);
  const executionExpanded = executionActive || manualExecutionExpanded;

  const useLiveTimeline = Boolean(
    platformSubtasks &&
      platformSubtasks.length > 0 &&
      timelineRunId &&
      setPanelSubtaskFocus &&
      setPanelVisibility &&
      activeHighlightTaskId !== undefined,
  );

  if (ordered.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex w-full justify-start", WRAP)}>
      <TaskOrchestrationBlock
        datetime={formatTime(datetime)}
        splitItems={ordered.map((s) => s.label)}
        splitTestId="platform-task-split"
        executionExpanded={executionExpanded}
        onExecutionExpandedChange={setManualExecutionExpanded}
        executionContentClassName="mt-4 space-y-0"
        executionTestId="platform-task-execution-panel"
      >
        {useLiveTimeline ? (
          <PlatformRoundStepTimeline
            executionSteps={ordered}
            platformSubtasks={platformSubtasks}
            activeHighlightTaskId={executionActive ? (activeHighlightTaskId ?? null) : null}
            runId={timelineRunId!}
            setPanelSubtaskFocus={setPanelSubtaskFocus!}
            setPanelVisibility={setPanelVisibility!}
          />
        ) : (
          <ExecutionStepsHistoryList steps={ordered} />
        )}
      </TaskOrchestrationBlock>
    </div>
  );
}
