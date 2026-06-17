"use client";

import { ChevronDown } from "@/components/ui/tabler-icons";
import { cn } from "@/lib/utils";

type TaskExecutionPanelProps = {
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
  children: React.ReactNode;
  title?: string;
  titleTag?: React.ReactNode;
  collapsible?: boolean;
  contentClassName?: string;
  testId?: string;
};

export function TaskExecutionPanel({
  expanded,
  onExpandedChange,
  children,
  title = "任务执行",
  titleTag,
  collapsible = true,
  contentClassName = "mt-4 space-y-3",
  testId = "task-execution-panel",
}: TaskExecutionPanelProps) {
  const titleContent = (
    <span className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-title-1 font-semibold text-foreground">{title}</span>
      {titleTag ? <span className="min-w-0">{titleTag}</span> : null}
    </span>
  );
  const header = (
    <>
      {titleContent}
      {collapsible ? (
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-foreground transition-colors group-hover:bg-fill-hover">
          <ChevronDown
            className={cn(
              "h-5 w-5 transition-transform",
              expanded ? "rotate-180" : "rotate-0",
            )}
            strokeWidth={1.5}
          />
        </span>
      ) : null}
    </>
  );

  return (
    <div className="rounded-popover border border-border bg-bg-surface px-4 py-4 shadow-none" data-testid={testId}>
      {collapsible ? (
        <button
          type="button"
          className="group flex w-full items-center justify-between gap-3 text-left"
          aria-expanded={expanded}
          aria-label={expanded ? `收起${title}` : `展开${title}`}
          onClick={() => onExpandedChange(!expanded)}
        >
          {header}
        </button>
      ) : (
        <div className="flex w-full items-center justify-between gap-3">{header}</div>
      )}
      {expanded ? <div className={contentClassName}>{children}</div> : null}
    </div>
  );
}
