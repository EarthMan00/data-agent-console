import type { SessionMessageItem } from "@/lib/agent-api/types";

function messageMeta(m: SessionMessageItem): Record<string, unknown> | undefined {
  return m.meta && typeof m.meta === "object" && !Array.isArray(m.meta)
    ? (m.meta as Record<string, unknown>)
    : undefined;
}

/** 会话中是否已有编排失败说明（含带具体原因的新格式）。 */
export function sessionHasOrchestrationFailure(messages: SessionMessageItem[]): boolean {
  return messages.some((m) => {
    if (m.role !== "assistant") return false;
    const meta = messageMeta(m);
    if (meta?.kind === "orchestration_failure") return true;
    const c = (m.content || "").trim();
    return /^多步任务在执行过程中失败/.test(c) || /^无法基于当前会话已有结果生成分析报告/.test(c);
  });
}
