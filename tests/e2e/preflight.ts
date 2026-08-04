import type { FullConfig } from "@playwright/test";

import { e2eConfig } from "./config";
import { AgentPlatformRequestError } from "./http";

export type PreflightStepKey =
  | "baseUrlReachability"
  | "adminLogin"
  | "favoriteFoldersApi"
  | "promptCategoryRoundTrip"
  | "realUserCredentials"
  | "realUserLogin"
  | "realBackendHealth"
  | "realRoundFaultGuard"
  | "realRoundRouteSchema";

export type RealPreflightFailureClass =
  | "credentials_missing"
  | "authentication_rejected"
  | "backend_wiring"
  | "database_migration"
  | "fault_guard"
  | "round_schema"
  | "session_persistence";

export class RealPreflightError extends Error {
  constructor(
    public readonly failureClass: RealPreflightFailureClass,
    public readonly status?: number,
  ) {
    super(failureClass);
    this.name = "RealPreflightError";
  }
}

export type PreflightContext = {
  baseURL: string;
  preflightTimeoutMs: number;
};

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "TimeoutError" || /timed?\s*out|aborted due to timeout/i.test(error.message);
}

function detailSuffix(error: AgentPlatformRequestError): string {
  return error.detail ? ` Detail: ${error.detail}.` : "";
}

function statusSuffix(error: unknown): string {
  const status = error instanceof RealPreflightError || error instanceof AgentPlatformRequestError
    ? error.status
    : undefined;
  return status === undefined ? "" : ` (HTTP ${status})`;
}

export function formatPreflightFailure(
  step: PreflightStepKey,
  error: unknown,
  context: PreflightContext,
): string {
  const prefix = {
    baseUrlReachability: "[playwright preflight] baseURL reachability failed",
    adminLogin: "[playwright preflight] admin login failed",
    favoriteFoldersApi: "[playwright preflight] favorite folders API failed",
    promptCategoryRoundTrip: "[playwright preflight] prompt category create/delete failed",
    realUserCredentials: "[playwright preflight] dedicated real-user credentials failed",
    realUserLogin: "[playwright preflight] dedicated real-user authentication failed",
    realBackendHealth: "[playwright preflight] real backend health failed",
    realRoundFaultGuard: "[playwright preflight] Round double fault-guard failed",
    realRoundRouteSchema: "[playwright preflight] Round route/schema wiring failed",
  }[step];

  if (step === "baseUrlReachability" && isTimeoutError(error)) {
    return `${prefix}: timed out after ${context.preflightTimeoutMs}ms while reaching ${context.baseURL}. Check that the Next.js app is listening on PLAYWRIGHT_HOST/PLAYWRIGHT_PORT or that the reused server is already running.`;
  }

  if (step === "adminLogin" && error instanceof AgentPlatformRequestError && (error.status === 401 || error.status === 403)) {
    return `${prefix}: backend rejected the configured admin credentials at ${error.path} (HTTP ${error.status}). Check PLAYWRIGHT_ADMIN_USERNAME / PLAYWRIGHT_ADMIN_PASSWORD and ensure the local admin account is seeded.${detailSuffix(error)}`;
  }

  if (step === "favoriteFoldersApi" && error instanceof AgentPlatformRequestError) {
    return `${prefix}: authenticated session could not read ${error.path} (HTTP ${error.status}). Check token seeding, auth wiring, and the user favorites API.${detailSuffix(error)}`;
  }

  if (step === "promptCategoryRoundTrip" && error instanceof AgentPlatformRequestError) {
    return `${prefix}: authenticated admin could not create and delete prompt categories via ${error.path} (HTTP ${error.status}). Check database connectivity, migrations, and admin prompt APIs.${detailSuffix(error)}`;
  }

  if (step === "realUserCredentials") {
    return `${prefix}: set both PLAYWRIGHT_REAL_USERNAME and PLAYWRIGHT_REAL_PASSWORD only in the secure environment used for the real durability suite.`;
  }

  if (step === "realUserLogin") {
    return `${prefix}${statusSuffix(error)}: check PLAYWRIGHT_REAL_USERNAME / PLAYWRIGHT_REAL_PASSWORD and ensure the dedicated real user exists; credential values are intentionally not reported.`;
  }

  if (step === "realBackendHealth") {
    if (error instanceof RealPreflightError && error.failureClass === "database_migration") {
      return `${prefix}${statusSuffix(error)}: the Console proxy reached FastAPI, but database health is not ok. Check DATABASE_URL and required migrations.`;
    }
    return `${prefix}${statusSuffix(error)}: could not validate FastAPI through /agent-platform/health. Check backend reachability and Console proxy wiring.`;
  }

  if (step === "realRoundFaultGuard") {
    return `${prefix}${statusSuffix(error)}: /api/chat/rounds CORS does not allow X-Round-Test-Fault. Start the isolated Server parent process with exact AGENT_WEB_ENV=test and ROUND_TEST_FAULTS_ENABLED=1 values; never enable them in production.`;
  }

  if (step === "realRoundRouteSchema") {
    if (error instanceof RealPreflightError && error.failureClass === "session_persistence") {
      return `${prefix}${statusSuffix(error)}: authenticated Session totals were unavailable or changed after schema rejection. Check database connectivity, migrations, and Session persistence.`;
    }
    return `${prefix}${statusSuffix(error)}: an authenticated empty multipart Round request must be rejected with HTTP 422 before route execution. Check Round route/schema proxy wiring.`;
  }

  if (error instanceof Error) {
    return `${prefix}: ${error.message}`;
  }
  return `${prefix}: ${String(error)}`;
}

export function resolveConfiguredBaseUrl(config: FullConfig): string {
  const configured = config.projects[0]?.use?.baseURL;
  return typeof configured === "string" && configured.trim() ? configured : e2eConfig.baseUrl;
}
