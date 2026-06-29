import type { AgentRoundRuntimeEvent } from "@/lib/agent-events";

export { isAgentRuntimeConfigured, isPlatformBackendEnabled } from "./config";
import { runPlatformRound } from "./platform-round";
import type { AgentRoundInput, StreamAgentRoundPlatformOptions } from "./types";

export type { AgentRoundInput, StreamAgentRoundPlatformOptions };

export async function streamAgentRound(
  input: AgentRoundInput,
  handlers: {
    onEvent: (event: AgentRoundRuntimeEvent) => void;
  },
  options?: { platform?: StreamAgentRoundPlatformOptions },
) {
  const sid = input.platformChatSessionId;
  const platform = options?.platform;
  if (sid && platform?.withFreshToken) {
    await runPlatformRound(input, handlers, sid, platform);
    return;
  }
  throw new Error(
    "当前任务没有可用平台会话。请从首页输入需求并发送以创建真实会话。",
  );
}
