/** 从用户可见文案中移除内部工具/技能名称（与后端 step_display_labels 对齐）。 */

const INTERNAL_TOOL_BRACKET_RE =
  /\[(?:run_(?:linkfox|chatexcel)_task|linkfox|chatexcel)[^\]]*\]/gi;
const INTERNAL_TOOL_NAME_RE =
  /\bChatExcel\b|\bLinkFox(?:\s*Agent)?\b|\bLink\s*Fox\b|run_chatexcel_task|run_linkfox_task|\bKeepa\b|\bkeepa\b|卖家精灵|店雷达|\b(?:linkfox|chatexcel)\b/gi;
const STEP_MODEL_TOOL_PREFIX_RE =
  /第\s*\d+\s*步\s*模型指定\s*(?:ChatExcel|LinkFox|run_\w+)[^，。；\n]*[，。；]?\s*/gi;

export function stripInternalToolNamesForUi(text: string): string {
  let t = (text || "").trim();
  if (!t) return t;
  t = t.replace(INTERNAL_TOOL_BRACKET_RE, "");
  t = t.replace(STEP_MODEL_TOOL_PREFIX_RE, "");
  t = t.replace(INTERNAL_TOOL_NAME_RE, "");
  t = t.replace(/工具由模型指定[，。；]?\s*/g, "");
  t = t.replace(/\s{2,}/g, " ").trim();
  return t.replace(/^[，,、;；\s]+|[，,、;；\s]+$/g, "");
}
