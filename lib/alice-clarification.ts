const NUMBERED_ITEM = /^\s*\d+[.、)\]]\s*(.+)$/;
const BULLET_ITEM = /^\s*[-•*]\s+(.+)$/;

/** 从内部结果文本或会话正文中解析 ShareURL（仅内部使用，不展示给用户）。 */
export function parseAliceShareUrl(text: string): string | null {
  const m = /ShareURL:\s*(\S+)/i.exec(text || "");
  return m?.[1]?.trim() || null;
}

const SHARE_URL_LINE_RE = /ShareURL:\s*(\S+)/gi;
const MESSAGE_ID_LINE_RE = /^messageId:\s*\S+\s*$/gim;
const STATUS_LINE_RE = /^Status:\s*\S+\s*$/gim;
const INTERNAL_CLARIFICATION_SECTION_RE = /^---\s*(?:Alice|LinkFox)\s*说明\s*---\s*$/gim;
const LEGACY_SHARE_URL_RE = /https?:\/\/agent\.linkfox\.com\S*/gi;
const LEGACY_LINK_MD_RE = /\[在\s*LinkFox[^\]]*\]\([^)]+\)/gi;
const LEGACY_PROMPT_RE = /请在\s*LinkFox[^。\n]*[：:]\s*/gi;

export function resolveAliceShareUrl(
  meta: Record<string, unknown> | null | undefined,
  messageContent: string,
): string | null {
  const fromMeta = meta && typeof meta.share_url === "string" ? meta.share_url.trim() : "";
  if (fromMeta) return fromMeta;
  return parseAliceShareUrl(messageContent);
}

/** 面向用户的澄清文案：去掉工具名、外链、状态行与内部标记。 */
export function sanitizeClarificationForUserDisplay(message: string): string {
  let text = (message || "").trim();
  if (!text) return "";

  text = text.replace(INTERNAL_CLARIFICATION_SECTION_RE, "\n");
  text = text.replace(SHARE_URL_LINE_RE, "");
  text = text.replace(MESSAGE_ID_LINE_RE, "");
  text = text.replace(STATUS_LINE_RE, "");
  text = text.replace(LEGACY_SHARE_URL_RE, "");
  text = text.replace(LEGACY_LINK_MD_RE, "");
  text = text.replace(LEGACY_PROMPT_RE, "");
  text = text.replace(/请在下方输入补充信息后发送[^。]*。?/g, "");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

/** @deprecated 使用 sanitizeClarificationForUserDisplay */
export function aliceClarificationBodyForDisplay(body: string, _shareUrl: string | null): string {
  return sanitizeClarificationForUserDisplay(body);
}

/** 澄清内容写入助手流式回复（仅自然语言，无工具信息）。 */
export function formatAliceClarificationForStream(message: string, _shareUrl: string | null): string {
  return sanitizeClarificationForUserDisplay(message);
}

/** 是否为 Alice 二次确认/关键词选择类追问（用于持久化到对话历史）。 */
export function looksLikeClarificationPrompt(message: string): boolean {
  const text = sanitizeClarificationForUserDisplay(message);
  if (!text) return false;
  const markers = [
    "请确认",
    "请补充",
    "请告诉",
    "请选择",
    "英文关键词",
    "哪个关键词",
    "如下几个",
    "二次确认",
  ];
  return markers.some((m) => text.includes(m));
}

/** 将澄清正文拆成引导语 + 可点击关键词/选项列表。 */
export function splitClarificationForDisplay(content: string): {
  leading: string;
  suggestions: string[];
} {
  const text = sanitizeClarificationForUserDisplay(content);
  if (!text) return { leading: "", suggestions: [] };

  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const suggestions: string[] = [];
  const leadingLines: string[] = [];

  for (const line of lines) {
    const numbered = line.match(NUMBERED_ITEM);
    if (numbered?.[1]) {
      suggestions.push(numbered[1].trim());
      continue;
    }
    const bullet = line.match(BULLET_ITEM);
    if (bullet?.[1]) {
      suggestions.push(bullet[1].trim());
      continue;
    }
    leadingLines.push(line);
  }

  return {
    leading: leadingLines.join("\n").trim(),
    suggestions: suggestions.filter((s) => s.length > 0),
  };
}
