import { AgentApiError, readErrorResponseBody } from "@/lib/agent-api/client";
import { getAgentHttpApiBase } from "@/lib/agent-api/config";
import type { HomePromptRecommendationDto } from "@/lib/agent-api/types";

export type PublicPromptCategory = {
  id: string;
  name: string;
  sort_order: number;
};

/** 拉取公开的 Prompt 分类列表。 */
export async function fetchPublicPromptCategories(): Promise<PublicPromptCategory[]> {
  const base = getAgentHttpApiBase();
  const res = await fetch(`${base}/api/prompt-categories`);
  const data = await readErrorResponseBody(res);
  if (!res.ok) {
    throw new AgentApiError("fetch prompt categories failed", res.status, data);
  }
  if (!data || typeof data !== "object" || !Array.isArray((data as { categories?: unknown }).categories)) {
    throw new AgentApiError("invalid prompt categories response", res.status, data);
  }
  const out: PublicPromptCategory[] = [];
  for (const raw of (data as { categories: unknown[] }).categories) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    const name = typeof o.name === "string" ? o.name : "";
    if (!id || !name) continue;
    out.push({
      id,
      name,
      sort_order: typeof o.sort_order === "number" ? o.sort_order : 0,
    });
  }
  return out;
}

/** 拉取首页推荐提示词；失败时抛出，由调用方展示错误。capabilityId 可为逗号分隔多个 ID。categoryId 必填。 */
export async function fetchHomePromptRecommendations(categoryId: string, capabilityId?: string): Promise<HomePromptRecommendationDto[]> {
  const base = getAgentHttpApiBase();
  const params = new URLSearchParams();
  params.set("category_id", categoryId);
  if (capabilityId) params.set("capability_id", capabilityId);
  const qs = params.toString();
  const res = await fetch(`${base}/api/home-prompt-recommendations${qs ? `?${qs}` : ""}`);
  const data = await readErrorResponseBody(res);
  if (!res.ok) {
    const detail =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as { _nonJsonBody?: string; detail?: string })._nonJsonBody ||
          (data as { detail?: string }).detail
        : null;
    throw new AgentApiError(
      detail
        ? `home prompt recommendations failed: ${String(detail).slice(0, 200)}`
        : "home prompt recommendations failed",
      res.status,
      data,
    );
  }
  if (!data || typeof data !== "object" || !Array.isArray((data as { items?: unknown }).items)) {
    throw new AgentApiError("invalid home prompt recommendations response", res.status, data);
  }
  const out: HomePromptRecommendationDto[] = [];
  for (const raw of (data as { items: unknown[] }).items) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    const title = typeof o.title === "string" ? o.title : "";
    const description = typeof o.description === "string" ? o.description : "";
    const prompt = typeof o.prompt === "string" ? o.prompt : "";
    if (!id || !title || !prompt) continue;
    const meta = typeof o.meta === "string" ? o.meta : "";
    const capability_ids = Array.isArray(o.capability_ids)
      ? o.capability_ids.filter((x): x is string => typeof x === "string")
      : [];
    out.push({
      id,
      title,
      description,
      prompt,
      meta,
      capability_ids,
      replay_run_id: typeof o.replay_run_id === "string" ? o.replay_run_id : null,
      replay_share_id: typeof o.replay_share_id === "string" ? o.replay_share_id : null,
      sort_order: typeof o.sort_order === "number" ? o.sort_order : 0,
    });
  }
  return out;
}
