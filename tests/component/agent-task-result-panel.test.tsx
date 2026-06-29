import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentTaskResultPanel } from "@/components/agent-task-result-panel";
import type { PlatformTaskArtifactRef } from "@/lib/agent-events";

const apiMocks = vi.hoisted(() => ({
  createUserFavorite: vi.fn(),
  deleteUserFavorite: vi.fn(),
  downloadAuthorizedFile: vi.fn(),
  getFavoriteByTask: vi.fn(),
}));

vi.mock("@/lib/agent-api/client", () => ({
  ...apiMocks,
}));

vi.mock("@/lib/build-favorite-snapshot", () => ({
  buildFavoriteSnapshotFromArtifacts: vi.fn().mockResolvedValue({
    title: "收藏 · 任务结果",
    snapshot: { version: 2, sheets: [] },
    copy_artifact_id: null,
  }),
}));

const artifacts: PlatformTaskArtifactRef[] = [
  {
    artifact_id: "artifact-1",
    artifact_type: "csv",
    original_name: "result.csv",
    download_api: "/api/tasks/mock/artifacts/result.csv",
  },
];

const multiSheetArtifacts: PlatformTaskArtifactRef[] = [
  {
    artifact_id: "artifact-1",
    artifact_type: "csv",
    original_name: "汇总 QA 检查项.csv",
    download_api: "/api/tasks/mock/artifacts/qa.csv",
  },
  {
    artifact_id: "artifact-2",
    artifact_type: "csv",
    original_name: "生成标题与五点描述版本.csv",
    download_api: "/api/tasks/mock/artifacts/title.csv",
  },
];

function renderPanel(token = "real-token") {
  return render(
    <AgentTaskResultPanel
      onClose={vi.fn()}
      artifacts={artifacts}
      taskId="mock-task"
      withFreshToken={async (run) => {
        await run(token);
      }}
    />,
  );
}

describe("agent task result panel favorite feedback", () => {
  beforeEach(() => {
    apiMocks.createUserFavorite.mockReset();
    apiMocks.deleteUserFavorite.mockReset();
    apiMocks.downloadAuthorizedFile.mockReset();
    apiMocks.getFavoriteByTask.mockReset();
    apiMocks.getFavoriteByTask.mockResolvedValue({ favorited: false, favorite_id: null });
    apiMocks.createUserFavorite.mockResolvedValue({ id: "favorite-1" });
  });

  it("shows a global success toast for favorite actions without an inline panel notice", async () => {
    renderPanel("real-token");

    const panel = screen.getByTestId("agent-preview-panel");
    fireEvent.click(within(panel).getByRole("button", { name: "收藏报告" }));

    expect(await screen.findByText("收藏成功，可前往收藏夹查看")).toBeInTheDocument();
    expect(within(panel).queryByText("create user favorite failed (HTTP 401)")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(within(panel).getByRole("button", { name: "取消收藏报告" })).toBeInTheDocument();
    });
    expect(apiMocks.createUserFavorite).toHaveBeenCalledTimes(1);
  });

  it("does not render raw favorite API errors inside the result panel", async () => {
    apiMocks.createUserFavorite.mockRejectedValueOnce(new Error("create user favorite failed (HTTP 401)"));
    renderPanel("real-token");

    const panel = screen.getByTestId("agent-preview-panel");
    fireEvent.click(within(panel).getByRole("button", { name: "收藏报告" }));

    expect(await screen.findByText("收藏失败，请稍后重试")).toBeInTheDocument();
    expect(within(panel).queryByText("create user favorite failed (HTTP 401)")).not.toBeInTheDocument();
  });

  it("uses primary styling for active result sheets and a stronger header divider", () => {
    render(
      <AgentTaskResultPanel
        onClose={vi.fn()}
        artifacts={multiSheetArtifacts}
        taskId="mock-task"
        withFreshToken={async (run) => {
          await run("real-token");
        }}
      />,
    );

    const panel = screen.getByTestId("agent-preview-panel");
    const header = within(panel).getByText("任务执行结果").closest(".border-b");
    expect(header).toHaveClass("border-border-strong", "shadow-hairline");

    const activeTab = within(panel).getByRole("tab", { selected: true });
    expect(activeTab).toHaveClass("text-primary");
    expect(activeTab.querySelector(".bg-primary")).toBeInTheDocument();
  });
});
