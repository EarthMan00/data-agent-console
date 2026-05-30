import { describe, expect, it } from "vitest";

import {
  buildAcknowledgement,
  buildRoundViewModels,
  isExecutionStepActivelyBusy,
  isRoundAwaitingUserInput,
  isRoundExecutionTerminated,
  resolveClarificationOrchestrationId,
  shouldDeferExecutionPanelAfterClarification,
  toCapabilitySafeTitle,
  type TaskRunLike,
} from "@/components/agent-workspace-view-models";

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

  it("treats unclosed think in stream as empty for assistantReplyText", () => {
    const run: TaskRunLike = {
      ...sampleRun,
      status: "running",
      chains: [],
      roundUiLayouts: { "round-1": "simple_chat" },
      timeline: [
        {
          id: "node-user",
          roundId: "round-1",
          createdAt: "2026-03-28 12:00:00",
          kind: "user_message",
          text: "你好",
        },
        {
          id: "node-stream",
          roundId: "round-1",
          createdAt: "2026-03-28 12:00:05",
          kind: "assistant_stream",
          text: " 用户",
          status: "streaming",
        },
      ],
    };
    const [round] = buildRoundViewModels(run);
    expect(round.assistantPending).toBe(false);
    expect(round.assistantStreaming).toBe(true);
    expect(round.assistantReplyText).toBe("用户");
  });

  it("shows assistantPending when stream shell exists but text is still empty", () => {
    const run: TaskRunLike = {
      ...sampleRun,
      status: "running",
      chains: [],
      roundUiLayouts: { "round-1": "simple_chat" },
      timeline: [
        {
          id: "node-user",
          roundId: "round-1",
          createdAt: "2026-03-28 12:00:00",
          kind: "user_message",
          text: "你好",
        },
        {
          id: "node-stream",
          roundId: "round-1",
          createdAt: "2026-03-28 12:00:05",
          kind: "assistant_stream",
          text: "",
          status: "streaming",
        },
      ],
    };
    const [round] = buildRoundViewModels(run);
    expect(round.assistantPending).toBe(false);
    expect(round.resultSummary).toBe("");
    expect(round.assistantStreaming).toBe(true);
  });

  it("prefers assistant_stream text over report_patch summary in simple_chat", () => {
    const run: TaskRunLike = {
      ...sampleRun,
      chains: [],
      roundUiLayouts: { "round-1": "simple_chat" },
      timeline: [
        {
          id: "node-user",
          roundId: "round-1",
          createdAt: "2026-03-28 12:00:00",
          kind: "user_message",
          text: "你好",
        },
        {
          id: "node-stream",
          roundId: "round-1",
          createdAt: "2026-03-28 12:00:05",
          kind: "assistant_stream",
          text: "你好！我是数据分析助手。",
          status: "complete",
        },
        {
          id: "node-patch",
          roundId: "round-1",
          createdAt: "2026-03-28 12:00:10",
          kind: "report_patch",
          summary: ["本轮以 默认数据源 为主线完成了多逻辑链执行。"],
        },
      ],
    };
    const [round] = buildRoundViewModels(run);
    expect(round.resultSummary).toBe("你好！我是数据分析助手。");
    expect(round.assistantStreaming).toBe(false);
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

  it("maps splitStreamEnded and splitRevealComplete from run into round view models", () => {
    const run: TaskRunLike = {
      ...sampleRun,
      status: "running",
      latestRoundId: "round-1",
      roundUiLayouts: { "round-1": "tool_orchestration" },
      splitStreamEndedByRound: { "round-1": true },
      splitRevealCompleteByRound: { "round-1": true },
      taskExecutionStepsByRound: {
        "round-1": [
          { id: "s1", roundId: "round-1", order: 0, label: "搜索商品", status: "running" },
        ],
      },
    };
    const [round] = buildRoundViewModels(run);
    expect(round.splitStreamEnded).toBe(true);
    expect(round.splitRevealComplete).toBe(true);
    expect(round.splitReveal).toBe(true);
    expect(round.executionSteps).toHaveLength(1);
  });

  it("exposes supplemental user messages on the same round", () => {
    const run: TaskRunLike = {
      ...sampleRun,
      timeline: [
        ...sampleRun.timeline.slice(0, 1),
        {
          id: "node-user-2",
          roundId: "round-1",
          createdAt: "2026-03-28 12:00:30",
          kind: "user_message",
          text: "vacuum flask",
        },
        ...sampleRun.timeline.slice(1),
      ],
    };
    const [round] = buildRoundViewModels(run);
    expect(round.supplementalUserMessages).toEqual([
      { text: "vacuum flask", createdAt: "2026-03-28 12:00:30" },
    ]);
  });

  it("resolves orchestration id for clarification resume from persisted round state", () => {
    const run: TaskRunLike = {
      ...sampleRun,
      platformOrchestrationIdByRound: { "round-1": "orch-from-run" },
    };
    const round = {
      roundId: "round-1",
      linkfoxClarification: {
        message: "请确认关键词",
        shareUrl: null,
        stepIndex: 0,
        orchestrationId: "orch-from-clarify",
      },
    };
    expect(resolveClarificationOrchestrationId(run, round, "orch-from-ref")).toBe("orch-from-ref");
    expect(resolveClarificationOrchestrationId(run, round, null)).toBe("orch-from-clarify");
    expect(
      resolveClarificationOrchestrationId(
        { platformOrchestrationIdByRound: { "round-1": "orch-from-run" } },
        { roundId: "round-1", linkfoxClarification: undefined },
        null,
      ),
    ).toBe("orch-from-run");
  });

  it("builds clarification dialog from assistant final when step awaits input", () => {
    const run: TaskRunLike = {
      ...sampleRun,
      status: "running",
      chains: [],
      roundUiLayouts: { "round-1": "tool_orchestration" },
      taskExecutionStepsByRound: {
        "round-1": [
          { id: "s1", roundId: "round-1", order: 0, label: "采集市场数据", status: "awaiting_input" },
          { id: "s2", roundId: "round-1", order: 1, label: "生成报告", status: "pending" },
        ],
      },
      timeline: [
        {
          id: "node-user",
          roundId: "round-1",
          createdAt: "2026-03-28 12:00:00",
          kind: "user_message",
          text: "保温杯选品",
        },
        {
          id: "node-final",
          roundId: "round-1",
          createdAt: "2026-03-28 12:01:00",
          kind: "assistant_final",
          text: '您好，"保温杯"有如下几个英文关键词，请确认您需要使用哪个关键词来查询：\n- insulated tumbler\n- vacuum flask',
        },
      ],
    };
    const [round] = buildRoundViewModels(run);
    expect(round.clarificationDialog?.answered).toBe(false);
    expect(round.clarificationDialog?.message).toContain("保温杯");
    expect(round.clarificationDialog?.message).toContain("insulated tumbler");
  });

  it("treats linkfox clarification as awaiting user input", () => {
    expect(
      isRoundAwaitingUserInput({
        executionSteps: [{ id: "s1", roundId: "r1", order: 0, label: "步骤1", status: "running" }],
        clarificationDialog: {
          message: "请确认",
          answered: false,
          stepIndex: 0,
          datetime: "2026-03-28 12:00:00",
        },
      }),
    ).toBe(true);
    expect(
      isRoundAwaitingUserInput({
        executionSteps: [{ id: "s1", roundId: "r1", order: 0, label: "步骤1", status: "running" }],
        clarificationDialog: {
          message: "请确认",
          answered: true,
          stepIndex: 0,
          datetime: "2026-03-28 12:00:00",
        },
      }),
    ).toBe(false);
  });

  it("keeps answered clarification dialog visible from timeline after user supplement", () => {
    const run: TaskRunLike = {
      ...sampleRun,
      status: "success",
      chains: [],
      roundUiLayouts: { "round-1": "tool_orchestration" },
      taskExecutionStepsByRound: {
        "round-1": [
          { id: "s1", roundId: "round-1", order: 0, label: "采集市场数据", status: "done" },
          { id: "s2", roundId: "round-1", order: 1, label: "生成报告", status: "done" },
        ],
      },
      clarificationDialogByRound: {
        "round-1": {
          message:
            '您好，"保温杯"有如下几个英文关键词，请确认您需要使用哪个关键词来查询：\n- insulated tumbler\n- thermos\n- vacuum flask',
          stepIndex: 0,
          answered: true,
          createdAt: "2026-03-28 12:01:00",
          answeredAt: "2026-03-28 12:02:00",
        },
      },
      timeline: [
        {
          id: "node-user",
          roundId: "round-1",
          createdAt: "2026-03-28 12:00:00",
          kind: "user_message",
          text: "保温杯选品",
        },
        {
          id: "node-final",
          roundId: "round-1",
          createdAt: "2026-03-28 12:05:00",
          kind: "assistant_final",
          text: "任务已完成，可以在右侧查看结果。",
        },
        {
          id: "node-supplement",
          roundId: "round-1",
          createdAt: "2026-03-28 12:02:00",
          kind: "user_message",
          text: "thermos cup",
        },
      ],
    };
    const [round] = buildRoundViewModels(run);
    expect(round.clarificationDialog?.answered).toBe(true);
    expect(round.clarificationDialog?.message).toContain("thermos");
    expect(round.clarificationDialog?.message).toContain("vacuum flask");
    expect(round.supplementalUserMessages).toHaveLength(1);
    expect(round.supplementalUserMessages?.[0]?.text).toBe("thermos cup");
  });

  it("defers execution panel after user answered clarification", () => {
    const run: TaskRunLike = {
      ...sampleRun,
      status: "running",
      chains: [],
      roundUiLayouts: { "round-1": "tool_orchestration" },
      clarificationDialogByRound: {
        "round-1": {
          message: "请确认关键词",
          stepIndex: 0,
          answered: true,
          createdAt: "2026-03-28 12:01:00",
          answeredAt: "2026-03-28 12:02:00",
        },
      },
      timeline: [
        {
          id: "node-user",
          roundId: "round-1",
          createdAt: "2026-03-28 12:00:00",
          kind: "user_message",
          text: "保温杯选品",
        },
        {
          id: "node-supplement",
          roundId: "round-1",
          createdAt: "2026-03-28 12:02:00",
          kind: "user_message",
          text: "thermos cup",
        },
      ],
    };
    const [round] = buildRoundViewModels(run);
    expect(shouldDeferExecutionPanelAfterClarification(round)).toBe(true);
  });

  it("creates a plain-language acknowledgement from execution groups", () => {
    const [round] = buildRoundViewModels(sampleRun);

    expect(buildAcknowledgement(round, sampleRun)).toContain("好的，我收到");
    expect(buildAcknowledgement(round, sampleRun)).toContain("卖家精灵、谷歌趋势");
  });

  it("truncates long capability-safe titles", () => {
    expect(toCapabilitySafeTitle("a".repeat(50))).toBe(`${"a".repeat(42)}...`);
  });

  it("does not treat pending follow-up steps as busy after orchestration failed", () => {
    const round = {
      errorMessage: "积分不足!",
      executionSteps: [
        { id: "s1", roundId: "r1", order: 0, label: "步骤1", status: "error" as const },
        { id: "s2", roundId: "r1", order: 1, label: "步骤2", status: "pending" as const },
      ],
    };
    expect(isRoundExecutionTerminated("error", round)).toBe(true);
    const rawBusy = round.executionSteps.some((s) => isExecutionStepActivelyBusy(s.status));
    expect(rawBusy).toBe(true);
    const composerBusy =
      !isRoundExecutionTerminated("error", round) &&
      round.executionSteps.some((s) => isExecutionStepActivelyBusy(s.status));
    expect(composerBusy).toBe(false);
  });
});
