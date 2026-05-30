import type { AgentAttachment } from "@/lib/agent-events";

import { inferAttachmentType } from "@/lib/agent-attachments";

export function buildAttachmentItems(files: FileList | File[]): AgentAttachment[] {
  return Array.from(files).map((file, index) => ({
    id: `${file.name}-${index}`,
    name: file.name,
    size: file.size,
    fileType: inferAttachmentType(file.name),
    extension: file.name.split(".").pop()?.toLowerCase(),
    status: "queued",
  }));
}
