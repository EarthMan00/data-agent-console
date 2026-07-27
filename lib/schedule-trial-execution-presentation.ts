import type { ChatRoundSnapshot } from "@/lib/agent-api/types";
import type { ScheduleTrialMetaV2 } from "@/lib/schedule-create-draft";

const TERMINABLE_STATUSES = new Set<ChatRoundSnapshot["status"]>([
  "QUEUED",
  "PLANNING",
  "GENERATING",
  "EXECUTING",
  "WAITING_INPUT",
]);

export function resolveScheduleTrialRound(
  meta: ScheduleTrialMetaV2 | null,
  routeSessionId: string,
  snapshots: ReadonlyMap<string, ChatRoundSnapshot>,
): ChatRoundSnapshot | null {
  if (!meta || meta.sessionId !== routeSessionId) return null;
  const round = snapshots.get(meta.roundId) ?? null;
  if (!round || round.round_id !== meta.roundId || round.session_id !== meta.sessionId) return null;
  return round;
}

export function scheduleTrialCanSave(round: ChatRoundSnapshot | null): boolean {
  return round?.status === "SUCCEEDED" || round?.status === "PARTIAL_SUCCESS";
}

export function scheduleTrialCanTerminate(round: ChatRoundSnapshot | null): boolean {
  return Boolean(round && TERMINABLE_STATUSES.has(round.status));
}
