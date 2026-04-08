import { isAgentRealApiEnabled } from "@/lib/agent-api/config";
import type { AgentRoundRuntimeEvent } from "@/lib/agent-events";

import { runApiRound } from "./api-round";
import { getApiBase, isAgentRuntimeConfigured, isMockRuntimeEnabled, isPlatformBackendEnabled } from "./config";
import { runMockRound } from "./mock-round";
import { runPlatformRound } from "./platform-round";
import type { AgentCreateRunInput, AgentRoundInput, AgentRunSnapshot, StreamAgentRoundPlatformOptions } from "./types";
import { parseJsonResponse } from "./util";

export type { AgentCreateRunInput, AgentRoundInput, AgentRunSnapshot, StreamAgentRoundPlatformOptions };

export { isAgentRuntimeConfigured, isMockRuntimeEnabled, isPlatformBackendEnabled };

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
      "已开启后端联调（NEXT_PUBLIC_AGENT_USE_REAL_API=1），但当前任务是内置演示数据，没有平台会话。请返回首页输入需求并发送以创建真实会话；不要直接打开 /agent 或点击侧栏里的演示历史对话。",
    );
  }
  if (isMockRuntimeEnabled()) {
    await runMockRound(input, handlers);
    return;
  }
  await runApiRound(input, handlers);
}
