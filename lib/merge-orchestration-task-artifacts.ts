import { AgentApiError, getTask, getToolOrchestration } from "@/lib/agent-api/client";
import type { SessionMessageItem, TaskResponse } from "@/lib/agent-api/types";
import type { PlatformSubtaskSnapshot, PlatformTaskArtifactRef, TaskExecutionStep } from "@/lib/agent-events";
import { isTaskInFlight } from "@/lib/task-status-poll";

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
  if (/^run_(?:linkfox|chatexcel)_task$/i.test(t)) return true;
  return false;
}

function labelForOrchestrationStep(task: TaskResponse, stepIndex: number): string {
  const hint = (task.key_hint ?? "").trim();
  if (hint && !isUnhelpfulApiTaskLabel(hint)) {
    return hint.length > 36 ? `${hint.slice(0, 33)}...` : hint;
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
  /** 子任务平台状态；用于区分「已有产物但仍在执行」与真正完成。 */
  taskStatus?: string;
  finishedAt?: string | null;
};

/** 从历史消息里选「最全」的编排引用：避免命中仅含 task_id 的 task_execution_steps 导致只拉一步 */
export type OrchestrationAnchor = {
  messageId: string;
  primaryTaskId: string;
  bundleTaskIds: string[] | undefined;
  orchestrationId: string | null;
};

/** 右侧结果面板：按用户点中的单条消息隔离，不复用会话级最新 anchor */
export type ResultPanelContext = {
  sourceMessageId: string | null;
  primaryTaskId: string;
  bundles: TaskOrchestrationBundleRow[];
  finishedAt: string | null;
  errorMessage: string | null;
  lastStatus: string | null;
  bundleDownloadApi: string | null;
  bundleDownloadName: string | null;
  focusedSubtaskId: string | null;
};

export type PanelOrchestrationAnchor = {
  primaryTaskId: string;
  bundleTaskIds: string[] | undefined;
  orchestrationId: string | null;
};

/**
 * 从单条消息的 meta 中解析编排 anchor，不扫描全 session。
 * 用于 per-message bundles 加载，使每轮独立获取自己的产物。
 */
export function resolveOrchestrationAnchorFromMessageMeta(
  meta: Record<string, unknown> | undefined,
): { primaryTaskId: string; bundleTaskIds: string[]; orchestrationId: string | null } | null {
  if (!meta) return null;
  const raw = Array.isArray(meta.orchestration_step_task_ids)
    ? (meta.orchestration_step_task_ids as unknown[])
    : [];
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids = raw
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => x.length > 0 && UUID_RE.test(x));
  const tid = typeof meta.task_id === "string" && UUID_RE.test(meta.task_id.trim())
    ? meta.task_id.trim()
    : "";
  const orchId =
    typeof meta.orchestration_id === "string" && meta.orchestration_id.trim()
      ? meta.orchestration_id.trim()
      : null;
  const primary = tid || ids[ids.length - 1] || "";
  if (!primary) return null;
  return {
    primaryTaskId: primary,
    bundleTaskIds: ids.length > 0 ? ids : [primary],
    orchestrationId: orchId,
  };
}

/**
 * 从单条消息 meta 解析面板 anchor；不回退到会话级最新编排。
 * 用于历史回放点击某轮任务卡 / 步骤结果卡。
 */
export function resolveAnchorForPanelFromMessageMeta(
  meta: Record<string, unknown> | undefined,
): PanelOrchestrationAnchor | null {
  const fromOrch = resolveOrchestrationAnchorFromMessageMeta(meta);
  if (fromOrch) {
    return {
      primaryTaskId: fromOrch.primaryTaskId,
      bundleTaskIds: fromOrch.bundleTaskIds.length > 0 ? fromOrch.bundleTaskIds : undefined,
      orchestrationId: fromOrch.orchestrationId,
    };
  }
  const tid = typeof meta?.task_id === "string" ? meta.task_id.trim() : "";
  if (!tid) return null;
  return {
    primaryTaskId: tid,
    bundleTaskIds: undefined,
    orchestrationId: null,
  };
}

const ORCHESTRATION_TASK_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function orchestrationStepTaskIdsFromMeta(meta: Record<string, unknown>): string[] {
  const raw = Array.isArray(meta.orchestration_step_task_ids)
    ? (meta.orchestration_step_task_ids as unknown[])
    : [];
  return raw
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => x.length > 0 && ORCHESTRATION_TASK_ID_RE.test(x));
}

/**
 * 历史回放：task_execution_steps 消息 meta 通常只有单个 task_id；
 * 从同 orchestration 的完成消息补全 orchestration_step_task_ids。
 */
export function resolvePanelAnchorForStepsMessage(
  messages: SessionMessageItem[],
  stepsMeta: Record<string, unknown> | undefined,
): PanelOrchestrationAnchor | null {
  const direct = resolveAnchorForPanelFromMessageMeta(stepsMeta);
  if (!direct) return null;
  if (direct.bundleTaskIds && direct.bundleTaskIds.length >= 2) return direct;

  const orchId =
    typeof stepsMeta?.orchestration_id === "string" ? stepsMeta.orchestration_id.trim() : "";
  const stepsTaskId = typeof stepsMeta?.task_id === "string" ? stepsMeta.task_id.trim() : "";

  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role !== "assistant") continue;
    const meta = m.meta && typeof m.meta === "object" ? (m.meta as Record<string, unknown>) : undefined;
    if (!meta) continue;

    if (orchId) {
      const metaOrchId = typeof meta.orchestration_id === "string" ? meta.orchestration_id.trim() : "";
      if (metaOrchId !== orchId) continue;
    } else if (stepsTaskId) {
      const metaTaskId = typeof meta.task_id === "string" ? meta.task_id.trim() : "";
      const ids = orchestrationStepTaskIdsFromMeta(meta);
      if (metaTaskId !== stepsTaskId && !ids.includes(stepsTaskId)) continue;
    } else {
      continue;
    }

    const ids = orchestrationStepTaskIdsFromMeta(meta);
    if (ids.length < 2) continue;

    const tid =
      typeof meta.task_id === "string" && ORCHESTRATION_TASK_ID_RE.test(meta.task_id.trim())
        ? meta.task_id.trim()
        : ids[ids.length - 1]!;
    const metaOrchId =
      typeof meta.orchestration_id === "string" && meta.orchestration_id.trim()
        ? meta.orchestration_id.trim()
        : orchId || null;

    return {
      primaryTaskId: tid,
      bundleTaskIds: ids,
      orchestrationId: metaOrchId,
    };
  }

  return direct;
}

function bundleTaskSnapshot(bundle: TaskOrchestrationBundleRow): TaskResponse | null {
  if (!bundle.taskStatus) return null;
  return {
    task_id: bundle.taskId,
    tool_name: "",
    status: bundle.taskStatus,
    finished_at: bundle.finishedAt ?? null,
  };
}

function resolvedStepStatusFromBundleTask(bundle: TaskOrchestrationBundleRow): TaskExecutionStep["status"] | null {
  const snapshot = bundleTaskSnapshot(bundle);
  if (!snapshot || isTaskInFlight(snapshot)) return null;
  const s = (snapshot.status || "").toUpperCase();
  if (s === "SUCCESS" || s === "SUCCEEDED") return "done";
  if (s === "FAILED" || s === "CANCELLED" || s === "CANCEL" || s === "TIMEOUT" || s === "ERROR") {
    return "error";
  }
  return null;
}

/** 历史时间线：步骤 meta 未全部终态时，按已结束子任务的 bundle 推断 done，以渲染可点的结果卡。 */
export function alignStepStatusesWithOrchestrationBundles(
  steps: TaskExecutionStep[],
  bundles: TaskOrchestrationBundleRow[],
  expectedTaskIds?: string[] | null,
): TaskExecutionStep[] {
  if (steps.length === 0 || bundles.length === 0) return steps;
  if (steps.every((s) => s.status === "done" || s.status === "error")) return steps;
  const expected = new Set((expectedTaskIds ?? []).map((id) => id.trim()).filter(Boolean));
  if (expected.size > 0 && !bundles.some((bundle) => expected.has(bundle.taskId))) {
    return steps;
  }

  const bundleByIdx = new Map<number, TaskOrchestrationBundleRow>();
  for (const b of bundles) {
    bundleByIdx.set(b.stepIndex, b);
  }
  const ordered = [...steps].sort((a, b) => a.order - b.order);
  return ordered.map((step, i) => {
    const b = bundleByIdx.get(i);
    if (!b?.taskId || b.taskId.startsWith("__no_task_")) return step;
    if (step.status === "pending" || step.status === "running") {
      const resolved = resolvedStepStatusFromBundleTask(b);
      return resolved ? { ...step, status: resolved } : step;
    }
    return step;
  });
}

export function buildPlatformSubtasksForExecutionSteps(
  executionSteps: TaskExecutionStep[],
  bundles: TaskOrchestrationBundleRow[],
): PlatformSubtaskSnapshot[] {
  const aligned = alignStepStatusesWithOrchestrationBundles(executionSteps, bundles);
  return mergeBundlesIntoPlatformSnapshots(aligned, bundles);
}

export function buildBundleDownloadApiForPanel(
  primaryTaskId: string,
  bundleTaskIds: string[] | undefined,
): { api: string; name: string | null } {
  const ids = (bundleTaskIds ?? []).map((x) => (x || "").trim()).filter(Boolean);
  if (ids.length > 0) {
    return {
      api: `/api/tasks/download?${ids.map((id) => `task_ids=${encodeURIComponent(id)}`).join("&")}`,
      name: ids.length > 1 ? `${primaryTaskId}.zip` : null,
    };
  }
  return {
    api: `/api/tasks/${encodeURIComponent(primaryTaskId)}/download`,
    name: null,
  };
}

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
  options?: { orchestrationId?: string | null; expandOrchestration?: boolean },
): Promise<{
  bundles: TaskOrchestrationBundleRow[];
  mergedArtifacts: PlatformTaskArtifactRef[];
  finishedAt: string | null;
  errorMessage: string | null;
  lastStatus: string | null;
}> {
  let stepIds = dedupeOrchestrationTaskIds(primaryTaskId, bundleTaskIds);

  const mayExpandOrch = options?.expandOrchestration !== false;
  if (stepIds.length <= 1 && options?.orchestrationId && mayExpandOrch) {
    try {
      const orch = await getToolOrchestration(token, options.orchestrationId);
      const fromOrch = orch.steps
        .map((s) => (s.task_id ?? "").trim())
        .filter((x) => x.length > 0);
      if (fromOrch.length > 0) {
        stepIds = dedupeOrchestrationTaskIds(fromOrch[fromOrch.length - 1]!, fromOrch);
      }
    } catch (e) {
      // 编排仅存进程内存，服务重启后 404；继续用 message 里已有的 task_id / bundle
      if (!(e instanceof AgentApiError && e.status === 404)) {
        throw e;
      }
    }
  }
  const bundles: TaskOrchestrationBundleRow[] = [];
  const mergedArtifacts: PlatformTaskArtifactRef[] = [];
  let finishedAt: string | null = null;
  let errorMessage: string | null = null;
  let lastStatus: string | null = null;

  for (let i = 0; i < stepIds.length; i++) {
    const id = stepIds[i]!;
    const task = await getTask(token, id);
    finishedAt = task.finished_at ?? finishedAt;
    lastStatus = task.status ?? lastStatus;
    if ((task.error_message ?? "").trim()) {
      errorMessage = task.error_message!;
    }
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
      taskStatus: task.status,
      finishedAt: task.finished_at ?? null,
    });
  }

  return { bundles, mergedArtifacts, finishedAt, errorMessage, lastStatus };
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
