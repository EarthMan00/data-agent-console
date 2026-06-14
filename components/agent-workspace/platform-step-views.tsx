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
  StepResultPendingCard,
} from "@/components/execution-steps-monitor";
import { cn } from "@/lib/utils";
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
  /** 与执行卡片对齐的步骤总数，用于「步骤 N / M」 */
  totalSteps?: number;
}) {
  const stepNo = snap.stepIndex + 1;
  const hasPreviewFiles = hasTabularTaskResultFiles(snap.artifacts);
  const header =
    totalSteps != null ? `步骤 ${stepNo} / ${totalSteps} · 执行结果` : `步骤 ${stepNo} · 执行结果`;
  return (
    <button
      type="button"
      onClick={() => {
        if (!hasPreviewFiles) return;
        onSelect();
      }}
      className={cn(
        "w-full rounded-panel border px-4 py-3 text-left shadow-none transition-colors",
        isActive ? "border-info-border bg-info-bg" : "border-border-subtle bg-bg-surface",
        hasPreviewFiles
          ? "cursor-pointer hover:border-info-border hover:bg-bg-subtle"
          : "cursor-default opacity-95",
      )}
    >
      <div className="text-caption font-medium uppercase tracking-wide text-text-disabled">{header}</div>
      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-body font-semibold text-foreground">步骤 {stepNo}</div>
          <p className="mt-1 text-caption leading-5.5 text-text-secondary">{compactText(snap.label, 200)}</p>
        </div>
      </div>
      {snap.errorMessage ? (
        <p className="mt-2 text-caption leading-5 text-danger">
          {compactText(humanizeTaskErrorMessage(snap.errorMessage), 220)}
        </p>
      ) : null}
    </button>
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
  const total = executionSteps.length;

  return (
    <div className="space-y-3" data-testid="agent-step-timeline">
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
            totalSteps={total}
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
