"use client";

import { useEffect, useMemo, useState } from "react";

import { Check, XCircle } from "@/components/ui/tabler-icons";

import { DotmSquare11 } from "@/components/ui/dotm-square-11";
import { humanizeStepLabelForUi } from "@/lib/humanize-step-label";
import { stripInternalToolNamesForUi } from "@/lib/strip-internal-tool-names";
import { cn } from "@/lib/utils";
import type { PlatformSubtaskSnapshot, TaskExecutionStep } from "@/lib/agent-events";

/** 平台多步编排：按时间顺序合并执行步骤与结果快照，最终渲染为同一条时间线。 */
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

export function ExecutionRuntimeTag({ steps }: { steps: TaskExecutionStep[] | undefined }) {
  const step = useMemo(() => {
    return [...(steps ?? [])]
      .sort((a, b) => a.order - b.order)
      .find((item) => item.status === "running" && (item.runtimeHint || item.runtimeStartedAt));
  }, [steps]);
  const startedAtMs = step?.runtimeStartedAt
    ? (() => {
        const parsed = new Date(step.runtimeStartedAt).getTime();
        return Number.isFinite(parsed) ? parsed : null;
      })()
    : null;
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAtMs) return undefined;
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [startedAtMs]);

  if (!step || (!step.runtimeHint && !startedAtMs)) return null;

  const text =
    startedAtMs === null
      ? stripInternalToolNamesForUi(step.runtimeHint ?? "")
      : runtimeHintWithElapsed(step.runtimeHint, (nowMs - startedAtMs) / 1000);

  if (!text.trim()) return null;

  return (
    <span
      className="inline-flex min-w-0 max-w-full shrink items-center rounded-full bg-bg-subtle px-2 py-0.5 text-caption font-medium leading-5 text-text-secondary"
      data-testid="execution-runtime-tag"
      title={text}
    >
      <span className="min-w-0 truncate">{text}</span>
    </span>
  );
}

function StepStatusMark({ status }: { status: TaskExecutionStep["status"] }) {
  if (status === "running" || status === "awaiting_input") {
    return (
      <DotmSquare11
        ariaLabel="步骤执行中"
        color="currentColor"
        dotShape="square"
        dotSize={2}
        size={18}
        speed={1.15}
        className="text-foreground"
      />
    );
  }

  if (status === "done") {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-text-disabled text-bg-surface">
        <Check className="h-3.5 w-3.5" strokeWidth={2.25} />
      </span>
    );
  }

  if (status === "error") {
    return <XCircle className="h-5 w-5 text-text-tertiary" strokeWidth={1.8} />;
  }

  return <span className="mt-1 inline-flex h-3 w-3 rounded-full border border-border-strong bg-bg-surface" />;
}

export function ExecutionTimelineRow({
  label,
  status,
  isLast,
  active = false,
  onSelect,
}: {
  label: string;
  status: TaskExecutionStep["status"];
  isLast: boolean;
  active?: boolean;
  onSelect?: () => void;
}) {
  const emphasized = active || status === "running" || status === "awaiting_input" || isLast;
  const rowClass = cn(
    "relative flex w-full min-w-0 items-start gap-3 py-1.5 text-left transition-colors",
    onSelect ? "rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/15" : "",
  );
  const content = (
    <>
      <span className="relative flex w-5 shrink-0 justify-center pt-0.5" aria-hidden>
        {!isLast ? (
          <span className="absolute left-1/2 top-6 h-[calc(100%+10px)] -translate-x-1/2 border-l border-dashed border-border" />
        ) : null}
        <StepStatusMark status={status} />
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 break-words overflow-wrap-anywhere text-body leading-6.5",
          emphasized ? "font-semibold text-foreground" : "font-medium text-text-secondary",
        )}
      >
        {label}
      </span>
    </>
  );

  if (onSelect) {
    return (
      <button type="button" className={rowClass} onClick={onSelect}>
        {content}
      </button>
    );
  }

  return <div className={rowClass}>{content}</div>;
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
  return (
    <ExecutionTimelineRow
      label={humanizeStepLabelForUi(step.label)}
      status={step.status}
      isLast={stepIndex >= total - 1}
      active={step.status !== "done" && step.status !== "pending"}
    />
  );
}

/** 步骤已终态但尚未拉到结果快照时的占位。 */
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
  return (
    <ExecutionTimelineRow
      label={humanizeStepLabelForUi(label)}
      status={status}
      isLast={stepIndex >= total - 1}
      active={status !== "done"}
    />
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
    <div className="space-y-0">
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
    <div className="space-y-0">
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
