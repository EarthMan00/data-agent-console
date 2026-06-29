import { getTaskNameMaxChars } from "@/lib/agent-api/config";
import type { TaskResponse } from "@/lib/agent-api/types";

function compactTaskText(text: string, maxChars: number): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}...`;
}

function extractUserMessageFromAugmentedPrompt(message: string): string {
  const raw = (message || "").trim();
  if (!raw) return "";

  const userMessageMarker = "【用户消息】";
  const markerIndex = raw.lastIndexOf(userMessageMarker);
  if (markerIndex >= 0) {
    return raw.slice(markerIndex + userMessageMarker.length).trim();
  }

  return raw;
}

export function taskDisplayName(task: TaskResponse, maxChars?: number): string {
  const n = maxChars ?? getTaskNameMaxChars();

  const decomposedSingleStep = task.request_payload?.decomposed_single_step;
  if (typeof decomposedSingleStep === "string" && decomposedSingleStep.trim()) {
    return compactTaskText(decomposedSingleStep, n);
  }

  const rawMessage = task.request_payload?.message;
  if (typeof rawMessage === "string" && rawMessage.trim()) {
    return compactTaskText(extractUserMessageFromAugmentedPrompt(rawMessage), n);
  }

  const id = task.task_id;
  return id.length > 12 ? `${id.slice(0, 8)}...` : id;
}
