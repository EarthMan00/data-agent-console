"use client";

import { FileText } from "lucide-react";

import { cn } from "@/lib/utils";

type TaskResultSummaryCardProps = {
  title: string;
  summary: string;
  hasResult?: boolean;
  expanded: boolean;
  onToggle: () => void;
};

export function TaskResultSummaryCard({
  title,
  summary,
  hasResult = true,
  expanded,
  onToggle,
}: TaskResultSummaryCardProps) {
  return (
    <div className="space-y-3" data-testid="agent-result-section">
      <div className="text-[14px] font-semibold text-[#202124]">任务结果</div>
      <div className="rounded-[16px] border border-[#e5e7eb] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.03)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative flex h-[56px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-[linear-gradient(180deg,#eef4ff,#f8fafc)]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.14),transparent_55%)]" />
              <div className="relative flex h-8 w-8 items-center justify-center rounded-[10px] bg-white text-[#2563eb] shadow-sm">
                <FileText className="h-4 w-4" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold text-[#202124]">{title}</div>
            </div>
          </div>
          {hasResult ? (
            <button
              type="button"
              onClick={onToggle}
              className={cn(
                "shrink-0 rounded-[10px] border border-[#e5e7eb] bg-[#18181b] px-3 py-1.5 text-[11px] font-medium text-white shadow-[0_8px_20px_rgba(24,24,27,0.12)]",
                "hover:bg-[#27272a]",
              )}
            >
              {expanded ? "收起" : "查看任务结果"}
            </button>
          ) : null}
        </div>
      </div>
      {summary ? (
        <div className="line-clamp-3 max-w-[720px] px-1 text-[13px] leading-6.5 text-[#5f666f]">{summary}</div>
      ) : null}
    </div>
  );
}

