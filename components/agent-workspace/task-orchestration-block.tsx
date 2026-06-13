"use client";

import Image from "next/image";
import type { ReactNode } from "react";

import { ORCHESTRATION_BLOCK_MAX } from "@/components/agent-workspace/chat-bubbles";
import { TaskExecutionPanel } from "@/components/agent-workspace/task-execution-panel";
import { cn } from "@/lib/utils";
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
    <div className={cn("group w-full space-y-3.5", ORCHESTRATION_BLOCK_MAX)}>
      <div className="flex w-full min-w-0 items-center gap-3 text-[14px] font-medium text-[#1d2129]">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center">
            <Image
              src="/alice-logo.png"
              alt="Alice"
              width={36}
              height={36}
              className="h-9 w-9 shrink-0 object-contain"
              draggable={false}
            />
          </div>
          <div>
            <div className="text-[14px] font-semibold text-[#1d2129]">Alice</div>
          </div>
        </div>
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
      {datetime ? (
        <div className="!mt-1 text-[12px] font-normal text-[#4e5969] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {datetime}
        </div>
      ) : null}
      {afterExecution}
    </div>
  );
}
