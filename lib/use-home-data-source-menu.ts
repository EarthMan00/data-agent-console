"use client";

import { useEffect, useMemo, useState } from "react";

import { fetchPublicPromptCategories } from "@/lib/agent-api/home-prompts";
import {
  buildDataSourceGroupsFromPromptCards,
  loadHomePromptCardsOnce,
} from "@/lib/home-prompt-data-sources";
import { type HomeCapabilityGroup, type HomeCapabilityItem } from "@/lib/home-capability-items";

type UseHomeDataSourceMenuOptions = {
  enabled?: boolean;
  logLabel?: string;
};

type UseHomeDataSourceMenuResult = {
  dataSourceGroups: HomeCapabilityGroup[];
  dataSourceItems: HomeCapabilityItem[];
  dynamicDataSourceGroups: HomeCapabilityGroup[];
  dynamicDataSourceItems: HomeCapabilityItem[];
  loaded: boolean;
};

type DataSourceMenuLoadResult = {
  key: string;
  groups: HomeCapabilityGroup[];
};

export function useHomeDataSourceMenu({
  enabled = true,
  logLabel = "[source-menu-capabilities]",
}: UseHomeDataSourceMenuOptions = {}): UseHomeDataSourceMenuResult {
  const [loadResult, setLoadResult] = useState<DataSourceMenuLoadResult | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    void fetchPublicPromptCategories()
      .then(async (categories) => {
        const entries = await Promise.all(
          categories.map(async (category) => {
            const cards = await loadHomePromptCardsOnce(`source-menu:cat:${category.id}`, category.id);
            return [category.id, cards] as const;
          }),
        );
        if (cancelled) return;
        const cardsByCategoryId = Object.fromEntries(entries);
        setLoadResult({
          key: logLabel,
          groups: buildDataSourceGroupsFromPromptCards(categories, cardsByCategoryId),
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.warn(logLabel, err);
        setLoadResult({ key: logLabel, groups: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, logLabel]);

  const dynamicDataSourceGroups = useMemo(
    () => (enabled && loadResult?.key === logLabel ? loadResult.groups : []),
    [enabled, loadResult, logLabel],
  );
  const loaded = !enabled || loadResult?.key === logLabel;

  const dynamicDataSourceItems = useMemo(
    () => dynamicDataSourceGroups.flatMap((group) => group.items),
    [dynamicDataSourceGroups],
  );

  return {
    dataSourceGroups: dynamicDataSourceGroups,
    dataSourceItems: dynamicDataSourceItems,
    dynamicDataSourceGroups,
    dynamicDataSourceItems,
    loaded,
  };
}
