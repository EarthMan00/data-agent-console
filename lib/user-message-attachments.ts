export type UserMessageAttachment = {
  name: string;
  size: number;
  extension?: string;
};

const SPREADSHEET_EXTENSIONS = new Set(["xlsx", "xls", "xlsm", "csv", "tsv"]);

export function formatUserAttachmentSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "";
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)}KB`;
  return `${(size / 1024 / 1024).toFixed(2)}MB`;
}

export function attachmentIconTone(extension?: string): "spreadsheet" | "document" {
  const ext = (extension ?? "").toLowerCase();
  return SPREADSHEET_EXTENSIONS.has(ext) ? "spreadsheet" : "document";
}

export function buildUserMessageAttachmentsFromFiles(files: File[]): UserMessageAttachment[] {
  return files.map((file) => ({
    name: file.name,
    size: file.size,
    extension: file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() : undefined,
  }));
}

export function parseUserMessageAttachments(meta?: Record<string, unknown>): UserMessageAttachment[] {
  if (!meta || typeof meta !== "object") return [];
  const raw = meta.attachments;
  if (!Array.isArray(raw)) return [];
  const out: UserMessageAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const size = typeof row.size === "number" ? row.size : 0;
    const extension = typeof row.extension === "string" ? row.extension.trim().toLowerCase() : undefined;
    if (!name) continue;
    out.push({ name, size, extension: extension || undefined });
  }
  return out;
}
