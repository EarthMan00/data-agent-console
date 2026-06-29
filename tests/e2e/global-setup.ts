import type { FullConfig } from "@playwright/test";

import { e2eConfig } from "./config";
import { agentPlatformUrl, fetchJson, loginAsAdmin } from "./http";
import { formatPreflightFailure, resolveConfiguredBaseUrl, type PreflightStepKey } from "./preflight";

type AdminPromptCategoryCreateResponse = {
  category?: { id: string };
};

type FavoriteFolderListResponse = {
  items?: Array<{ id: string }>;
};

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
}
