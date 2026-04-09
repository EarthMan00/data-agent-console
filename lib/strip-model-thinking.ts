/** 与后端 model_text_sanitize.strip_model_thinking_for_ui 对齐，防止模型思考块出现在聊天区。 */

const ZW_RE = /[\u200b\u200c\u200d\u2060\ufeff]/g;

const REDACTED_THINKING_OPEN = /<\s*redacted_thinking\b[^>]*>/gi;
const REDACTED_THINKING_CLOSE = /<\s*\/\s*redacted_thinking\s*>/gi;

function stripRedactedThinkingBlocksScan(text: string): string {
  let t = text;
  for (;;) {
    REDACTED_THINKING_OPEN.lastIndex = 0;
    const m = REDACTED_THINKING_OPEN.exec(t);
    if (!m) break;
    const start = m.index;
    const rest = t.slice(m.index + m[0].length);
    REDACTED_THINKING_CLOSE.lastIndex = 0;
    const cm = REDACTED_THINKING_CLOSE.exec(rest);
    if (cm) {
      t = t.slice(0, start) + rest.slice(cm.index + cm[0].length);
      continue;
    }
    const markers = ["\n\n我正在", "\n\n请稍候", "\n我正在", "\n请稍候", "请稍候"] as const;
    let cut: number | undefined;
    for (const marker of markers) {
      const k = rest.indexOf(marker);
      if (k !== -1) {
        cut = k;
        break;
      }
    }
    if (cut !== undefined) {
      t = t.slice(0, start) + rest.slice(cut);
    } else {
      t = t.slice(0, start);
    }
    break;
  }
  return t;
}

export function stripModelThinkingForUi(text: string): string {
  if (!text) return text;
  let t = text.replace(ZW_RE, "");
  t = t.replace(/＜/g, "<").replace(/＞/g, ">");
  t = t.replace(/`[\s\S]*?`[\s\S]*?`[\s\S]*?`/g, "");
  t = t.replace(/``[\s\S]*?``/g, "");
  const tags = ["redacted_reasoning", "redacted_thinking", "thinking"] as const;
  for (const tag of tags) {
    const open = new RegExp(`<${tag}\\b[^>]*>[\\s\S]*?<\\/\\s*${tag}\\s*>`, "gi");
    t = t.replace(open, "");
    if (tag !== "redacted_thinking") {
      const openToEnd = new RegExp(`<${tag}\\b[^>]*>[\\s\S]*$`, "gi");
      t = t.replace(openToEnd, "");
    }
  }
  t = stripRedactedThinkingBlocksScan(t);
  t = t.replace(
    /<\s*[a-z0-9_]*redacted[a-z0-9_]*thinking\s*>[\s\S]*?<\/\s*[a-z0-9_]*redacted[a-z0-9_]*thinking\s*>/gi,
    "",
  );
  t = t.replace(/<minimax:tool_call\b[^>]*>[\s\S]*?<\/\s*minimax:tool_call\s*>/gi, "");
  t = t.replace(/linkfox\s*agent/gi, "");
  t = t.replace(/linkfox/gi, "");
  const s = t.trim();
  return s || "（无回复）";
}
