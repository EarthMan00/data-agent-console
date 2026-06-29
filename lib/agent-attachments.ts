import type { AgentAttachmentFileType } from "@/lib/agent-events";

export function sanitizeObjective(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/(^|[ \t])@[^\s]*/g, " ").replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim();
}

export function inferAttachmentType(name: string): AgentAttachmentFileType {
  const extension = name.split(".").pop()?.toLowerCase();
  if (!extension) return "txt";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(extension)) return "image";
  if (["mp4", "mov", "avi"].includes(extension)) return "video";
  if (["mp3", "wav", "m4a"].includes(extension)) return "audio";
  if (extension === "pdf") return "pdf";
  if (["doc", "docx"].includes(extension)) return "doc";
  if (["ppt", "pptx"].includes(extension)) return "ppt";
  return "txt";
}
