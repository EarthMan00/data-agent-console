/** 与后端 model_text_sanitize.strip_model_thinking_for_ui 对齐，防止模型思考块出现在聊天区。 */

import { stripInternalToolNamesForUi } from "@/lib/strip-internal-tool-names";

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

function stripModelThinkingBase(text: string, truncateUnclosed: boolean): string {
  if (!text) return text;
  let t = text.replace(ZW_RE, "");
  t = t.replace(/＜/g, "<").replace(/＞/g, ">");
  t = t.replace(/```[\s\S]*?```/g, "");
  t = t.replace(/``[\s\S]*?``/g, "");
  const tags = ["redacted_reasoning", "redacted_thinking", "thinking", "think"] as const;
  for (const tag of tags) {
    const open = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/\\s*${tag}\\s*>`, "gi");
    t = t.replace(open, "");
    if (truncateUnclosed && tag !== "redacted_thinking") {
      const openToEnd = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*$`, "gi");
      t = t.replace(openToEnd, "");
    }
  }
  if (!truncateUnclosed) {
    for (const tag of ["redacted_reasoning", "thinking", "think"] as const) {
      const openToEnd = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*$`, "gi");
      t = t.replace(openToEnd, "");
    }
  }
  t = stripRedactedThinkingBlocksScan(t);
  t = t.replace(
    /<\s*[a-z0-9_]*redacted[a-z0-9_]*thinking\s*>[\s\S]*?<\/\s*[a-z0-9_]*redacted[a-z0-9_]*thinking\s*>/gi,
    "",
  );
  t = t.replace(/<minimax:tool_call\b[^>]*>[\s\S]*?<\/\s*minimax:tool_call\s*>/gi, "");
  return t;
}

export function stripModelThinkingForUi(text: string): string {
  if (!text) return text;
  const s = stripModelThinkingBase(text, true).trim();
  return s || "（无回复）";
}

/** 流式进行中：仅去掉已闭合思考块，避免未闭合标签导致整段缓冲被清空。 */
export function stripModelThinkingForStreamPartial(text: string): string {
  if (!text) return "";
  return stripModelThinkingBase(text, false).trim();
}

/** 聊天区可见正文：去掉思考块与内部工具名，不含原始 markup。 */
export function resolveAssistantBodyForUi(text: string, streaming: boolean): string {
  if (!text.trim()) return "";
  const partial = stripModelThinkingForStreamPartial(text).trim();
  const full = stripModelThinkingForUi(text);
  const fullNorm = full === "（无回复）" ? "" : full.trim();
  const result = streaming ? partial || fullNorm : fullNorm;
  return stripInternalToolNamesForUi(result);
}

export function streamSanitizeDeltaClient(prev: string, rawAccum: string): { display: string; delta: string } {
  const display = stripInternalToolNamesForUi(stripModelThinkingForStreamPartial(rawAccum));
  if (display.startsWith(prev)) {
    return { display, delta: display.slice(prev.length) };
  }
  // 思考块闭合/展开导致可见文本缩短时，保留已展示内容，避免界面闪回「思考中」
  if (prev.startsWith(display) || display.length < prev.length) {
    return { display: prev, delta: "" };
  }
  return { display, delta: display.slice(prev.length) };
}
