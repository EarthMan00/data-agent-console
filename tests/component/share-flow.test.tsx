import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ShareReplayPage } from "@/components/share-replay-page";

vi.mock("@/lib/agent-api/public-shares", () => ({
  fetchPublicShare: vi.fn().mockResolvedValue({
    share_id: "yM2iGJyrFHeG8SfJojT9rP",
    title: "分析竞品生成内容",
    objective: "测试任务目标",
    description: "",
    meta: "",
    capability_ids: [],
    replay_run_id: null,
  }),
}));

describe("share flow", () => {
  it("renders share metadata from the public API", async () => {
    render(<ShareReplayPage shareId="yM2iGJyrFHeG8SfJojT9rP" />);

    await waitFor(() => {
      expect(screen.getByText("分析竞品生成内容")).toBeInTheDocument();
    });
    expect(screen.getByText("测试任务目标")).toBeInTheDocument();
  });
});
