"use client";

import Image from "next/image";
import type { ReactNode } from "react";

import { ORCHESTRATION_BLOCK_MAX } from "@/components/agent-workspace/chat-bubbles";
import { TaskExecutionPanel } from "@/components/agent-workspace/task-execution-panel";
import { cn } from "@/lib/utils";

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
  executionTitleTag?: ReactNode;
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
  executionTitleTag,
}: TaskOrchestrationBlockProps) {
  return (
    <div className={cn("w-full space-y-3.5", ORCHESTRATION_BLOCK_MAX)}>
      <div className="flex w-full min-w-0 items-center gap-3 text-body font-medium text-foreground">
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
            <div className="text-body font-semibold text-foreground">Alice</div>
          </div>
        </div>
      </div>

      <div className="ml-12 w-[calc(100%-3rem)] space-y-3.5">
        {beforeSplit}

        {showExecutionPanel ? (
          <TaskExecutionPanel
            expanded={executionExpanded}
            onExpandedChange={onExecutionExpandedChange}
            collapsible={executionCollapsible}
            contentClassName={executionContentClassName}
            testId={executionTestId}
            titleTag={executionTitleTag}
          >
            {children}
          </TaskExecutionPanel>
        ) : null}
        {afterExecution}
        {datetime ? <div className="mt-1 text-left text-caption text-text-tertiary">{datetime}</div> : null}
      </div>
    </div>
  );
}
