"use client";

import { useEffect, useState } from "react";

import { DotmSquare11 } from "@/components/ui/dotm-square-11";
import { Check, XCircle } from "@/components/ui/tabler-icons";
import type { ChatRoundStatus, ChatRoundStep } from "@/lib/agent-api/types";
import { stripInternalToolNamesForUi } from "@/lib/strip-internal-tool-names";
import { cn } from "@/lib/utils";
import { TaskResultSummaryCard } from "@/components/task-result-summary-card";

import { AssistantOutputFrame } from "./chat-bubbles";
import { TaskExecutionPanel } from "./task-execution-panel";

const STEP_STATUS_COPY: Readonly<Record<ChatRoundStep["status"], string>> = {
  PENDING: "等待执行",
  RUNNING: "正在执行",
  WAITING_INPUT: "需要补充信息",
  SUCCESS: "已完成",
  FAILED: "未完成",
  CANCELLED: "已停止",
  SKIPPED: "已跳过",
};

const INTERNAL_PUBLIC_TEXT_RE =
  /run_(?:linkfox|chatexcel)_task|commerce_data\.collect|scheduled_task\.create|favorite_snapshot\.create|\bcapability\b|\btool_name\b|\boperation\b|\braw_args\b|managed[_ ]?path|\bprovider\b|\bcredential\b/i;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ASIN_RE = /^[A-Z0-9]{10}$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function safePublicText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const stripped = stripInternalToolNamesForUi(value).trim();
  if (!stripped || INTERNAL_PUBLIC_TEXT_RE.test(stripped)) return null;
  return stripped;
}

function safeUuid(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}

function safeNextRun(value: unknown): string | null {
  if (typeof value !== "string" || !value || value.length > 64) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? value : null;
}

function formatElapsed(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return minutes + " 分 " + rest + " 秒";
}

function ExecutionRuntimeTag({
  active,
}: {
  active: boolean;
}) {
  // The first timestamp is deliberately latched. Replacing a synthetic
  // assistant message with the canonical persisted message must not reset the
  // visible wait timer back to zero.
  const [startedAtMs] = useState<number>(() => Date.now());
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    if (!active) return undefined;
    const tick = () => setNowMs(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [active, startedAtMs]);

  if (!active) return null;
  const elapsedSeconds = ((nowMs ?? startedAtMs) - startedAtMs) / 1000;
  const text = "已等待 " + formatElapsed(elapsedSeconds);

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

function StepStatusMark({ status }: { status: ChatRoundStep["status"] }) {
  if (status === "RUNNING" || status === "WAITING_INPUT") {
    return (
      <DotmSquare11
        ariaLabel={status === "WAITING_INPUT" ? "步骤等待补充信息" : "步骤执行中"}
        color="currentColor"
        dotShape="square"
        dotSize={2}
        size={18}
        speed={1.15}
        className={status === "WAITING_INPUT" ? "text-warning" : "text-foreground"}
      />
    );
  }

  if (status === "SUCCESS") {
    return (
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-text-disabled text-bg-surface"
        aria-label="步骤已完成"
      >
        <Check className="h-3.5 w-3.5" strokeWidth={2.25} />
      </span>
    );
  }

  if (status === "FAILED" || status === "CANCELLED") {
    return (
      <XCircle
        className="h-5 w-5 text-text-tertiary"
        strokeWidth={1.8}
        aria-label={status === "CANCELLED" ? "步骤已停止" : "步骤未完成"}
      />
    );
  }

  return (
    <span
      className="mt-1 inline-flex h-3 w-3 rounded-full border border-border-strong bg-bg-surface"
      aria-label={status === "SKIPPED" ? "步骤已跳过" : "步骤等待执行"}
    />
  );
}

function Evidence({ step }: { step: ChatRoundStep }) {
  if (step.status !== "SUCCESS" || !step.evidence) return null;
  const evidence = step.evidence;

  const scheduledTaskId = safeUuid(evidence.scheduled_task_id);
  if (scheduledTaskId) {
    const title = safePublicText(evidence.title);
    const time = typeof evidence.time_hhmm === "string" && TIME_RE.test(evidence.time_hhmm)
      ? evidence.time_hhmm
      : null;
    const nextRun = safeNextRun(evidence.next_run_at);
    return (
      <dl className="mt-2 grid gap-1 text-caption text-text-secondary">
        <div><dt className="inline">定时任务 ID：</dt><dd className="inline">{scheduledTaskId}</dd></div>
        {title ? <div><dt className="inline">标题：</dt><dd className="inline">{title}</dd></div> : null}
        {time ? <div><dt className="inline">执行时间：</dt><dd className="inline">{time}</dd></div> : null}
        {nextRun ? <div><dt className="inline">下次运行：</dt><dd className="inline">{nextRun}</dd></div> : null}
      </dl>
    );
  }

  const favoriteId = safeUuid(evidence.favorite_id);
  if (favoriteId) {
    const asins = Array.isArray(evidence.asins)
      ? evidence.asins.filter((value): value is string => typeof value === "string" && ASIN_RE.test(value))
      : [];
    const selectedCount = Number.isSafeInteger(evidence.selected_count) && Number(evidence.selected_count) > 0
      ? Number(evidence.selected_count)
      : null;
    return (
      <dl className="mt-2 grid gap-1 text-caption text-text-secondary">
        <div><dt className="inline">收藏 ID：</dt><dd className="inline">{favoriteId}</dd></div>
        {selectedCount !== null ? (
          <div><dt className="inline">选品：</dt><dd className="inline">已选 {selectedCount} 项</dd></div>
        ) : null}
        {asins.length > 0 ? (
          <div><dt className="inline">ASIN：</dt><dd className="inline">{asins.join("、")}</dd></div>
        ) : null}
      </dl>
    );
  }

  return null;
}

function executionTitle(status: ChatRoundStatus, steps: ChatRoundStep[]): string {
  if (status === "CANCELLED") return "任务已终止";
  if (steps.some((step) => step.status === "FAILED")) return "任务执行失败";
  if (steps.length > 0 && steps.every((step) => step.status === "SUCCESS" || step.status === "SKIPPED")) {
    return "任务已完成";
  }
  return "任务执行";
}

function hasActiveStep(steps: ChatRoundStep[]): boolean {
  return steps.some(
    (step) => step.status === "PENDING" || step.status === "RUNNING" || step.status === "WAITING_INPUT",
  );
}

function isTerminalRoundStatus(status: ChatRoundStatus): boolean {
  return (
    status === "SUCCEEDED" ||
    status === "PARTIAL_SUCCESS" ||
    status === "FAILED" ||
    status === "CANCELLED"
  );
}

function ExecutionStepsPendingNotice() {
  return (
    <div
      className="flex items-center gap-3 py-1.5 text-body leading-6.5 text-text-tertiary"
      role="status"
      aria-live="polite"
      data-testid="execution-steps-pending"
    >
      <DotmSquare11
        size={18}
        dotSize={2}
        speed={1.15}
        className="shrink-0 text-foreground"
        aria-hidden
      />
      <span>正在加载执行步骤</span>
    </div>
  );
}

function StepRow({
  step,
  onOpenStepResult,
}: {
  step: ChatRoundStep;
  onOpenStepResult?: (step: ChatRoundStep) => void;
}) {
  const label = safePublicText(step.label) ?? "任务步骤";
  const canOpenResult = step.status === "SUCCESS" && step.artifacts.length > 0 && onOpenStepResult;
  const rowClass = cn(
    "relative flex w-full min-w-0 items-start gap-3 py-1.5 text-left transition-colors",
    canOpenResult ? "rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/15" : "",
  );
  const content = (
    <>
      <span className="relative flex w-5 shrink-0 justify-center pt-0.5" aria-hidden>
        <StepStatusMark status={step.status} />
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 break-words overflow-wrap-anywhere text-body leading-6.5",
          step.status === "WAITING_INPUT"
            ? "font-semibold text-warning"
            : step.status === "RUNNING"
              ? "font-semibold text-foreground"
              : "font-medium text-text-secondary",
        )}
      >
        {label}
      </span>
      <span className="sr-only">{STEP_STATUS_COPY[step.status]}</span>
    </>
  );

  return canOpenResult ? (
    <button
      type="button"
      className={rowClass}
      aria-label={label + "，查看结果"}
      data-testid="chat-round-step"
      data-step-status={step.status}
      onClick={() => onOpenStepResult(step)}
    >
      {content}
    </button>
  ) : (
    <div className={rowClass} data-testid="chat-round-step" data-step-status={step.status}>
      {content}
    </div>
  );
}

export function ChatRoundProgress({
  status,
  steps,
  startedAt,
  onOpenStepResult,
  onCloseStepResult,
  openedStepId,
}: {
  status: ChatRoundStatus;
  steps: ChatRoundStep[];
  startedAt?: string;
  onOpenStepResult?: (step: ChatRoundStep) => void;
  onCloseStepResult?: () => void;
  /** The result currently shown in the workspace side panel, if any. */
  openedStepId?: string | null;
}) {
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const [localResultExpanded, setLocalResultExpanded] = useState(false);
  const executionStarted = status === "EXECUTING";
  const active = executionStarted || hasActiveStep(steps);
  const awaitingUserInput = steps.some((step) => step.status === "WAITING_INPUT");
  const expanded = manualExpanded ?? (active || awaitingUserInput);

  // Planning/generation can legitimately have no public steps yet. Once the
  // Round has entered EXECUTING, show the execution card immediately and let
  // the plan.ready event fill in the detailed rows without falling back to a
  // generic thinking bubble.
  if (steps.length === 0 && !executionStarted) {
    return (
      <span
        data-testid="chat-round-progress"
        data-round-status={status}
        className="sr-only"
        aria-hidden="true"
      />
    );
  }

  const running = executionStarted || steps.some((step) => step.status === "RUNNING");
  const title = executionTitle(status, steps);
  // A step may finish before the rest of a multi-step Round. Keep its
  // artifacts available from the step row, but do not render the bottom
  // result entry card until the Round itself has reached a terminal state.
  const resultStep = isTerminalRoundStatus(status)
    ? steps.find((step) => step.status === "SUCCESS" && step.artifacts.length > 0)
    : null;
  // Workspace callers pass openedStepId so the card follows the side panel.
  // Keep a local fallback for isolated consumers that do not provide a panel.
  const resultExpanded =
    openedStepId === undefined
      ? localResultExpanded
      : Boolean(openedStepId && resultStep?.step_id === openedStepId);

  const toggleResult = () => {
    if (resultExpanded) {
      if (openedStepId === undefined) setLocalResultExpanded(false);
      onCloseStepResult?.();
      return;
    }
    if (!resultStep || !onOpenStepResult) return;
    if (openedStepId === undefined) setLocalResultExpanded(true);
    onOpenStepResult(resultStep);
  };

  return (
    <div
      data-testid="chat-round-progress"
      data-round-status={status}
      aria-label="任务执行进度"
      className="w-full min-w-0"
    >
      <AssistantOutputFrame datetime={startedAt} wide>
        <div className="w-full min-w-0 space-y-3.5">
          <TaskExecutionPanel
            expanded={expanded}
            onExpandedChange={setManualExpanded}
            contentClassName="mt-4 space-y-0"
            testId="platform-task-execution-panel"
            title={title}
            titleTag={running ? <ExecutionRuntimeTag active /> : undefined}
          >
            <div className="space-y-0">
              {steps.length === 0 ? (
                <ExecutionStepsPendingNotice />
              ) : (
                [...steps]
                  .sort((left, right) => left.step_index - right.step_index)
                  .map((step) => (
                    <div key={step.step_id}>
                      <StepRow
                        step={step}
                        onOpenStepResult={(selectedStep) => {
                          if (openedStepId === undefined) setLocalResultExpanded(true);
                          onOpenStepResult?.(selectedStep);
                        }}
                      />
                      <Evidence step={step} />
                    </div>
                  ))
              )}
            </div>
          </TaskExecutionPanel>
          {resultStep ? (
            <TaskResultSummaryCard
              title="任务结果"
              expanded={resultExpanded}
              onToggle={toggleResult}
            />
          ) : null}
        </div>
      </AssistantOutputFrame>
    </div>
  );
}
