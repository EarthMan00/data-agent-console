import { homeDataSourceItems, type HomeCapabilityItem } from "@/lib/home-capability-items";

export type ComposerPrefill = {
  text: string;
  selectedSourceIds: string[];
};

type StoredComposerPrefill = {
  text?: unknown;
  selectedSourceIds?: unknown;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids));
}

function mentionPatternFor(label: string) {
  const prefix = "(^|\\s|[，。；、,.!?！？:：])";
  const suffix = /[\u4e00-\u9fff]/.test(label)
    ? "(?=$|\\s|[，。；、,.!?！？:：]|[\\u4e00-\\u9fff])"
    : "(?=$|\\s|[，。；、,.!?！？:：])";
  return new RegExp(`${prefix}@${escapeRegExp(label)}${suffix}`, "g");
}

export function parseDatasourceMentions(
  text: string,
  dataSourceItems: HomeCapabilityItem[] = homeDataSourceItems,
): ComposerPrefill {
  const tools = dataSourceItems
    .flatMap((item) => [
      { id: item.id, label: item.label },
      { id: item.id, label: item.parentLabel },
    ])
    .sort((a, b) => b.label.length - a.label.length);
  const selectedSourceIds: string[] = [];
  let nextText = text;

  tools.forEach((tool) => {
    const pattern = mentionPatternFor(tool.label);
    nextText = nextText.replace(pattern, (match, prefix: string) => {
      selectedSourceIds.push(tool.id);
      return prefix;
    });
  });

  return {
    text: nextText.replace(/[ \t]{2,}/g, " ").replace(/\n[ \t]+/g, "\n").trimStart(),
    selectedSourceIds: uniqueIds(selectedSourceIds),
  };
}

export function createComposerPrefillStorageValue(text: string) {
  const parsed = parseDatasourceMentions(text);
  return JSON.stringify(parsed);
}

/** 将引导项等内容追加到输入框草稿（已有内容时用换行分隔）。 */
export function appendToComposerDraft(current: string, addition: string): string {
  const next = addition.trim();
  if (!next) return current;
  if (composerDraftContainsSuggestion(current, next)) return current;
  const cur = current.trimEnd();
  if (!cur) return next;
  return `${cur}\n${next}`;
}

function normalizeDraftLines(draft: string): string[] {
  return draft.split("\n").map((line) => line.trimEnd());
}

/** 输入框草稿是否包含与引导项完全匹配的一行。 */
export function composerDraftContainsSuggestion(draft: string, suggestion: string): boolean {
  const target = suggestion.trim();
  if (!target) return false;
  return normalizeDraftLines(draft).some((line) => line.trim() === target);
}

/** 从输入框草稿中移除与引导项完全匹配的一行（保留用户其余编辑内容）。 */
export function removeFromComposerDraft(current: string, removal: string): string {
  const target = removal.trim();
  if (!target) return current;
  if (current.trim() === target) return "";

  const lines = normalizeDraftLines(current);
  const kept = lines.filter((line) => line.trim() !== target);
  if (kept.length !== lines.length) {
    return kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
  }

  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const linePattern = new RegExp(`^${escaped}$`, "m");
  if (linePattern.test(current)) {
    return current
      .replace(new RegExp(`\\n?${escaped}\\n?`, "m"), "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return current;
}

export function parseComposerPrefillStorageValue(raw: string): ComposerPrefill {
  try {
    const parsed = JSON.parse(raw) as StoredComposerPrefill;
    if (parsed && typeof parsed === "object" && typeof parsed.text === "string") {
      const mentionParsed = parseDatasourceMentions(parsed.text);
      const storedIds = Array.isArray(parsed.selectedSourceIds)
        ? parsed.selectedSourceIds.filter((id): id is string => typeof id === "string")
        : [];
      return {
        text: mentionParsed.text,
        selectedSourceIds: uniqueIds([...storedIds, ...mentionParsed.selectedSourceIds]),
      };
    }
  } catch {
    /* Backward-compatible plain text prefill. */
  }

  return parseDatasourceMentions(raw);
}
