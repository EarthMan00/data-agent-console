"use client";

import { FileSpreadsheet, FileText } from "@/components/ui/tabler-icons";

import {
  attachmentIconTone,
  formatUserAttachmentSize,
  type UserMessageAttachment,
} from "@/lib/user-message-attachments";
import { cn } from "@/lib/utils";

type UserMessageAttachmentCardsProps = {
  attachments: UserMessageAttachment[];
  className?: string;
};

function AttachmentIcon({ extension }: { extension?: string }) {
  const tone = attachmentIconTone(extension);
  return (
    <span
      className={cn(
        "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control",
        tone === "spreadsheet" ? "bg-success-bg text-success" : "bg-info-bg text-link",
      )}
    >
      {tone === "spreadsheet" ? (
        <FileSpreadsheet className="h-5 w-5" aria-hidden />
      ) : (
        <FileText className="h-5 w-5" aria-hidden />
      )}
    </span>
  );
}

export function UserMessageAttachmentCards({ attachments, className }: UserMessageAttachmentCardsProps) {
  if (attachments.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap justify-end gap-2", className)} data-testid="user-message-attachments">
      {attachments.map((attachment) => {
        const typeLabel = attachment.extension ? attachment.extension.toUpperCase() : "FILE";
        const sizeLabel = formatUserAttachmentSize(attachment.size);
        return (
          <div
            key={`${attachment.name}-${attachment.size}`}
            className="flex min-w-sidebar-admin max-w-72 items-center gap-3 rounded-card border border-border bg-bg-surface px-3 py-2.5 shadow-none"
          >
            <AttachmentIcon extension={attachment.extension} />
            <span className="min-w-0">
              <span className="block truncate text-body font-medium leading-5 text-foreground">
                {attachment.name}
              </span>
              <span className="mt-0.5 block text-caption leading-4 text-text-disabled">
                {[typeLabel, sizeLabel].filter(Boolean).join(" ")}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
