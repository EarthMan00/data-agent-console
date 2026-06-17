import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AgentWorkspace } from "@/components/agent-workspace";
import { MoreDataShellRoot } from "@/components/more-data-shell";
import { workspaceActions, workspaceStore } from "@/lib/workspace-store";

const routeState = vi.hoisted(() => ({ runId: "" }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(routeState.runId ? `runId=${routeState.runId}` : ""),
  usePathname: () => "/agent",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/components/platform-agent-provider", () => ({
  useOptionalPlatformAgent: () => null,
}));

function seedCompletedAgentRun() {
  const runId = workspaceActions.startPlatformTask({
    platformSessionId: "session-test",
    objective: "使用亚马逊前端搜索模拟，批量跑单品机会筛选",
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
      { id: "step-1", label: "采集第一页搜索数据" },
      { id: "step-2", label: "过滤符合条件的商品" },
    ],
  });
  workspaceActions.applyRuntimeEvent(runId, {
    type: "task_execution_step_update",
    roundId,
    stepId: "step-1",
    status: "done",
  });
  workspaceActions.applyRuntimeEvent(runId, {
    type: "task_execution_step_update",
    roundId,
    stepId: "step-2",
    status: "done",
  });
  workspaceActions.applyRuntimeEvent(runId, {
    type: "platform_subtask_snapshot",
    roundId,
    stepIndex: 1,
    stepId: "step-2",
    label: "过滤符合条件的商品",
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
    text: "已完成亚马逊前端搜索结果筛选，并生成结构化数据结果。",
  });
  workspaceActions.applyRuntimeEvent(runId, { type: "round_completed", roundId });
  routeState.runId = runId;
  return runId;
}

function renderSeededAgentWorkspace() {
  seedCompletedAgentRun();
  return render(
    <MoreDataShellRoot>
      <AgentWorkspace />
    </MoreDataShellRoot>,
  );
}

describe("agent flow", () => {
  it("renders the current /agent structure with execution card, result section, and right rail preview", async () => {
    renderSeededAgentWorkspace();

    expect(screen.getByTestId("agent-user-input-card")).toBeInTheDocument();
    const executionPanel = await screen.findByTestId("agent-execution-panel");
    expect(executionPanel).toHaveTextContent("任务已完成");
    expect(within(executionPanel).queryByText("任务执行")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("agent-result-section")).toBeInTheDocument();
      expect(document.querySelector("main aside [data-testid='agent-preview-panel']")).toBeInTheDocument();
    });
    expect(document.querySelector("main > div > div [data-testid='agent-preview-panel']")).not.toBeInTheDocument();
  });

  it("shows step details after opening the execution card", async () => {
    renderSeededAgentWorkspace();

    const panel = await screen.findByTestId("agent-execution-panel");
    if (!screen.queryByTestId("agent-step-timeline")) {
      const toggle = within(panel).queryByRole("button");
      if (toggle) fireEvent.click(toggle);
    }
    expect(panel).not.toHaveTextContent("调用工具");
    expect(await screen.findByTestId("agent-step-timeline")).toHaveTextContent("采集第一页搜索数据");
  });
});
