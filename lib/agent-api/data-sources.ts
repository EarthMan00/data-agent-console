import { AgentApiError, readErrorResponseBody } from "@/lib/agent-api/client";
import { getAgentHttpApiBase } from "@/lib/agent-api/config";
import type { HomeCapabilityGroup, HomeCapabilityItem } from "@/lib/home-capability-items";

export type DataSourceGroupDto = {
  id: string;
  name: string;
  sort_order: number;
  icon: string;
  accent: string;
};

export type DataSourceToolDto = {
  id: string;
  category_id: string;
  category_name: string;
  label: string;
  prompt_hint: string;
  prompt_template: string | null;
  prompt_templates?: string[];
  icon: string;
  accent: string;
  sort_order: number;
};

function mapToolToItem(tool: DataSourceToolDto): HomeCapabilityItem {
  const templates = (tool.prompt_templates ?? [])
    .map((item) => item.trim())
    .filter(Boolean);
  const fallbackTemplate = tool.prompt_template?.trim() || undefined;
  const promptTemplates = templates.length > 0 ? templates : fallbackTemplate ? [fallbackTemplate] : undefined;
  const promptTemplate = promptTemplates?.[0];
  return {
    id: tool.id,
    label: tool.label,
    promptHint: tool.prompt_hint,
    promptTemplate,
    promptTemplates,
    parentId: tool.category_id,
    parentLabel: tool.category_name,
    icon: tool.icon,
    accent: tool.accent,
  };
}

export function buildDataSourceGroups(
  groups: DataSourceGroupDto[],
  tools: DataSourceToolDto[],
): HomeCapabilityGroup[] {
  const toolsByCategory = new Map<string, HomeCapabilityItem[]>();
  for (const tool of tools) {
    const item = mapToolToItem(tool);
    const bucket = toolsByCategory.get(tool.category_id) ?? [];
    bucket.push(item);
    toolsByCategory.set(tool.category_id, bucket);
  }

  return groups
    .map((group) => ({
      id: group.id,
      label: group.name,
      accent: group.accent,
      icon: group.icon,
      items: toolsByCategory.get(group.id) ?? [],
    }))
    .filter((group) => group.items.length > 0);
}

export async function fetchDataSourceGroups(): Promise<DataSourceGroupDto[]> {
  const base = getAgentHttpApiBase();
  const res = await fetch(`${base}/api/data-source-groups`, { cache: "no-store" });
  const data = await readErrorResponseBody(res);
  if (!res.ok) {
    throw new AgentApiError("fetch data source groups failed", res.status, data);
  }
  if (!data || typeof data !== "object" || !Array.isArray((data as { groups?: unknown }).groups)) {
    throw new AgentApiError("invalid data source groups response", res.status, data);
  }
  const out: DataSourceGroupDto[] = [];
  for (const raw of (data as { groups: unknown[] }).groups) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : "";
    const name = typeof row.name === "string" ? row.name : "";
    if (!id || !name) continue;
    out.push({
      id,
      name,
      sort_order: typeof row.sort_order === "number" ? row.sort_order : 0,
      icon: typeof row.icon === "string" ? row.icon : "grid",
      accent: typeof row.accent === "string" ? row.accent : "var(--color-accent-neutral)",
    });
  }
  return out;
}

export async function fetchDataSourceTools(categoryId?: string): Promise<DataSourceToolDto[]> {
  const base = getAgentHttpApiBase();
  const params = new URLSearchParams();
  if (categoryId?.trim()) params.set("category_id", categoryId.trim());
  const qs = params.toString();
  const res = await fetch(`${base}/api/data-source-tools${qs ? `?${qs}` : ""}`, { cache: "no-store" });
  const data = await readErrorResponseBody(res);
  if (!res.ok) {
    throw new AgentApiError("fetch data source tools failed", res.status, data);
  }
  if (!data || typeof data !== "object" || !Array.isArray((data as { items?: unknown }).items)) {
    throw new AgentApiError("invalid data source tools response", res.status, data);
  }
  const out: DataSourceToolDto[] = [];
  for (const raw of (data as { items: unknown[] }).items) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : "";
    const category_id = typeof row.category_id === "string" ? row.category_id : "";
    const category_name = typeof row.category_name === "string" ? row.category_name : "";
    const label = typeof row.label === "string" ? row.label : "";
    if (!id || !category_id || !label) continue;
    out.push({
      id,
      category_id,
      category_name,
      label,
      prompt_hint: typeof row.prompt_hint === "string" ? row.prompt_hint : "",
      prompt_template: typeof row.prompt_template === "string" ? row.prompt_template : null,
      prompt_templates: Array.isArray(row.prompt_templates)
        ? row.prompt_templates.filter((item): item is string => typeof item === "string")
        : [],
      icon: typeof row.icon === "string" ? row.icon : "grid",
      accent: typeof row.accent === "string" ? row.accent : "var(--color-accent-neutral)",
      sort_order: typeof row.sort_order === "number" ? row.sort_order : 0,
    });
  }
  return out;
}

/** 拉取完整 @数据源 菜单（分组 + 工具）。 */
export async function fetchDataSourceMenu(): Promise<HomeCapabilityGroup[]> {
  const [groups, tools] = await Promise.all([fetchDataSourceGroups(), fetchDataSourceTools()]);
  return buildDataSourceGroups(groups, tools);
}

/** 按分组拉取工具列表。 */
export async function fetchDataSourceToolsByGroup(categoryId: string): Promise<HomeCapabilityItem[]> {
  const tools = await fetchDataSourceTools(categoryId);
  return tools.map(mapToolToItem);
}
