import {
  RoundEventGapError,
  type ChatRoundEvent,
  type ChatRoundSnapshot,
  type ChatRoundStatus,
  type ChatRoundStep,
} from "@/lib/agent-api/types";

const ROUND_STATUSES = new Set<ChatRoundStatus>([
  "QUEUED",
  "PLANNING",
  "GENERATING",
  "EXECUTING",
  "WAITING_INPUT",
  "CANCEL_REQUESTED",
  "SUCCEEDED",
  "PARTIAL_SUCCESS",
  "FAILED",
  "CANCELLED",
]);

const STEP_STATUSES = new Set<ChatRoundStep["status"]>([
  "PENDING",
  "RUNNING",
  "WAITING_INPUT",
  "SUCCESS",
  "FAILED",
  "CANCELLED",
  "SKIPPED",
]);

const ROUND_FIELD_EVENTS = new Set([
  "round.planning",
  "round.generating",
  "round.executing",
  "round.waiting_input",
  "round.resumed",
  "round.cancel_requested",
  "round.cancelled",
  "round.completed",
  "round.failed",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function publicStatus(value: unknown): ChatRoundStatus | null {
  return typeof value === "string" && ROUND_STATUSES.has(value as ChatRoundStatus)
    ? (value as ChatRoundStatus)
    : null;
}

function publicStepStatus(value: unknown): ChatRoundStep["status"] | null {
  return typeof value === "string" && STEP_STATUSES.has(value as ChatRoundStep["status"])
    ? (value as ChatRoundStep["status"])
    : null;
}

function publicArtifacts(value: unknown): ChatRoundStep["artifacts"] | null {
  if (!Array.isArray(value)) return null;
  const artifacts: ChatRoundStep["artifacts"] = [];
  for (const raw of value) {
    if (!isObject(raw)) return null;
    const { artifact_id, artifact_type, original_name, download_api } = raw;
    if (
      typeof artifact_id !== "string" ||
      typeof artifact_type !== "string" ||
      typeof original_name !== "string" ||
      typeof download_api !== "string"
    ) {
      return null;
    }
    artifacts.push({ artifact_id, artifact_type, original_name, download_api });
  }
  return artifacts;
}

function plannedSteps(value: unknown): ChatRoundStep[] | null {
  if (!Array.isArray(value)) return null;
  const steps: ChatRoundStep[] = [];
  for (const [stepIndex, raw] of value.entries()) {
    if (!isObject(raw)) return null;
    const stepId = raw.step_id;
    const label = raw.label;
    const status = publicStepStatus(raw.status);
    if (typeof stepId !== "string" || typeof label !== "string" || !status) return null;
    steps.push({
      step_id: stepId,
      step_index: stepIndex,
      label,
      status,
      task_id: null,
      artifacts: [],
      evidence: null,
      error_code: null,
      error_message: null,
    });
  }
  return steps;
}

function payloadString(
  payload: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
}

function updateRoundFields(
  snapshot: ChatRoundSnapshot,
  payload: Record<string, unknown>,
): ChatRoundSnapshot {
  const status = publicStatus(payload.status);
  const content = payloadString(payload, "content");
  const errorCode = payload.error_code;
  const errorMessage = payload.error_message ?? payload.message;
  return {
    ...snapshot,
    ...(status ? { status } : {}),
    ...(content !== undefined ? { content } : {}),
    ...(errorCode === null || typeof errorCode === "string"
      ? { error_code: errorCode }
      : {}),
    ...(errorMessage === null || typeof errorMessage === "string"
      ? { error_message: errorMessage }
      : {}),
  };
}

function updateStep(
  snapshot: ChatRoundSnapshot,
  payload: Record<string, unknown>,
): ChatRoundSnapshot {
  const stepId = payload.step_id;
  if (typeof stepId !== "string") return snapshot;
  const index = snapshot.steps.findIndex((step) => step.step_id === stepId);
  if (index < 0) return snapshot;

  const current = snapshot.steps[index];
  const status = publicStepStatus(payload.status);
  const label = payloadString(payload, "label");
  const taskId = payload.task_id;
  const artifacts = publicArtifacts(payload.artifacts);
  const evidence = payload.evidence;
  const errorCode = payload.error_code;
  const errorMessage = payload.error_message ?? payload.message;
  const next: ChatRoundStep = {
    ...current,
    ...(status ? { status } : {}),
    ...(label !== undefined ? { label } : {}),
    ...(taskId === null || typeof taskId === "string" ? { task_id: taskId } : {}),
    ...(artifacts ? { artifacts } : {}),
    ...(evidence === null || isObject(evidence) ? { evidence } : {}),
    ...(errorCode === null || typeof errorCode === "string"
      ? { error_code: errorCode }
      : {}),
    ...(errorMessage === null || typeof errorMessage === "string"
      ? { error_message: errorMessage }
      : {}),
  };
  const steps = [...snapshot.steps];
  steps[index] = next;
  return { ...snapshot, steps };
}

function reduceKnownEvent(
  snapshot: ChatRoundSnapshot,
  event: ChatRoundEvent,
): ChatRoundSnapshot {
  if (event.event_type === "assistant.reset") {
    return { ...snapshot, content: "" };
  }
  if (event.event_type === "assistant.delta" || event.event_type === "assistant.final") {
    const content = payloadString(event.payload, "content");
    return content === undefined ? snapshot : { ...snapshot, content };
  }
  if (event.event_type === "plan.ready") {
    const steps = plannedSteps(event.payload.steps);
    return steps === null ? snapshot : { ...snapshot, steps };
  }
  if (event.event_type.startsWith("step.")) {
    return updateStep(snapshot, event.payload);
  }
  if (ROUND_FIELD_EVENTS.has(event.event_type)) {
    return updateRoundFields(snapshot, event.payload);
  }
  return snapshot;
}

export function applyRoundEvent(
  snapshot: ChatRoundSnapshot,
  event: ChatRoundEvent,
): ChatRoundSnapshot {
  if (event.round_id !== snapshot.round_id) {
    throw new Error("round event does not match snapshot");
  }
  if (event.seq <= snapshot.last_event_seq) return snapshot;
  if (event.seq !== snapshot.last_event_seq + 1) {
    throw new RoundEventGapError(snapshot.last_event_seq + 1, event.seq);
  }
  return { ...reduceKnownEvent(snapshot, event), last_event_seq: event.seq };
}
