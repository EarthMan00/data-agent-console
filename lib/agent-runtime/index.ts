import { isAgentRealApiEnabled } from "@/lib/agent-api/config";
import type { AgentRoundRuntimeEvent } from "@/lib/agent-events";

import { runApiRound } from "./api-round";
import { getApiBase, isAgentRuntimeConfigured, isPlatformBackendEnabled } from "./config";
import { runPlatformRound } from "./platform-round";
import type { AgentCreateRunInput, AgentRoundInput, AgentRunSnapshot, StreamAgentRoundPlatformOptions } from "./types";
import { parseJsonResponse } from "./util";

export type { AgentCreateRunInput, AgentRoundInput, AgentRunSnapshot, StreamAgentRoundPlatformOptions };

export { isAgentRuntimeConfigured, isMockRuntimeEnabled, isPlatformBackendEnabled } from "./config";

export async function createAgentRun(input: AgentCreateRunInput) {
  const base = getApiBase();
  const response = await fetch(`${base}/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  return parseJsonResponse<AgentRunSnapshot>(response);
}

export async function streamAgentRound(
  input: AgentRoundInput,
  handlers: {
    onEvent: (event: AgentRoundRuntimeEvent) => void;
  },
  options?: { platform?: StreamAgentRoundPlatformOptions },
) {
  if (isAgentRealApiEnabled()) {
    const { withFreshToken } = options?.platform ?? {};
    const sid = input.platformChatSessionId;
    if (sid && withFreshToken) {
      await runPlatformRound(input, handlers, sid, withFreshToken);
      return;
    }
    throw new Error(
      "已开启平台后端，但当前任务没有可用平台会话。请从首页输入需求并发送以创建真实会话。",
    );
  }
  await runApiRound(input, handlers);
}
