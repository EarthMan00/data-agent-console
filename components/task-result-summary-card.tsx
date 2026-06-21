"use client";

import { FileText } from "@/components/ui/tabler-icons";

import { cn } from "@/lib/utils";

type TaskResultSummaryCardProps = {
  title: string;
  summary: string;
  completedAt?: string;
  hasResult?: boolean;
  expanded: boolean;
  onToggle: () => void;
  className?: string;
};

function formatResultTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function TaskResultSummaryCard({
  title,
  summary,
  completedAt,
  hasResult = true,
  expanded,
  onToggle,
  className,
}: TaskResultSummaryCardProps) {
  const displayTime = formatResultTime(completedAt);

  return (
    <div className={cn("space-y-3", className)} data-testid="agent-result-section">
      <div className="rounded-popover border border-border bg-bg-surface px-4 py-4 shadow-surface">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-field bg-fill-hover">
              <div className="relative flex h-8 w-8 items-center justify-center rounded-control bg-bg-surface text-foreground shadow-none">
                <FileText className="h-4 w-4" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-body font-semibold text-foreground">{title}</div>
              {displayTime ? (
                <div className="mt-0.5 truncate text-caption leading-5 text-text-tertiary">{displayTime}</div>
              ) : null}
            </div>
          </div>
          {hasResult ? (
            <button
              type="button"
              onClick={onToggle}
              className={cn(
                "shrink-0 rounded-control border border-transparent bg-primary px-3 py-1.5 text-caption font-medium text-primary-foreground shadow-none",
                "hover:bg-primary/85",
              )}
            >
              {expanded ? "收起" : "查看"}
            </button>
          ) : null}
        </div>
      </div>
      {summary ? (
        <div className="line-clamp-3 max-w-3xl px-1 text-body leading-6.5 text-text-tertiary">{summary}</div>
      ) : null}
    </div>
  );
}
