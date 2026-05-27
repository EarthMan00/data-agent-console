import type { SessionMessageItem } from "@/lib/agent-api/types";

const GUIDANCE_TITLE_PREFIX = /^【接下来您可以】\s*/u;
const EMBEDDED_GUIDANCE_SPLIT = /\n*【接下来您可以】\s*\n?([\s\S]*)$/u;

/** 从旧版「任务摘要 + 【接下来您可以】+ 引导」合并正文中拆出引导块。 */
export function splitEmbeddedPostTaskGuidance(content: string): {
  leading: string;
  guidanceBlock: string | null;
} {
  const text = (content || "").trim();
  const match = text.match(EMBEDDED_GUIDANCE_SPLIT);
  if (!match || match.index === undefined) {
    return { leading: text, guidanceBlock: null };
  }
  const leading = text.slice(0, match.index).trimEnd();
  const guidanceBlock = (match[1] || "").trim();
  return { leading, guidanceBlock: guidanceBlock || null };
}

export type PostTaskGuidancePresentation =
  | { kind: "none" }
  | { kind: "dedicated"; content: string }
  | { kind: "embedded"; leading: string; guidanceBlock: string };

/** 判断 assistant 消息是否应以 PostTaskGuidanceBubble 展示（含旧版正文内嵌引导）。 */
export function resolvePostTaskGuidancePresentation(
  message: SessionMessageItem,
  meta?: Record<string, unknown>,
): PostTaskGuidancePresentation {
  const msgKind = typeof meta?.kind === "string" ? meta.kind.trim() : "";
  if (msgKind === "post_task_guidance") {
    return { kind: "dedicated", content: message.content };
  }
  const split = splitEmbeddedPostTaskGuidance(message.content);
  if (split.guidanceBlock) {
    return { kind: "embedded", leading: split.leading, guidanceBlock: split.guidanceBlock };
  }
  return { kind: "none" };
}
const NUMBERED_ITEM = /^\s*\d+[.、)\]]\s*(.+)$/;
const BULLET_ITEM = /^\s*[-•*]\s+(.+)$/;
const FILE_FORMAT_RE = /\b(?:CSV|JSON|Excel|XLSX?|xlsx|xls|\.csv|\.json)\b/gi;
const TOOL_NAME_RE = /ChatExcel|LinkFox|Link\s*Fox|linkfox|chatexcel|Keepa|keepa|卖家精灵|店雷达/gi;
export const RESULT_ANALYSIS_GUIDANCE_CANONICAL = "查看结果数据详情，并生成分析报告";

/** 展示用：去掉文件格式与内部工具名，与后端 follow_up_service 规则对齐。 */
export function sanitizePostTaskGuidanceSuggestion(text: string): string {
  const raw = (text || "").trim();
  if (!raw) return "";

  const low = raw.toLowerCase();
  const wantsAnalysis = /报告|分析|解读|汇总|洞察/.test(raw);
  const wantsViewData = /查看|详情|结果|数据|导出|下载/.test(raw);
  const hasFormatOrTool = FILE_FORMAT_RE.test(raw) || TOOL_NAME_RE.test(raw);

  if (hasFormatOrTool && wantsViewData && wantsAnalysis) {
    return RESULT_ANALYSIS_GUIDANCE_CANONICAL;
  }
  if (
    wantsViewData &&
    wantsAnalysis &&
    /csv|json|excel|chatexcel|linkfox|xlsx/.test(low)
  ) {
    return RESULT_ANALYSIS_GUIDANCE_CANONICAL;
  }

  let s = raw.replace(FILE_FORMAT_RE, "").replace(TOOL_NAME_RE, "");
  s = s.replace(/已落盘|落盘/g, "");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/[，,]\s*[，,]+/g, "，");
  s = s.replace(/用\s*并生成/g, "并生成").replace(/用\s*生成/g, "并生成");
  if (/查看.+详情/.test(s) && !s.includes("结果数据")) {
    s = s.replace(/查看.+?详情/, "查看结果数据详情");
  }
  s = s.replace(/^[，,、;；\s]+|[，,、;；\s]+$/g, "");
  if (!s && wantsViewData && wantsAnalysis) {
    return RESULT_ANALYSIS_GUIDANCE_CANONICAL;
  }
  return s;
}

/** 将服务端落库的引导文案解析为可点击的建议项。 */
export function parsePostTaskGuidanceSuggestions(content: string): string[] {
  let text = (content || "").trim();
  if (!text) return [];
  text = text.replace(GUIDANCE_TITLE_PREFIX, "").trim();
  if (!text) return [];

  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const items: string[] = [];
  for (const line of lines) {
    const numbered = line.match(NUMBERED_ITEM);
    if (numbered?.[1]) {
      items.push(numbered[1].trim());
      continue;
    }
    const bullet = line.match(BULLET_ITEM);
    if (bullet?.[1]) {
      items.push(bullet[1].trim());
      continue;
    }
    items.push(line);
  }

  return items
    .map((item) => sanitizePostTaskGuidanceSuggestion(item))
    .filter((s) => s.length > 0);
}
