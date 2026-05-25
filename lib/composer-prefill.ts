import { homeCapabilityItems } from "@/lib/home-capability-items";

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

export function parseDatasourceMentions(text: string): ComposerPrefill {
  const tools = homeCapabilityItems
    .filter((item) => item.id !== "scenarios")
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
