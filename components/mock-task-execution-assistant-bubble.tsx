"use client";

import { Bot } from "lucide-react";

import { ExecutionStepsMonitor } from "@/components/execution-steps-monitor";
import type { TaskExecutionStep } from "@/lib/agent-events";

const BUBBLE_MAX = "max-w-[min(100%,720px)]";

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function MockTaskExecutionAssistantBubble({
  steps,
  datetime,
}: {
  steps: TaskExecutionStep[];
  datetime: string;
}) {
  return (
    <div className="flex w-full justify-start">
      <div className={`rounded-[18px] border border-[#e5e7eb] bg-white px-4 py-3 shadow-sm ${BUBBLE_MAX}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#475569]">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#171717] text-white">
              <Bot className="h-3.5 w-3.5" />
            </span>
            MData Agent
          </div>
          <div className="text-[11px] text-[#94a3b8]">{formatTime(datetime)}</div>
        </div>
        <div className="mt-2 text-[12px] font-medium text-[#64748b]">工具执行步骤</div>
        <div className="mt-3">
          <ExecutionStepsMonitor steps={steps} />
        </div>
      </div>
    </div>
  );
}
