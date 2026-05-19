import { AgentApiError } from "@/lib/agent-api/client";
import { getAgentHttpApiBase } from "@/lib/agent-api/config";

export type PublicShareReplayDto = {
  share_id: string;
  title: string;
  objective: string;
  description: string;
  meta: string;
  capability_ids: string[];
  replay_run_id: string | null;
};

export async function fetchPublicShare(shareId: string): Promise<PublicShareReplayDto> {
  const id = (shareId || "").trim();
  if (!id) {
    throw new AgentApiError("share id required", 400, null);
  }
  const base = getAgentHttpApiBase();
  const res = await fetch(`${base}/api/public/shares/${encodeURIComponent(id)}`);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new AgentApiError("share not found", res.status, data);
  }
  if (!data || typeof data !== "object") {
    throw new AgentApiError("invalid share response", res.status, data);
  }
  const o = data as Record<string, unknown>;
  const share_id = typeof o.share_id === "string" ? o.share_id : id;
  const title = typeof o.title === "string" ? o.title : "";
  const objective = typeof o.objective === "string" ? o.objective : "";
  if (!title || !objective) {
    throw new AgentApiError("invalid share payload", res.status, data);
  }
  return {
    share_id,
    title,
    objective,
    description: typeof o.description === "string" ? o.description : "",
    meta: typeof o.meta === "string" ? o.meta : "",
    capability_ids: Array.isArray(o.capability_ids)
      ? o.capability_ids.filter((x): x is string => typeof x === "string")
      : [],
    replay_run_id: typeof o.replay_run_id === "string" ? o.replay_run_id : null,
  };
}
