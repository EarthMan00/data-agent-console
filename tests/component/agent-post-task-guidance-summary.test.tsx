import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentWorkspace } from "@/components/agent-workspace";
import { AliceShellRoot } from "@/components/alice-shell";
import { workspaceActions, workspaceStore } from "@/lib/workspace-store";

const routeState = vi.hoisted(() => ({ runId: "" }));
const mockFetchPublicPromptCategories = vi.hoisted(() => vi.fn());
const mockFetchHomePromptRecommendations = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(routeState.runId ? `runId=${routeState.runId}` : ""),
  usePathname: () => "/agent",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/components/platform-agent-provider", () => ({
  useOptionalPlatformAgent: () => null,
}));

vi.mock("@/lib/agent-api/home-prompts", () => ({
  fetchPublicPromptCategories: mockFetchPublicPromptCategories,
  fetchHomePromptRecommendations: mockFetchHomePromptRecommendations,
}));

function seedRunWithPostTaskGuidance() {
  const runId = workspaceActions.startPlatformTask({
    platformSessionId: "session-guidance-test",
    objective: "亚马逊搜索 cup 并返回排名前三的爆品信息",
    mode: "专业模式",
    selectedCapabilities: ["amazon"],
  });
  const run = workspaceStore.getSnapshot().runs.find((item) => item.id === runId);
  const roundId = run?.latestRoundId;
  if (!roundId) throw new Error("Failed to create local agent run for test");

  workspaceActions.applyRuntimeEvent(runId, { type: "round_started", roundId });
  workspaceActions.applyRuntimeEvent(runId, {
    type: "round_ui_layout",
    roundId,
    layout: "tool_orchestration",
  });
  workspaceActions.applyRuntimeEvent(runId, {
    type: "task_execution_steps_init",
    roundId,
    steps: [
      {
        id: "step-1",
        label: "在亚马逊上搜索“cup”，提取排名前三的爆品信息",
      },
    ],
  });
  workspaceActions.applyRuntimeEvent(runId, {
    type: "task_execution_step_update",
    roundId,
    stepId: "step-1",
    status: "done",
  });
  workspaceActions.applyRuntimeEvent(runId, {
    type: "platform_subtask_snapshot",
    roundId,
    stepIndex: 0,
    stepId: "step-1",
    label: "在亚马逊上搜索“cup”，提取排名前三的爆品信息",
    taskId: "task-result-1",
    outcome: "success",
    taskStatus: "completed",
    artifacts: [
      {
        artifact_id: "artifact-1",
        artifact_type: "csv",
        original_name: "amazon-search-result.csv",
        download_api: "/api/test/artifact-1",
      },
    ],
    zipDownloadApi: null,
  });
  workspaceActions.applyRuntimeEvent(runId, {
    type: "final",
    roundId,
    text: "任务已完成，可以在右侧查看本轮任务结果和 CSV 数据。",
  });
  workspaceActions.applyRuntimeEvent(runId, {
    type: "post_task_guidance",
    roundId,
    text: [
      "1. 查看结果数据详情，生成这三款爆品的分析报告",
      "2. 将这三款产品进行横向对比，快速了解差异",
      "3. 追踪它们的价格和排名变化，把握动态趋势",
    ].join("\n"),
  });
  workspaceActions.applyRuntimeEvent(runId, { type: "round_completed", roundId });

  routeState.runId = runId;
}

describe("AgentWorkspace post-task guidance summary", () => {
  beforeEach(() => {
    mockFetchPublicPromptCategories.mockReset();
    mockFetchPublicPromptCategories.mockResolvedValue([]);
    mockFetchHomePromptRecommendations.mockReset();
    mockFetchHomePromptRecommendations.mockResolvedValue([]);
    routeState.runId = "";
  });

  it("shows the task summary above follow-up guidance in the live agent workspace", async () => {
    seedRunWithPostTaskGuidance();

    render(
      <AliceShellRoot>
        <AgentWorkspace />
      </AliceShellRoot>,
    );

    expect(await screen.findByText("接下来您可以试试：")).toBeInTheDocument();
    expect(screen.getByText("查看结果数据详情，生成这三款爆品的分析报告")).toBeInTheDocument();
    expect(screen.getByText("任务已完成，可以在右侧查看本轮任务结果和 CSV 数据。")).toBeInTheDocument();
  });
});
