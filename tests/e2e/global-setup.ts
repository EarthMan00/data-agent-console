import type { FullConfig } from "@playwright/test";

import { e2eConfig, realRoundE2EConfig } from "./config";
import {
  agentPlatformUrl,
  fetchJson,
  loginAsAdmin,
  type LoginResponse,
} from "./http";
import {
  formatPreflightFailure,
  RealPreflightError,
  resolveConfiguredBaseUrl,
  type PreflightStepKey,
} from "./preflight";

type AdminPromptCategoryCreateResponse = {
  category?: { id: string };
};

type FavoriteFolderListResponse = {
  items?: Array<{ id: string }>;
};

type HealthResponse = {
  database?: unknown;
};

type SessionListResponse = {
  total?: unknown;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function timeoutSignal(): AbortSignal {
  return AbortSignal.timeout(e2eConfig.preflightTimeoutMs);
}

async function runPreflightStep<T>(step: PreflightStepKey, fn: () => Promise<T>, baseURL: string): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw new Error(
      formatPreflightFailure(step, error, {
        baseURL,
        preflightTimeoutMs: e2eConfig.preflightTimeoutMs,
      }),
    );
  }
}

async function ensureBaseUrlReachable(baseURL: string): Promise<void> {
  const res = await fetch(baseURL, {
    method: "GET",
    redirect: "manual",
    signal: timeoutSignal(),
  });
  if (res.status < 200 || res.status >= 400) {
    throw new Error(`unexpected HTTP ${res.status} from ${baseURL}`);
  }
}

async function ensureFavoriteFoldersReadable(baseURL: string, accessToken: string): Promise<void> {
  await fetchJson<FavoriteFolderListResponse>(baseURL, "/api/user/favorite-folders", {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: timeoutSignal(),
  });
}

async function ensurePromptCategoryRoundTrip(baseURL: string, accessToken: string): Promise<void> {
  const created = await fetchJson<AdminPromptCategoryCreateResponse>(baseURL, "/admin/prompts/categories", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: `${e2eConfig.fixturePrefix} Preflight Category ${Date.now()}`,
      sort_order: 9999,
    }),
    signal: timeoutSignal(),
  });
  const categoryId = created.category?.id;
  if (!categoryId) {
    throw new Error("preflight category id missing");
  }

  const cleanup = await fetch(agentPlatformUrl(baseURL, `/admin/prompts/categories/${encodeURIComponent(categoryId)}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: timeoutSignal(),
  });
  if (!cleanup.ok) {
    throw new Error(`preflight category cleanup failed (${cleanup.status})`);
  }
}

function ensureRealCredentialsConfigured(): void {
  if (!realRoundE2EConfig.username || !realRoundE2EConfig.password) {
    throw new RealPreflightError("credentials_missing");
  }
}

async function loginAsRealUser(baseURL: string): Promise<LoginResponse> {
  const auth = await fetchJson<LoginResponse>(baseURL, "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: realRoundE2EConfig.username,
      password: realRoundE2EConfig.password,
    }),
    signal: timeoutSignal(),
  });
  if (!auth.access_token || !UUID_RE.test(auth.user_id)) {
    throw new RealPreflightError("authentication_rejected");
  }
  return auth;
}

async function ensureRealBackendHealthy(baseURL: string): Promise<void> {
  const response = await fetch(agentPlatformUrl(baseURL, "/health"), {
    headers: { Accept: "application/json" },
    signal: timeoutSignal(),
  });
  let body: HealthResponse | null = null;
  try {
    body = await response.json() as HealthResponse;
  } catch {
    throw new RealPreflightError("backend_wiring", response.status);
  }
  if (response.status !== 200) {
    if (body && Object.hasOwn(body, "database") && body.database !== "ok") {
      throw new RealPreflightError("database_migration", response.status);
    }
    throw new RealPreflightError("backend_wiring", response.status);
  }
  if (body?.database !== "ok") {
    throw new RealPreflightError("database_migration", response.status);
  }
}

async function ensureRoundFaultGuard(baseURL: string): Promise<void> {
  const response = await fetch(agentPlatformUrl(baseURL, "/api/chat/rounds"), {
    method: "OPTIONS",
    headers: {
      Origin: baseURL,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers":
        "Authorization, X-Request-ID, X-Round-Test-Fault",
    },
    signal: timeoutSignal(),
  });
  const allowed = (response.headers.get("access-control-allow-headers") ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase());
  if (!response.ok || !allowed.includes("x-round-test-fault")) {
    throw new RealPreflightError("fault_guard", response.status);
  }
}

async function readSessionTotal(baseURL: string, accessToken: string): Promise<number> {
  const page = await fetchJson<SessionListResponse>(
    baseURL,
    "/api/sessions?page=1&page_size=1",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: timeoutSignal(),
    },
  );
  if (!Number.isSafeInteger(page.total) || typeof page.total !== "number" || page.total < 0) {
    throw new RealPreflightError("session_persistence");
  }
  return page.total;
}

async function ensureEmptyRoundRejectedWithoutSession(
  baseURL: string,
  accessToken: string,
): Promise<void> {
  const before = await readSessionTotal(baseURL, accessToken);
  const clientMessageId = crypto.randomUUID();
  const body = new FormData();
  body.append("message", "");
  body.append("client_message_id", clientMessageId);
  const response = await fetch(agentPlatformUrl(baseURL, "/api/chat/rounds"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Request-ID": clientMessageId,
    },
    body,
    signal: timeoutSignal(),
  });
  if (response.status !== 422) {
    throw new RealPreflightError("round_schema", response.status);
  }
  const after = await readSessionTotal(baseURL, accessToken);
  if (after !== before) {
    throw new RealPreflightError("session_persistence");
  }
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = resolveConfiguredBaseUrl(config);

  await runPreflightStep("baseUrlReachability", async () => {
    await ensureBaseUrlReachable(baseURL);
  }, baseURL);

  const auth = await runPreflightStep("adminLogin", async () => {
    return loginAsAdmin(baseURL, { signal: timeoutSignal() });
  }, baseURL);

  await runPreflightStep("favoriteFoldersApi", async () => {
    await ensureFavoriteFoldersReadable(baseURL, auth.access_token);
  }, baseURL);

  await runPreflightStep("promptCategoryRoundTrip", async () => {
    await ensurePromptCategoryRoundTrip(baseURL, auth.access_token);
  }, baseURL);

  if (!realRoundE2EConfig.realRoundE2E) return;

  await runPreflightStep("realUserCredentials", async () => {
    ensureRealCredentialsConfigured();
  }, baseURL);

  const realAuth = await runPreflightStep("realUserLogin", async () => {
    return loginAsRealUser(baseURL);
  }, baseURL);

  await runPreflightStep("realBackendHealth", async () => {
    await ensureRealBackendHealthy(baseURL);
  }, baseURL);

  await runPreflightStep("realRoundFaultGuard", async () => {
    await ensureRoundFaultGuard(baseURL);
  }, baseURL);

  await runPreflightStep("realRoundRouteSchema", async () => {
    await ensureEmptyRoundRejectedWithoutSession(baseURL, realAuth.access_token);
  }, baseURL);
}
