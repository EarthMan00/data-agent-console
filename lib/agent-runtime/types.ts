import type { AgentAttachment } from "@/lib/agent-events";
import type { Report, TaskRun } from "@/lib/workspace-store";

export type AgentRunSnapshot = {
  run: TaskRun;
  report: Report;
};

export type AgentCreateRunInput = {
  objective: string;
  mode: TaskRun["mode"];
  selectedCapabilities: string[];
};

export type AgentRoundInput = {
  roundId: string;
  runId: string;
  prompt: string;
  mode: "普通模式" | "深度模式";
  selectedCapabilities: string[];
  attachments: AgentAttachment[];
  objective?: string;
  isInitialRound?: boolean;
  /** Data Agent Server 的会话 id，对应 TaskRun.platformSessionId */
  platformChatSessionId?: string;
};

export type StreamAgentRoundPlatformOptions = {
  withFreshToken: (run: (token: string) => Promise<void>) => Promise<void>;
};
