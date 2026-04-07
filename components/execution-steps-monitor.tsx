"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PlatformSubtaskSnapshot, TaskExecutionStep } from "@/lib/agent-events";

/** 平台多步编排：按时间顺序「步骤 N 执行卡片 → 步骤 N 执行结果 → 步骤 N+1 执行卡片 → …」 */
export type PlatformStepTimelineItem =
  | { kind: "executing"; step: TaskExecutionStep; stepIndex: number; total: number }
  | { kind: "result"; snap: PlatformSubtaskSnapshot }
  | {
      kind: "result_pending";
      stepIndex: number;
      total: number;
      label: string;
      status: "done" | "error";
    };

export function buildPlatformStepTimeline(
  executionSteps: TaskExecutionStep[],
  platformSubtasks: PlatformSubtaskSnapshot[] | undefined,
): PlatformStepTimelineItem[] {
  const ordered = [...executionSteps].sort((a, b) => a.order - b.order);
  const snapByIndex = new Map<number, PlatformSubtaskSnapshot>();
  for (const s of platformSubtasks ?? []) {
    snapByIndex.set(s.stepIndex, s);
  }
  const items: PlatformStepTimelineItem[] = [];
  const n = ordered.length;

  for (let i = 0; i < n; i++) {
    const step = ordered[i]!;
    if (step.status === "done" || step.status === "error") {
      const snap = snapByIndex.get(i);
      if (snap) {
        items.push({ kind: "result", snap });
      } else {
        items.push({
          kind: "result_pending",
          stepIndex: i,
          total: n,
          label: step.label,
          status: step.status,
        });
      }
    } else {
      items.push({ kind: "executing", step, stepIndex: i, total: n });
      break;
    }
  }
  return items;
}

function executionSubtitle(status: TaskExecutionStep["status"]): string {
  if (status === "running") return "执行中";
  if (status === "pending") return "等待执行";
  if (status === "done") return "已完成";
  return "执行失败";
}

/** 当前正在排队或执行中的步骤（非终态） */
export function ExecutionStepCard({
  step,
  stepIndex,
  total,
}: {
  step: TaskExecutionStep;
  stepIndex: number;
  total: number;
}) {
  const stepNo = stepIndex + 1;
  return (
    <div
      className={cn(
        "rounded-[16px] border px-4 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)]",
        step.status === "error" ? "border-red-200 bg-red-50/50" : "border-[#eceef1] bg-white",
      )}
      data-testid="execution-step-card"
      data-step-index={stepIndex}
    >
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[#9aa39e]">
        步骤 {stepNo} / {total} · {executionSubtitle(step.status)}
      </div>
      <div className="flex gap-3">
        <div className="flex w-7 shrink-0 justify-center pt-0.5" aria-hidden>
          {step.status === "pending" ? (
            <span className="mt-2 block h-2 w-2 rounded-full bg-[#d1d5db]" />
          ) : step.status === "running" ? (
            <Loader2 className="h-5 w-5 animate-spin text-[#2563eb]" />
          ) : step.status === "done" ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          ) : (
            <XCircle className="h-5 w-5 text-red-500" />
          )}
        </div>
        <p className="min-w-0 flex-1 text-[13px] leading-6.5 text-[#374151]">
          <span className="text-[#9ca3af]">{stepNo}. </span>
          {step.label}
        </p>
      </div>
    </div>
  );
}

/** 步骤已终态但尚未拉到结果快照时的占位（与执行结果卡片版式一致，不可点右侧） */
export function StepResultPendingCard({
  stepIndex,
  total,
  label,
  status,
}: {
  stepIndex: number;
  total: number;
  label: string;
  status: "done" | "error";
}) {
  const stepNo = stepIndex + 1;
  const ok = status === "done";
  return (
    <div
      className={cn(
        "rounded-[16px] border px-4 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)]",
        ok ? "border-[#eceef1] bg-white" : "border-red-200 bg-red-50/50",
      )}
      data-testid="step-result-pending-card"
      data-step-index={stepIndex}
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-[#9aa39e]">步骤 {stepNo} / {total} · 执行结果</div>
      <div className="mt-1 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-[#1f2421]">步骤 {stepNo}</p>
          <p className="mt-1 text-[12px] leading-5.5 text-[#4f5753]">{label}</p>
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
      {ok ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled
          className="mt-3 h-8 cursor-not-allowed rounded-[10px] px-3 text-xs"
        >
          <Loader2 className="mr-1.5 h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
          结果加载中…
        </Button>
      ) : null}
    </div>
  );
}

/**
 * 历史会话 / 仅持久化了步骤状态、无 PlatformSubtaskSnapshot 时：
 * 只展示各步执行卡片，避免 buildPlatformStepTimeline(..., undefined) 产生永久的「结果加载中」占位。
 */
export function ExecutionStepsHistoryList({ steps }: { steps: TaskExecutionStep[] }) {
  const ordered = [...steps].sort((a, b) => a.order - b.order);
  const total = ordered.length;
  return (
    <div className="space-y-3">
      {ordered.map((step, stepIndex) => (
        <ExecutionStepCard key={step.id} step={step} stepIndex={stepIndex} total={total} />
      ))}
    </div>
  );
}

/** @deprecated 历史会话请用 ExecutionStepsHistoryList；实时编排请用 buildPlatformStepTimeline + PlatformRoundStepTimeline */
export function ExecutionStepsMonitor({ steps }: { steps: TaskExecutionStep[] }) {
  const items = buildPlatformStepTimeline(steps, undefined);
  return (
    <div className="space-y-3">
      {items.map((item) => {
        if (item.kind === "executing") {
          return (
            <ExecutionStepCard key={`e-${item.step.id}`} step={item.step} stepIndex={item.stepIndex} total={item.total} />
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
        return null;
      })}
    </div>
  );
}
