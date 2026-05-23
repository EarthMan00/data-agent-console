"use client";

import { FileText } from "@/components/ui/tabler-icons";

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
      <div className="rounded-[18px] border border-[#e2e2df] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(17,17,17,0.03)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative flex h-[56px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-[#f7f7f7]">
              <div className="relative flex h-8 w-8 items-center justify-center rounded-[10px] bg-white text-[#111111] shadow-none">
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
                "shrink-0 rounded-[10px] border border-transparent bg-[#111111] px-3 py-1.5 text-[11px] font-medium text-white shadow-none",
                "hover:bg-[#2a2a2a]",
              )}
            >
              {expanded ? "收起" : "查看"}
            </button>
          ) : null}
        </div>
      </div>
      {summary ? (
        <div className="line-clamp-3 max-w-[720px] px-1 text-[13px] leading-6.5 text-[#747571]">{summary}</div>
      ) : null}
    </div>
  );
}
