"use client";

import Image from "next/image";
import type { ReactNode } from "react";

import { TaskExecutionPanel } from "@/components/agent-workspace/task-execution-panel";
import { TaskSplitSection } from "@/components/agent-workspace/task-split-section";

type TaskOrchestrationBlockProps = {
  splitItems: string[];
  executionExpanded: boolean;
  onExecutionExpandedChange: (next: boolean) => void;
  children: ReactNode;
  datetime?: string;
  beforeSplit?: ReactNode;
  afterExecution?: ReactNode;
  splitReveal?: boolean;
  splitStreamEnded?: boolean;
  onSplitRevealComplete?: () => void;
  splitTestId?: string;
  showExecutionPanel?: boolean;
  executionCollapsible?: boolean;
  executionContentClassName?: string;
  executionTestId?: string;
};

export function TaskOrchestrationBlock({
  splitItems,
  executionExpanded,
  onExecutionExpandedChange,
  children,
  datetime,
  beforeSplit,
  afterExecution,
  splitReveal = false,
  splitStreamEnded,
  onSplitRevealComplete,
  splitTestId,
  showExecutionPanel = true,
  executionCollapsible = true,
  executionContentClassName,
  executionTestId,
}: TaskOrchestrationBlockProps) {
  return (
    <div className="w-full space-y-3.5">
      <div className="flex w-full min-w-0 items-center justify-between gap-3 text-[14px] font-medium text-[#303734]">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center">
            <Image
              src="/mdata-logo.png"
              alt="Alice"
              width={36}
              height={36}
              className="h-9 w-9 shrink-0 object-contain"
              draggable={false}
            />
          </div>
          <div>
            <div className="text-[14px] font-semibold text-[#1f2421]">Alice</div>
          </div>
        </div>
        {datetime ? <div className="shrink-0 text-[12px] text-[#858481]">{datetime}</div> : null}
      </div>

      {beforeSplit}

      {splitItems.length > 0 ? (
        <TaskSplitSection
          items={splitItems}
          reveal={splitReveal}
          streamEnded={splitStreamEnded}
          onRevealComplete={onSplitRevealComplete}
          testId={splitTestId}
        />
      ) : null}

      {showExecutionPanel ? (
        <TaskExecutionPanel
          expanded={executionExpanded}
          onExpandedChange={onExecutionExpandedChange}
          collapsible={executionCollapsible}
          contentClassName={executionContentClassName}
          testId={executionTestId}
        >
          {children}
        </TaskExecutionPanel>
      ) : null}
      {afterExecution}
    </div>
  );
}
