import { afterEach, describe, expect, it, vi } from "vitest";

import { listScheduledTaskRuns } from "@/lib/agent-api/scheduled-tasks";

describe("scheduled task run list filters", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves task_id as the scheduled-task list filter", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          items: [],
          total: 0,
          page: 1,
          page_size: 20,
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await listScheduledTaskRuns("access-token", {
      task_id: "scheduled-task-filter-id",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/api/scheduled-task-runs?task_id=scheduled-task-filter-id",
      ),
      expect.objectContaining({
        headers: { Authorization: "Bearer access-token" },
      }),
    );
  });
});
