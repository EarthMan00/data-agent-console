import type { ChatRoundStatus } from "@/lib/agent-api/types";

/** Only an authoritative durable Round status can make Stop available. */
export function roundCanStop(status: ChatRoundStatus | null): boolean {
  return (
    status === "QUEUED" ||
    status === "PLANNING" ||
    status === "GENERATING" ||
    status === "EXECUTING" ||
    status === "WAITING_INPUT"
  );
}
