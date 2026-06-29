export type E2EConfig = {
  adminUsername: string;
  adminPassword: string;
  fixturePrefix: string;
  feedbackResolvedStatus: string;
  feedbackAdminNote: string;
  host: string;
  port: number;
  baseUrl: string;
  webServerCommand: string;
  preflightTimeoutMs: number;
};

type EnvLike = Record<string, string | undefined>;

function trimToDefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  const normalized = trimToDefined(value);
  if (!normalized || !/^\d+$/.test(normalized)) return undefined;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function resolveE2EConfig(env: EnvLike): E2EConfig {
  const host = trimToDefined(env.PLAYWRIGHT_HOST) ?? "127.0.0.1";
  const port = parsePositiveInteger(env.PLAYWRIGHT_PORT) ?? 3000;
  const preflightTimeoutMs = parsePositiveInteger(env.PLAYWRIGHT_PREFLIGHT_TIMEOUT_MS) ?? 15000;

  return {
    adminUsername: trimToDefined(env.PLAYWRIGHT_ADMIN_USERNAME) ?? "admin",
    adminPassword: trimToDefined(env.PLAYWRIGHT_ADMIN_PASSWORD) ?? "admin123",
    fixturePrefix: trimToDefined(env.PLAYWRIGHT_FIXTURE_PREFIX) ?? "E2E",
    feedbackResolvedStatus: trimToDefined(env.PLAYWRIGHT_FEEDBACK_STATUS) ?? "archived",
    feedbackAdminNote: trimToDefined(env.PLAYWRIGHT_FEEDBACK_NOTE) ?? "playwright e2e fixture",
    host,
    port,
    baseUrl: `http://${host}:${port}`,
    webServerCommand: `npm run dev -- --hostname ${host} --port ${port}`,
    preflightTimeoutMs,
  };
}

export const e2eConfig = resolveE2EConfig(process.env as EnvLike);
