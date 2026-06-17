"use client";

import type { Dispatch, SetStateAction } from "react";

import type {
  PlatformSubtaskSnapshot,
  PlatformTaskArtifactRef,
  TaskExecutionStep,
} from "@/lib/agent-events";
import {
  buildPlatformStepTimeline,
  ExecutionStepCard,
  ExecutionTimelineRow,
  StepResultPendingCard,
} from "@/components/execution-steps-monitor";
import { compactText } from "@/components/agent-workspace-view-models";
import { humanizeTaskErrorMessage } from "@/lib/platform-task-error-copy";
import { hasTabularTaskResultFiles } from "@/lib/platform-task-artifacts";

function PlatformSubtaskResultCard({
  snap,
  isActive,
  onSelect,
  totalSteps,
}: {
  snap: PlatformSubtaskSnapshot;
  isActive: boolean;
  onSelect: () => void;
  totalSteps: number;
}) {
  const hasPreviewFiles = hasTabularTaskResultFiles(snap.artifacts);
  const status = snap.outcome === "failed" ? "error" : "done";
  return (
    <ExecutionTimelineRow
      label={
        snap.errorMessage
          ? compactText(humanizeTaskErrorMessage(snap.errorMessage), 220)
          : compactText(snap.label, 200)
      }
      status={status}
      isLast={snap.stepIndex >= totalSteps - 1}
      active={isActive || status === "error"}
      onSelect={
        hasPreviewFiles
          ? () => {
              onSelect();
            }
          : undefined
      }
    />
  );
}

export function PlatformRoundStepTimeline({
  executionSteps,
  platformSubtasks,
  activeHighlightTaskId,
  runId,
  setPanelSubtaskFocus,
  setPanelVisibility,
  onOpenSubtaskResult,
}: {
  executionSteps: TaskExecutionStep[];
  platformSubtasks: PlatformSubtaskSnapshot[] | undefined;
  /** 与右侧结果区当前页签对齐的步骤 taskId（含默认选中「最新有结果的一步」） */
  activeHighlightTaskId: string | null;
  runId: string;
  setPanelSubtaskFocus?: Dispatch<SetStateAction<{ taskId: string; artifacts: PlatformTaskArtifactRef[] } | null>>;
  setPanelVisibility?: Dispatch<SetStateAction<Record<string, boolean>>>;
  /** 历史回放：按该轮消息打开结果面板，优先于 setPanelSubtaskFocus */
  onOpenSubtaskResult?: (taskId: string) => void;
}) {
  const items = buildPlatformStepTimeline(executionSteps, platformSubtasks);
  return (
    <div className="space-y-0" data-testid="agent-step-timeline">
      {items.map((item) => {
        if (item.kind === "executing") {
          return (
            <ExecutionStepCard
              key={`exec-${item.step.id}-${item.stepIndex}`}
              step={item.step}
              stepIndex={item.stepIndex}
              total={item.total}
            />
          );
        }
        if (item.kind === "result_pending") {
          return (
            <StepResultPendingCard
              key={`rp-${item.stepIndex}`}
              stepIndex={item.stepIndex}
              total={item.total}
              label={item.label}
              status={item.status}
            />
          );
        }
        const snap = item.snap;
        const active = activeHighlightTaskId === snap.taskId;
        return (
          <PlatformSubtaskResultCard
            key={snap.taskId}
            snap={snap}
            isActive={active}
            totalSteps={executionSteps.length}
            onSelect={() => {
              if (onOpenSubtaskResult) {
                onOpenSubtaskResult(snap.taskId);
                return;
              }
              if (!setPanelSubtaskFocus || !setPanelVisibility) return;
              setPanelSubtaskFocus({ taskId: snap.taskId, artifacts: snap.artifacts });
              setPanelVisibility((c) => ({ ...c, [runId]: true }));
            }}
          />
        );
      })}
    </div>
  );
}
