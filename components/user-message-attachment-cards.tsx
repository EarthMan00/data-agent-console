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
        "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]",
        tone === "spreadsheet" ? "bg-[#e8f5ec] text-[#1f8f4a]" : "bg-[#edf3ff] text-[#2f6fed]",
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
            className="flex min-w-[220px] max-w-[280px] items-center gap-3 rounded-[14px] border border-[#e7e7ea] bg-white px-3 py-2.5 shadow-[0_4px_12px_rgba(15,23,42,0.03)]"
          >
            <AttachmentIcon extension={attachment.extension} />
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-medium leading-5 text-[#202124]">
                {attachment.name}
              </span>
              <span className="mt-0.5 block text-[12px] leading-4 text-[#9a9ea6]">
                {[typeLabel, sizeLabel].filter(Boolean).join(" ")}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
