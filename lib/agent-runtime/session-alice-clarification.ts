import { listSessionMessages } from "@/lib/agent-api/client";
import { sanitizeClarificationForUserDisplay } from "@/lib/alice-clarification";

export type SessionAliceClarification = {
  message: string;
  stepIndex: number | null;
  orchestrationId: string | null;
  taskId: string | null;
};

function parseClarificationMessage(
  m: { role?: string; content?: string; meta?: unknown },
  opts?: { taskId?: string; orchestrationId?: string | null },
): SessionAliceClarification | null {
  if (m.role !== "assistant") return null;
  const meta =
    m.meta && typeof m.meta === "object" && !Array.isArray(m.meta)
      ? (m.meta as Record<string, unknown>)
      : undefined;
  if (meta?.kind !== "linkfox_clarification") return null;
  const taskId = meta.task_id != null ? String(meta.task_id).trim() : "";
  const orchId = meta.orchestration_id != null ? String(meta.orchestration_id).trim() : "";
  if (opts?.taskId && taskId && taskId !== opts.taskId) return null;
  if (opts?.orchestrationId && orchId && orchId !== opts.orchestrationId) return null;
  const message = sanitizeClarificationForUserDisplay(m.content ?? "").trim();
  if (!message) return null;
  return {
    message,
    stepIndex: typeof meta.clarification_step_index === "number" ? meta.clarification_step_index : null,
    orchestrationId: orchId || null,
    taskId: taskId || null,
  };
}

/** 任务/编排结束后，从 session_messages 拉取 Alice 二次确认（后端异步写入，需短暂重试）。 */
export async function resolvePendingAliceClarificationFromSession(
  token: string,
  sessionId: string,
  opts?: {
    taskId?: string;
    orchestrationId?: string | null;
    maxAttempts?: number;
    intervalMs?: number;
  },
): Promise<SessionAliceClarification | null> {
  const maxAttempts = opts?.maxAttempts ?? 16;
  const intervalMs = opts?.intervalMs ?? 250;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    try {
      const page = await listSessionMessages(token, sessionId, 60);
      const rows = [...(page.messages ?? [])].reverse();
      for (const m of rows) {
        const hit = parseClarificationMessage(m, {
          taskId: opts?.taskId,
          orchestrationId: opts?.orchestrationId,
        });
        if (hit) return hit;
      }
    } catch {
      /* 拉取失败时继续重试 */
    }
  }
  return null;
}
