import type { AgentAttachment } from "@/lib/agent-events";
import type { TdAttachmentItem } from "tdesign-web-components/lib/filecard/type";

import { inferAttachmentType } from "@/lib/agent-attachments";

export function buildAttachmentItems(files: FileList): AgentAttachment[] {
  return Array.from(files).map((file, index) => ({
    id: `${file.name}-${index}`,
    name: file.name,
    size: file.size,
    fileType: inferAttachmentType(file.name),
    extension: file.name.split(".").pop()?.toLowerCase(),
    status: "queued",
  }));
}

export function toTdAttachments(attachments: AgentAttachment[]): TdAttachmentItem[] {
  return attachments.map((item) => ({
    uid: item.id,
    name: item.name,
    size: item.size,
    status: "success",
    fileType: item.fileType,
    extension: item.extension,
  }));
}
