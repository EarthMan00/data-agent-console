import { beforeEach, describe, expect, it } from "vitest";

import {
  loadScheduleTrialMeta,
  saveScheduleTrialMeta,
} from "@/lib/schedule-create-draft";

const SESSION_ID = "f4159ee9-c863-41c8-9c1b-ffbfa193917f";
const ROUND_ID = "3da8ff9a-95e2-4f9e-9788-7fda3d450fe7";
const META_KEY = "alice:scheduleTrialMetaV2";

describe("strict durable schedule trial metadata", () => {
  beforeEach(() => sessionStorage.clear());

  it("round-trips only the v2 accepted Session/Round reference", () => {
    saveScheduleTrialMeta({
      v: 2,
      sessionId: SESSION_ID,
      roundId: ROUND_ID,
      sendKind: "queued",
    });

    expect(loadScheduleTrialMeta()).toEqual({
      v: 2,
      sessionId: SESSION_ID,
      roundId: ROUND_ID,
      sendKind: "queued",
    });
  });

  it.each([
    { v: 1, sessionId: SESSION_ID, taskId: null, sendKind: "accepted" },
    { v: 2, sessionId: "not-a-uuid", roundId: ROUND_ID, sendKind: "queued" },
    { v: 2, sessionId: SESSION_ID, roundId: "not-a-uuid", sendKind: "queued" },
    { v: 2, sessionId: SESSION_ID, roundId: ROUND_ID, sendKind: "pending" },
    { v: 2, sessionId: SESSION_ID, roundId: ROUND_ID, sendKind: "queued", taskId: "legacy" },
    { v: 2, sessionId: SESSION_ID, roundId: ROUND_ID },
    null,
    [],
  ])("rejects malformed or legacy payload %# without fallback", (value) => {
    sessionStorage.setItem(META_KEY, JSON.stringify(value));
    expect(loadScheduleTrialMeta()).toBeNull();
  });
});
