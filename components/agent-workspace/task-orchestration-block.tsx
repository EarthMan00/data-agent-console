"use client";

import type { ReactNode } from "react";

import { AssistantOutputFrame, ORCHESTRATION_BLOCK_MAX } from "@/components/agent-workspace/chat-bubbles";
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
  executionTitle?: string;
  executionTitleTag?: ReactNode;
};

export function TaskOrchestrationBlock({
  executionExpanded,
  onExecutionExpandedChange,
  children,
  datetime,
  beforeSplit,
  afterExecution,
  showExecutionPanel = true,
  executionCollapsible = true,
  executionContentClassName,
  executionTestId,
  executionTitle,
  executionTitleTag,
}: TaskOrchestrationBlockProps) {
  return (
    <AssistantOutputFrame datetime={datetime} wide>
      <div className={cn("w-full space-y-3.5", ORCHESTRATION_BLOCK_MAX)}>
        {beforeSplit}

        {showExecutionPanel ? (
          <TaskExecutionPanel
            expanded={executionExpanded}
            onExpandedChange={onExecutionExpandedChange}
            collapsible={executionCollapsible}
            contentClassName={executionContentClassName}
            testId={executionTestId}
            title={executionTitle}
            titleTag={executionTitleTag}
          >
            {children}
          </TaskExecutionPanel>
        ) : null}
        {afterExecution}
      </div>
    </AssistantOutputFrame>
  );
}
