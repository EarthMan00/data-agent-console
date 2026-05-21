import type { SessionMessageItem } from "@/lib/agent-api/types";

/** 从「已拆解为 N 个执行步骤…」类助手文案中解析步骤说明（定时/历史会话无 task_execution_steps 落库时兜底）。 */
export function parseDecompositionLabelsFromContent(content: string): string[] {
  const c = (content || "").trim();
  if (!/^已拆解为\s+\d+\s+个执行步骤/.test(c) && !/^拆解为\s+1\s+个执行步骤/.test(c)) {
    return [];
  }
  const labels: string[] = [];
  for (const line of c.split(/\n+/)) {
    const trimmed = line.trim();
    const m = trimmed.match(/^\d+\.\s*(?:\[[^\]]+\]\s*)?(.+)$/);
    if (m?.[1]) {
      const label = m[1].trim();
      if (label) labels.push(label);
    }
  }
  return labels;
}

export function extractDecompositionLabelsFromMessages(messages: SessionMessageItem[]): string[] {
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    const labels = parseDecompositionLabelsFromContent(m.content);
    if (labels.length > 0) return labels;
  }
  return [];
}
