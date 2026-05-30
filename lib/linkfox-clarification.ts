const NUMBERED_ITEM = /^\s*\d+[.、)\]]\s*(.+)$/;
const BULLET_ITEM = /^\s*[-•*]\s+(.+)$/;

/** 从 linkfox_result 文本或会话正文中解析 ShareURL（仅内部使用，不展示给用户）。 */
export function parseLinkfoxShareUrl(text: string): string | null {
  const m = /ShareURL:\s*(\S+)/i.exec(text || "");
  return m?.[1]?.trim() || null;
}

const SHARE_URL_LINE_RE = /ShareURL:\s*(\S+)/gi;
const MESSAGE_ID_LINE_RE = /^messageId:\s*\S+\s*$/gim;
const STATUS_LINE_RE = /^Status:\s*\S+\s*$/gim;
const LINKFOX_SECTION_RE = /^---\s*LinkFox\s*说明\s*---\s*$/gim;
const LINKFOX_URL_RE = /https?:\/\/agent\.linkfox\.com\S*/gi;
const LINKFOX_LINK_MD_RE = /\[在\s*LinkFox[^\]]*\]\([^)]+\)/gi;
const LINKFOX_PROMPT_RE = /请在\s*LinkFox[^。\n]*[：:]\s*/gi;

export function resolveLinkfoxShareUrl(
  meta: Record<string, unknown> | null | undefined,
  messageContent: string,
): string | null {
  const fromMeta = meta && typeof meta.share_url === "string" ? meta.share_url.trim() : "";
  if (fromMeta) return fromMeta;
  return parseLinkfoxShareUrl(messageContent);
}

/** 面向用户的澄清文案：去掉工具名、外链、状态行与内部标记。 */
export function sanitizeClarificationForUserDisplay(message: string): string {
  let text = (message || "").trim();
  if (!text) return "";

  text = text.replace(LINKFOX_SECTION_RE, "\n");
  text = text.replace(SHARE_URL_LINE_RE, "");
  text = text.replace(MESSAGE_ID_LINE_RE, "");
  text = text.replace(STATUS_LINE_RE, "");
  text = text.replace(LINKFOX_URL_RE, "");
  text = text.replace(LINKFOX_LINK_MD_RE, "");
  text = text.replace(LINKFOX_PROMPT_RE, "");
  text = text.replace(/请在下方输入补充信息后发送[^。]*。?/g, "");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

/** @deprecated 使用 sanitizeClarificationForUserDisplay */
export function linkfoxClarificationBodyForDisplay(body: string, _shareUrl: string | null): string {
  return sanitizeClarificationForUserDisplay(body);
}

/** 澄清内容写入助手流式回复（仅自然语言，无工具信息）。 */
export function formatLinkfoxClarificationForStream(message: string, _shareUrl: string | null): string {
  return sanitizeClarificationForUserDisplay(message);
}

/** 是否为 LinkFox 二次确认/关键词选择类追问（用于持久化到对话历史）。 */
export function looksLikeClarificationPrompt(message: string): boolean {
  const text = sanitizeClarificationForUserDisplay(message);
  if (!text) return false;
  const markers = [
    "请确认",
    "请补充",
    "请告诉",
    "请选择",
    "关键词",
    "英文关键词",
    "哪个关键词",
    "如下几个",
    "二次确认",
  ];
  if (markers.some((m) => text.includes(m))) return true;
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const optionLines = lines.filter((l) => BULLET_ITEM.test(l) || NUMBERED_ITEM.test(l));
  return optionLines.length >= 2;
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
