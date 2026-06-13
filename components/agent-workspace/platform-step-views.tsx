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
}: {
  snap: PlatformSubtaskSnapshot;
  isActive: boolean;
  onSelect: () => void;
}) {
  const stepNo = snap.stepIndex + 1;
  const hasPreviewFiles = hasTabularTaskResultFiles(snap.artifacts);
  return (
    <button
      type="button"
      onClick={() => {
        if (!hasPreviewFiles) return;
        onSelect();
      }}
      className={cn(
        "w-full rounded-[16px] border px-4 py-3 text-left shadow-none transition-colors",
        isActive ? "border-[#2563eb] bg-[#eff6ff]" : "border-[#eceef1] bg-white",
        hasPreviewFiles
          ? "cursor-pointer hover:border-[#bfdbfe] hover:bg-[#f8fafc]"
          : "cursor-default opacity-95",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-[#1d2129]">步骤 {stepNo}</div>
          <p className="mt-1 text-[12px] leading-5.5 text-[#4e5969]">{compactText(snap.label, 200)}</p>
        </div>
      </div>
      {snap.errorMessage ? (
        <p className="mt-2 text-[12px] leading-5 text-[#b91c1c]">
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
}: {
  executionSteps: TaskExecutionStep[];
  platformSubtasks: PlatformSubtaskSnapshot[] | undefined;
  /** 与右侧结果区当前页签对齐的步骤 taskId（含默认选中「最新有结果的一步」） */
  activeHighlightTaskId: string | null;
  runId: string;
  setPanelSubtaskFocus: Dispatch<SetStateAction<{ taskId: string; artifacts: PlatformTaskArtifactRef[] } | null>>;
  setPanelVisibility: Dispatch<SetStateAction<Record<string, boolean>>>;
}) {
  const items = buildPlatformStepTimeline(executionSteps, platformSubtasks);
  return (
    <div className="space-y-3" data-testid="agent-step-timeline">
      {items.map((item) => {
        if (item.kind === "executing") {
          return (
            <ExecutionStepCard
              key={`exec-${item.step.id}-${item.stepIndex}`}
              step={item.step}
              stepIndex={item.stepIndex}
            />
          );
        }
        if (item.kind === "result_pending") {
          return (
            <StepResultPendingCard
              key={`rp-${item.stepIndex}`}
              stepIndex={item.stepIndex}
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
            onSelect={() => {
              setPanelSubtaskFocus({ taskId: snap.taskId, artifacts: snap.artifacts });
              setPanelVisibility((c) => ({ ...c, [runId]: true }));
            }}
          />
        );
      })}
    </div>
  );
}
