import { getAgentHttpApiBase, getAgentWsOrigin } from "@/lib/agent-api/config";
import type { TaskExecutionStepStatus } from "@/lib/agent-events";
import type {
  AdminUserRow,
  ChatSendResult,
  CreateSessionResponse,
  LoginResponse,
  SessionMessagesPageResponse,
  SessionListResponse,
  TaskListResult,
  TaskResponse,
  TokenCheckResponse,
  ToolOrchestrationStatusApi,
} from "@/lib/agent-api/types";

function apiUrl(path: string): string {
  const base = getAgentHttpApiBase();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text) as unknown;
}

export class AgentApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "AgentApiError";
    this.status = status;
    this.body = body;
  }
}

/** 解析 FastAPI 等返回的 JSON `detail` 字段 */
export function parseFastApiDetail(data: unknown): string | null {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const detail = (data as Record<string, unknown>).detail;
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  if (Array.isArray(detail)) {
    const parts: string[] = [];
    for (const item of detail) {
      if (item && typeof item === "object" && typeof (item as { msg?: unknown }).msg === "string") {
        parts.push((item as { msg: string }).msg);
      }
    }
    if (parts.length) return parts.join("；");
  }
  return null;
}

/** 拼「服务端说明 + HTTP 状态码与短语」一行，便于用户排查 */
export function formatHttpErrorMessage(res: Response, data: unknown, fallbackPrefix: string): string {
  const detail = parseFastApiDetail(data);
  const statusText = (res.statusText || "").trim() || "Error";
  const httpPart = `HTTP ${res.status} ${statusText}`;
  if (detail) return `${detail} (${httpPart})`;
  return `${fallbackPrefix} (${httpPart})`;
}

/** 展示用：已含 `HTTP 数字` 的不再重复拼接状态码 */
export function formatAgentApiErrorForUser(e: unknown): string {
  if (e instanceof AgentApiError) {
    if (e.status > 0 && /\bHTTP\s+\d+\b/.test(e.message)) return e.message;
    if (e.status > 0) return `${e.message} (HTTP ${e.status})`;
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

function assertJsonObject(v: unknown): asserts v is Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    throw new AgentApiError("expected JSON object", 0, v);
  }
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await parseJson(res);
  } catch {
    return null;
  }
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const res = await fetch(apiUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const rawText = await res.text();
  let data: unknown;
  try {
    data = rawText ? (JSON.parse(rawText) as unknown) : null;
  } catch {
    const preview = rawText.replace(/\s+/g, " ").trim().slice(0, 120);
    throw new AgentApiError(
      `登录接口返回非 JSON（多为网关/服务端 500）。响应片段：${preview || "(empty)"}`,
      res.status,
      rawText,
    );
  }
  if (!res.ok) {
    throw new AgentApiError("login failed", res.status, data);
  }
  assertJsonObject(data);
  const access_token = data.access_token;
  const refresh_token = data.refresh_token;
  const user_id = data.user_id;
  const plan_code = data.plan_code;
  if (
    typeof access_token !== "string" ||
    typeof refresh_token !== "string" ||
    typeof user_id !== "string" ||
    typeof plan_code !== "string"
  ) {
    throw new AgentApiError("invalid login response shape", res.status, data);
  }
  const user_role = data.user_role;
  return {
    access_token,
    refresh_token,
    user_id,
    plan_code,
    user_role: typeof user_role === "string" ? user_role : undefined,
  };
}

export type AdminUsersListResponse = { users: AdminUserRow[] };

export async function adminListUsers(accessToken: string): Promise<AdminUsersListResponse> {
  const res = await fetch(apiUrl("/admin/users"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await safeJson(res);
  if (!res.ok) {
    throw new AgentApiError("list admin users failed", res.status, data);
  }
  return data as AdminUsersListResponse;
}

export async function adminCreateUser(
  accessToken: string,
  body: { username: string; password: string; role: string; email?: string | null; status?: string },
): Promise<Record<string, unknown>> {
  const res = await fetch(apiUrl("/admin/users"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await safeJson(res);
  if (!res.ok) {
    throw new AgentApiError("create user failed", res.status, data);
  }
  return data as Record<string, unknown>;
}

export async function adminPatchUser(
  accessToken: string,
  userId: string,
  body: { password?: string; role?: string; status?: string },
): Promise<Record<string, unknown>> {
  const res = await fetch(apiUrl(`/admin/users/${encodeURIComponent(userId)}`), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await safeJson(res);
  if (!res.ok) {
    throw new AgentApiError("patch user failed", res.status, data);
  }
  return data as Record<string, unknown>;
}

export async function adminDeleteUser(accessToken: string, userId: string): Promise<void> {
  const res = await fetch(apiUrl(`/admin/users/${encodeURIComponent(userId)}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.ok) return;
  const data = await safeJson(res);
  throw new AgentApiError("delete user failed", res.status, data);
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(apiUrl("/api/auth/refresh"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new AgentApiError("refresh failed", res.status, data);
  }
  assertJsonObject(data);
  const access_token = data.access_token;
  if (typeof access_token !== "string") {
    throw new AgentApiError("invalid refresh response shape", res.status, data);
  }
  return access_token;
}

export async function checkAccessToken(accessToken: string): Promise<TokenCheckResponse> {
  const res = await fetch(apiUrl("/api/auth/token/check"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new AgentApiError("token check failed", res.status, data);
  }
  assertJsonObject(data);
  if (data.valid !== true) {
    throw new AgentApiError("invalid token", res.status, data);
  }
  return data as TokenCheckResponse;
}

export async function createSession(accessToken: string): Promise<CreateSessionResponse> {
  const res = await fetch(apiUrl("/api/sessions"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new AgentApiError("create session failed", res.status, data);
  }
  assertJsonObject(data);
  const session_id = data.session_id;
  if (typeof session_id !== "string") {
    throw new AgentApiError("invalid session response shape", res.status, data);
  }
  return { session_id };
}

export async function releaseSession(accessToken: string, sessionId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/sessions/${sessionId}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.ok || res.status === 404) return;
  const data = await parseJson(res);
  throw new AgentApiError("release session failed", res.status, data);
}

/** 永久删除会话及其消息、任务、产物等全部关联数据（不可恢复）。 */
export async function purgeSessionData(accessToken: string, sessionId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/sessions/${encodeURIComponent(sessionId)}/purge`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.ok) return;
  const data = await parseJson(res);
  throw new AgentApiError("purge session failed", res.status, data);
}

export async function listSessions(
  accessToken: string,
  page = 1,
  pageSize = 50,
): Promise<SessionListResponse> {
  const sp = new URLSearchParams();
  sp.set("page", String(page));
  sp.set("page_size", String(pageSize));
  const qs = sp.toString();
  const res = await fetch(apiUrl(`/api/sessions${qs ? `?${qs}` : ""}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await safeJson(res);
  if (!res.ok) {
    throw new AgentApiError("list sessions failed", res.status, data);
  }
  return data as SessionListResponse;
}

export async function listSessionMessages(
  accessToken: string,
  sessionId: string,
  limit = 50,
): Promise<SessionMessagesPageResponse> {
  const clamped = Math.max(1, Math.min(limit, 100));
  const sp = new URLSearchParams();
  sp.set("limit", String(clamped));
  const qs = sp.toString();
  const res = await fetch(apiUrl(`/api/sessions/${sessionId}/messages${qs ? `?${qs}` : ""}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await safeJson(res);
  if (!res.ok) {
    throw new AgentApiError("list session messages failed", res.status, data);
  }
  return data as SessionMessagesPageResponse;
}

export type TaskExecutionStepPersistPayload = {
  id: string;
  label: string;
  status: TaskExecutionStepStatus;
};

export type TaskExecutionStepsPersistBody = {
  round_id: string;
  task_id: string;
  steps: TaskExecutionStepPersistPayload[];
};

/** 任务受理后尽早插入步骤占位（pending），使 message_index 早于任务结果消息。 */
export async function postTaskExecutionSteps(
  accessToken: string,
  sessionId: string,
  body: TaskExecutionStepsPersistBody,
): Promise<string | null> {
  const res = await fetch(apiUrl(`/api/sessions/${sessionId}/messages/task-execution-steps`), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (res.status === 503) return null;
  if (!res.ok) return null;
  const data = await safeJson(res);
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const mid = (data as Record<string, unknown>).message_id;
    if (typeof mid === "string") return mid;
  }
  return null;
}

/** 任务结束时更新同一条步骤消息的 steps（不改变排序位置）。 */
export async function patchTaskExecutionSteps(
  accessToken: string,
  sessionId: string,
  messageId: string,
  body: TaskExecutionStepsPersistBody,
): Promise<boolean> {
  const res = await fetch(
    apiUrl(`/api/sessions/${sessionId}/messages/${messageId}/task-execution-steps`),
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (res.status === 503) return false;
  return res.ok;
}

export type ListTasksParams = {
  status?: "RUNNING" | "SUCCESS" | "FAILED" | "BLOCKED_BY_PLAN" | "TIMEOUT" | "CANCELLED";
  page?: number;
  page_size?: number;
};

export async function listTasks(accessToken: string, params?: ListTasksParams): Promise<TaskListResult> {
  const sp = new URLSearchParams();
  if (params?.status) sp.set("status", params.status);
  if (params?.page != null) sp.set("page", String(params.page));
  if (params?.page_size != null) sp.set("page_size", String(params.page_size));
  const q = sp.toString();
  const res = await fetch(apiUrl(`/api/tasks${q ? `?${q}` : ""}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new AgentApiError("list tasks failed", res.status, data);
  }
  assertJsonObject(data);
  const tasks = data.tasks;
  const page = data.page;
  const page_size = data.page_size;
  if (!Array.isArray(tasks) || typeof page !== "number" || typeof page_size !== "number") {
    throw new AgentApiError("invalid task list shape", res.status, data);
  }
  return { tasks: tasks as TaskResponse[], page, page_size };
}

export async function deleteTaskSession(accessToken: string, taskId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/tasks/${taskId}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await safeJson(res);
  if (!res.ok) {
    throw new AgentApiError("delete task session failed", res.status, data);
  }
}

export async function sendChatMessage(
  accessToken: string,
  sessionId: string,
  message: string,
  messageId: string,
): Promise<ChatSendResult> {
  const res = await fetch(apiUrl(`/api/chat/${sessionId}/send`), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `ui:${messageId}`,
      "X-Request-ID": messageId,
    },
    body: JSON.stringify({ message, message_id: messageId }),
  });
  const raw = await parseJson(res);
  const invalidBody = raw === null || typeof raw !== "object" || Array.isArray(raw);
  if (invalidBody) {
    if (!res.ok) {
      throw new AgentApiError(formatHttpErrorMessage(res, raw, "发送消息失败"), res.status, raw);
    }
    throw new AgentApiError(
      `invalid chat response body (HTTP ${res.status} ${(res.statusText || "").trim() || "Error"})`,
      res.status,
      raw,
    );
  }
  const data = raw as Record<string, unknown>;

  if (res.status === 202) {
    const task_id = data.task_id;
    const task_status = data.task_status;
    if (typeof task_id !== "string") {
      throw new AgentApiError("invalid accepted chat response", res.status, data);
    }
    const rawSteps = data.execution_steps;
    const execution_steps = Array.isArray(rawSteps)
      ? rawSteps.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      : [];
    const orch = data.orchestration_id;
    const orchestration_id = typeof orch === "string" && orch.trim() ? orch.trim() : null;
    return {
      kind: "accepted",
      task_id,
      task_status: typeof task_status === "string" ? task_status : "RUNNING",
      execution_steps,
      orchestration_id,
    };
  }

  if (!res.ok) {
    throw new AgentApiError(formatHttpErrorMessage(res, data, "发送消息失败"), res.status, data);
  }

  const status = data.status;
  if (status === "blocked") {
    const sid = data.session_id;
    const msg = data.message;
    const tid = data.task_id;
    if (typeof sid !== "string" || typeof msg !== "string") {
      throw new AgentApiError("invalid blocked chat response", res.status, data);
    }
    return {
      kind: "blocked",
      session_id: sid,
      message: msg,
      task_id: typeof tid === "string" ? tid : null,
    };
  }

  if (status === "completed") {
    const sid = data.session_id;
    const msg = data.message;
    if (typeof sid !== "string" || typeof msg !== "string") {
      throw new AgentApiError("invalid completed chat response", res.status, data);
    }
    return { kind: "completed", session_id: sid, message: msg };
  }

  throw new AgentApiError(`unexpected chat response status: ${String(status)}`, res.status, data);
}

/** 相对路径如 `/api/tasks/.../download`，带 Bearer 拉取二进制并触发浏览器下载。 */
export async function downloadAuthorizedFile(
  accessToken: string,
  downloadPath: string,
  fallbackFilename: string,
): Promise<void> {
  const path = downloadPath.startsWith("/") ? downloadPath : `/${downloadPath}`;
  const res = await fetch(apiUrl(path), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const body = await parseJson(res).catch(() => null);
    throw new AgentApiError("download failed", res.status, body);
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition");
  let filename = fallbackFilename;
  const m = cd?.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)/i);
  if (m?.[1]) {
    try {
      filename = decodeURIComponent(m[1].trim());
    } catch {
      filename = m[1].trim();
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** 带 Bearer 拉取文本（用于预览 CSV/JSON 等）。 */
export async function fetchAuthorizedText(accessToken: string, downloadPath: string): Promise<string> {
  const path = downloadPath.startsWith("/") ? downloadPath : `/${downloadPath}`;
  const res = await fetch(apiUrl(path), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const body = await parseJson(res).catch(() => null);
    throw new AgentApiError("fetch text failed", res.status, body);
  }
  return res.text();
}

/**
 * 带 Bearer 打开 UTF-8 文本流（用于大 CSV 懒加载预览）。
 * 调用方负责 `reader.read()` / `reader.cancel()`。
 */
export async function openAuthorizedUtf8TextStream(
  accessToken: string,
  downloadPath: string,
): Promise<ReadableStreamDefaultReader<string>> {
  const path = downloadPath.startsWith("/") ? downloadPath : `/${downloadPath}`;
  const res = await fetch(apiUrl(path), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const body = await parseJson(res).catch(() => null);
    throw new AgentApiError("open text stream failed", res.status, body);
  }
  if (!res.body) {
    throw new AgentApiError("response has no body", res.status, null);
  }
  const decoded = res.body.pipeThrough(new TextDecoderStream("utf-8", { fatal: false }));
  return decoded.getReader();
}

export async function getToolOrchestration(
  accessToken: string,
  orchestrationId: string,
): Promise<ToolOrchestrationStatusApi> {
  const res = await fetch(apiUrl(`/api/tool-orchestrations/${encodeURIComponent(orchestrationId)}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const raw = await safeJson(res);
  if (!res.ok) {
    throw new AgentApiError("get tool orchestration failed", res.status, raw);
  }
  assertJsonObject(raw);
  const orchestration_id = raw.orchestration_id;
  const finished = raw.finished;
  const success = raw.success;
  const steps = raw.steps;
  if (
    typeof orchestration_id !== "string" ||
    typeof finished !== "boolean" ||
    typeof success !== "boolean" ||
    !Array.isArray(steps)
  ) {
    throw new AgentApiError("invalid orchestration response shape", res.status, raw);
  }
  const parsedSteps = steps.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return {
        index,
        label: "",
        task_id: null,
        status: "PENDING",
      };
    }
    const o = item as Record<string, unknown>;
    return {
      index: typeof o.index === "number" ? o.index : index,
      label: typeof o.label === "string" ? o.label : "",
      task_id: typeof o.task_id === "string" ? o.task_id : null,
      status: typeof o.status === "string" ? o.status : "PENDING",
    };
  });
  return {
    orchestration_id,
    finished,
    success,
    steps: parsedSteps,
  };
}

export async function getTask(accessToken: string, taskId: string): Promise<TaskResponse> {
  const res = await fetch(apiUrl(`/api/tasks/${taskId}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new AgentApiError("get task failed", res.status, data);
  }
  assertJsonObject(data);
  return data as unknown as TaskResponse;
}

/** 任务事件 WebSocket URL（勿再把 token 放在 query，以免进入代理/浏览器日志）。连接成功后应立刻发送 {@link taskWebSocketAuthPayload}。 */
export function buildTaskWsUrl(taskId: string): string {
  const root = getAgentWsOrigin();
  const base = root.endsWith("/") ? root.slice(0, -1) : root;
  return `${base}/ws/tasks/${taskId}`;
}

/** 浏览器 WebSocket 无法自定义 Header 时，在 onopen 后发送此字符串完成鉴权。 */
export function taskWebSocketAuthPayload(accessToken: string): string {
  return JSON.stringify({ type: "auth", access_token: accessToken });
}
