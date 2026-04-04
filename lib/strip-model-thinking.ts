/** 与后端 strip_model_thinking_for_ui 对齐，防止模型思考块出现在聊天区。 */

export function stripModelThinkingForUi(text: string): string {
  if (!text) return text;
  let t = text;
  t = t.replace(/`[\s\S]*?`[\s\S]*?`[\s\S]*?`/g, "");
  t = t.replace(/``[\s\S]*?``/g, "");
  t = t.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
  const s = t.trim();
  return s || "（无回复）";
}
