"use client";

import type { ChatRoundStatus, ChatRoundStep } from "@/lib/agent-api/types";
import { artifactDisplayLabelForUi } from "@/lib/platform-task-artifacts";
import { stripInternalToolNamesForUi } from "@/lib/strip-internal-tool-names";
import { cn } from "@/lib/utils";

export const CHAT_ROUND_STATUS_COPY: Readonly<Record<ChatRoundStatus, string>> = {
  QUEUED: "正在准备",
  PLANNING: "正在理解需求并制定执行计划",
  GENERATING: "正在生成回答",
  EXECUTING: "正在执行任务",
  WAITING_INPUT: "需要补充信息",
  CANCEL_REQUESTED: "正在停止",
  SUCCEEDED: "已完成",
  PARTIAL_SUCCESS: "已完成部分结果",
  FAILED: "未完成",
  CANCELLED: "已停止",
};

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

function stepTone(status: ChatRoundStep["status"]): string {
  if (status === "SUCCESS") return "text-success";
  if (status === "FAILED" || status === "CANCELLED") return "text-danger";
  if (status === "RUNNING" || status === "WAITING_INPUT") return "text-primary";
  return "text-text-tertiary";
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

export function ChatRoundProgress({
  status,
  steps,
  onOpenStepResult,
}: {
  status: ChatRoundStatus;
  steps: ChatRoundStep[];
  onOpenStepResult?: (step: ChatRoundStep) => void;
}) {
  return (
    <section
      data-testid="chat-round-progress"
      aria-label="任务执行进度"
      className="rounded-panel border border-border bg-bg-surface px-4 py-3"
    >
      <p data-testid="chat-round-status" className="text-sm font-medium text-foreground">
        {CHAT_ROUND_STATUS_COPY[status]}
      </p>
      {steps.length > 0 ? (
        <ol className="mt-3 space-y-3">
          {[...steps]
            .sort((left, right) => left.step_index - right.step_index)
            .map((step) => {
              const label = safePublicText(step.label) ?? "任务步骤";
              const artifacts = step.artifacts.map((artifact) => ({
                ...artifact,
                label: safePublicText(artifactDisplayLabelForUi(artifact.original_name)) ?? "结果文件",
              }));
              const canOpenResult = step.status === "SUCCESS" && artifacts.length > 0 && onOpenStepResult;
              return (
                <li key={step.step_id} data-step-status={step.status} className="rounded-control bg-fill-hover px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 text-sm text-foreground">{label}</span>
                    <span className={cn("shrink-0 text-caption", stepTone(step.status))}>
                      {STEP_STATUS_COPY[step.status]}
                    </span>
                  </div>
                  {artifacts.length > 0 ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {artifacts.map((artifact) => (
                        <span key={artifact.artifact_id} className="text-caption text-text-secondary">
                          {artifact.label}
                        </span>
                      ))}
                      {canOpenResult ? (
                        <button
                          type="button"
                          className="text-caption font-medium text-primary hover:underline"
                          onClick={() => onOpenStepResult(step)}
                        >
                          查看结果
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  <Evidence step={step} />
                </li>
              );
            })}
        </ol>
      ) : null}
    </section>
  );
}
