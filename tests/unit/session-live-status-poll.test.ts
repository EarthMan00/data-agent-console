import { describe, expect, it } from "vitest";

import { getLiveSessionPrimaryTaskPollStrategy } from "@/lib/session-live-status-poll";

describe("getLiveSessionPrimaryTaskPollStrategy", () => {
  it("skips primary-task polling for orchestration replays", () => {
    expect(
      getLiveSessionPrimaryTaskPollStrategy({
        scheduleTrial: false,
        scheduledRunRecord: false,
        composerShowsStop: true,
        sending: false,
        orchestrationId: "orch-1",
      }),
    ).toBe("none");
  });

  it("keeps primary-task polling for single-task replays", () => {
    expect(
      getLiveSessionPrimaryTaskPollStrategy({
        scheduleTrial: false,
        scheduledRunRecord: false,
        composerShowsStop: true,
        sending: false,
        orchestrationId: null,
      }),
    ).toBe("primary-task");
  });
});
