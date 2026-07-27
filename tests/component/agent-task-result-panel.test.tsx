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
    download_api: "/api/chat-rounds/round-1/artifacts/artifact-1/download",
  },
];

const multiSheetArtifacts: PlatformTaskArtifactRef[] = [
  {
    artifact_id: "artifact-1",
    artifact_type: "csv",
    original_name: "汇总 QA 检查项.csv",
    download_api: "/api/chat-rounds/round-1/artifacts/artifact-1/download",
  },
  {
    artifact_id: "artifact-2",
    artifact_type: "csv",
    original_name: "生成标题与五点描述版本.csv",
    download_api: "/api/chat-rounds/round-1/artifacts/artifact-2/download",
  },
];

const roundPairedArtifacts: PlatformTaskArtifactRef[] = [
  {
    artifact_id: "round-csv",
    artifact_type: "csv",
    original_name: "sales-result.csv",
    download_api: "/api/chat-rounds/round-1/artifacts/round-csv/download",
  },
  {
    artifact_id: "round-json",
    artifact_type: "json",
    original_name: "sales-result.json",
    download_api: "/api/chat-rounds/round-1/artifacts/round-json/download",
  },
];

function renderPanel(token = "real-token") {
  return render(
    <AgentTaskResultPanel
      onClose={vi.fn()}
      artifacts={artifacts}
      favoriteSourceTaskId="favorite-source-task"
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

  it("downloads the active Round artifact for a multi-artifact table/code sheet without a legacy task route", async () => {
    const withFreshToken = vi.fn(async (run: (token: string) => Promise<void>) => {
      await run("round-token");
    });
    render(
      <AgentTaskResultPanel
        onClose={vi.fn()}
        artifacts={roundPairedArtifacts}
        withFreshToken={withFreshToken}
      />,
    );

    const panel = screen.getByTestId("agent-preview-panel");
    const download = within(panel).getByRole("button", { name: "下载当前结果" });
    fireEvent.click(download);
    await waitFor(() => {
      expect(apiMocks.downloadAuthorizedFile).toHaveBeenLastCalledWith(
        "round-token",
        "/api/chat-rounds/round-1/artifacts/round-csv/download",
        "sales-result.csv",
      );
    });

    fireEvent.click(within(panel).getByRole("button", { name: "代码" }));
    fireEvent.click(download);
    await waitFor(() => {
      expect(apiMocks.downloadAuthorizedFile).toHaveBeenLastCalledWith(
        "round-token",
        "/api/chat-rounds/round-1/artifacts/round-json/download",
        "sales-result.json",
      );
    });
    expect(withFreshToken).toHaveBeenCalled();
    expect(apiMocks.downloadAuthorizedFile.mock.calls.flat().join(" ")).not.toContain("/api/tasks/");
  });

  it("downloads a single result only through its owner-scoped artifact URL", async () => {
    render(
      <AgentTaskResultPanel
        onClose={vi.fn()}
        artifacts={artifacts}
        favoriteSourceTaskId="favorite-source-task"
        withFreshToken={async (run) => {
          await run("round-token");
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "下载当前结果" }));
    await waitFor(() => {
      expect(apiMocks.downloadAuthorizedFile).toHaveBeenCalledWith(
        "round-token",
        "/api/chat-rounds/round-1/artifacts/artifact-1/download",
        "result.csv",
      );
    });
    expect(apiMocks.downloadAuthorizedFile.mock.calls.flat().join(" ")).not.toContain(
      "/api/tasks/",
    );
  });

  it("uses a favorite source identity without enabling the legacy task download fallback", async () => {
    const favoriteSourceTaskId = "round-owned-step-task-id";
    render(
      <AgentTaskResultPanel
        onClose={vi.fn()}
        artifacts={artifacts}
        favoriteSourceTaskId={favoriteSourceTaskId}
        withFreshToken={async (run) => {
          await run("round-token");
        }}
      />,
    );

    const panel = screen.getByTestId("agent-preview-panel");
    await waitFor(() => {
      expect(apiMocks.getFavoriteByTask).toHaveBeenCalledWith("round-token", favoriteSourceTaskId);
    });
    const favorite = within(panel).getByRole("button", { name: "收藏报告" });
    expect(favorite).toBeEnabled();
    expect(panel).not.toHaveTextContent(favoriteSourceTaskId);

    fireEvent.click(favorite);
    await waitFor(() => {
      expect(apiMocks.createUserFavorite).toHaveBeenCalledWith(
        "round-token",
        expect.objectContaining({ source_task_id: favoriteSourceTaskId }),
      );
    });
    fireEvent.click(within(panel).getByRole("button", { name: "取消收藏报告" }));
    await waitFor(() => {
      expect(apiMocks.deleteUserFavorite).toHaveBeenCalledWith("round-token", "favorite-1");
    });
    expect(apiMocks.downloadAuthorizedFile).not.toHaveBeenCalled();
  });

  it("uses primary styling and downloads the selected artifact in a multi-sheet result", async () => {
    render(
      <AgentTaskResultPanel
        onClose={vi.fn()}
        artifacts={multiSheetArtifacts}
        withFreshToken={async (run) => {
          await run("real-token");
        }}
      />,
    );

    const panel = screen.getByTestId("agent-preview-panel");
    const header = within(panel).getByTestId("agent-result-panel-header");
    expect(header).toHaveStyle({ boxShadow: "none" });
    const scrollRegion = within(panel).getByTestId("agent-result-scroll-region");
    scrollRegion.scrollTop = 24;
    fireEvent.scroll(scrollRegion);
    expect(header).toHaveStyle({ boxShadow: "0 1px 0 var(--color-border-1)" });

    const activeTab = within(panel).getByRole("tab", { selected: true });
    expect(activeTab).toHaveClass("text-primary");
    expect(activeTab.querySelector(".bg-primary")).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("tab", { name: "生成标题与五点描述版本" }));
    fireEvent.click(within(panel).getByRole("button", { name: "下载当前结果" }));
    await waitFor(() => {
      expect(apiMocks.downloadAuthorizedFile).toHaveBeenCalledWith(
        "real-token",
        "/api/chat-rounds/round-1/artifacts/artifact-2/download",
        "生成标题与五点描述版本.csv",
      );
    });
    expect(apiMocks.downloadAuthorizedFile.mock.calls.flat().join(" ")).not.toContain(
      "/api/tasks/",
    );
  });

  it("keeps earlier artifacts available when the latest task status is failed", () => {
    render(
      <AgentTaskResultPanel
        onClose={vi.fn()}
        artifacts={artifacts}
        taskStatus="FAILED"
        withFreshToken={async (run) => {
          await run("real-token");
        }}
      />,
    );

    const panel = screen.getByTestId("agent-preview-panel");
    expect(within(panel).getByRole("button", { name: "下载当前结果" })).toBeInTheDocument();
    expect(within(panel).queryByText(/未产生可展示的数据文件/)).not.toBeInTheDocument();
  });

  it("shows the durable empty-result copy when a failed task has no artifacts", () => {
    render(
      <AgentTaskResultPanel
        onClose={vi.fn()}
        artifacts={[]}
        taskStatus="FAILED"
        withFreshToken={async (run) => {
          await run("real-token");
        }}
      />,
    );

    const panel = screen.getByTestId("agent-preview-panel");
    expect(within(panel).getByText(/任务未产生可展示的数据文件/)).toBeInTheDocument();
  });
});
