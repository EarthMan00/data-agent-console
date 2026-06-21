import {
  getDataSourceItems,
  homeDataSourceItems,
  type HomeCapabilityItem,
} from "@/lib/home-capability-items";

export type ComposerPrefill = {
  text: string;
  selectedSourceIds: string[];
  sourcePlacements: ComposerSourcePlacement[];
};

export type ComposerSourcePlacement = {
  sourceId: string;
  offset: number;
};

type StoredComposerPrefill = {
  text?: unknown;
  selectedSourceIds?: unknown;
  sourcePlacements?: unknown;
};

type MentionToolCandidate = {
  id: string;
  label: string;
  normalizedLabel: string;
};

type MentionResolution = {
  id: string;
  matchedBodyLength: number;
  score: number;
};

const MENTION_PATTERN = /(^|[^A-Za-z0-9_])@([^\s@，。；、,.!?！？:：]+)/g;
const PARTIAL_MENTION_MIN_LENGTH = 3;
const STRIPPABLE_TOOL_SUFFIXES = ["模拟", "工具"] as const;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids));
}

function uniqueSourcePlacements(placements: ComposerSourcePlacement[]) {
  const seen = new Set<string>();
  return placements.filter((placement) => {
    if (seen.has(placement.sourceId)) return false;
    seen.add(placement.sourceId);
    return true;
  });
}

function parseStoredSourcePlacements(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((placement): ComposerSourcePlacement | null => {
      if (!placement || typeof placement !== "object") return null;
      const sourceId = "sourceId" in placement ? placement.sourceId : null;
      const offset = "offset" in placement ? placement.offset : null;
      if (typeof sourceId !== "string" || typeof offset !== "number" || !Number.isFinite(offset)) return null;
      return { sourceId, offset: Math.max(0, offset) };
    })
    .filter((placement): placement is ComposerSourcePlacement => Boolean(placement));
}

function normalizeMentionLabel(value: string) {
  return value.trim().toLocaleLowerCase();
}

function mentionAliasesFor(label: string) {
  const trimmed = label.trim();
  if (!trimmed) return [];

  const aliases = new Set([trimmed]);
  STRIPPABLE_TOOL_SUFFIXES.forEach((suffix) => {
    if (trimmed.endsWith(suffix) && trimmed.length > suffix.length) {
      aliases.add(trimmed.slice(0, -suffix.length));
    }
  });
  return Array.from(aliases);
}

export function collectDatasourceMentionBodies(text: string) {
  const bodies: string[] = [];
  MENTION_PATTERN.lastIndex = 0;
  let match = MENTION_PATTERN.exec(text);
  while (match) {
    const body = match[2];
    if (body) bodies.push(body);
    match = MENTION_PATTERN.exec(text);
  }
  return bodies;
}

function findStaticDataSourceItem(item: HomeCapabilityItem) {
  return homeDataSourceItems.find(
    (source) =>
      source.id === item.id ||
      source.label === item.id ||
      source.id === item.label ||
      source.label === item.label,
  );
}

function mentionLabelsFor(item: HomeCapabilityItem) {
  const labels = new Set([item.label, item.parentLabel]);
  const staticItem = findStaticDataSourceItem(item);
  if (staticItem) {
    labels.add(staticItem.label);
    labels.add(staticItem.parentLabel);
  }
  return Array.from(labels);
}

function buildMentionToolCandidates(dataSourceItems: HomeCapabilityItem[]) {
  const candidates = new Map<string, MentionToolCandidate>();

  dataSourceItems.forEach((item) => {
    mentionLabelsFor(item).forEach((label) => {
      mentionAliasesFor(label).forEach((alias) => {
        const normalizedLabel = normalizeMentionLabel(alias);
        if (normalizedLabel.length < PARTIAL_MENTION_MIN_LENGTH) return;
        const key = `${item.id}:${normalizedLabel}`;
        if (!candidates.has(key)) {
          candidates.set(key, { id: item.id, label: alias, normalizedLabel });
        }
      });
    });
  });

  return Array.from(candidates.values()).sort((a, b) => b.normalizedLabel.length - a.normalizedLabel.length);
}

function resolveMentionBody(body: string, candidates: MentionToolCandidate[]): MentionResolution | null {
  const normalizedBody = normalizeMentionLabel(body);
  if (normalizedBody.length < PARTIAL_MENTION_MIN_LENGTH) return null;

  let best: MentionResolution | null = null;

  candidates.forEach((candidate) => {
    const bodyStartsWithTool = normalizedBody.startsWith(candidate.normalizedLabel);
    const toolStartsWithBody = candidate.normalizedLabel.startsWith(normalizedBody);
    if (!bodyStartsWithTool && !toolStartsWithBody) return;

    const matchedBodyLength = bodyStartsWithTool ? candidate.label.length : body.length;
    const normalizedMatchLength = bodyStartsWithTool ? candidate.normalizedLabel.length : normalizedBody.length;
    const score = normalizedMatchLength * 1000 + candidate.normalizedLabel.length;
    if (!best || score > best.score) {
      best = {
        id: candidate.id,
        matchedBodyLength,
        score,
      };
    }
  });

  return best;
}

export function parseDatasourceMentions(
  text: string,
  dataSourceItems: HomeCapabilityItem[] = getDataSourceItems(),
): ComposerPrefill {
  const tools = buildMentionToolCandidates(dataSourceItems);
  const selectedSourceIds: string[] = [];
  const sourcePlacements: ComposerSourcePlacement[] = [];
  let cursor = 0;
  let nextText = "";

  MENTION_PATTERN.lastIndex = 0;
  let match = MENTION_PATTERN.exec(text);
  while (match) {
    const [matchedText, prefix = "", body = ""] = match;
    const matchStart = match.index;
    const matchEnd = matchStart + matchedText.length;
    const resolution = resolveMentionBody(body, tools);
    nextText += text.slice(cursor, matchStart);

    if (resolution) {
      nextText += prefix;
      sourcePlacements.push({ sourceId: resolution.id, offset: nextText.length });
      selectedSourceIds.push(resolution.id);
      nextText += body.slice(resolution.matchedBodyLength);
    } else {
      nextText += matchedText;
    }

    cursor = matchEnd;
    match = MENTION_PATTERN.exec(text);
  }

  nextText += text.slice(cursor);
  const normalizedText = nextText.replace(/[ \t]{2,}/g, " ").replace(/\n[ \t]+/g, "\n").trimStart();
  const trimOffset = nextText.length - normalizedText.length;

  return {
    text: normalizedText,
    selectedSourceIds: uniqueIds(selectedSourceIds),
    sourcePlacements: uniqueSourcePlacements(sourcePlacements).map((placement) => ({
      ...placement,
      offset: Math.max(0, placement.offset - trimOffset),
    })),
  };
}

export function getUnmatchedDatasourceMentionBodies(
  text: string,
  dataSourceItems: HomeCapabilityItem[] = homeDataSourceItems,
) {
  return collectDatasourceMentionBodies(parseDatasourceMentions(text, dataSourceItems).text);
}

export function createComposerPrefillStorageValue(
  text: string,
  dataSourceItems: HomeCapabilityItem[] = homeDataSourceItems,
) {
  const parsed = parseDatasourceMentions(text, dataSourceItems);
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

  const escaped = escapeRegExp(target);
  const linePattern = new RegExp(`^${escaped}$`, "m");
  if (linePattern.test(current)) {
    return current
      .replace(new RegExp(`\\n?${escaped}\\n?`, "m"), "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return current;
}

export function parseComposerPrefillStorageValue(
  raw: string,
  dataSourceItems: HomeCapabilityItem[] = homeDataSourceItems,
): ComposerPrefill {
  try {
    const parsed = JSON.parse(raw) as StoredComposerPrefill;
    if (parsed && typeof parsed === "object" && typeof parsed.text === "string") {
      const mentionParsed = parseDatasourceMentions(parsed.text, dataSourceItems);
      const storedIds = Array.isArray(parsed.selectedSourceIds)
        ? parsed.selectedSourceIds.filter((id): id is string => typeof id === "string")
        : [];
      const storedPlacements = parseStoredSourcePlacements(parsed.sourcePlacements);
      return {
        text: mentionParsed.text,
        selectedSourceIds: uniqueIds([...storedIds, ...mentionParsed.selectedSourceIds]),
        sourcePlacements: uniqueSourcePlacements([...storedPlacements, ...mentionParsed.sourcePlacements]),
      };
    }
  } catch {
    /* Backward-compatible plain text prefill. */
  }

  return parseDatasourceMentions(raw, dataSourceItems);
}
