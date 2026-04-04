import { getTaskNameMaxChars } from "@/lib/agent-api/config";
import type { TaskResponse } from "@/lib/agent-api/types";

export function taskDisplayName(task: TaskResponse, maxChars?: number): string {
  const n = maxChars ?? getTaskNameMaxChars();
  const raw = task.request_payload?.message;
  if (typeof raw === "string" && raw.trim()) {
    const s = raw.trim().replace(/\s+/g, " ");
    if (s.length <= n) return s;
    return `${s.slice(0, n)}…`;
  }
  const id = task.task_id;
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}
