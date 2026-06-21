const HTML_SOURCE_RE = /<(?:!doctype|html|head|body|style|script|title|h[1-6]|p|li|div|section|article|table|tr|td|th)\b/i;
const CODE_PREFIX_RE = /^\s*(?:<!doctype|<html|<head|<style|<script|[{[]|"total"|const\s+|function\s+)/i;
const MAX_PREVIEW_SOURCE_CHARS = 80_000;

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => {
      const value = Number.parseInt(code, 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => {
      const value = Number.parseInt(code, 16);
      return Number.isFinite(value) ? String.fromCodePoint(value) : _;
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function normalizePreviewText(text: string) {
  return decodeHtmlEntities(text)
    .replace(/\r/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsefulReportLine(line: string) {
  const t = line.trim();
  if (t.length < 2) return false;
  if (/^[{}[\],:;]+$/.test(t)) return false;
  if (/^(?:body|html|head|root|script|style)\b/i.test(t)) return false;
  if (/^(?:font-|background|line-height|margin|padding|color|display|width|height|max-width)\s*:/i.test(t)) return false;
  if (/^https?:\/\//i.test(t)) return false;
  return /[\u4e00-\u9fa5a-zA-Z0-9]/.test(t);
}

export function favoritePreviewLooksLikeSource(preview: string | null | undefined) {
  const text = (preview ?? "").trim();
  if (!text) return false;
  return CODE_PREFIX_RE.test(text) || HTML_SOURCE_RE.test(text);
}

export function summarizeFavoritePreviewText(preview: string | null | undefined) {
  const raw = (preview ?? "").trim();
  if (!raw) return "";
  if (!favoritePreviewLooksLikeSource(raw)) return normalizePreviewText(raw);

  const source = raw.slice(0, MAX_PREVIEW_SOURCE_CHARS);
  const title = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const body = source.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? source;
  const readable = body
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<(?:br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/(?:h[1-6]|p|li|div|section|article|tr|td|th|table|ul|ol)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  const lines = `${title}\n${readable}`
    .split("\n")
    .map(normalizePreviewText)
    .filter(isUsefulReportLine);

  return Array.from(new Set(lines)).slice(0, 8).join(" ");
}

function stringFromUnknown(value: unknown) {
  return typeof value === "string" && value.trim() ? value : "";
}

export function summarizeFavoriteSnapshot(snapshot: Record<string, unknown> | null | undefined) {
  if (!snapshot) return "";

  const sheets = snapshot.sheets;
  if (Array.isArray(sheets)) {
    for (const sheet of sheets) {
      if (!sheet || typeof sheet !== "object" || Array.isArray(sheet)) continue;
      const row = sheet as Record<string, unknown>;
      const candidates = [
        stringFromUnknown(row.primary_text),
        stringFromUnknown(row.report_text),
        stringFromUnknown(row.markdown_text),
        stringFromUnknown(row.html_text),
      ];
      for (const candidate of candidates) {
        const summary = summarizeFavoritePreviewText(candidate);
        if (summary && !favoritePreviewLooksLikeSource(summary)) return summary;
      }
    }
  }

  const candidates = [
    stringFromUnknown(snapshot.content_text),
    stringFromUnknown(snapshot.card_preview),
    stringFromUnknown(snapshot.display_title),
  ];
  for (const candidate of candidates) {
    const summary = summarizeFavoritePreviewText(candidate);
    if (summary && !favoritePreviewLooksLikeSource(summary)) return summary;
  }

  return "";
}

export function favoriteCardPreviewText({
  cardPreview,
  snapshot,
  fallback,
}: {
  cardPreview?: string | null;
  snapshot?: Record<string, unknown> | null;
  fallback?: string;
}) {
  const snapshotSummary = summarizeFavoriteSnapshot(snapshot);
  if (snapshotSummary) return snapshotSummary;

  const previewSummary = summarizeFavoritePreviewText(cardPreview);
  if (previewSummary && !favoritePreviewLooksLikeSource(previewSummary)) return previewSummary;

  return normalizePreviewText(fallback ?? "") || "（无预览摘要）";
}
