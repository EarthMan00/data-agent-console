import { isAgentApiProxyEnabled, isAgentRealApiEnabled } from "@/lib/agent-api/config";

import { API_BASE } from "./constants";

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

/** 项目规则（见仓库 readme.txt）：console 只使用真实数据，不开启本地 mock 推理运行模式。 */
export function isMockRuntimeEnabled() {
  return false;
}

export function getApiBase() {
  if (!API_BASE) {
    throw new Error("未配置会话后端接口：请设置 NEXT_PUBLIC_AGENT_API_BASE_URL");
  }
  return API_BASE;
}
