import { e2eConfig } from "./config";

export type LoginResponse = {
  access_token: string;
  refresh_token: string;
  user_id: string;
  user_role?: string;
};

const AGENT_PLATFORM_PREFIX = "/agent-platform";

export class AgentPlatformRequestError extends Error {
  path: string;
  status: number;
  detail?: string;

  constructor(path: string, status: number, detail?: string) {
    super(detail ? `request failed (${status}) for ${path}: ${detail}` : `request failed (${status}) for ${path}`);
    this.name = "AgentPlatformRequestError";
    this.path = path;
    this.status = status;
    this.detail = detail;
  }
}

export function agentPlatformUrl(baseURL: string, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(`${AGENT_PLATFORM_PREFIX}${normalizedPath}`, baseURL).toString();
}

export async function parseJson<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text) as T;
}

function extractErrorDetail(data: unknown): string | undefined {
  if (typeof data === "string") {
    const trimmed = data.trim();
    return trimmed || undefined;
  }
  if (!data || typeof data !== "object") return undefined;

  const candidate = data as Record<string, unknown>;
  for (const key of ["detail", "message", "error"]) {
    const value = candidate[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

export async function fetchJson<T>(baseURL: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(agentPlatformUrl(baseURL, path), init);
  const data = await parseJson<T>(res);
  if (!res.ok) {
    throw new AgentPlatformRequestError(path, res.status, extractErrorDetail(data));
  }
  return data as T;
}

export async function loginAsAdmin(baseURL: string, init?: RequestInit): Promise<LoginResponse> {
  return fetchJson<LoginResponse>(baseURL, "/api/auth/login", {
    ...init,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    body: JSON.stringify({
      username: e2eConfig.adminUsername,
      password: e2eConfig.adminPassword,
    }),
  });
}
