import { isAgentApiProxyEnabled, isAgentRealApiEnabled } from "@/lib/agent-api/config";

import { API_BASE, RUNTIME_MODE } from "./constants";

export function isPlatformBackendEnabled() {
  return isAgentRealApiEnabled();
}

export function isAgentRuntimeConfigured() {
  if (isAgentRealApiEnabled()) {
    if (isAgentApiProxyEnabled()) return true;
    return Boolean(process.env.NEXT_PUBLIC_AGENT_API_ORIGIN?.trim());
  }
  return Boolean(API_BASE);
}

export function isMockRuntimeEnabled() {
  if (isAgentRealApiEnabled()) return false;
  return RUNTIME_MODE === "mock";
}

export function getApiBase() {
  if (!API_BASE) {
    throw new Error("未配置会话后端接口：请设置 NEXT_PUBLIC_AGENT_API_BASE_URL");
  }
  return API_BASE;
}
