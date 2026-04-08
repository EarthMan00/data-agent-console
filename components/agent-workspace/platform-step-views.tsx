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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { compactText } from "@/components/agent-workspace-view-models";

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
  const ok = snap.outcome === "success";
  const stepNo = snap.stepIndex + 1;
  const header =
    totalSteps != null ? `步骤 ${stepNo} / ${totalSteps} · 执行结果` : `步骤 ${stepNo} · 执行结果`;
  return (
    <div
      className={cn(
        "w-full rounded-[16px] border px-4 py-3 text-left shadow-[0_8px_20px_rgba(15,23,42,0.04)]",
        isActive ? "border-[#2563eb] bg-[#eff6ff]" : "border-[#eceef1] bg-white",
      )}
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-[#9aa39e]">{header}</div>
      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-[#1f2421]">步骤 {stepNo}</div>
          <p className="mt-1 text-[12px] leading-5.5 text-[#4f5753]">{compactText(snap.label, 200)}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
            ok ? "bg-[#dcfce7] text-[#166534]" : "bg-[#fee2e2] text-[#991b1b]",
          )}
        >
          {ok ? "已完成" : "失败"}
        </span>
      </div>
      {snap.errorMessage ? (
        <p className="mt-2 text-[11px] leading-5 text-[#b91c1c]">{compactText(snap.errorMessage, 160)}</p>
      ) : null}
      <Button type="button" variant="default" size="sm" className="mt-3 h-8 rounded-[10px] px-3 text-xs" onClick={onSelect}>
        查看任务结果
      </Button>
    </div>
  );
}

export function PlatformRoundStepTimeline({
  executionSteps,
  platformSubtasks,
  panelSubtaskFocus,
  runId,
  setPanelSubtaskFocus,
  setPanelVisibility,
}: {
  executionSteps: TaskExecutionStep[];
  platformSubtasks: PlatformSubtaskSnapshot[] | undefined;
  panelSubtaskFocus: { taskId: string; artifacts: PlatformTaskArtifactRef[] } | null;
  runId: string;
  setPanelSubtaskFocus: Dispatch<SetStateAction<{ taskId: string; artifacts: PlatformTaskArtifactRef[] } | null>>;
  setPanelVisibility: Dispatch<SetStateAction<Record<string, boolean>>>;
}) {
  const items = buildPlatformStepTimeline(executionSteps, platformSubtasks);
  const subs = platformSubtasks ?? [];
  const lastSnap = subs.length ? subs[subs.length - 1] : undefined;
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
        const active =
          panelSubtaskFocus?.taskId === snap.taskId ||
          (!panelSubtaskFocus && lastSnap != null && snap.taskId === lastSnap.taskId);
        return (
          <PlatformSubtaskResultCard
            key={snap.taskId}
            snap={snap}
            isActive={active}
            totalSteps={total}
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
