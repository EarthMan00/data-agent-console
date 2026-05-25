"use client";

import type { Dispatch, SetStateAction } from "react";
import Image from "next/image";

import { PlatformRoundStepTimeline } from "@/components/agent-workspace/platform-step-views";
import { TaskSplitSection } from "@/components/agent-workspace/task-split-section";
import { ExecutionStepsHistoryList } from "@/components/execution-steps-monitor";
import type { PlatformSubtaskSnapshot, PlatformTaskArtifactRef, TaskExecutionStep } from "@/lib/agent-events";
import { cn } from "@/lib/utils";

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
  if (ordered.length === 0) {
    return null;
  }

  const useLiveTimeline = Boolean(
    platformSubtasks &&
      platformSubtasks.length > 0 &&
      timelineRunId &&
      setPanelSubtaskFocus &&
      setPanelVisibility &&
      activeHighlightTaskId !== undefined,
  );

  return (
    <div className={cn("flex w-full justify-start", WRAP)}>
      <div className="w-full space-y-3.5">
        <div className="flex w-full min-w-0 items-center justify-between gap-3 text-[14px] font-medium text-[#303734]">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center">
              <Image
                src="/mdata-logo.png"
                alt="Alice"
                width={36}
                height={36}
                className="h-9 w-9 shrink-0 object-contain"
                draggable={false}
              />
            </div>
            <div>
              <div className="text-[14px] font-semibold text-[#1f2421]">Alice</div>
            </div>
          </div>
          <div className="shrink-0 text-[12px] text-[#94a3b8]">{formatTime(datetime)}</div>
        </div>

        <TaskSplitSection
          items={ordered.map((s) => s.label)}
          reveal={false}
          testId="platform-task-split"
        />

        <div
          className="rounded-[18px] border border-[#e2e2df] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(17,17,17,0.03)]"
          data-testid="platform-task-execution-panel"
        >
          <div className="text-[16px] font-semibold text-[#1f2421]">任务执行</div>
          <div className="mt-4 space-y-0">
            {useLiveTimeline ? (
              <PlatformRoundStepTimeline
                executionSteps={ordered}
                platformSubtasks={platformSubtasks}
                activeHighlightTaskId={activeHighlightTaskId ?? null}
                runId={timelineRunId!}
                setPanelSubtaskFocus={setPanelSubtaskFocus!}
                setPanelVisibility={setPanelVisibility!}
              />
            ) : (
              <ExecutionStepsHistoryList steps={ordered} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
