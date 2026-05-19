import { AgentApiError } from "@/lib/agent-api/client";
import { getAgentHttpApiBase } from "@/lib/agent-api/config";
import type { HomePromptRecommendationDto } from "@/lib/agent-api/types";

/** 拉取首页推荐提示词；失败时抛出，由调用方展示错误。 */
export async function fetchHomePromptRecommendations(): Promise<HomePromptRecommendationDto[]> {
  const base = getAgentHttpApiBase();
  const res = await fetch(`${base}/api/home-prompt-recommendations`);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new AgentApiError("home prompt recommendations failed", res.status, data);
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
