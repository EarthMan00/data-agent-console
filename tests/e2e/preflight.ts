import type { FullConfig } from "@playwright/test";

import { e2eConfig } from "./config";
import { AgentPlatformRequestError } from "./http";

export type PreflightStepKey =
  | "baseUrlReachability"
  | "adminLogin"
  | "favoriteFoldersApi"
  | "promptCategoryRoundTrip";

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

  if (error instanceof Error) {
    return `${prefix}: ${error.message}`;
  }
  return `${prefix}: ${String(error)}`;
}

export function resolveConfiguredBaseUrl(config: FullConfig): string {
  const configured = config.projects[0]?.use?.baseURL;
  return typeof configured === "string" && configured.trim() ? configured : e2eConfig.baseUrl;
}
