"use client";

import { ChevronDown } from "@/components/ui/tabler-icons";
import { cn } from "@/lib/utils";

type TaskExecutionPanelProps = {
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
  children: React.ReactNode;
  title?: string;
  collapsible?: boolean;
  contentClassName?: string;
  testId?: string;
};

export function TaskExecutionPanel({
  expanded,
  onExpandedChange,
  children,
  title = "任务执行",
  collapsible = true,
  contentClassName = "mt-4 space-y-3",
  testId = "task-execution-panel",
}: TaskExecutionPanelProps) {
  const header = (
    <>
      <span className="text-[16px] font-semibold text-[#1f2421]">{title}</span>
      {collapsible ? (
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[#34322d] transition-colors group-hover:bg-[rgba(55,53,47,0.06)]">
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
    <div className="rounded-[18px] border border-[#e2e2df] bg-white px-4 py-4 shadow-none" data-testid={testId}>
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
