"use client";

import type { ComponentProps } from "react";

import { TaskComposer } from "@/components/task-composer";
import { cn } from "@/lib/utils";

type NewConversationTaskComposerProps = ComponentProps<typeof TaskComposer> & {
  highlighted?: boolean;
  sendButtonActive?: boolean;
};

export function NewConversationTaskComposer({
  highlighted = false,
  sendButtonActive,
  value,
  containerClassName,
  textareaClassName,
  placeholderClassName,
  sendButtonClassName,
  ...props
}: NewConversationTaskComposerProps) {
  const resolvedSendButtonActive = sendButtonActive ?? value.trim().length > 0;

  return (
    <TaskComposer
      {...props}
      value={value}
      visualStyle="heroMinimal"
      containerClassName={cn(
        "relative z-30 w-full rounded-composer border border-border bg-bg-surface shadow-popover transition-all duration-300 sm:rounded-hero",
        highlighted && "border-primary/25 shadow-popover-strong",
        containerClassName,
      )}
      textareaClassName={cn(
        "min-h-28 max-h-composer-home min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words bg-transparent px-0 py-1.5 pr-2 text-body font-normal leading-6 text-foreground outline-none scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-zinc-300 sm:min-h-34",
        textareaClassName,
      )}
      placeholderClassName={cn("top-1.5 text-body leading-6 text-text-tertiary", placeholderClassName)}
      sendButtonClassName={cn(
        "h-10 w-10 min-w-0 rounded-full border border-transparent p-0 text-primary-foreground shadow-none transition",
        resolvedSendButtonActive ? "bg-primary hover:bg-primary/85" : "bg-fill-active hover:bg-fill-active",
        sendButtonClassName,
      )}
    />
  );
}
