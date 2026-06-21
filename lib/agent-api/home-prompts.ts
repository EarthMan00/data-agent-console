import { AgentApiError, readErrorResponseBody } from "@/lib/agent-api/client";
import { getAgentHttpApiBase } from "@/lib/agent-api/config";
import type { HomePromptRecommendationDto } from "@/lib/agent-api/types";

export type PublicPromptCategory = {
  id: string;
  name: string;
  sort_order: number;
};

let _categoriesPromise: Promise<PublicPromptCategory[]> | null = null;

/** 拉取公开的 Prompt 分类列表（自动去重：并发调用共享同一请求）。 */
export async function fetchPublicPromptCategories(): Promise<PublicPromptCategory[]> {
  if (_categoriesPromise) return _categoriesPromise;
  _categoriesPromise = _doFetchCategories();
  try {
    return await _categoriesPromise;
  } finally {
    _categoriesPromise = null;
  }
}

async function _doFetchCategories(): Promise<PublicPromptCategory[]> {
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

type FetchHomePromptRecommendationsOptions = {
  categoryId?: string;
  capabilityId?: string;
  capabilityIds?: string[];
};

/** 拉取首页推荐提示词；失败时抛出，由调用方展示错误。兼容旧签名与 capabilityIds 查询参数。 */
export async function fetchHomePromptRecommendations(
  categoryId: string,
  capabilityId?: string,
): Promise<HomePromptRecommendationDto[]>;
export async function fetchHomePromptRecommendations(
  options: FetchHomePromptRecommendationsOptions,
): Promise<HomePromptRecommendationDto[]>;
export async function fetchHomePromptRecommendations(
  categoryIdOrOptions: string | FetchHomePromptRecommendationsOptions,
  capabilityId?: string,
): Promise<HomePromptRecommendationDto[]> {
  const base = getAgentHttpApiBase();
  const params = new URLSearchParams();
  const categoryId =
    typeof categoryIdOrOptions === "string" ? categoryIdOrOptions : categoryIdOrOptions.categoryId?.trim() ?? "";
  const singleCapabilityId =
    typeof categoryIdOrOptions === "string"
      ? capabilityId?.trim() ?? ""
      : categoryIdOrOptions.capabilityId?.trim() ?? "";
  const capabilityIds =
    typeof categoryIdOrOptions === "string"
      ? []
      : (categoryIdOrOptions.capabilityIds ?? [])
          .map((item) => item.trim())
          .filter(Boolean);

  if (categoryId) params.set("category_id", categoryId);
  if (singleCapabilityId) params.set("capability_id", singleCapabilityId);
  for (const item of capabilityIds) params.append("capability_id", item);
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
