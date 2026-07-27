import {
  AgentApiError,
  readErrorResponseBody,
  uploadSessionAttachments,
} from "@/lib/agent-api/client";
import { getAgentHttpApiBase } from "@/lib/agent-api/config";
import type {
  ChatRoundEvent,
  ChatRoundSnapshot,
  ChatRoundStatus,
  ChatRoundStep,
  RoundAccepted,
} from "@/lib/agent-api/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getAgentHttpApiBase()}${normalized}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function isRoundStatus(value: unknown): value is ChatRoundStatus {
  return typeof value === "string" && ROUND_STATUSES.has(value as ChatRoundStatus);
}

function isStepStatus(value: unknown): value is ChatRoundStep["status"] {
  return typeof value === "string" && STEP_STATUSES.has(value as ChatRoundStep["status"]);
}

function isEventSeq(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value >= 1;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function invalidShape(label: string, status: number, body: unknown): never {
  throw new AgentApiError(`invalid ${label} response shape`, status, body);
}

async function responseJson(response: Response): Promise<unknown> {
  return readErrorResponseBody(response);
}

async function checkedJson(response: Response, label: string): Promise<unknown> {
  const body = await responseJson(response);
  if (!response.ok) {
    throw new AgentApiError(`${label} failed`, response.status, body);
  }
  return body;
}

function parseRoundAccepted(body: unknown, status: number, label: string): RoundAccepted {
  if (!isObject(body)) invalidShape(label, status, body);
  const { session_id, round_id, assistant_message_id, status: roundStatus, last_event_seq } = body;
  if (
    !isUuid(session_id) ||
    !isUuid(round_id) ||
    !isUuid(assistant_message_id) ||
    !isRoundStatus(roundStatus) ||
    !isEventSeq(last_event_seq)
  ) {
    invalidShape(label, status, body);
  }
  return {
    session_id,
    round_id,
    assistant_message_id,
    status: roundStatus,
    last_event_seq,
  };
}

function parseArtifact(value: unknown): ChatRoundStep["artifacts"][number] | null {
  if (!isObject(value)) return null;
  const { artifact_id, artifact_type, original_name, download_api } = value;
  if (
    !isUuid(artifact_id) ||
    typeof artifact_type !== "string" ||
    typeof original_name !== "string" ||
    typeof download_api !== "string"
  ) {
    return null;
  }
  return { artifact_id, artifact_type, original_name, download_api };
}

function parseStep(value: unknown): ChatRoundStep | null {
  if (!isObject(value)) return null;
  const {
    step_id,
    step_index,
    label,
    status,
    task_id,
    artifacts,
    evidence,
    error_code,
    error_message,
  } = value;
  if (
    typeof step_id !== "string" ||
    !step_id ||
    !Number.isSafeInteger(step_index) ||
    typeof step_index !== "number" ||
    step_index < 0 ||
    typeof label !== "string" ||
    !isStepStatus(status) ||
    !(task_id === null || isUuid(task_id)) ||
    !Array.isArray(artifacts) ||
    !(evidence === null || isObject(evidence)) ||
    !isNullableString(error_code) ||
    !isNullableString(error_message)
  ) {
    return null;
  }
  const parsedArtifacts = artifacts.map(parseArtifact);
  if (parsedArtifacts.some((artifact) => artifact === null)) return null;
  return {
    step_id,
    step_index,
    label,
    status,
    task_id,
    artifacts: parsedArtifacts as ChatRoundStep["artifacts"],
    evidence,
    error_code,
    error_message,
  };
}

function parseRoundSnapshot(body: unknown, status: number, label: string): ChatRoundSnapshot {
  if (!isObject(body)) invalidShape(label, status, body);
  const {
    round_id,
    session_id,
    status: roundStatus,
    assistant_message_id,
    content,
    last_event_seq,
    steps,
    error_code,
    error_message,
  } = body;
  if (
    !isUuid(round_id) ||
    !isUuid(session_id) ||
    !isRoundStatus(roundStatus) ||
    !isUuid(assistant_message_id) ||
    typeof content !== "string" ||
    !isEventSeq(last_event_seq) ||
    !Array.isArray(steps) ||
    !isNullableString(error_code) ||
    !isNullableString(error_message)
  ) {
    invalidShape(label, status, body);
  }
  const parsedSteps = steps.map(parseStep);
  if (parsedSteps.some((step) => step === null)) invalidShape(label, status, body);
  return {
    round_id,
    session_id,
    status: roundStatus,
    assistant_message_id,
    content,
    last_event_seq,
    steps: parsedSteps as ChatRoundStep[],
    error_code,
    error_message,
  };
}

async function acceptedResponse(response: Response, label: string): Promise<RoundAccepted> {
  const body = await checkedJson(response, label);
  if (response.status !== 202) {
    throw new AgentApiError(`${label} expected HTTP 202`, response.status, body);
  }
  return parseRoundAccepted(body, response.status, label);
}

export async function createInitialChatRound(
  accessToken: string,
  message: string,
  clientMessageId: string,
  files: File[] = [],
): Promise<RoundAccepted> {
  const form = new FormData();
  form.append("message", message);
  form.append("client_message_id", clientMessageId);
  for (const file of files) form.append("files", file, file.name);

  const response = await fetch(apiUrl("/api/chat/rounds"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Request-ID": clientMessageId,
    },
    body: form,
  });
  return acceptedResponse(response, "create chat round");
}

export async function createChatRound(
  accessToken: string,
  sessionId: string,
  message: string,
  clientMessageId: string,
  files: File[] = [],
): Promise<RoundAccepted> {
  const attachments = await uploadSessionAttachments(accessToken, sessionId, files);
  const response = await fetch(apiUrl(`/api/chat/${encodeURIComponent(sessionId)}/rounds`), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Request-ID": clientMessageId,
    },
    body: JSON.stringify({
      message,
      client_message_id: clientMessageId,
      attachment_ids: attachments.map((attachment) => attachment.attachment_id),
    }),
  });
  return acceptedResponse(response, "create chat round");
}

export async function getChatRound(
  accessToken: string,
  roundId: string,
): Promise<ChatRoundSnapshot> {
  const response = await fetch(apiUrl(`/api/chat/rounds/${encodeURIComponent(roundId)}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await checkedJson(response, "get chat round");
  return parseRoundSnapshot(body, response.status, "get chat round");
}

export async function cancelChatRound(
  accessToken: string,
  roundId: string,
): Promise<ChatRoundSnapshot> {
  const response = await fetch(
    apiUrl(`/api/chat/rounds/${encodeURIComponent(roundId)}/cancel`),
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  const body = await checkedJson(response, "cancel chat round");
  return parseRoundSnapshot(body, response.status, "cancel chat round");
}

export async function resumeChatRound(
  accessToken: string,
  roundId: string,
  message: string,
  clientMessageId: string,
): Promise<RoundAccepted> {
  const response = await fetch(
    apiUrl(`/api/chat/rounds/${encodeURIComponent(roundId)}/resume`),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Request-ID": clientMessageId,
      },
      body: JSON.stringify({ message, client_message_id: clientMessageId }),
    },
  );
  return acceptedResponse(response, "resume chat round");
}

export type ChatRoundEventHandlers = {
  onEvent?: (event: ChatRoundEvent) => void;
};

export type ChatRoundSubscriptionResult =
  | { kind: "stream_ended" }
  | { kind: "subscription_closed" };

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function sseFieldValue(line: string, prefixLength: number): string {
  const value = line.slice(prefixLength);
  return value.startsWith(" ") ? value.slice(1) : value;
}

function parseSseBlock(block: string, roundId: string): ChatRoundEvent | null {
  let id: string | null = null;
  let eventName = "message";
  const dataLines: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("id:")) {
      id = sseFieldValue(line, 3);
    } else if (line.startsWith("event:")) {
      eventName = sseFieldValue(line, 6);
    } else if (line.startsWith("data:")) {
      dataLines.push(sseFieldValue(line, 5));
    }
  }
  if (dataLines.length === 0) return null;
  if (id === null || !/^[1-9]\d*$/.test(id)) {
    throw new AgentApiError("invalid chat round event sequence", 200, null);
  }
  const idSeq = Number(id);
  if (!Number.isSafeInteger(idSeq)) {
    throw new AgentApiError("invalid chat round event sequence", 200, null);
  }

  let body: unknown;
  try {
    body = JSON.parse(dataLines.join("\n")) as unknown;
  } catch {
    throw new AgentApiError("invalid chat round event payload", 200, null);
  }
  if (!isObject(body)) invalidShape("chat round event", 200, body);
  const { seq, event_type, payload, created_at } = body;
  if (
    !isEventSeq(seq) ||
    seq !== idSeq ||
    typeof event_type !== "string" ||
    !event_type ||
    eventName !== event_type ||
    !isObject(payload) ||
    typeof created_at !== "string" ||
    !created_at
  ) {
    invalidShape("chat round event", 200, body);
  }
  const bodyRoundId = body.round_id;
  if (bodyRoundId !== undefined && bodyRoundId !== roundId) {
    invalidShape("chat round event", 200, body);
  }
  return { round_id: roundId, seq, event_type, payload, created_at };
}

export async function subscribeChatRoundEvents(
  accessToken: string,
  roundId: string,
  afterSeq: number,
  handlers: ChatRoundEventHandlers = {},
  init: { signal?: AbortSignal } = {},
): Promise<ChatRoundSubscriptionResult> {
  if (!Number.isSafeInteger(afterSeq) || afterSeq < 0) {
    throw new RangeError("afterSeq must be a non-negative safe integer");
  }

  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  try {
    const query = new URLSearchParams({ after_seq: String(afterSeq) });
    const response = await fetch(
      apiUrl(`/api/chat/rounds/${encodeURIComponent(roundId)}/events?${query.toString()}`),
      {
        headers: {
          Accept: "text/event-stream",
          Authorization: `Bearer ${accessToken}`,
        },
        signal: init.signal,
      },
    );
    if (!response.ok) {
      throw new AgentApiError(
        "subscribe chat round events failed",
        response.status,
        await responseJson(response),
      );
    }
    if (!response.body) {
      throw new AgentApiError("chat round event stream has no body", response.status, null);
    }

    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      while (true) {
        const boundary = /\r?\n\r?\n/.exec(buffer);
        if (!boundary || boundary.index === undefined) break;
        const block = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const event = parseSseBlock(block, roundId);
        if (event) handlers.onEvent?.(event);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      const event = parseSseBlock(buffer, roundId);
      if (event) handlers.onEvent?.(event);
    }
    return { kind: "stream_ended" };
  } catch (error) {
    if (reader) {
      try {
        await reader.cancel();
      } catch {
        // The failed or aborted fetch may already have closed its reader.
      }
    }
    if (isAbortError(error)) return { kind: "subscription_closed" };
    throw error;
  } finally {
    reader?.releaseLock();
  }
}
