import { describe, expect, it } from "vitest";

import { buildRoundViewModels, type TaskRunLike } from "@/components/agent-workspace";

describe("mock runtime mapping", () => {
  it("falls back to report patch summaries when assistant final text is missing", () => {
    const run: TaskRunLike = {
      startedAt: "2026-03-28 12:00:00",
      objective: "分析美国站平板壳机会点",
      selectedCapabilities: ["web-search"],
      timeline: [
        {
          id: "user-1",
          roundId: "round-2",
          createdAt: "2026-03-28 12:00:00",
          kind: "user_message",
          text: "分析美国站平板壳机会点",
        },
        {
          id: "patch-1",
          roundId: "round-2",
          createdAt: "2026-03-28 12:02:00",
          kind: "report_patch",
          summary: ["市场需求存在增长", "评论痛点集中在防漏与耐磨"],
        },
      ],
      chains: [],
    };

    const [round] = buildRoundViewModels(run);

    expect(round.resultSummary).toContain("市场需求存在增长");
    expect(round.hasResult).toBe(true);
    expect(round.executionGroups).toHaveLength(0);
  });
});
