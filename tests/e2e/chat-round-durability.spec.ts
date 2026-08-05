import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  test,
  type APIResponse,
  type BrowserContext,
  type Page,
  type Route,
} from "@playwright/test";

import {
  CHAT_ROUND_E2E_CASES,
  CHAT_ROUND_E2E_CATEGORY_COUNTS,
  type ChatRoundE2ECase,
  type ChatRoundTerminal,
} from "./chat-round-cases";
import {
  manifestPath,
  realRoundE2EConfig,
  roundTimeoutMs,
} from "./config";
import {
  assertManifestTerminalExpectations,
  isExpectedRoundTerminal,
} from "./chat-round-manifest";
import { classifyDeclaredFaultOutcome } from "./chat-round-fault-outcome";
import { agentPlatformUrl } from "./http";
import { classifyRoundPollingStatus } from "./chat-round-status";

type JsonObject = Record<string, unknown>;

type AcceptedRound = {
  sessionId: string;
  roundId: string;
  clientMessageId: string;
  initialStatus: string;
  initialEventSeq: number;
};

type RoundStep = {
  stepIndex: number;
  status: string;
  taskId: string | null;
  evidence: JsonObject | null;
  errorCode: string | null;
};

type RoundSnapshot = {
  roundId: string;
  sessionId: string;
  status: ChatRoundTerminal;
  lastEventSeq: number;
  steps: RoundStep[];
};

type BusinessObjectEvidence = {
  kind: "scheduled_task" | "favorite_snapshot";
  object_id: string;
};

type ManifestCase = {
  case_id: string;
  category: ChatRoundE2ECase["category"];
  session_id: string;
  round_id: string;
  client_message_id: string;
  expected_terminal: ChatRoundTerminal[];
  observed_terminal: ChatRoundTerminal;
  expected_business_object: BusinessObjectEvidence | null;
  fault: ChatRoundE2ECase["fault"];
};

type AcceptanceManifest = {
  version: 1;
  run_id: string;
  user_id: string;
  started_at: string;
  finished_at: string;
  cases: ManifestCase[];
};

type CaseIdentity = Partial<Pick<AcceptedRound, "sessionId" | "roundId" | "clientMessageId">>;

type TerminalMismatch = {
  caseId: string;
  category: ChatRoundE2ECase["category"];
  observedTerminal: ChatRoundTerminal;
  roundId: string;
};

type CapturedRoundCreateResponse = {
  status: number;
  body: unknown;
  clientMessageId: string | undefined;
  requestBody: string;
};

class Deferred<T> {
  readonly promise: Promise<T>;
  resolve!: (value: T) => void;
  reject!: (reason: unknown) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

type LoginResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  user_id?: unknown;
  user_role?: unknown;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TERMINAL_STATUSES = new Set<ChatRoundTerminal>([
  "SUCCEEDED",
  "PARTIAL_SUCCESS",
  "FAILED",
  "CANCELLED",
]);
const LIVE_STATUS_TEXT = new Set([
  "正在理解需求并制定执行计划",
  "正在生成回答",
  "正在执行任务",
]);
const TERMINAL_STATUS_TEXT: Readonly<Record<ChatRoundTerminal, string>> = {
  SUCCEEDED: "已完成",
  PARTIAL_SUCCESS: "已完成部分结果",
  FAILED: "未完成",
  CANCELLED: "已停止",
};
const ROUND_CREATE_PATH = "/agent-platform/api/chat/rounds";
const ROUND_EVENT_ROUTE = "**/agent-platform/api/chat/rounds/*/events?*";
const E2E_IO_TIMEOUT_MS = 60_000;
const SESSION_STORAGE_ACCESS = "agent_platform.access_token";
const SESSION_STORAGE_REFRESH = "agent_platform.refresh_token";
const SESSION_STORAGE_USER_ID = "agent_platform.user_id";
const SESSION_STORAGE_USER_ROLE = "agent_platform.user_role";
const SESSION_STORAGE_DISPLAY_NAME = "agent_platform.user_display_name";

const PRIVACY_DETECTORS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  {
    label: "internal_capability_identifier",
    pattern:
      /run_(?:linkfox|chatexcel)_task|commerce_data\.collect|scheduled_task\.create|favorite_snapshot\.create|\b(?:capability|capability_id|tool_name)\b/i,
  },
  {
    label: "internal_execution_field",
    pattern: /\b(?:operation|arguments|raw_args|managed_path|provider|credential)\b|managed[ _]path/i,
  },
  {
    label: "provider_model_raw_response",
    pattern: /\b(?:provider|model)[._ -]?(?:raw[_ -]?)?response\b|\braw_response\b/i,
  },
  {
    label: "credential_or_token_assignment",
    pattern:
      /\b(?:credential|password|access[_ -]?token|api[_ -]?key|model[_ -]?key)\s*[:=]\s*\S+|\bBearer\s+\S+|\batk_[A-Za-z0-9_-]+\b|\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b/i,
  },
  {
    label: "managed_windows_path",
    pattern: /(?:[A-Za-z]:\\|%LOCALAPPDATA%\\)[^\s<>"'`]+/i,
  },
  {
    label: "managed_unix_path",
    pattern: /(?:^|[\s"'(])\/(?:Users|home|var|tmp|opt|srv|root)\/[^\s<>"'`)]+/i,
  },
  {
    label: "legacy_task_route",
    pattern:
      /\/(?:agent-platform\/)?api\/(?:agent\/)?tasks\/[0-9a-f]{8}-[0-9a-f-]{27,}/i,
  },
];

class SafeCaseFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafeCaseFailure";
  }
}

let context: BrowserContext;
let page: Page;
let baseURL = "";
let accessToken = "";
let userId = "";
let runId = "";
let startedAt = "";
const completedCases: ManifestCase[] = [];
const terminalMismatches: TerminalMismatch[] = [];
const seenSessionIds = new Set<string>();
const seenRoundIds = new Set<string>();
const seenClientMessageIds = new Set<string>();

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function safeCaseFailure(
  item: ChatRoundE2ECase,
  label: string,
  identity: CaseIdentity = {},
  status?: number,
): SafeCaseFailure {
  const fields = [
    `case_id=${item.caseId}`,
    `category=${item.category}`,
    `label=${label}`,
  ];
  if (status !== undefined) fields.push(`http_status=${status}`);
  if (isUuid(identity.sessionId)) fields.push(`session_id=${identity.sessionId}`);
  if (isUuid(identity.roundId)) fields.push(`round_id=${identity.roundId}`);
  if (isUuid(identity.clientMessageId)) {
    fields.push(`client_message_id=${identity.clientMessageId}`);
  }
  return new SafeCaseFailure(`[real chat round] ${fields.join(" ")}`);
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function sessionUrl(sessionId: string): string {
  return `${baseURL}/agent?sessionId=${encodeURIComponent(sessionId)}`;
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (
    error.name === "TimeoutError" || /timed?\s*out|timeout/i.test(error.message)
  );
}

async function boundedApiRequest(
  item: ChatRoundE2ECase,
  label: string,
  identity: CaseIdentity,
  request: () => Promise<APIResponse>,
): Promise<APIResponse> {
  try {
    return await request();
  } catch (error) {
    throw safeCaseFailure(
      item,
      `${label}_${isTimeoutError(error) ? "timeout" : "transport"}`,
      identity,
    );
  }
}

async function boundedCaseOperation<T>(
  item: ChatRoundE2ECase,
  label: string,
  identity: CaseIdentity,
  operation: () => Promise<T>,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(
      () => reject(safeCaseFailure(item, `${label}_timeout`, identity)),
      E2E_IO_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([operation(), timeoutPromise]);
  } catch (error) {
    if (error instanceof SafeCaseFailure) throw error;
    throw safeCaseFailure(
      item,
      `${label}_${isTimeoutError(error) ? "timeout" : "failed"}`,
      identity,
    );
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function navigatePage(
  item: ChatRoundE2ECase,
  label: string,
  identity: CaseIdentity,
  url: string,
): Promise<void> {
  try {
    const response = await page.goto(url, {
      timeout: E2E_IO_TIMEOUT_MS,
      waitUntil: "domcontentloaded",
    });
    if (response && !response.ok()) {
      throw safeCaseFailure(item, `${label}_http`, identity, response.status());
    }
  } catch (error) {
    if (error instanceof SafeCaseFailure) throw error;
    throw safeCaseFailure(
      item,
      `${label}_${isTimeoutError(error) ? "timeout" : "transport"}`,
      identity,
    );
  }
}

async function reloadPage(
  item: ChatRoundE2ECase,
  label: string,
  identity: CaseIdentity,
): Promise<void> {
  try {
    const response = await page.reload({
      timeout: E2E_IO_TIMEOUT_MS,
      waitUntil: "domcontentloaded",
    });
    if (response && !response.ok()) {
      throw safeCaseFailure(item, `${label}_http`, identity, response.status());
    }
  } catch (error) {
    if (error instanceof SafeCaseFailure) throw error;
    throw safeCaseFailure(
      item,
      `${label}_${isTimeoutError(error) ? "timeout" : "transport"}`,
      identity,
    );
  }
}

async function readApiJson(
  response: APIResponse,
  item: ChatRoundE2ECase,
  label: string,
  identity: CaseIdentity,
): Promise<JsonObject> {
  try {
    const body = await response.json() as unknown;
    if (!isObject(body)) throw safeCaseFailure(item, `${label}_shape`, identity, response.status());
    return body;
  } catch (error) {
    if (error instanceof SafeCaseFailure) throw error;
    throw safeCaseFailure(item, `${label}_json`, identity, response.status());
  }
}

async function refreshAccessToken(item: ChatRoundE2ECase, identity: CaseIdentity): Promise<void> {
  const response = await boundedApiRequest(
    item,
    "authentication_refresh",
    identity,
    () => context.request.post(`${baseURL}/api/platform-auth/refresh`, {
      timeout: E2E_IO_TIMEOUT_MS,
    }),
  );
  try {
    if (!response.ok()) {
      throw safeCaseFailure(item, "authentication_refresh", identity, response.status());
    }
    const body = await readApiJson(response, item, "authentication_refresh", identity);
    if (typeof body.access_token !== "string" || !body.access_token) {
      throw safeCaseFailure(item, "authentication_refresh_shape", identity, response.status());
    }
    accessToken = body.access_token;
    for (const openPage of context.pages()) {
      if (openPage.isClosed() || !openPage.url().startsWith(baseURL)) continue;
      await openPage.evaluate(
        ({ key, token }) => sessionStorage.setItem(key, token),
        { key: SESSION_STORAGE_ACCESS, token: accessToken },
      );
    }
  } finally {
    await response.dispose();
  }
}

async function authenticatedGet(
  item: ChatRoundE2ECase,
  apiPath: string,
  label: string,
  identity: CaseIdentity,
): Promise<JsonObject> {
  const request = () => boundedApiRequest(item, label, identity, () =>
    context.request.get(agentPlatformUrl(baseURL, apiPath), {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: E2E_IO_TIMEOUT_MS,
    }));
  let response = await request();
  if (response.status() === 401) {
    await response.dispose();
    await refreshAccessToken(item, identity);
    response = await request();
  }
  try {
    if (!response.ok()) throw safeCaseFailure(item, label, identity, response.status());
    return await readApiJson(response, item, label, identity);
  } finally {
    await response.dispose();
  }
}

async function waitForPageCondition(
  item: ChatRoundE2ECase,
  label: string,
  identity: CaseIdentity,
  predicate: () => Promise<boolean>,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return;
    } catch (error) {
      if (error instanceof SafeCaseFailure) throw error;
    }
    await sleep(250);
  }
  throw safeCaseFailure(item, label, identity);
}

function parseAcceptedRound(
  item: ChatRoundE2ECase,
  response: CapturedRoundCreateResponse,
): AcceptedRound {
  const status = response.status;
  const body = response.body;
  if (status !== 202 || !isObject(body)) {
    throw safeCaseFailure(item, "round_create_rejected", {
      clientMessageId: response.clientMessageId,
    }, status);
  }
  const clientMessageId = response.clientMessageId;
  const sessionId = body.session_id;
  const roundId = body.round_id;
  const assistantMessageId = body.assistant_message_id;
  const initialStatus = body.status;
  const initialEventSeq = body.last_event_seq;
  if (
    !isUuid(sessionId) ||
    !isUuid(roundId) ||
    !isUuid(assistantMessageId) ||
    !isUuid(clientMessageId) ||
    typeof initialStatus !== "string" ||
    !Number.isSafeInteger(initialEventSeq) ||
    typeof initialEventSeq !== "number" ||
    initialEventSeq < 1
  ) {
    throw safeCaseFailure(item, "round_create_shape", {
      sessionId: typeof sessionId === "string" ? sessionId : undefined,
      roundId: typeof roundId === "string" ? roundId : undefined,
      clientMessageId,
    }, status);
  }
  if (
    !response.requestBody.includes('name="client_message_id"') ||
    !response.requestBody.includes(clientMessageId)
  ) {
    throw safeCaseFailure(item, "client_message_identity_mismatch", {
      sessionId,
      roundId,
      clientMessageId,
    }, status);
  }
  if (
    seenSessionIds.has(sessionId) ||
    seenRoundIds.has(roundId) ||
    seenClientMessageIds.has(clientMessageId)
  ) {
    throw safeCaseFailure(item, "duplicate_public_identity", {
      sessionId,
      roundId,
      clientMessageId,
    }, status);
  }
  seenSessionIds.add(sessionId);
  seenRoundIds.add(roundId);
  seenClientMessageIds.add(clientMessageId);
  return { sessionId, roundId, clientMessageId, initialStatus, initialEventSeq };
}

async function submitThroughRenderedComposer(
  item: ChatRoundE2ECase,
): Promise<{
  accepted: AcceptedRound;
  abortState: { aborted: boolean; handler: ((route: Route) => Promise<void>) | null };
}> {
  await navigatePage(item, "home_navigation", {}, `${baseURL}/`);
  await waitForPageCondition(
    item,
    "home_client_not_hydrated",
    {},
    async () => page.locator('button[aria-label="用户中心"]').isVisible(),
    E2E_IO_TIMEOUT_MS,
  );
  await waitForPageCondition(item, "home_composer_unavailable", {}, async () =>
    page.getByTestId("task-composer-textbox").isVisible(), 60_000);
  await waitForPageCondition(
    item,
    "home_composer_not_synchronized",
    {},
    async () => {
      const editor = page.getByTestId("task-composer-editor");
      const submit = page.getByTestId("task-composer-submit");
      if (!await editor.isVisible() || !await submit.isVisible()) return false;
      const editorText = (await editor.innerText()).replaceAll("\u200b", "").trim();
      return editorText === "" && !await submit.isEnabled();
    },
    E2E_IO_TIMEOUT_MS,
  );

  const capture = new Deferred<CapturedRoundCreateResponse>();
  const createHandler = async (route: Route): Promise<void> => {
    const request = route.request();
    if (request.method() !== "POST") {
      await route.continue();
      return;
    }
    const clientMessageId = request.headers()["x-request-id"];
    const identity: CaseIdentity = {
      clientMessageId: isUuid(clientMessageId) ? clientMessageId : undefined,
    };
    try {
      const upstream = await boundedCaseOperation(
        item,
        "round_create_fetch",
        identity,
        () => route.fetch({
          headers: {
            ...request.headers(),
            ...(item.fault ? { "X-Round-Test-Fault": item.fault } : {}),
          },
          timeout: E2E_IO_TIMEOUT_MS,
        }),
      );
      const responseBody = await boundedCaseOperation(
        item,
        "round_create_json",
        identity,
        () => upstream.json() as Promise<unknown>,
      );
      await boundedCaseOperation(
        item,
        "round_create_fulfill",
        identity,
        () => route.fulfill({ response: upstream }),
      );
      capture.resolve({
        status: upstream.status(),
        body: responseBody,
        clientMessageId,
        requestBody: request.postData() ?? "",
      });
    } catch (error) {
      const failure = error instanceof SafeCaseFailure
        ? error
        : safeCaseFailure(item, "round_create_capture", identity);
      capture.reject(failure);
      await route.abort("failed").catch(() => undefined);
    }
  };
  await context.route(`**${ROUND_CREATE_PATH}`, createHandler);

  const abortState: {
    aborted: boolean;
    handler: ((route: Route) => Promise<void>) | null;
  } = { aborted: false, handler: null };
  if (item.lifecycle === "abort_sse") {
    abortState.handler = async (route: Route) => {
      if (!abortState.aborted) {
        abortState.aborted = true;
        await route.abort("aborted");
        return;
      }
      await route.continue();
    };
    await context.route(ROUND_EVENT_ROUTE, abortState.handler);
  }

  try {
    await boundedCaseOperation(
      item,
      "composer_focus",
      {},
      () => page.getByTestId("task-composer-textbox").click({
        timeout: E2E_IO_TIMEOUT_MS,
      }),
    );
    await boundedCaseOperation(
      item,
      "composer_input",
      {},
      () => page.keyboard.insertText(item.prompt),
    );
    await waitForPageCondition(
      item,
      "composer_submit_unavailable",
      {},
      async () => {
        const submit = page.getByTestId("task-composer-submit");
        return await submit.isVisible() && await submit.isEnabled();
      },
      E2E_IO_TIMEOUT_MS,
    );
    await boundedCaseOperation(
      item,
      "composer_submit",
      {},
      () => page.getByTestId("task-composer-submit").click({
        timeout: E2E_IO_TIMEOUT_MS,
      }),
    );
    const captured = await boundedCaseOperation(
      item,
      "round_create_capture",
      {},
      () => capture.promise,
    );
    return {
      accepted: parseAcceptedRound(item, captured),
      abortState,
    };
  } finally {
    await context.unroute(`**${ROUND_CREATE_PATH}`, createHandler);
  }
}

async function waitForLiveStatus(item: ChatRoundE2ECase, identity: AcceptedRound): Promise<void> {
  await waitForPageCondition(item, "live_status_not_rendered", identity, async () => {
    const statuses = await page.locator('[data-testid="chat-round-status"]').allInnerTexts();
    return statuses.some((value) => LIVE_STATUS_TEXT.has(value.trim()));
  }, 60_000);
}

async function applyLifecycle(
  item: ChatRoundE2ECase,
  accepted: AcceptedRound,
  abortState: { aborted: boolean; handler: ((route: Route) => Promise<void>) | null },
): Promise<void> {
  if (item.lifecycle === "switch_session") {
    const previous = completedCases.at(-1)?.session_id;
    if (!previous || previous === accepted.sessionId) {
      throw safeCaseFailure(item, "switch_session_target_missing", accepted);
    }
    await navigatePage(
      item,
      "switch_session_previous_navigation",
      accepted,
      sessionUrl(previous),
    );
    await navigatePage(
      item,
      "switch_session_return_navigation",
      accepted,
      sessionUrl(accepted.sessionId),
    );
    return;
  }

  if (item.lifecycle === "abort_sse") {
    await waitForPageCondition(item, "sse_abort_not_observed", accepted, async () =>
      abortState.aborted, 60_000);
    if (abortState.handler) await context.unroute(ROUND_EVENT_ROUTE, abortState.handler);
    await navigatePage(
      item,
      "sse_reconnect_navigation",
      accepted,
      sessionUrl(accepted.sessionId),
    );
    return;
  }

  if (item.lifecycle === "reload_active") {
    await waitForLiveStatus(item, accepted);
    await reloadPage(item, "active_round_reload", accepted);
    return;
  }

  if (item.lifecycle === "reopen_page") {
    await page.close();
    page = await context.newPage();
    await navigatePage(
      item,
      "reopen_page_navigation",
      accepted,
      sessionUrl(accepted.sessionId),
    );
    return;
  }

  if (item.lifecycle === "explicit_stop") {
    await waitForPageCondition(item, "stop_control_not_rendered", accepted, async () => {
      const button = page.getByTestId("task-composer-submit");
      return await button.isVisible() && await button.getAttribute("aria-label") === "停止任务";
    }, 60_000);
    await boundedCaseOperation(
      item,
      "stop_control_submit",
      accepted,
      () => page.getByTestId("task-composer-submit").click({
        timeout: E2E_IO_TIMEOUT_MS,
      }),
    );
    await waitForPageCondition(item, "stopped_state_not_rendered", accepted, async () => {
      const statuses = await page.locator('[data-testid="chat-round-status"]').allInnerTexts();
      return statuses.some((value) => value.trim() === "已停止");
    }, roundTimeoutMs);
  }
}

function parseRoundSnapshot(
  item: ChatRoundE2ECase,
  identity: AcceptedRound,
  body: JsonObject,
): RoundSnapshot | null {
  if (body.round_id !== identity.roundId || body.session_id !== identity.sessionId) {
    throw safeCaseFailure(item, "round_snapshot_identity", identity);
  }
  const status = body.status;
  const lastEventSeq = body.last_event_seq;
  if (
    typeof status !== "string" ||
    !Number.isSafeInteger(lastEventSeq) ||
    typeof lastEventSeq !== "number" ||
    lastEventSeq < identity.initialEventSeq ||
    !Array.isArray(body.steps)
  ) {
    throw safeCaseFailure(item, "round_snapshot_shape", identity);
  }
  const pollingClassification = classifyRoundPollingStatus(status);
  if (pollingClassification === "unexpected_waiting_input") {
    throw safeCaseFailure(item, "unexpected_waiting_input", identity);
  }
  if (pollingClassification === "pending") return null;
  const steps: RoundStep[] = body.steps.map((raw) => {
    if (!isObject(raw)) throw safeCaseFailure(item, "round_step_shape", identity);
    const stepIndex = raw.step_index;
    const stepStatus = raw.status;
    const taskId = raw.task_id;
    const evidence = raw.evidence;
    const errorCode = raw.error_code;
    if (
      !Number.isSafeInteger(stepIndex) ||
      typeof stepIndex !== "number" ||
      stepIndex < 0 ||
      typeof stepStatus !== "string" ||
      !(taskId === null || isUuid(taskId)) ||
      !(evidence === null || isObject(evidence)) ||
      !(errorCode === null || typeof errorCode === "string")
    ) {
      throw safeCaseFailure(item, "round_step_shape", identity);
    }
    return { stepIndex, status: stepStatus, taskId, evidence, errorCode };
  });
  return {
    roundId: identity.roundId,
    sessionId: identity.sessionId,
    status: status as ChatRoundTerminal,
    lastEventSeq,
    steps,
  };
}

async function waitForTerminalSnapshot(
  item: ChatRoundE2ECase,
  identity: AcceptedRound,
): Promise<RoundSnapshot> {
  const deadline = Date.now() + roundTimeoutMs;
  while (Date.now() < deadline) {
    const body = await authenticatedGet(
      item,
      `/api/chat/rounds/${encodeURIComponent(identity.roundId)}`,
      "round_snapshot_request",
      identity,
    );
    const snapshot = parseRoundSnapshot(item, identity, body);
    if (snapshot) return snapshot;
    await sleep(2_000);
  }
  throw safeCaseFailure(item, "round_terminal_timeout", identity);
}

async function reconnectAndAssertPrivacy(
  item: ChatRoundE2ECase,
  identity: AcceptedRound,
  observedTerminal: ChatRoundTerminal,
): Promise<void> {
  if (page.isClosed()) page = await context.newPage();
  await navigatePage(
    item,
    "session_reconnect_navigation",
    identity,
    sessionUrl(identity.sessionId),
  );
  await waitForPageCondition(item, "session_round_not_rendered", identity, async () => {
    const text = await page.locator("body").innerText();
    return text.includes(item.marker);
  }, 60_000);
  await waitForPageCondition(item, "terminal_status_not_rendered", identity, async () => {
    const statuses = await page.locator('[data-testid="chat-round-status"]').allInnerTexts();
    return statuses.some((value) => value.trim() === TERMINAL_STATUS_TEXT[observedTerminal]);
  }, 60_000);
  const rendered = await page.evaluate(() => {
    const values: string[] = [document.body.innerText];
    const relevant = [
      "href",
      "src",
      "action",
      "title",
      "aria-label",
      "alt",
      "data-tool-id",
      "data-source-tag",
    ];
    for (const element of Array.from(document.querySelectorAll("*"))) {
      for (const name of relevant) {
        const value = element.getAttribute(name);
        if (value) values.push(value);
      }
    }
    return values.join("\n");
  });
  for (const detector of PRIVACY_DETECTORS) {
    if (detector.pattern.test(rendered)) {
      throw safeCaseFailure(item, `privacy_${detector.label}`, identity);
    }
  }
}

function successfulEvidenceIds(
  snapshot: RoundSnapshot,
  key: "scheduled_task_id" | "favorite_id",
): Array<{ id: string; stepIndex: number; evidence: JsonObject }> {
  const values: Array<{ id: string; stepIndex: number; evidence: JsonObject }> = [];
  for (const step of snapshot.steps) {
    const candidate = step.status === "SUCCESS" ? step.evidence?.[key] : undefined;
    if (isUuid(candidate) && step.evidence) {
      values.push({ id: candidate, stepIndex: step.stepIndex, evidence: step.evidence });
    }
  }
  return values;
}

async function verifyBusinessObject(
  item: ChatRoundE2ECase,
  identity: AcceptedRound,
  snapshot: RoundSnapshot,
): Promise<BusinessObjectEvidence | null> {
  if (item.category === "schedule_create") {
    const evidence = successfulEvidenceIds(snapshot, "scheduled_task_id");
    if (evidence.length !== 1) {
      throw safeCaseFailure(item, "scheduled_task_evidence", identity);
    }
    const objectId = evidence[0].id;
    const detail = await authenticatedGet(
      item,
      `/api/user-scheduled-tasks/${encodeURIComponent(objectId)}`,
      "scheduled_task_get",
      identity,
    );
    if (detail.id !== objectId || typeof detail.title !== "string" || !detail.title.trim()) {
      throw safeCaseFailure(item, "scheduled_task_shape", identity);
    }
    await navigatePage(
      item,
      "scheduled_task_navigation",
      identity,
      `${baseURL}/schedules`,
    );
    await waitForPageCondition(item, "scheduled_task_ui", identity, async () =>
      (await page.locator("body").innerText()).includes(detail.title as string), 60_000);
    return { kind: "scheduled_task", object_id: objectId };
  }

  if (item.category === "favorite_create") {
    const evidence = successfulEvidenceIds(snapshot, "favorite_id");
    if (evidence.length !== 1) {
      throw safeCaseFailure(item, "favorite_evidence", identity);
    }
    const favorite = evidence[0];
    const sourceTaskId = favorite.evidence.source_task_id;
    const selectedCount = favorite.evidence.selected_count;
    const asins = favorite.evidence.asins;
    const validAsins = Array.isArray(asins) && asins.length > 0 && asins.every(
      (value) => typeof value === "string" && /^[A-Z0-9]{10}$/.test(value),
    );
    if (
      !isUuid(sourceTaskId) ||
      !Number.isSafeInteger(selectedCount) ||
      typeof selectedCount !== "number" ||
      selectedCount <= 0 ||
      !validAsins ||
      new Set(asins as string[]).size !== (asins as string[]).length ||
      selectedCount !== (asins as string[]).length
    ) {
      throw safeCaseFailure(item, "favorite_selection_evidence", identity);
    }
    const sourceStep = snapshot.steps.find(
      (step) =>
        step.status === "SUCCESS" &&
        step.stepIndex < favorite.stepIndex &&
        step.taskId === sourceTaskId,
    );
    if (!sourceStep) throw safeCaseFailure(item, "favorite_source_task_order", identity);
    const detail = await authenticatedGet(
      item,
      `/api/user/favorites/${encodeURIComponent(favorite.id)}`,
      "favorite_get",
      identity,
    );
    if (
      detail.id !== favorite.id ||
      typeof detail.title !== "string" ||
      !detail.title.trim() ||
      detail.source_task_id !== sourceTaskId ||
      !isObject(detail.snapshot) ||
      Object.keys(detail.snapshot).length === 0
    ) {
      throw safeCaseFailure(item, "favorite_source_snapshot", identity);
    }
    await navigatePage(
      item,
      "favorite_navigation",
      identity,
      `${baseURL}/artifacts`,
    );
    await waitForPageCondition(item, "favorite_ui", identity, async () =>
      (await page.locator("body").innerText()).includes(detail.title as string), 60_000);
    return { kind: "favorite_snapshot", object_id: favorite.id };
  }

  return null;
}

function assertDeclaredFaultObserved(
  item: ChatRoundE2ECase,
  identity: AcceptedRound,
  snapshot: RoundSnapshot,
): void {
  const outcome = classifyDeclaredFaultOutcome(item.fault, snapshot.steps);
  if (outcome.kind !== "invalid") return;
  if (outcome.reason === "shape") {
    throw safeCaseFailure(item, "declared_fault_shape", identity);
  }
  if (outcome.reason === "prior_result_missing") {
    throw safeCaseFailure(item, "declared_fault_prior_result_missing", identity);
  }
  throw safeCaseFailure(item, "declared_fault_not_observed", identity);
}

async function executeCase(item: ChatRoundE2ECase): Promise<void> {
  let identity: CaseIdentity = {};
  let abortHandler: ((route: Route) => Promise<void>) | null = null;
  try {
    const submitted = await test.step(
      "submit rendered request",
      () => submitThroughRenderedComposer(item),
    );
    const accepted = submitted.accepted;
    identity = accepted;
    abortHandler = submitted.abortState.handler;
    await test.step(
      "apply declared lifecycle",
      () => applyLifecycle(item, accepted, submitted.abortState),
    );
    const snapshot = await test.step(
      "wait for terminal Round snapshot",
      () => waitForTerminalSnapshot(item, accepted),
    );
    await test.step(
      "reconnect and verify public rendering",
      () => reconnectAndAssertPrivacy(item, accepted, snapshot.status),
    );
    await test.step("verify terminal contract", async () => {
      if (!isExpectedRoundTerminal(snapshot.status, item.expectedTerminal)) {
        terminalMismatches.push({
          caseId: item.caseId,
          category: item.category,
          observedTerminal: snapshot.status,
          roundId: accepted.roundId,
        });
        throw safeCaseFailure(item, "terminal_mismatch", accepted);
      }
      assertDeclaredFaultObserved(item, accepted, snapshot);
    });
    const businessObject = await test.step(
      "verify declared business evidence",
      () => verifyBusinessObject(item, accepted, snapshot),
    );
    completedCases.push({
      case_id: item.caseId,
      category: item.category,
      session_id: accepted.sessionId,
      round_id: accepted.roundId,
      client_message_id: accepted.clientMessageId,
      expected_terminal: [...item.expectedTerminal],
      observed_terminal: snapshot.status,
      expected_business_object: businessObject,
      fault: item.fault,
    });
  } catch (error) {
    if (error instanceof SafeCaseFailure) throw error;
    throw safeCaseFailure(item, "case_execution", identity);
  } finally {
    if (abortHandler) await context.unroute(ROUND_EVENT_ROUTE, abortHandler).catch(() => undefined);
  }
}

function exactKeys(value: JsonObject, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function terminalMismatchError(): Error | null {
  if (terminalMismatches.length === 0) return null;
  const first = terminalMismatches[0];
  return new Error(
    `[real chat round] label=terminal_mismatch case_id=${first.caseId} category=${first.category} observed_terminal=${first.observedTerminal} round_id=${first.roundId} mismatch_count=${terminalMismatches.length}`,
  );
}

function isTimezoneAwareIso(value: string): boolean {
  return /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}

function validateManifest(manifest: AcceptanceManifest): void {
  if (
    !exactKeys(manifest as unknown as JsonObject, [
      "version",
      "run_id",
      "user_id",
      "started_at",
      "finished_at",
      "cases",
    ]) ||
    manifest.version !== 1 ||
    !isUuid(manifest.run_id) ||
    !isUuid(manifest.user_id) ||
    manifest.cases.length !== 60 ||
    !isTimezoneAwareIso(manifest.started_at) ||
    !isTimezoneAwareIso(manifest.finished_at) ||
    Date.parse(manifest.finished_at) <= Date.parse(manifest.started_at)
  ) {
    throw new Error("manifest_top_level_schema");
  }
  const caseIds = new Set<string>();
  const sessionIds = new Set<string>();
  const roundIds = new Set<string>();
  const clientIds = new Set<string>();
  const counts: Record<string, number> = {};
  const expectedByCaseId = new Map(CHAT_ROUND_E2E_CASES.map((item) => [item.caseId, item]));
  assertManifestTerminalExpectations(manifest.cases);
  for (const entry of manifest.cases) {
    const expectedCase = expectedByCaseId.get(entry.case_id);
    if (
      !exactKeys(entry as unknown as JsonObject, [
        "case_id",
        "category",
        "session_id",
        "round_id",
        "client_message_id",
        "expected_terminal",
        "observed_terminal",
        "expected_business_object",
        "fault",
      ]) ||
      !isUuid(entry.session_id) ||
      !isUuid(entry.round_id) ||
      !isUuid(entry.client_message_id) ||
      !expectedCase ||
      expectedCase.category !== entry.category ||
      !Array.isArray(entry.expected_terminal) ||
      entry.expected_terminal.length !== expectedCase.expectedTerminal.length ||
      entry.expected_terminal.some((value, index) => value !== expectedCase.expectedTerminal[index]) ||
      !TERMINAL_STATUSES.has(entry.observed_terminal) ||
      entry.fault !== expectedCase.fault ||
      caseIds.has(entry.case_id) ||
      sessionIds.has(entry.session_id) ||
      roundIds.has(entry.round_id) ||
      clientIds.has(entry.client_message_id)
    ) {
      throw new Error("manifest_case_schema");
    }
    caseIds.add(entry.case_id);
    sessionIds.add(entry.session_id);
    roundIds.add(entry.round_id);
    clientIds.add(entry.client_message_id);
    counts[entry.category] = (counts[entry.category] ?? 0) + 1;
    const expectsBusiness = entry.category === "schedule_create" || entry.category === "favorite_create";
    if (expectsBusiness !== (entry.expected_business_object !== null)) {
      throw new Error("manifest_business_object_schema");
    }
    if (entry.expected_business_object !== null) {
      const expectedKind = entry.category === "schedule_create"
        ? "scheduled_task"
        : "favorite_snapshot";
      if (
        !exactKeys(entry.expected_business_object as unknown as JsonObject, ["kind", "object_id"]) ||
        entry.expected_business_object.kind !== expectedKind ||
        !isUuid(entry.expected_business_object.object_id)
      ) {
        throw new Error("manifest_business_object_schema");
      }
    }
  }
  for (const [category, count] of Object.entries(CHAT_ROUND_E2E_CATEGORY_COUNTS)) {
    if (counts[category] !== count) throw new Error("manifest_category_counts");
  }
}

async function writeManifestAtomically(manifest: AcceptanceManifest): Promise<void> {
  validateManifest(manifest);
  const directory = path.dirname(manifestPath);
  await mkdir(directory, { recursive: true });
  const temporaryPath = path.join(directory, `.${path.basename(manifestPath)}.${runId}.tmp`);
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  await rename(temporaryPath, manifestPath);
}

test.describe.serial("real chat Round durability", () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    if (!realRoundE2EConfig.realRoundE2E) {
      throw new Error("[real chat round] label=real_suite_flag_missing");
    }
    baseURL = testInfo.project.use.baseURL as string;
    if (!baseURL || !realRoundE2EConfig.username || !realRoundE2EConfig.password) {
      throw new Error("[real chat round] label=real_suite_configuration");
    }
    runId = crypto.randomUUID();
    startedAt = new Date().toISOString();
    try {
      await rm(manifestPath, { force: true });
    } catch {
      throw new Error(`[real chat round] label=stale_manifest_remove run_id=${runId}`);
    }
    context = await browser.newContext({
      baseURL,
      recordVideo: undefined,
    });
    let login: APIResponse;
    try {
      login = await context.request.post(`${baseURL}/api/platform-auth/login`, {
        data: {
          username: realRoundE2EConfig.username,
          password: realRoundE2EConfig.password,
        },
        timeout: E2E_IO_TIMEOUT_MS,
      });
    } catch (error) {
      throw new Error(
        `[real chat round] label=real_user_authentication_${
          isTimeoutError(error) ? "timeout" : "transport"
        }`,
      );
    }
    try {
      if (!login.ok()) {
        throw new Error(`[real chat round] label=real_user_authentication http_status=${login.status()}`);
      }
      const body = await login.json() as LoginResponse;
      if (typeof body.access_token !== "string" || !body.access_token || !isUuid(body.user_id)) {
        throw new Error("[real chat round] label=real_user_authentication_shape");
      }
      accessToken = body.access_token;
      userId = body.user_id;
      await context.addInitScript((auth) => {
        try {
          sessionStorage.setItem(auth.accessKey, auth.accessToken);
          sessionStorage.setItem(auth.refreshKey, "__http_only_refresh__");
          sessionStorage.setItem(auth.userIdKey, auth.userId);
          sessionStorage.setItem(auth.userRoleKey, auth.userRole);
          sessionStorage.setItem(auth.displayNameKey, auth.displayName);
        } catch {
          // Non-application pages may not expose sessionStorage.
        }
      }, {
        accessKey: SESSION_STORAGE_ACCESS,
        accessToken,
        refreshKey: SESSION_STORAGE_REFRESH,
        userIdKey: SESSION_STORAGE_USER_ID,
        userId,
        userRoleKey: SESSION_STORAGE_USER_ROLE,
        userRole: typeof body.user_role === "string" ? body.user_role : "user",
        displayNameKey: SESSION_STORAGE_DISPLAY_NAME,
        displayName: realRoundE2EConfig.username,
      });
    } finally {
      await login.dispose();
    }
    page = await context.newPage();
  });

  for (const item of CHAT_ROUND_E2E_CASES) {
    test(`${item.caseId} [${item.category}]`, async () => {
      await executeCase(item);
    });
  }

  test.afterAll(async () => {
    try {
      const mismatch = terminalMismatchError();
      if (mismatch) throw mismatch;
      if (completedCases.length !== CHAT_ROUND_E2E_CASES.length) {
        return;
      }
      const manifest: AcceptanceManifest = {
        version: 1,
        run_id: runId,
        user_id: userId,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        cases: completedCases,
      };
      try {
        await writeManifestAtomically(manifest);
      } catch {
        throw new Error(`[real chat round] label=manifest_atomic_write run_id=${runId}`);
      }
    } finally {
      await context?.close();
    }
  });
});
