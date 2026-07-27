import { describe, expect, it } from "vitest";

import { scheduledRunHasResultArtifacts } from "@/lib/agent-api/schedules-mappers";
import type { ScheduledTaskRunItemApi } from "@/lib/agent-api/types";

function run(meta: Record<string, unknown> | null): ScheduledTaskRunItemApi {
  return {
    id: "scheduled-run-1",
    task_id: "scheduled-task-filter-id",
    trigger_type: "schedule",
    status: "success",
    session_id: "f4159ee9-c863-41c8-9c1b-ffbfa193917f",
    started_at: "2026-07-27T00:00:00Z",
    finished_at: "2026-07-27T00:01:00Z",
    error_message: null,
    task_title_snapshot: "日报",
    prompt_snapshot: "生成日报",
    group_name_snapshot: null,
    meta,
    created_at: "2026-07-27T00:00:00Z",
  };
}

describe("scheduled run result artifacts", () => {
  it("uses only a positive durable result_artifact_count", () => {
    expect(scheduledRunHasResultArtifacts(run({ result_artifact_count: 2 }))).toBe(true);
    expect(scheduledRunHasResultArtifacts(run({ result_artifact_count: 0 }))).toBe(false);
  });

  it("does not fall back to legacy meta.task_id", () => {
    expect(
      scheduledRunHasResultArtifacts(
        run({ task_id: "legacy-skill-task", result_artifact_count: 0 }),
      ),
    ).toBe(false);
    expect(scheduledRunHasResultArtifacts(run({ task_id: "legacy-skill-task" }))).toBe(false);
  });

  it("does not guess malformed or string artifact counts", () => {
    expect(scheduledRunHasResultArtifacts(run({ result_artifact_count: "2" }))).toBe(false);
    expect(scheduledRunHasResultArtifacts(run({ result_artifact_count: Number.NaN }))).toBe(false);
    expect(scheduledRunHasResultArtifacts(run(null))).toBe(false);
  });
});
