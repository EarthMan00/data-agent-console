import { describe, expect, it } from "vitest";

import { buildAcknowledgement, buildRoundViewModels, toCapabilitySafeTitle, type TaskRunLike } from "@/components/agent-workspace";

const sampleRun: TaskRunLike = {
  startedAt: "2026-03-28 12:00:00",
  objective: "请帮我分析美国站 keyboard case 赛道，并输出机会点。",
  selectedCapabilities: ["seller-sprite", "google"],
  status: "success",
  latestRoundId: "round-1",
  timeline: [
    {
      id: "node-user",
      roundId: "round-1",
      createdAt: "2026-03-28 12:00:00",
      kind: "user_message",
      text: "请帮我分析美国站 keyboard case 赛道，并输出机会点。",
    },
    {
      id: "node-final",
      roundId: "round-1",
      createdAt: "2026-03-28 12:01:00",
      kind: "assistant_final",
      text: "本轮已经完成卖家精灵与谷歌趋势的结果整理。",
    },
  ],
  chains: [
    {
      id: "chain-1",
      roundId: "round-1",
      sourceId: "seller-sprite",
      sourceLabel: "卖家精灵",
      status: "success",
      intent: "围绕评论与流量词做结构化调研。",
      progressText: "已完成卖家精灵数据查询与整理。",
      resultCountText: "返回 50 条数据",
      resultPreviewId: "market-report",
    },
    {
      id: "chain-2",
      roundId: "round-1",
      sourceId: "google",
      sourceLabel: "谷歌趋势",
      status: "success",
      intent: "围绕搜索需求趋势做结构化调研。",
      progressText: "已完成谷歌趋势数据查询与整理。",
      resultCountText: "返回 60 条数据",
      resultPreviewId: "review-report",
    },
  ],
};

describe("agent view model helpers", () => {
  it("builds round models from the current timeline and chain data", () => {
    const models = buildRoundViewModels(sampleRun);

    expect(models).toHaveLength(1);
    expect(models[0]?.splitItems).toHaveLength(2);
    expect(models[0]?.executionGroups[0]?.title).toBe("卖家精灵");
    expect(models[0]?.executionGroups[0]?.tools[0]?.title).toBe("卖家精灵");
    expect(models[0]?.hasResult).toBe(true);
    expect(models[0]?.showTaskResultInChat).toBe(true);
    expect(models[0]?.uiLayout).toBe("tool_orchestration");
    expect(models[0]?.assistantPending).toBe(false);
  });

  it("uses simple_chat layout when explicit and clears split/execution chrome", () => {
    const simple: TaskRunLike = {
      ...sampleRun,
      chains: [],
      roundUiLayouts: { "round-1": "simple_chat" },
    };
    const [round] = buildRoundViewModels(simple);
    expect(round.uiLayout).toBe("simple_chat");
    expect(round.splitItems).toHaveLength(0);
    expect(round.executionGroups).toHaveLength(0);
  });

  it("uses platform execution steps for split list and hides chain tool cards", () => {
    const run: TaskRunLike = {
      ...sampleRun,
      chains: [],
      roundUiLayouts: { "round-1": "tool_orchestration" },
      taskExecutionStepsByRound: {
        "round-1": [
          { id: "s1", roundId: "round-1", order: 0, label: "打开百度首页", status: "pending" },
          { id: "s2", roundId: "round-1", order: 1, label: "输入检索词", status: "running" },
        ],
      },
    };
    const [round] = buildRoundViewModels(run);
    expect(round.splitItems.some((line) => line.includes("打开百度首页"))).toBe(true);
    expect(round.executionGroups).toHaveLength(0);
    expect(round.executionSteps).toHaveLength(2);
  });

  it("does not mark hasResult until platform steps are complete even if final text exists", () => {
    const run: TaskRunLike = {
      ...sampleRun,
      chains: [],
      roundUiLayouts: { "round-1": "tool_orchestration" },
      taskExecutionStepsByRound: {
        "round-1": [
          { id: "s1", roundId: "round-1", order: 0, label: "步骤一", status: "running" },
          { id: "s2", roundId: "round-1", order: 1, label: "步骤二", status: "pending" },
        ],
      },
    };
    const [round] = buildRoundViewModels(run);
    expect(round.hasResult).toBe(false);
    expect(round.showTaskResultInChat).toBe(false);
  });

  it("marks hasResult when platform steps are complete and final output exists", () => {
    const run: TaskRunLike = {
      ...sampleRun,
      chains: [],
      roundUiLayouts: { "round-1": "tool_orchestration" },
      status: "success",
      platformTaskArtifacts: [
        {
          artifact_id: "a1",
          artifact_type: "text/csv",
          original_name: "result.csv",
          download_api: "/api/tasks/x/download/a1",
        },
      ],
      taskExecutionStepsByRound: {
        "round-1": [
          { id: "s1", roundId: "round-1", order: 0, label: "步骤一", status: "done" },
          { id: "s2", roundId: "round-1", order: 1, label: "步骤二", status: "done" },
        ],
      },
    };
    const [round] = buildRoundViewModels(run);
    expect(round.hasResult).toBe(true);
    expect(round.showTaskResultInChat).toBe(true);
  });

  it("creates a plain-language acknowledgement from execution groups", () => {
    const [round] = buildRoundViewModels(sampleRun);

    expect(buildAcknowledgement(round, sampleRun)).toContain("好的，我收到");
    expect(buildAcknowledgement(round, sampleRun)).toContain("卖家精灵、谷歌趋势");
  });

  it("truncates long capability-safe titles", () => {
    expect(toCapabilitySafeTitle("a".repeat(50))).toBe(`${"a".repeat(42)}...`);
  });
});
