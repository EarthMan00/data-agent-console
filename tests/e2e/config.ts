import path from "node:path";

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

export type RealRoundE2EConfig = {
  realRoundE2E: boolean;
  roundTimeoutMs: number;
  manifestPath: string;
  username: string;
  password: string;
};

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

export function resolveRealRoundE2EConfig(env: EnvLike): RealRoundE2EConfig {
  const manifestOverride = trimToDefined(env.PLAYWRIGHT_REAL_MANIFEST_PATH);
  return {
    realRoundE2E: env.RUN_REAL_CHAT_ROUND_E2E === "1",
    roundTimeoutMs:
      parsePositiveInteger(env.PLAYWRIGHT_REAL_ROUND_TIMEOUT_MS) ?? 1_200_000,
    manifestPath: path.resolve(
      manifestOverride ?? path.join("test-results", "chat-round-acceptance-manifest.json"),
    ),
    username: trimToDefined(env.PLAYWRIGHT_REAL_USERNAME) ?? "",
    password: env.PLAYWRIGHT_REAL_PASSWORD ?? "",
  };
}

export const e2eConfig = resolveE2EConfig(process.env as EnvLike);
export const realRoundE2EConfig = resolveRealRoundE2EConfig(process.env as EnvLike);
export const {
  realRoundE2E,
  roundTimeoutMs,
  manifestPath,
} = realRoundE2EConfig;
