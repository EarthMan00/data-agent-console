"use client";

import { useEffect, useMemo, useState } from "react";

import { AlertCircle, CheckCircle2, XCircle } from "@/components/ui/tabler-icons";

import { Button } from "@/components/ui/button";
import { DotmSquare11 } from "@/components/ui/dotm-square-11";
import { humanizeStepLabelForUi } from "@/lib/humanize-step-label";
import { stripInternalToolNamesForUi } from "@/lib/strip-internal-tool-names";
import { cn } from "@/lib/utils";
import type { PlatformSubtaskSnapshot, TaskExecutionStep } from "@/lib/agent-events";

/** 平台多步编排：按时间顺序「步骤 N 执行卡片 → 步骤 N 执行结果 → 步骤 N+1 执行卡片 → …」 */
export type PlatformStepTimelineItem =
  | { kind: "executing"; step: TaskExecutionStep; stepIndex: number }
  | { kind: "result"; snap: PlatformSubtaskSnapshot }
  | {
      kind: "result_pending";
      stepIndex: number;
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
          label: step.label,
          status: step.status,
        });
      }
    } else {
      items.push({ kind: "executing", step, stepIndex: i });
      break;
    }
  }
  return items;
}

function formatElapsed(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${minutes} 分 ${rest} 秒`;
}

function runtimeHintWithElapsed(runtimeHint: string | undefined, elapsedSeconds: number): string {
  const elapsedText = `已等待 ${formatElapsed(elapsedSeconds)}`;
  const hint = stripInternalToolNamesForUi(runtimeHint ?? "").trim();
  if (!hint) return elapsedText;
  if (/已等待\s*\d+\s*分\s*\d+\s*秒/.test(hint)) {
    return hint.replace(/已等待\s*\d+\s*分\s*\d+\s*秒/g, elapsedText);
  }
  return `${hint} · ${elapsedText}`;
}

function RunningStepRuntimeHint({ step }: { step: TaskExecutionStep }) {
  const startedAtMs = useMemo(() => {
    if (!step.runtimeStartedAt) return null;
    const parsed = new Date(step.runtimeStartedAt).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }, [step.runtimeStartedAt]);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAtMs) return undefined;
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [startedAtMs]);

  if (!step.runtimeHint && !startedAtMs) return null;

  const text =
    startedAtMs === null
      ? stripInternalToolNamesForUi(step.runtimeHint ?? "")
      : runtimeHintWithElapsed(step.runtimeHint, (nowMs - startedAtMs) / 1000);

  if (!text.trim()) return null;

  return (
    <p className="mt-2 pl-10 text-[12px] leading-5 text-[#4e5969]">
      {text}
    </p>
  );
}

/** 当前正在排队或执行中的步骤（非终态） */
export function ExecutionStepCard({
  step,
  stepIndex,
}: {
  step: TaskExecutionStep;
  stepIndex: number;
}) {
  const stepNo = stepIndex + 1;
  const showStatusIcon = step.status !== "pending";
  return (
    <div
      className={cn(
        "px-0 py-1.5",
        step.status === "error"
          ? "text-red-600"
          : step.status === "awaiting_input"
            ? "text-amber-700"
            : "text-[#4e5969]",
      )}
      data-testid="execution-step-card"
      data-step-index={stepIndex}
    >
      <div className="mb-2 text-[12px] font-medium uppercase tracking-wide text-[#4e5969]">
        步骤 {stepNo}
      </div>
      <div className={cn("flex", showStatusIcon ? "gap-3" : "gap-0")}>
        {showStatusIcon ? (
          <div className="flex w-7 shrink-0 justify-center pt-0.5" aria-hidden>
            {step.status === "running" ? (
              <DotmSquare11
                ariaLabel="步骤执行中"
                color="#111111"
                dotShape="square"
                dotSize={2}
                size={18}
                speed={1.15}
              />
            ) : step.status === "awaiting_input" ? (
              <AlertCircle className="h-5 w-5 text-amber-600" />
            ) : step.status === "done" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )}
          </div>
        ) : null}
        <p className="min-w-0 flex-1 break-words text-[14px] leading-6.5 [overflow-wrap:anywhere]">
          {humanizeStepLabelForUi(step.label)}
        </p>
      </div>
      {step.status === "running" ? <RunningStepRuntimeHint step={step} /> : null}
    </div>
  );
}

/** 步骤已终态但尚未拉到结果快照时的占位（与执行结果卡片版式一致，不可点右侧） */
export function StepResultPendingCard({
  stepIndex,
  label,
  status,
}: {
  stepIndex: number;
  label: string;
  status: "done" | "error";
}) {
  const stepNo = stepIndex + 1;
  const ok = status === "done";
  return (
    <div
      className="w-full rounded-[16px] border border-[#eceef1] bg-white px-4 py-3 text-left text-[#4e5969] shadow-none"
      data-testid="step-result-pending-card"
      data-step-index={stepIndex}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-[#1d2129]">步骤 {stepNo}</p>
          <p className="mt-1 break-words text-[12px] leading-5.5 text-[#4e5969] [overflow-wrap:anywhere]">
            {humanizeStepLabelForUi(label)}
          </p>
        </div>
      </div>
      {ok ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled
          className="mt-3 h-8 cursor-not-allowed rounded-[10px] px-3 text-xs"
        >
          <DotmSquare11
            ariaLabel="结果加载中"
            className="mr-1.5 shrink-0"
            color="#111111"
            dotShape="square"
            dotSize={1.6}
            size={14}
            speed={1.15}
          />
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
  return (
    <div className="space-y-3">
      {ordered.map((step, stepIndex) => (
        <ExecutionStepCard key={step.id} step={step} stepIndex={stepIndex} />
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
            <ExecutionStepCard key={`e-${item.step.id}`} step={item.step} stepIndex={item.stepIndex} />
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
        return null;
      })}
    </div>
  );
}
