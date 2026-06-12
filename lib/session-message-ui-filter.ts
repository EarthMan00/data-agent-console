import type { SessionMessageItem } from "@/lib/agent-api/types";
import { parseTaskExecutionStepsFromMeta } from "@/lib/task-execution-steps-meta";

function messageMeta(m: SessionMessageItem): Record<string, unknown> | undefined {
  return m.meta && typeof m.meta === "object" && !Array.isArray(m.meta)
    ? (m.meta as Record<string, unknown>)
    : undefined;
}

/** 编排/拆解类助手文案：界面已由「任务拆分 + 任务执行」卡片承载，不再重复展示纯文本气泡。 */
function matchesOrchestrationStatusContent(content: string): boolean {
  const c = content.trim();
  if (!c) return false;
  if (/^已拆解为\s+\d+\s+个执行步骤/.test(c)) return true;
  if (/^拆解为\s+1\s+个执行步骤/.test(c)) return true;
  if (/^多步任务已全部完成/.test(c)) return true;
  if (/^多步任务在执行过程中失败/.test(c)) return true;
  if (/^多步任务已由用户终止/.test(c)) return true;
  if (/^任务已完成，可以在右侧查看/.test(c)) return true;
  if (/^任务执行失败，错误信息已记录在任务结果中/.test(c)) return true;
  if (c === "已分析请求，将触发工具执行。" || c === "已分析请求，将触发工具执行") return true;
  if (/^按套餐\s+.+\s*[,，]\s*将执行工具/.test(c)) return true;
  return false;
}

/**
 * 是否在聊天区隐藏该条 assistant 消息的气泡（仍可保留「任务结果」卡片等附属 UI）。
 * 适用于定时任务记录、历史会话、正常多步任务完成后的回放。
 */
export function shouldHideAssistantMessageBubble(m: SessionMessageItem): boolean {
  if (m.role !== "assistant") return false;
  const meta = messageMeta(m);
  const kind = typeof meta?.kind === "string" ? meta.kind.trim() : "";
  if (kind === "task_execution_steps") {
    // 步骤卡片由 TaskExecutionStepsAssistantBubble 渲染；
    // 若正文仅为占位文本，隐藏纯文本气泡避免重复展示。
    if (matchesOrchestrationStatusContent(m.content || "")) return true;
    return false;
  }
  if (
    kind === "linkfox_clarification" ||
    kind === "post_task_guidance" ||
    kind === "orchestration_failure"
  ) {
    return false;
  }
  if (kind === "model_error" || kind === "blocked_by_plan") return false;

  if (kind === "tool_only_turn") return true;

  const content = (m.content || "").trim();
  if (!content) {
    if (kind === "task_execution_steps") return false;
    if (meta?.streaming === true) return false;
    return true;
  }
  if (matchesOrchestrationStatusContent(content)) return true;

  const hasSteps = Boolean(parseTaskExecutionStepsFromMeta(meta)?.length);
  if (hasSteps) return false;

  if (meta?.orchestration_id && /多步任务|已拆解为|拆解为\s+\d+\s+个执行步骤/.test(content)) {
    return true;
  }
  if (Array.isArray(meta?.orchestration_step_task_ids) && meta.orchestration_step_task_ids.length > 0) {
    if (/多步任务/.test(content)) return true;
  }

  return false;
}
