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
          className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-[12px] border border-[#e7e7ea] bg-white px-3 py-2 text-left shadow-[0_4px_12px_rgba(15,23,42,0.03)]"
        >
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-[#f4f4f5] text-[#62666d]">
            <FileText className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block max-w-[220px] truncate text-[12px] font-medium text-[#202124]">
              {attachment.name}
            </span>
            <span className="mt-0.5 block text-[12px] text-[#9a9ea6]">
              {[attachment.extension?.toUpperCase(), formatAttachmentSize(attachment.size)].filter(Boolean).join(" · ") || "附件"}
            </span>
          </span>
        </AttachmentPrimitive.Root>
      ))}
    </div>
  );
}
