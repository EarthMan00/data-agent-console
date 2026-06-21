import {
  fetchHomePromptRecommendations,
  type PublicPromptCategory,
} from "@/lib/agent-api/home-prompts";
import { getUnmatchedDatasourceMentionBodies } from "@/lib/composer-prefill";
import {
  homeCapabilityGroups,
  homeDataSourceItems,
  type HomeCapabilityGroup,
  type HomeCapabilityItem,
} from "@/lib/home-capability-items";
import type { HomePromptCard } from "@/lib/workspace-domain-types";

const SCENARIO_CATEGORY_NAME = "应用场景";
const COMMON_TOOL_GROUP_ID = "common-tools";
const COMMON_TOOL_GROUP_LABEL = "常用工具";

type HomePromptCacheEntry = {
  cards: HomePromptCard[] | null;
  promise: Promise<HomePromptCard[]> | null;
};

export const HOME_PROMPT_ANONYMOUS_CACHE_KEY = "__anonymous__";

const homePromptCardCache = new Map<string, HomePromptCacheEntry>();

export function mapHomePromptCards(rows: Awaited<ReturnType<typeof fetchHomePromptRecommendations>>): HomePromptCard[] {
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.description,
    prompt: r.prompt,
    meta: r.meta,
    capabilityIds: r.capability_ids,
    replayRunId: r.replay_run_id ?? undefined,
    replayShareId: r.replay_share_id ?? undefined,
  }));
}

function filterHomePromptCardsByCapability(cards: HomePromptCard[], capabilityIds: string[]) {
  if (capabilityIds.length === 0) return cards;
  const filterSet = new Set(capabilityIds);
  return cards.filter((card) => card.capabilityIds.some((id) => filterSet.has(id)));
}

export function getCachedHomePromptCards(cacheKey: string) {
  return homePromptCardCache.get(cacheKey)?.cards ?? null;
}

export function loadHomePromptCardsOnce(
  cacheKey: string,
  categoryId: string,
  capabilityId?: string,
  capabilityIds: string[] = [],
) {
  const cached = homePromptCardCache.get(cacheKey);
  if (cached?.cards) return Promise.resolve(cached.cards);
  if (cached?.promise) return cached.promise;

  const promise = fetchHomePromptRecommendations(categoryId, capabilityId)
    .then(mapHomePromptCards)
    .then((cards) => filterHomePromptCardsByCapability(cards, capabilityIds))
    .then((cards) => {
      homePromptCardCache.set(cacheKey, { cards, promise: null });
      return cards;
    })
    .catch((error) => {
      homePromptCardCache.delete(cacheKey);
      throw error;
    });

  homePromptCardCache.set(cacheKey, { cards: null, promise });
  return promise;
}

function capabilityLabelFromId(capabilityId: string) {
  return capabilityId.trim().replace(/^@+/, "");
}

function findStaticCapabilityItem(capabilityLabel: string) {
  const normalized = capabilityLabelFromId(capabilityLabel);
  return homeDataSourceItems.find(
    (item) => item.id === capabilityLabel || item.id === normalized || item.label === capabilityLabel || item.label === normalized,
  );
}

function staticCapabilityMeta(categoryName: string, capabilityLabel: string) {
  const staticItem = findStaticCapabilityItem(capabilityLabel);
  const staticGroup = homeCapabilityGroups.find((group) => group.label === categoryName);
  return {
    id: staticItem?.id,
    label: staticItem?.label,
    promptHint: staticItem?.promptHint,
    promptTemplate: staticItem?.promptTemplate,
    promptTemplates: staticItem?.promptTemplates,
    icon: staticItem?.icon ?? staticGroup?.icon ?? "grid",
    accent: staticItem?.accent ?? staticGroup?.accent ?? "var(--color-accent-neutral)",
  };
}

function getDatasourceGroupDescriptor(category: PublicPromptCategory) {
  if (category.name === SCENARIO_CATEGORY_NAME) {
    return { id: COMMON_TOOL_GROUP_ID, label: COMMON_TOOL_GROUP_LABEL };
  }
  return { id: category.id, label: category.name };
}

export function buildDataSourceGroupsFromPromptCards(
  categories: PublicPromptCategory[],
  cardsByCategoryId: Record<string, HomePromptCard[]>,
): HomeCapabilityGroup[] {
  const groupsById = new Map<string, HomeCapabilityGroup>();
  const itemsByCapabilityId = new Map<string, HomeCapabilityItem>();
  const promptsByCapabilityId = new Map<string, Set<string>>();

  const addCapabilityItem = (
    category: PublicPromptCategory,
    rawId: string,
    prompt: string,
    labelOverride?: string,
  ) => {
    const rawCapabilityId = rawId.trim();
    const rawLabel = (labelOverride ?? capabilityLabelFromId(rawCapabilityId)).trim();
    const meta = staticCapabilityMeta(category.name, rawLabel || rawCapabilityId);
    const capabilityId = meta.id ?? rawCapabilityId;
    const label = meta.label ?? rawLabel;
    if (!capabilityId || !label) return null;

    let item = itemsByCapabilityId.get(capabilityId);
    if (!item) {
      const groupDescriptor = getDatasourceGroupDescriptor(category);
      const groupMeta = staticCapabilityMeta(groupDescriptor.label, "");
      let group = groupsById.get(groupDescriptor.id);
      if (!group) {
        group = {
          id: groupDescriptor.id,
          label: groupDescriptor.label,
          accent: groupMeta.accent,
          icon: groupMeta.icon,
          items: [],
        };
        groupsById.set(groupDescriptor.id, group);
      }

      item = {
        id: capabilityId,
        label: meta.label ?? label,
        promptHint: meta.promptHint ?? groupDescriptor.label,
        parentId: group.id,
        parentLabel: group.label,
        accent: meta.accent,
        icon: meta.icon,
        promptTemplate: meta.promptTemplate,
        promptTemplates: [...(meta.promptTemplates ?? [])],
      };
      itemsByCapabilityId.set(capabilityId, item);
      group.items.push(item);
    }

    if (prompt) {
      const existingPrompts = promptsByCapabilityId.get(capabilityId) ?? new Set<string>();
      if (!existingPrompts.has(prompt)) {
        existingPrompts.add(prompt);
        promptsByCapabilityId.set(capabilityId, existingPrompts);
        item.promptTemplates = [...(item.promptTemplates ?? []), prompt];
        item.promptTemplate ??= prompt;
      }
    }

    return item;
  };

  const nonScenarioCategories = categories.filter((category) => category.name !== SCENARIO_CATEGORY_NAME);
  const scenarioCategories = categories.filter((category) => category.name === SCENARIO_CATEGORY_NAME);
  const orderedCategories = [...nonScenarioCategories, ...scenarioCategories];

  orderedCategories.forEach((category) => {
    const cards = cardsByCategoryId[category.id] ?? [];
    for (const card of cards) {
      const prompt = card.prompt.trim();
      card.capabilityIds.forEach((rawId) => addCapabilityItem(category, rawId, prompt));
    }
  });

  orderedCategories.forEach((category) => {
    const cards = cardsByCategoryId[category.id] ?? [];
    for (const card of cards) {
      const prompt = card.prompt.trim();
      const currentItems = Array.from(itemsByCapabilityId.values());
      getUnmatchedDatasourceMentionBodies(prompt, currentItems).forEach((body) => {
        const label = capabilityLabelFromId(body);
        addCapabilityItem(category, `@${label}`, prompt, label);
      });
    }
  });

  const groupOrder = [
    COMMON_TOOL_GROUP_ID,
    ...categories
      .filter((category) => category.name !== SCENARIO_CATEGORY_NAME)
      .map((category) => category.id),
  ];

  return groupOrder
    .map((groupId) => groupsById.get(groupId))
    .filter((group): group is HomeCapabilityGroup => Boolean(group && group.items.length > 0));
}
