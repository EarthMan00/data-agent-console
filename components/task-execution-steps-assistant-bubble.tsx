"use client";

import { Bot } from "lucide-react";

import { ExecutionStepsHistoryList } from "@/components/execution-steps-monitor";
import type { TaskExecutionStep } from "@/lib/agent-events";
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
}: {
  steps: TaskExecutionStep[];
  datetime: string;
}) {
  const ordered = [...steps].sort((a, b) => a.order - b.order);
  if (ordered.length === 0) {
    return null;
  }
  return (
    <div className={cn("flex w-full justify-start", WRAP)}>
      <div className="w-full space-y-3.5">
        <div className="flex w-full min-w-0 items-center justify-between gap-3 text-[14px] font-medium text-[#303734]">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#171717] text-white shadow-[0_14px_32px_rgba(23,23,23,0.18)]">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[15px] font-semibold text-[#1f2421]">LinkData</div>
            </div>
          </div>
          <div className="shrink-0 text-[11px] text-[#94a3b8]">{formatTime(datetime)}</div>
        </div>

        <div className="space-y-2 px-1" data-testid="platform-task-split">
          <div className="text-[14px] font-semibold text-[#202124]">任务拆分</div>
          <div className="space-y-2 text-[13px] leading-[1.6] text-[#4f5753]">
            {ordered.map((step, itemIndex) => (
              <div key={step.id} className="flex gap-2">
                <span className="pt-px text-[#9aa39e]">{itemIndex + 1}.</span>
                <p className="min-w-0 flex-1">{step.label.replace(/^\d+[）.、]\s*/, "")}</p>
              </div>
            ))}
          </div>
        </div>

        <div
          className="rounded-[20px] border border-[#eceef1] bg-[#fcfcfd] px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.03)]"
          data-testid="platform-task-execution-panel"
        >
          <div className="text-[16px] font-semibold tracking-[-0.02em] text-[#1f2421]">任务执行</div>
          <div className="mt-4 space-y-0">
            <ExecutionStepsHistoryList steps={ordered} />
          </div>
        </div>
      </div>
    </div>
  );
}
