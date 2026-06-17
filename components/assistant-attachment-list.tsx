"use client";

import { AttachmentPrimitive } from "@assistant-ui/react";

import type { AgentAttachment } from "@/lib/agent-events";
import { FileText } from "@/components/ui/tabler-icons";
import { cn } from "@/lib/utils";

type AssistantAttachmentListProps = {
  attachments: AgentAttachment[];
  className?: string;
};

function formatAttachmentSize(size?: number) {
  if (!size || size <= 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function AssistantAttachmentList({ attachments, className }: AssistantAttachmentListProps) {
  if (attachments.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-2", className)} data-assistant-ui-attachments>
      {attachments.map((attachment) => (
        <AttachmentPrimitive.Root
          key={attachment.id}
          className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-field border border-border bg-bg-surface px-3 py-2 text-left shadow-surface"
        >
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-fill-active text-text-secondary">
            <FileText className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block max-w-sidebar-admin truncate text-caption font-medium text-foreground">
              {attachment.name}
            </span>
            <span className="mt-0.5 block text-caption text-text-disabled">
              {[attachment.extension?.toUpperCase(), formatAttachmentSize(attachment.size)].filter(Boolean).join(" · ") || "附件"}
            </span>
          </span>
        </AttachmentPrimitive.Root>
      ))}
    </div>
  );
}
