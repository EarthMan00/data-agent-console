import { getAgentHttpApiBase } from "@/lib/agent-api/config";
import { AgentApiError, parseFastApiDetail } from "@/lib/agent-api/client";

export const EXTERNAL_API_KEY_SCOPES = [
  "bulk.run",
  "run.read",
  "bundle.download",
] as const;

export type ExternalApiKeyScope = (typeof EXTERNAL_API_KEY_SCOPES)[number];

export type ExternalApiKeyItem = {
  key_id: string;
  name: string;
  key_prefix: string;
  key_last4: string;
  scopes: ExternalApiKeyScope[];
  status: "active" | "revoked" | string;
  created_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
};

export type ExternalApiKeyCreated = ExternalApiKeyItem & {
  api_key: string;
  warning: string;
};

function apiUrl(path: string): string {
  const base = getAgentHttpApiBase();
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

async function responseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { detail: text.slice(0, 280) };
  }
}

function externalErrorMessage(body: unknown, fallback: string): string {
  const fastApiDetail = parseFastApiDetail(body);
  if (fastApiDetail) return fastApiDetail;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const error = (body as { error?: unknown }).error;
    if (error && typeof error === "object" && !Array.isArray(error)) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) return message.trim();
    }
  }
  return fallback;
}

async function requireOk<T>(response: Response, fallback: string): Promise<T> {
  const body = await responseBody(response);
  if (!response.ok) {
    throw new AgentApiError(
      externalErrorMessage(body, fallback),
      response.status,
      body,
    );
  }
  return body as T;
}

export async function listExternalApiKeys(
  accessToken: string,
): Promise<ExternalApiKeyItem[]> {
  const response = await fetch(apiUrl("/api/user/api-keys"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await requireOk<{ items: ExternalApiKeyItem[] }>(
    response,
    "加载 API 密钥失败",
  );
  return body.items;
}

export async function createExternalApiKey(
  accessToken: string,
  name: string,
): Promise<ExternalApiKeyCreated> {
  const response = await fetch(apiUrl("/api/user/api-keys"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      scopes: [...EXTERNAL_API_KEY_SCOPES],
    }),
  });
  return requireOk<ExternalApiKeyCreated>(response, "创建 API 密钥失败");
}

export async function revokeExternalApiKey(
  accessToken: string,
  keyId: string,
): Promise<void> {
  const response = await fetch(
    apiUrl(`/api/user/api-keys/${encodeURIComponent(keyId)}`),
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  await requireOk<unknown>(response, "撤销 API 密钥失败");
}

export async function restoreExternalApiKey(
  accessToken: string,
  keyId: string,
): Promise<void> {
  const response = await fetch(
    apiUrl(`/api/user/api-keys/${encodeURIComponent(keyId)}/restore`),
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  await requireOk<unknown>(response, "恢复 API 密钥失败");
}
