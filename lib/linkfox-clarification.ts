const SHARE_URL_LINE_RE = /ShareURL:\s*(\S+)/i;

/** 从 linkfox_result 文本或会话正文中解析 ShareURL。 */
export function parseLinkfoxShareUrl(text: string): string | null {
  const m = SHARE_URL_LINE_RE.exec(text || "");
  return m?.[1]?.trim() || null;
}

export function resolveLinkfoxShareUrl(
  meta: Record<string, unknown> | null | undefined,
  messageContent: string,
): string | null {
  const fromMeta = meta && typeof meta.share_url === "string" ? meta.share_url.trim() : "";
  if (fromMeta) return fromMeta;
  return parseLinkfoxShareUrl(messageContent);
}

/** 展示用正文：去掉末尾 LinkFox 链接行，避免与按钮重复。 */
export function linkfoxClarificationBodyForDisplay(body: string, shareUrl: string | null): string {
  const url = (shareUrl || "").trim();
  let text = (body || "").trim();
  if (!text) return "";
  if (url) {
    text = text.split(url).join("").trim();
    text = text.replace(/请在 LinkFox 对话中继续补充信息：\s*$/i, "").trim();
  }
  return text;
}

export function formatLinkfoxClarificationForStream(message: string, shareUrl: string | null): string {
  const body = linkfoxClarificationBodyForDisplay(message, shareUrl);
  const url = (shareUrl || "").trim();
  if (!url) return body;
  const linkLine = `[在 LinkFox 中继续补充](${url})`;
  return body ? `${body}\n\n${linkLine}` : linkLine;
}
