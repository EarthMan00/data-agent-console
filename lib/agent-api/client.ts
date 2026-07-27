import { getAgentHttpApiBase } from "@/lib/agent-api/config";
import type {
  AdminUserRow,
  FavoriteFolderDto,
  FavoriteFolderListDto,
  LoginResponse,
  SessionMessagesPageResponse,
  SessionListResponse,
  SessionAttachmentUploadItem,
  TokenCheckResponse,
  UserFavoriteByTaskDto,
  UserFavoriteCreateBody,
  UserFavoriteDetailDto,
  UserFavoriteListDto,
  AdminPlan,
  AdminPromptCategory,
  AdminPromptTemplate,
  AdminPromptTemplateListResponse,
  AdminFeedbackEntry,
  AdminModelConfig,
  AdminAlicePersonaTemplate,
} from "@/lib/agent-api/types";

function apiUrl(path: string): string {
  const base = getAgentHttpApiBase();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

function appRouteUrl(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function triggerBrowserDownload(blob: Blob, filename: string) {
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

/** 读取响应体并解析 JSON；非 JSON（如代理返回 Internal Server Error 纯文本）时返回 `{ _nonJsonBody }`。 */
async function parseResponseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { _nonJsonBody: text.length > 2000 ? `${text.slice(0, 2000)}…` : text };
  }
}

/** 与 parseResponseJson 相同；保留名称供全文件 API 调用方使用。 */
async function parseJson(res: Response): Promise<unknown> {
  return parseResponseJson(res);
}

/** 在 !res.ok 时读取 body：优先解析 JSON，失败时返回含原文片段的占位对象，便于排障。 */
export async function readErrorResponseBody(res: Response): Promise<unknown> {
  return parseResponseJson(res);
}

function apiErrorDetailFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const o = body as Record<string, unknown>;
    if (typeof o._nonJsonBody === "string" && o._nonJsonBody.trim()) {
      return `${fallback}: ${o._nonJsonBody.trim().slice(0, 280)}`;
    }
    if (typeof o.detail === "string" && o.detail.trim()) {
      return `${fallback}: ${o.detail.trim().slice(0, 280)}`;
    }
  }
  return fallback;
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

function isBrowserNetworkError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const m = e.message.trim().toLowerCase();
  return (
    m === "failed to fetch" ||
    m.includes("networkerror") ||
    m.includes("network request failed") ||
    m.includes("load failed")
  );
}

/** 展示用：已含 `HTTP 数字` 的不再重复拼接状态码 */
export function formatAgentApiErrorForUser(e: unknown): string {
  if (isBrowserNetworkError(e)) {
    return (
      "无法连接服务：请确认本机前端开发服务（npm run dev）与后端（Alice 后端服务）均已启动后再试。" +
      "若刚执行完长任务，可先刷新页面。"
    );
  }
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

/** 读取响应 JSON；非 JSON 时返回 `{ _nonJsonBody }`，由调用方结合 `res.ok` 抛出 AgentApiError。 */
async function safeJson(res: Response): Promise<unknown> {
  return parseResponseJson(res);
}

function parseLoginResponse(data: unknown, status: number, errorLabel: string): LoginResponse {
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
    throw new AgentApiError(`invalid ${errorLabel} response shape`, status, data);
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

const EMAIL_LOGIN_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_LOGIN_RE = /^1[3-9]\d{9}$/;

function buildPasswordLoginBody(account: string, password: string): Record<string, string> {
  const a = account.trim();
  if (PHONE_LOGIN_RE.test(a)) {
    return { phone: a, password };
  }
  if (EMAIL_LOGIN_RE.test(a)) {
    return { email: a, password };
  }
  return { username: a, password };
}

export async function login(account: string, password: string): Promise<LoginResponse> {
  const body = buildPasswordLoginBody(account, password);
  const res = await fetch(appRouteUrl("/api/platform-auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const rawText = await res.text();
  let data: unknown;
  try {
    data = rawText ? (JSON.parse(rawText) as unknown) : null;
  } catch {
    const preview = rawText.replace(/\s+/g, " ").trim().slice(0, 120);
    throw new AgentApiError(
      res.status === 400 && /text\/html/i.test(res.headers.get("content-type") || "")
        ? "登录请求被网关拒绝（HTTP 400）。请检查服务器 AGENT_WEB_PLATFORM_INTERNAL_URL 是否指向本机后端（如 http://127.0.0.1:8000），勿使用公网 /agent-platform 地址。"
        : `登录接口返回非 JSON（多为网关/服务端 500）。响应片段：${preview || "(empty)"}`,
      res.status,
      rawText,
    );
  }
  if (!res.ok) {
    throw new AgentApiError("login failed", res.status, data);
  }
  return parseLoginResponse(data, res.status, "login");
}

export async function sendSmsLoginCode(phone: string): Promise<{ retryAfterSeconds: number | null }> {
  const res = await fetch(apiUrl("/api/auth/login/sms/send"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  if (res.status === 429) {
    const ra = (res.headers.get("Retry-After") || "").trim();
    const seconds = ra ? Number(ra) : NaN;
    return { retryAfterSeconds: Number.isFinite(seconds) && seconds > 0 ? seconds : 60 };
  }
  const data = await safeJson(res);
  if (!res.ok) {
    throw new AgentApiError(formatHttpErrorMessage(res, data, "获取验证码失败"), res.status, data);
  }
  return { retryAfterSeconds: null };
}

export async function loginBySms(phone: string, code: string): Promise<LoginResponse> {
  const res = await fetch(apiUrl("/api/auth/login/sms"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code }),
  });
  const data = await safeJson(res);
  if (!res.ok) {
    throw new AgentApiError(formatHttpErrorMessage(res, data, "短信登录失败"), res.status, data);
  }
  return parseLoginResponse(data, res.status, "login");
}

export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const sp = new URLSearchParams();
  sp.set("username", username);
  const res = await fetch(apiUrl(`/api/auth/register/username-availability?${sp.toString()}`));
  const data = await safeJson(res);
  if (!res.ok) {
    throw new AgentApiError("username availability check failed", res.status, data);
  }
  assertJsonObject(data);
  const av = (data as Record<string, unknown>).available;
  return av === true;
}

export async function sendRegisterEmailOtp(username: string, email: string): Promise<{ retryAfterSeconds: number | null }> {
  const res = await fetch(apiUrl("/api/auth/register/email/send"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email }),
  });
  if (res.status === 429) {
    const ra = (res.headers.get("Retry-After") || "").trim();
    const seconds = ra ? Number(ra) : NaN;
    return { retryAfterSeconds: Number.isFinite(seconds) && seconds > 0 ? seconds : 60 };
  }
  const data = await safeJson(res);
  if (!res.ok) {
    throw new AgentApiError(formatHttpErrorMessage(res, data, "获取邮箱验证码失败"), res.status, data);
  }
  return { retryAfterSeconds: null };
}

export async function registerByEmail(args: { username: string; email: string; password: string; code: string }): Promise<LoginResponse> {
  const res = await fetch(apiUrl("/api/auth/register/email"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const data = await safeJson(res);
  if (!res.ok) {
    throw new AgentApiError(formatHttpErrorMessage(res, data, "注册失败"), res.status, data);
  }
  return parseLoginResponse(data, res.status, "register");
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
  body: {
    username: string;
    password: string;
    /** standard=普通用户，premium=高级用户（由服务端绑定对应套餐） */
    account_kind: "standard" | "premium";
    email?: string | null;
    status?: string;
  },
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

function sanitizeAdminPlanWriteBody(
  body: {
    code?: string;
    name?: string;
    level?: number;
    can_use_tools?: boolean;
    features?: Record<string, unknown>;
  } & Record<string, unknown>,
): {
  code?: string;
  name?: string;
  level?: number;
  can_use_tools?: boolean;
  features?: Record<string, unknown>;
} {
  const { code, name, level, can_use_tools, features } = body;
  return { code, name, level, can_use_tools, features };
}

export async function refreshAccessToken(): Promise<string> {
  const res = await fetch(appRouteUrl("/api/platform-auth/refresh"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

export async function logoutPlatformAuth(accessToken?: string): Promise<void> {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const res = await fetch(appRouteUrl("/api/platform-auth/logout"), {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
  if (res.ok) return;
  throw new AgentApiError("logout failed", res.status, await safeJson(res));
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

export async function uploadSessionAttachments(
  accessToken: string,
  sessionId: string,
  files: File[],
): Promise<SessionAttachmentUploadItem[]> {
  if (files.length === 0) return [];
  const form = new FormData();
  for (const file of files) {
    form.append("files", file, file.name);
  }
  const res = await fetch(apiUrl(`/api/chat/${sessionId}/attachments`), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new AgentApiError(
      apiErrorDetailFromBody(data, formatHttpErrorMessage(res, data, "上传附件失败")),
      res.status,
      data,
    );
  }
  assertJsonObject(data);
  const attachments = data.attachments;
  if (!Array.isArray(attachments)) {
    throw new AgentApiError("invalid attachment upload response", res.status, data);
  }
  return attachments
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const row = item as Record<string, unknown>;
      const attachment_id = row.attachment_id;
      const name = row.name;
      const size = row.size;
      if (typeof attachment_id !== "string" || typeof name !== "string" || typeof size !== "number") {
        return null;
      }
      return { attachment_id, name, size };
    })
    .filter((item): item is SessionAttachmentUploadItem => item !== null);
}

/** 使用服务端验证后的 artifact `download_api` 拉取二进制并触发浏览器下载。 */
export async function downloadAuthorizedFile(
  accessToken: string,
  downloadPath: string,
  fallbackFilename: string,
): Promise<void> {
  const path = downloadPath.startsWith("/") ? downloadPath : `/${downloadPath}`;
  const res = await fetch(apiUrl(path), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const body = await readErrorResponseBody(res);
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
  triggerBrowserDownload(blob, filename);
}

/** 带 Bearer 拉取文本（用于预览 CSV/JSON 等）。 */
export async function fetchAuthorizedText(accessToken: string, downloadPath: string): Promise<string> {
  const path = downloadPath.startsWith("/") ? downloadPath : `/${downloadPath}`;
  const res = await fetch(apiUrl(path), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const body = await readErrorResponseBody(res);
    throw new AgentApiError("fetch text failed", res.status, body);
  }
  return res.text();
}

export async function listFavoriteFolders(accessToken: string): Promise<FavoriteFolderListDto> {
  const res = await fetch(apiUrl("/api/user/favorite-folders"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await safeJson(res);
  if (!res.ok) {
    throw new AgentApiError("list favorite folders failed", res.status, data);
  }
  return data as FavoriteFolderListDto;
}

export async function createFavoriteFolder(accessToken: string, name: string): Promise<FavoriteFolderDto> {
  const res = await fetch(apiUrl("/api/user/favorite-folders"), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data = await safeJson(res);
  if (!res.ok) {
    throw new AgentApiError("create favorite folder failed", res.status, data);
  }
  const raw = data as Record<string, unknown>;
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    sort_order: typeof raw.sort_order === "number" ? raw.sort_order : 0,
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
  };
}

export async function deleteFavoriteFolder(accessToken: string, folderId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/user/favorite-folders/${encodeURIComponent(folderId)}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.ok) return;
  const data = await parseJson(res);
  throw new AgentApiError("delete favorite folder failed", res.status, data);
}

export async function getFavoriteByTask(accessToken: string, taskId: string): Promise<UserFavoriteByTaskDto> {
  const res = await fetch(apiUrl(`/api/user/favorites/by-task/${encodeURIComponent(taskId)}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await safeJson(res);
  if (!res.ok) {
    throw new AgentApiError("get favorite by task failed", res.status, data);
  }
  return data as UserFavoriteByTaskDto;
}

export async function listUserFavorites(
  accessToken: string,
  opts?: { folderId?: string | null; page?: number; pageSize?: number },
): Promise<UserFavoriteListDto> {
  const sp = new URLSearchParams();
  if (opts?.folderId) sp.set("folder_id", opts.folderId);
  sp.set("page", String(opts?.page ?? 1));
  sp.set("page_size", String(opts?.pageSize ?? 50));
  const qs = sp.toString();
  const res = await fetch(apiUrl(`/api/user/favorites?${qs}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await safeJson(res);
  if (!res.ok) {
    throw new AgentApiError("list user favorites failed", res.status, data);
  }
  return data as UserFavoriteListDto;
}

export async function getUserFavorite(accessToken: string, favoriteId: string): Promise<UserFavoriteDetailDto> {
  const res = await fetch(apiUrl(`/api/user/favorites/${encodeURIComponent(favoriteId)}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await safeJson(res);
  if (!res.ok) {
    throw new AgentApiError("get user favorite failed", res.status, data);
  }
  return data as UserFavoriteDetailDto;
}

export async function createUserFavorite(accessToken: string, body: UserFavoriteCreateBody): Promise<UserFavoriteDetailDto> {
  const res = await fetch(apiUrl("/api/user/favorites"), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await safeJson(res);
  if (!res.ok) {
    throw new AgentApiError("create user favorite failed", res.status, data);
  }
  return data as UserFavoriteDetailDto;
}

export async function patchUserFavoriteTitle(accessToken: string, favoriteId: string, title: string): Promise<UserFavoriteDetailDto> {
  const res = await fetch(apiUrl(`/api/user/favorites/${encodeURIComponent(favoriteId)}`), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  const data = await safeJson(res);
  if (!res.ok) {
    throw new AgentApiError("patch favorite title failed", res.status, data);
  }
  return data as UserFavoriteDetailDto;
}

export async function moveUserFavorite(accessToken: string, favoriteId: string, folderId: string): Promise<UserFavoriteDetailDto> {
  const res = await fetch(apiUrl(`/api/user/favorites/${encodeURIComponent(favoriteId)}/move`), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ folder_id: folderId }),
  });
  const data = await safeJson(res);
  if (!res.ok) {
    throw new AgentApiError("move favorite failed", res.status, data);
  }
  return data as UserFavoriteDetailDto;
}

export async function deleteUserFavorite(accessToken: string, favoriteId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/user/favorites/${encodeURIComponent(favoriteId)}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.ok) return;
  const data = await parseJson(res);
  throw new AgentApiError("delete favorite failed", res.status, data);
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
    const body = await readErrorResponseBody(res);
    throw new AgentApiError("open text stream failed", res.status, body);
  }
  if (!res.body) {
    throw new AgentApiError("response has no body", res.status, null);
  }
  const decoded = res.body.pipeThrough(new TextDecoderStream("utf-8", { fatal: false }));
  return decoded.getReader();
}

// --- Plans ---

export async function adminListPlans(accessToken: string): Promise<{ plans: AdminPlan[] }> {
  const res = await fetch(apiUrl("/admin/plans"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await safeJson(res);
  if (!res.ok) throw new AgentApiError("list plans failed", res.status, data);
  return data as { plans: AdminPlan[] };
}

export async function adminCreatePlan(
  accessToken: string,
  body: { code: string; name: string; level?: number; can_use_tools?: boolean; features?: Record<string, unknown> },
): Promise<{ plan: AdminPlan }> {
  const res = await fetch(apiUrl("/admin/plans"), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(sanitizeAdminPlanWriteBody(body)),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new AgentApiError("create plan failed", res.status, data);
  return data as { plan: AdminPlan };
}

export async function adminPatchPlan(
  accessToken: string, planId: string,
  body: { name?: string; level?: number; can_use_tools?: boolean; features?: Record<string, unknown> },
): Promise<{ plan: AdminPlan }> {
  const res = await fetch(apiUrl(`/admin/plans/${encodeURIComponent(planId)}`), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(sanitizeAdminPlanWriteBody(body)),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new AgentApiError("patch plan failed", res.status, data);
  return data as { plan: AdminPlan };
}

export async function adminDeletePlan(accessToken: string, planId: string): Promise<void> {
  const res = await fetch(apiUrl(`/admin/plans/${encodeURIComponent(planId)}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.ok) return;
  throw new AgentApiError("delete plan failed", res.status, await safeJson(res));
}

// --- Prompts ---

export async function adminListPromptCategories(accessToken: string): Promise<{ categories: AdminPromptCategory[] }> {
  const res = await fetch(apiUrl("/admin/prompts/categories"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await safeJson(res);
  if (!res.ok) throw new AgentApiError("list prompt categories failed", res.status, data);
  return data as { categories: AdminPromptCategory[] };
}

export async function adminCreatePromptCategory(
  accessToken: string, body: { name: string; sort_order?: number },
): Promise<{ category: AdminPromptCategory }> {
  const res = await fetch(apiUrl("/admin/prompts/categories"), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new AgentApiError("create prompt category failed", res.status, data);
  return data as { category: AdminPromptCategory };
}

export async function adminPatchPromptCategory(
  accessToken: string, categoryId: string, body: { name: string; sort_order?: number },
): Promise<{ category: AdminPromptCategory }> {
  const res = await fetch(apiUrl(`/admin/prompts/categories/${encodeURIComponent(categoryId)}`), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new AgentApiError("patch prompt category failed", res.status, data);
  return data as { category: AdminPromptCategory };
}

export async function adminDeletePromptCategory(accessToken: string, categoryId: string): Promise<void> {
  const res = await fetch(apiUrl(`/admin/prompts/categories/${encodeURIComponent(categoryId)}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.ok) return;
  throw new AgentApiError("delete prompt category failed", res.status, await safeJson(res));
}

export async function adminListPromptTemplates(
  accessToken: string,
  categoryId: string,
  status?: string,
  page?: number,
  pageSize?: number,
): Promise<AdminPromptTemplateListResponse> {
  const params = new URLSearchParams();
  params.set("category_id", categoryId);
  if (status) params.set("status", status);
  if (page != null) params.set("page", String(page));
  if (pageSize != null) params.set("page_size", String(pageSize));
  const qs = params.toString();
  const res = await fetch(apiUrl(`/admin/prompts${qs ? `?${qs}` : ""}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await safeJson(res);
  if (!res.ok) throw new AgentApiError("list prompt templates failed", res.status, data);
  return data as AdminPromptTemplateListResponse;
}

export async function adminCreatePromptTemplate(
  accessToken: string, body: Record<string, unknown>,
): Promise<{ template: AdminPromptTemplate }> {
  const res = await fetch(apiUrl("/admin/prompts"), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new AgentApiError("create prompt template failed", res.status, data);
  return data as { template: AdminPromptTemplate };
}

export async function adminPatchPromptTemplate(
  accessToken: string, templateId: string, body: Record<string, unknown>,
): Promise<{ template: AdminPromptTemplate }> {
  const res = await fetch(apiUrl(`/admin/prompts/${encodeURIComponent(templateId)}`), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new AgentApiError("patch prompt template failed", res.status, data);
  return data as { template: AdminPromptTemplate };
}

export async function adminDeletePromptTemplate(accessToken: string, templateId: string): Promise<void> {
  const res = await fetch(apiUrl(`/admin/prompts/${encodeURIComponent(templateId)}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.ok) return;
  throw new AgentApiError("delete prompt template failed", res.status, await safeJson(res));
}

export type AdminImportPromptsResult = {
  ok: boolean;
  categories_created: number;
  categories_deleted: number;
  templates_created: number;
  templates_deleted: number;
  errors: string[];
};

export async function adminImportPromptsFromExcel(
  accessToken: string,
  file: File,
): Promise<AdminImportPromptsResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(apiUrl("/admin/prompts/import"), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  const data = await safeJson(res);
  if (!res.ok) {
    const detail = parseFastApiDetail(data) || `导入失败 (HTTP ${res.status})`;
    throw new AgentApiError(detail, res.status, data);
  }
  return data as AdminImportPromptsResult;
}

// --- Feedback ---

export async function adminListFeedback(
  accessToken: string, params?: { status?: string; page_path?: string; page?: number; page_size?: number },
): Promise<{ entries: AdminFeedbackEntry[] }> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.page_path) qs.set("page_path", params.page_path);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.page_size) qs.set("page_size", String(params.page_size));
  const query = qs.toString();
  const res = await fetch(apiUrl(`/admin/feedback${query ? `?${query}` : ""}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await safeJson(res);
  if (!res.ok) throw new AgentApiError("list feedback failed", res.status, data);
  return data as { entries: AdminFeedbackEntry[] };
}

export async function adminPatchFeedback(
  accessToken: string, entryId: string, body: { status?: string; admin_note?: string },
): Promise<{ entry: AdminFeedbackEntry }> {
  const res = await fetch(apiUrl(`/admin/feedback/${encodeURIComponent(entryId)}`), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new AgentApiError("patch feedback failed", res.status, data);
  return data as { entry: AdminFeedbackEntry };
}

// --- Admin: model configs ---

export async function adminListModelConfigs(accessToken: string): Promise<{ configs: AdminModelConfig[] }> {
  const res = await fetch(apiUrl("/admin/models"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await safeJson(res);
  if (!res.ok) throw new AgentApiError("list model configs failed", res.status, data);
  return data as { configs: AdminModelConfig[] };
}

export async function adminCreateModelConfig(
  accessToken: string,
  body: { name: string; api_key: string; base_url: string; model: string; request_timeout?: number },
): Promise<{ config: AdminModelConfig }> {
  const res = await fetch(apiUrl("/admin/models"), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new AgentApiError("create model config failed", res.status, data);
  return data as { config: AdminModelConfig };
}

export async function adminPatchModelConfig(
  accessToken: string, configId: string,
  body: { name?: string; api_key?: string; base_url?: string; model?: string; request_timeout?: number },
): Promise<{ config: AdminModelConfig }> {
  const res = await fetch(apiUrl(`/admin/models/${encodeURIComponent(configId)}`), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new AgentApiError("patch model config failed", res.status, data);
  return data as { config: AdminModelConfig };
}

export async function adminDeleteModelConfig(accessToken: string, configId: string): Promise<void> {
  const res = await fetch(apiUrl(`/admin/models/${encodeURIComponent(configId)}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.ok) return;
  throw new AgentApiError("delete model config failed", res.status, await safeJson(res));
}

export async function adminActivateModelConfig(accessToken: string, configId: string): Promise<void> {
  const res = await fetch(apiUrl(`/admin/models/${encodeURIComponent(configId)}/activate`), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.ok) return;
  throw new AgentApiError("activate model config failed", res.status, await safeJson(res));
}

// --- Admin: Alice persona templates ---

export async function adminListAlicePersonas(accessToken: string): Promise<{ personas: AdminAlicePersonaTemplate[] }> {
  const res = await fetch(apiUrl("/admin/personas"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await safeJson(res);
  if (!res.ok) throw new AgentApiError("list Alice personas failed", res.status, data);
  return data as { personas: AdminAlicePersonaTemplate[] };
}

export async function adminCreateAlicePersona(
  accessToken: string,
  body: { name: string; description?: string | null } & Partial<Pick<
    AdminAlicePersonaTemplate,
    | "identity"
    | "communication_style"
    | "output_contract"
    | "safety_rules"
    | "internal_reasoning_policy"
    | "decompose_prompt"
    | "error_humanize_prompt"
  >>,
): Promise<{ persona: AdminAlicePersonaTemplate }> {
  const res = await fetch(apiUrl("/admin/personas"), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new AgentApiError("create Alice persona failed", res.status, data);
  return data as { persona: AdminAlicePersonaTemplate };
}

export async function adminPatchAlicePersona(
  accessToken: string,
  personaId: string,
  body: Partial<Pick<
    AdminAlicePersonaTemplate,
    | "name"
    | "description"
    | "identity"
    | "communication_style"
    | "output_contract"
    | "safety_rules"
    | "internal_reasoning_policy"
    | "decompose_prompt"
    | "error_humanize_prompt"
  >>,
): Promise<{ persona: AdminAlicePersonaTemplate }> {
  const res = await fetch(apiUrl(`/admin/personas/${encodeURIComponent(personaId)}`), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new AgentApiError("patch Alice persona failed", res.status, data);
  return data as { persona: AdminAlicePersonaTemplate };
}

export async function adminDeleteAlicePersona(accessToken: string, personaId: string): Promise<void> {
  const res = await fetch(apiUrl(`/admin/personas/${encodeURIComponent(personaId)}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.ok) return;
  throw new AgentApiError("delete Alice persona failed", res.status, await safeJson(res));
}

export async function adminActivateAlicePersona(
  accessToken: string,
  personaId: string,
): Promise<{ persona: AdminAlicePersonaTemplate }> {
  const res = await fetch(apiUrl(`/admin/personas/${encodeURIComponent(personaId)}/activate`), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await safeJson(res);
  if (!res.ok) throw new AgentApiError("activate Alice persona failed", res.status, data);
  return data as { persona: AdminAlicePersonaTemplate };
}
