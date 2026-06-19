"use client";

import { useEffect, useState } from "react";

import { FileSpreadsheet, FileText, ImageIcon } from "@/components/ui/tabler-icons";

import {
  attachmentIconTone,
  formatUserAttachmentSize,
  isImageAttachmentExtension,
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

function ImageAttachmentIcon({ extension }: { extension?: string }) {
  const label = (extension || "FILE").toUpperCase().slice(0, 4);
  return (
    <span
      aria-label={`图片文件 ${label}`}
      className="size-attachment-thumb flex shrink-0 items-center justify-center rounded-control bg-info-bg text-link"
    >
      <ImageIcon className="h-5 w-5" aria-hidden />
    </span>
  );
}

function ImageAttachmentPreview({
  attachment,
}: {
  attachment: UserMessageAttachment;
}) {
  const [failedPreviewUrl, setFailedPreviewUrl] = useState<string | null>(null);
  const previewUrl = attachment.previewUrl;
  const canPreview = Boolean(previewUrl && failedPreviewUrl !== previewUrl);

  useEffect(() => {
    if (!previewUrl || typeof window === "undefined") return;

    let cancelled = false;
    const probe = new window.Image();
    probe.onerror = () => {
      if (!cancelled) setFailedPreviewUrl(previewUrl);
    };
    probe.src = previewUrl;
    return () => {
      cancelled = true;
    };
  }, [previewUrl]);

  if (!previewUrl || !canPreview) return <ImageAttachmentIcon extension={attachment.extension} />;

  return (
    <span
      aria-label={`图片预览 ${attachment.name}`}
      className="size-attachment-thumb flex shrink-0 overflow-hidden rounded-control border border-border-subtle bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${previewUrl})` }}
    />
  );
}

export function UserMessageAttachmentCards({ attachments, className }: UserMessageAttachmentCardsProps) {
  if (attachments.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap justify-end gap-2", className)} data-testid="user-message-attachments">
      {attachments.map((attachment) => {
        const typeLabel = attachment.extension ? attachment.extension.toUpperCase() : "FILE";
        const sizeLabel = formatUserAttachmentSize(attachment.size);
        const isImageAttachment = isImageAttachmentExtension(attachment.extension);
        return (
          <div
            key={`${attachment.name}-${attachment.size}`}
            className="flex min-w-sidebar-admin max-w-72 items-center gap-3 rounded-card border border-border bg-bg-surface px-3 py-2.5 shadow-none"
          >
            {isImageAttachment ? (
              <ImageAttachmentPreview attachment={attachment} />
            ) : (
              <AttachmentIcon extension={attachment.extension} />
            )}
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
