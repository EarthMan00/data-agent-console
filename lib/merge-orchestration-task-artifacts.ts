import { getTask, getToolOrchestration } from "@/lib/agent-api/client";
import type { SessionMessageItem, TaskResponse } from "@/lib/agent-api/types";
import type { PlatformSubtaskSnapshot, PlatformTaskArtifactRef, TaskExecutionStep } from "@/lib/agent-events";

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

/** 后端 key_hint 常为 `hash:os:xxx` 等内部标识，不宜用作 Sheet 展示名 */
export function isUnhelpfulApiTaskLabel(s: string): boolean {
  const t = (s ?? "").trim();
  if (!t) return true;
  if (/^hash:/i.test(t)) return true;
  if (/^hash:os:[a-f0-9]+$/i.test(t)) return true;
  if (/^os:[a-f0-9]+$/i.test(t)) return true;
  return false;
}

function labelForOrchestrationStep(task: TaskResponse, stepIndex: number): string {
  const hint = (task.key_hint ?? "").trim();
  if (hint && !isUnhelpfulApiTaskLabel(hint)) {
    return hint.length > 36 ? `${hint.slice(0, 33)}...` : hint;
  }
  const tn = (task.tool_name ?? "").trim();
  if (tn && !isUnhelpfulApiTaskLabel(tn)) {
    return tn.length > 36 ? `${tn.slice(0, 33)}...` : tn;
  }
  return `步骤 ${stepIndex + 1}`;
}

/** 底部 Sheet / 卡片：优先用拆解步骤文案，其次非鸡肋 API 字段，最后「步骤 N」 */
export function displayLabelForIndexedSubtask(
  stepIndex: number,
  fallbackLabel: string,
  executionSteps: TaskExecutionStep[] | null | undefined,
): string {
  const ordered = executionSteps?.length
    ? [...executionSteps].sort((a, b) => a.order - b.order)
    : [];
  const step = ordered[stepIndex];
  const stepLabel = step?.label?.replace(/^\d+[）.)]\s*/, "").trim() ?? "";
  if (stepLabel.length > 0) return stepLabel;
  if (!isUnhelpfulApiTaskLabel(fallbackLabel)) return fallbackLabel;
  return `步骤 ${stepIndex + 1}`;
}

export function enrichOrchestrationBundlesWithStepLabels(
  bundles: TaskOrchestrationBundleRow[],
  executionSteps: TaskExecutionStep[] | null | undefined,
): TaskOrchestrationBundleRow[] {
  if (!bundles.length) return bundles;
  return bundles.map((b) => {
    const label = displayLabelForIndexedSubtask(b.stepIndex, b.label, executionSteps);
    return label === b.label ? b : { ...b, label };
  });
}

/** 按子任务拆开的产物行，用于右侧多 sheet 与步骤卡片对齐 */
export type TaskOrchestrationBundleRow = {
  taskId: string;
  stepIndex: number;
  label: string;
  artifacts: PlatformTaskArtifactRef[];
};

/** 从历史消息里选「最全」的编排引用：避免命中仅含 task_id 的 task_execution_steps 导致只拉一步 */
export type OrchestrationAnchor = {
  messageId: string;
  primaryTaskId: string;
  bundleTaskIds: string[] | undefined;
  orchestrationId: string | null;
};

export function pickBestOrchestrationAnchor(messages: SessionMessageItem[]): OrchestrationAnchor | null {
  let best: OrchestrationAnchor | null = null;
  let bestScore = -1;

  for (const m of messages) {
    if (m.role !== "assistant") continue;
    const meta = m.meta && typeof m.meta === "object" ? (m.meta as Record<string, unknown>) : undefined;
    if (!meta) continue;

    const raw = Array.isArray(meta.orchestration_step_task_ids)
      ? (meta.orchestration_step_task_ids as unknown[])
      : [];
    const ids = raw.map((x) => (typeof x === "string" ? x.trim() : "")).filter((x) => x.length > 0);
    const tid = typeof meta.task_id === "string" ? meta.task_id.trim() : "";
    const orchId =
      typeof meta.orchestration_id === "string" && meta.orchestration_id.trim()
        ? meta.orchestration_id.trim()
        : null;

    if (!tid && ids.length === 0 && !orchId) continue;

    const primary = tid || ids[ids.length - 1] || "";
    if (!primary) continue;

    const kind = meta.kind;
    const isStepsProgressMeta = kind === "task_execution_steps";

    let score = ids.length;
    if (ids.length >= 2) score += 1000;
    else if (ids.length === 1) score += 100;
    else if (tid && !isStepsProgressMeta) score += 50;
    else if (tid && isStepsProgressMeta) score += 5;
    if (orchId) score += 2;

    /** 同分时用后出现的消息（更近的一轮编排） */
    if (score >= bestScore) {
      bestScore = score;
      best = {
        messageId: m.id,
        primaryTaskId: primary,
        bundleTaskIds: ids.length > 0 ? ids : undefined,
        orchestrationId: orchId,
      };
    }
  }

  return best;
}

export async function fetchTaskOrchestrationForResultPanel(
  token: string,
  primaryTaskId: string,
  bundleTaskIds: string[] | undefined,
  options?: { orchestrationId?: string | null },
): Promise<{
  bundles: TaskOrchestrationBundleRow[];
  mergedArtifacts: PlatformTaskArtifactRef[];
  finishedAt: string | null;
}> {
  let stepIds = dedupeOrchestrationTaskIds(primaryTaskId, bundleTaskIds);

  if (stepIds.length <= 1 && options?.orchestrationId) {
    const orch = await getToolOrchestration(token, options.orchestrationId);
    const fromOrch = orch.steps
      .map((s) => (s.task_id ?? "").trim())
      .filter((x) => x.length > 0);
    if (fromOrch.length > 0) {
      stepIds = dedupeOrchestrationTaskIds(fromOrch[fromOrch.length - 1]!, fromOrch);
    }
  }
  const bundles: TaskOrchestrationBundleRow[] = [];
  const mergedArtifacts: PlatformTaskArtifactRef[] = [];
  let finishedAt: string | null = null;

  for (let i = 0; i < stepIds.length; i++) {
    const id = stepIds[i]!;
    const task = await getTask(token, id);
    finishedAt = task.finished_at ?? finishedAt;
    const arts = (task.artifacts ?? []).map((a) => ({
      artifact_id: a.artifact_id,
      artifact_type: a.artifact_type,
      original_name: a.original_name,
      download_api: a.download_api,
    }));
    mergedArtifacts.push(...arts);
    bundles.push({
      taskId: id,
      stepIndex: i,
      label: labelForOrchestrationStep(task, i),
      artifacts: arts,
    });
  }

  return { bundles, mergedArtifacts, finishedAt };
}

export async function fetchArtifactsForResultPanel(
  token: string,
  primaryTaskId: string,
  bundleTaskIds: string[] | undefined,
): Promise<{ artifacts: PlatformTaskArtifactRef[]; finishedAt: string | null }> {
  const r = await fetchTaskOrchestrationForResultPanel(token, primaryTaskId, bundleTaskIds);
  return { artifacts: r.mergedArtifacts, finishedAt: r.finishedAt };
}

/**
 * 将 bundles 按 stepIndex 对齐到「按 order 排序后的」execution_steps：
 * 每一步一条快照，避免 buildPlatformStepTimeline 因缺索引而出现永久的「结果加载中」。
 */
export function mergeBundlesIntoPlatformSnapshots(
  executionSteps: TaskExecutionStep[],
  bundles: TaskOrchestrationBundleRow[],
): PlatformSubtaskSnapshot[] {
  const ordered = [...executionSteps].sort((a, b) => a.order - b.order);
  const bundleByIdx = new Map<number, TaskOrchestrationBundleRow>();
  for (const b of bundles) {
    bundleByIdx.set(b.stepIndex, b);
  }
  return ordered.map((step, i) => {
    const b = bundleByIdx.get(i);
    const rawLabel = step.label.replace(/^\d+[）.)]\s*/, "").trim();
    const outcome = step.status === "error" ? ("failed" as const) : ("success" as const);
    return {
      stepIndex: i,
      stepId: step.id,
      label: rawLabel.length > 0 ? rawLabel : (b?.label ?? `步骤 ${i + 1}`),
      taskId: b?.taskId ?? `__no_task_${step.id}`,
      outcome,
      taskStatus: step.status === "error" ? "FAILED" : "SUCCESS",
      artifacts: b?.artifacts ?? [],
      zipDownloadApi: null,
    };
  });
}
