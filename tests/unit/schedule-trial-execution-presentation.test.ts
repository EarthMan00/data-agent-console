import { describe, expect, it } from "vitest";

import {
  resolveScheduleTrialRound,
  scheduleTrialCanSave,
  scheduleTrialCanTerminate,
} from "@/lib/schedule-trial-execution-presentation";
import type { ChatRoundSnapshot, ChatRoundStatus } from "@/lib/agent-api/types";

const SESSION_ID = "f4159ee9-c863-41c8-9c1b-ffbfa193917f";
const ROUND_ID = "3da8ff9a-95e2-4f9e-9788-7fda3d450fe7";
const ASSISTANT_ID = "46aa60a5-64dd-471d-adfe-9856a3ee17c5";
const META = { v: 2 as const, sessionId: SESSION_ID, roundId: ROUND_ID, sendKind: "queued" as const };

function snapshot(status: ChatRoundStatus, overrides: Partial<ChatRoundSnapshot> = {}): ChatRoundSnapshot {
  return {
    round_id: ROUND_ID,
    session_id: SESSION_ID,
    status,
    assistant_message_id: ASSISTANT_ID,
    content: "",
    last_event_seq: 1,
    steps: [],
    error_code: null,
    error_message: null,
    ...overrides,
  };
}

describe("schedule trial authoritative Round presentation", () => {
  it("resolves only the persisted v2 Session/Round identity", () => {
    const expected = snapshot("EXECUTING");
    expect(resolveScheduleTrialRound(META, SESSION_ID, new Map([[ROUND_ID, expected]]))).toBe(expected);
    expect(resolveScheduleTrialRound(META, "a27ab89a-74bc-43f0-bb15-bb3b8387635e", new Map([[ROUND_ID, expected]]))).toBeNull();
    expect(resolveScheduleTrialRound(META, SESSION_ID, new Map([[ROUND_ID, snapshot("EXECUTING", {
      session_id: "a27ab89a-74bc-43f0-bb15-bb3b8387635e",
    })]]))).toBeNull();
  });

  it.each(["SUCCEEDED", "PARTIAL_SUCCESS"] as const)("allows save only for terminal success %s", (status) => {
    expect(scheduleTrialCanSave(snapshot(status))).toBe(true);
  });

  it.each(["QUEUED", "PLANNING", "GENERATING", "EXECUTING", "WAITING_INPUT"] as const)(
    "allows explicit Round terminate for %s",
    (status) => expect(scheduleTrialCanTerminate(snapshot(status))).toBe(true),
  );

  it.each(["CANCEL_REQUESTED", "SUCCEEDED", "PARTIAL_SUCCESS", "FAILED", "CANCELLED"] as const)(
    "does not issue cancel for %s",
    (status) => expect(scheduleTrialCanTerminate(snapshot(status))).toBe(false),
  );
});
