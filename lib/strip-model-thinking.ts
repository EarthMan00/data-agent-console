/** 与后端 model_text_sanitize.strip_model_thinking_for_ui 对齐，防止模型思考块出现在聊天区。 */

const ZW_RE = /[\u200b\u200c\u200d\u2060\ufeff]/g;

export function stripModelThinkingForUi(text: string): string {
  if (!text) return text;
  let t = text.replace(ZW_RE, "");
  t = t.replace(/`[\s\S]*?`[\s\S]*?`[\s\S]*?`/g, "");
  t = t.replace(/``[\s\S]*?``/g, "");
  const tags = ["redacted_reasoning", "redacted_thinking", "thinking"] as const;
  for (const tag of tags) {
    const open = new RegExp(`<${tag}\\b[^>]*>[\\s\S]*?<\\/\\s*${tag}\\s*>`, "gi");
    const openToEnd = new RegExp(`<${tag}\\b[^>]*>[\\s\S]*$`, "gi");
    t = t.replace(open, "");
    t = t.replace(openToEnd, "");
  }
  t = t.replace(/<minimax:tool_call\b[^>]*>[\s\S]*?<\/\s*minimax:tool_call\s*>/gi, "");
  t = t.replace(/linkfox\s*agent/gi, "");
  t = t.replace(/linkfox/gi, "");
  const s = t.trim();
  return s || "（无回复）";
}
