"use client";



import type { Dispatch, ReactNode, SetStateAction } from "react";

import { useState } from "react";



import { PlatformRoundStepTimeline } from "@/components/agent-workspace/platform-step-views";

import { TaskOrchestrationBlock } from "@/components/agent-workspace/task-orchestration-block";

import { ExecutionRuntimeTag, ExecutionStepsHistoryList } from "@/components/execution-steps-monitor";

import type { PlatformSubtaskSnapshot, PlatformTaskArtifactRef, TaskExecutionStep } from "@/lib/agent-events";

import { humanizeStepLabelForUi } from "@/lib/humanize-step-label";
import { taskExecutionTitleForSteps } from "@/lib/task-terminated-presentation";



function hasActiveExecutionStep(steps: TaskExecutionStep[]) {

  return steps.some((step) => {

    const status = (step.status ?? "").toLowerCase();

    return status === "queued" || status === "running" || status === "pending";

  });

}

function getExecutionTitle(steps: TaskExecutionStep[], terminated?: boolean) {
  return taskExecutionTitleForSteps(steps, { terminated });
}

function formatTime(iso: string) {
  const d = new Date(iso);

  if (Number.isNaN(d.getTime())) return iso;

  return d.toLocaleString();

}



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

  onOpenSubtaskResult,

  afterExecution,

  terminated = false,

}: {

  steps: TaskExecutionStep[];

  datetime: string;

  /** 自后端任务拉取后的子任务快照；有则使用与新建对话一致的步骤时间线 */

  platformSubtasks?: PlatformSubtaskSnapshot[];

  timelineRunId?: string;

  activeHighlightTaskId?: string | null;

  setPanelSubtaskFocus?: Dispatch<SetStateAction<{ taskId: string; artifacts: PlatformTaskArtifactRef[] } | null>>;

  setPanelVisibility?: Dispatch<SetStateAction<Record<string, boolean>>>;

  /** 历史回放：点击步骤结果卡时按该轮消息打开面板 */

  onOpenSubtaskResult?: (taskId: string) => void;

  /** 附属于同一条任务执行消息的后续内容，例如任务结果卡片。 */

  afterExecution?: ReactNode;

  /** 用户手动终止（区别于执行失败） */
  terminated?: boolean;

}) {

  const ordered = [...steps].sort((a, b) => a.order - b.order);

  const executionActive = hasActiveExecutionStep(ordered);
  const executionTitle = getExecutionTitle(ordered, terminated);

  const awaitingUserInput = ordered.some((s) => s.status === "awaiting_input");

  const [manualExecutionExpanded, setManualExecutionExpanded] = useState(false);

  const executionExpanded = executionActive || manualExecutionExpanded || awaitingUserInput;

  const executionTitleTag = ordered.some(
    (step) => step.status === "running" && (step.runtimeHint || step.runtimeStartedAt),
  )
    ? <ExecutionRuntimeTag steps={ordered} />
    : undefined;

  const useLiveTimeline = Boolean(

    platformSubtasks &&

      platformSubtasks.length > 0 &&

      timelineRunId &&

      activeHighlightTaskId !== undefined &&

      (onOpenSubtaskResult || (setPanelSubtaskFocus && setPanelVisibility)),

  );



  if (ordered.length === 0) {

    return null;

  }



  return (

      <TaskOrchestrationBlock

        datetime={formatTime(datetime)}

        splitItems={ordered.map((s) => humanizeStepLabelForUi(s.label))}

        splitTestId="platform-task-split"

        executionExpanded={executionExpanded}

        onExecutionExpandedChange={setManualExecutionExpanded}

        executionContentClassName="mt-4 space-y-0"

        executionTestId="platform-task-execution-panel"
        executionTitle={executionTitle}
        executionTitleTag={executionTitleTag}
        afterExecution={afterExecution}
      >

        {useLiveTimeline ? (

          <PlatformRoundStepTimeline

            executionSteps={ordered}

            platformSubtasks={platformSubtasks}

            activeHighlightTaskId={executionActive ? (activeHighlightTaskId ?? null) : null}

            runId={timelineRunId!}

            setPanelSubtaskFocus={setPanelSubtaskFocus}

            setPanelVisibility={setPanelVisibility}

            onOpenSubtaskResult={onOpenSubtaskResult}

          />

        ) : (

          <ExecutionStepsHistoryList steps={ordered} />

        )}

      </TaskOrchestrationBlock>

  );

}
