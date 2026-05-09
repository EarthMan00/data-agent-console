import { getTask } from "@/lib/agent-api/client";
import type { PlatformTaskArtifactRef } from "@/lib/agent-events";

/** 编排消息里 step0..stepN-1 的顺序；合并时保持该顺序，使「后执行的子任务」产物在列表末尾 → sheet 排序更靠前。 */
export function dedupeOrchestrationTaskIds(primaryTaskId: string, bundleTaskIds: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const candidates =
    bundleTaskIds && bundleTaskIds.some((x) => (x || "").trim()) ? bundleTaskIds : [primaryTaskId];
  for (const x of candidates) {
    const id = (x || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  if (out.length === 0 && primaryTaskId.trim()) {
    out.push(primaryTaskId.trim());
  }
  return out;
}

export async function fetchArtifactsForResultPanel(
  token: string,
  primaryTaskId: string,
  bundleTaskIds: string[] | undefined,
): Promise<{ artifacts: PlatformTaskArtifactRef[]; finishedAt: string | null }> {
  const stepIds = dedupeOrchestrationTaskIds(primaryTaskId, bundleTaskIds);
  const artifacts: PlatformTaskArtifactRef[] = [];
  let finishedAt: string | null = null;

  for (const id of stepIds) {
    const task = await getTask(token, id);
    finishedAt = task.finished_at ?? finishedAt;
    for (const a of task.artifacts ?? []) {
      artifacts.push({
        artifact_id: a.artifact_id,
        artifact_type: a.artifact_type,
        original_name: a.original_name,
        download_api: a.download_api,
      });
    }
  }

  return { artifacts, finishedAt };
}
