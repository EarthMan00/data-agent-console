import { describe, expect, it } from "vitest";

import {
  stashScheduleTrialAttachmentFiles,
  takeScheduleTrialAttachmentFiles,
} from "@/lib/schedule-trial-attachment-files";

describe("schedule trial attachment files", () => {
  it("stashes files by session id and consumes them once", () => {
    const file = new File(["demo"], "demo.csv", { type: "text/csv" });

    stashScheduleTrialAttachmentFiles("session-1", [file]);

    expect(takeScheduleTrialAttachmentFiles("session-1")).toEqual([file]);
    expect(takeScheduleTrialAttachmentFiles("session-1")).toEqual([]);
  });
});
