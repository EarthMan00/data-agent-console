export type UserMessageAttachment = {
  name: string;
  size: number;
  extension?: string;
  previewUrl?: string;
};

const SPREADSHEET_EXTENSIONS = new Set(["xlsx", "xls", "xlsm", "csv", "tsv"]);
const IMAGE_EXTENSIONS = new Set(["apng", "avif", "gif", "jpg", "jpeg", "png", "svg", "svgz", "webp"]);

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

export function isImageAttachmentExtension(extension?: string): boolean {
  const ext = (extension ?? "").toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

export function buildUserMessageAttachmentsFromFiles(files: File[]): UserMessageAttachment[] {
  return files.map((file) => {
    const extension = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() : undefined;
    const isImage = file.type.startsWith("image/") || isImageAttachmentExtension(extension);
    return {
      name: file.name,
      size: file.size,
      extension,
      previewUrl:
        isImage &&
        typeof URL !== "undefined" &&
        typeof URL.createObjectURL === "function"
          ? URL.createObjectURL(file)
          : undefined,
    };
  });
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
    const previewUrl =
      (typeof row.previewUrl === "string" && row.previewUrl.trim()) ||
      (typeof row.preview_url === "string" && row.preview_url.trim()) ||
      (typeof row.url === "string" && row.url.trim()) ||
      (typeof row.download_url === "string" && row.download_url.trim()) ||
      (typeof row.downloadUrl === "string" && row.downloadUrl.trim()) ||
      (typeof row.data_url === "string" && row.data_url.trim()) ||
      "";
    if (!name) continue;
    out.push({ name, size, extension: extension || undefined, previewUrl: previewUrl || undefined });
  }
  return out;
}
