"use client";

import type { ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  type ThreadMessage,
  ThreadPrimitive,
  useExternalStoreRuntime,
} from "@assistant-ui/react";

import { cn } from "@/lib/utils";

type AssistantThreadFrameProps = {
  children: ReactNode;
  className?: string;
  isRunning?: boolean;
  onCancel?: () => Promise<void> | void;
};

export function AssistantThreadFrame({
  children,
  className,
  isRunning = false,
  onCancel,
}: AssistantThreadFrameProps) {
  const runtime = useExternalStoreRuntime<ThreadMessage>({
    messages: [] as readonly ThreadMessage[],
    isRunning,
    onNew: async () => {
      // Sending remains owned by the product composer; this runtime keeps
      // assistant-ui primitives mounted without changing business flow.
    },
    onCancel: async () => {
      await onCancel?.();
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className={cn("min-h-0", className)} data-assistant-ui-thread>
        {children}
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}
