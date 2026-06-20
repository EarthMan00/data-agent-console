export type HomeCapabilityCategory = {
  id: string;
  label: string;
  accent: string;
  icon: string;
};

export type HomeCapabilityItem = HomeCapabilityCategory & {
  promptHint: string;
  promptTemplate?: string;
  promptTemplates?: string[];
  parentId: string;
  parentLabel: string;
};

export type HomeCapabilityGroup = HomeCapabilityCategory & {
  items: HomeCapabilityItem[];
};

export const scenariosCategory: HomeCapabilityCategory = {
  id: "scenarios",
  label: "应用场景",
  accent: "var(--color-accent-neutral)",
  icon: "grid",
};

let dataSourceGroups: HomeCapabilityGroup[] = [];
let dataSourceItems: HomeCapabilityItem[] = [];

export function setDataSourceMenu(groups: HomeCapabilityGroup[]) {
  dataSourceGroups = groups;
  dataSourceItems = groups.flatMap((group) => group.items);
}

export function getDataSourceGroups() {
  return dataSourceGroups;
}

export function getDataSourceItems() {
  return dataSourceItems;
}

export function getHomeCapabilityItem(id: string | null | undefined) {
  if (!id) return null;
  const normalized = id.trim();
  if (!normalized) return null;
  return (
    dataSourceItems.find((item) => item.id === normalized || item.label === normalized) ?? null
  );
}

export function getHomeCapabilityCategory(id: string | null | undefined) {
  if (!id) return null;
  if (id === scenariosCategory.id) return scenariosCategory;
  return dataSourceGroups.find((group) => group.id === id) ?? null;
}

export function getHomeCapabilityGroup(id: string | null | undefined) {
  if (!id) return null;
  const groupMatch = dataSourceGroups.find((group) => group.id === id);
  if (groupMatch) return groupMatch;
  const itemMatch = getHomeCapabilityItem(id);
  if (!itemMatch) return null;
  return dataSourceGroups.find((group) => group.id === itemMatch.parentId) ?? null;
}

export function getHomeCapabilityFilterIds(id: string | null | undefined) {
  if (!id || id === scenariosCategory.id) return [];
  const itemMatch = getHomeCapabilityItem(id);
  if (itemMatch) return [itemMatch.id];
  const groupMatch = dataSourceGroups.find((group) => group.id === id);
  return groupMatch ? groupMatch.items.map((item) => item.id) : [id];
}
