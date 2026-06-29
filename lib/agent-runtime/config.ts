import { isAgentApiProxyEnabled } from "@/lib/agent-api/config";

export function isPlatformBackendEnabled() {
  return true;
}

export function isAgentRuntimeConfigured() {
  if (isAgentApiProxyEnabled()) return true;
  return Boolean(process.env.NEXT_PUBLIC_AGENT_API_ORIGIN?.trim());
}
