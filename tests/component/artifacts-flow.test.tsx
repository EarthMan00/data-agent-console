import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { FavoritesWorkspace } from "@/components/favorites-workspace";

vi.mock("@/components/more-data-shell", () => ({
  MoreDataShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/platform-agent-provider", () => ({
  useOptionalPlatformAgent: () => ({
    withFreshToken: async (fn: (token: string) => Promise<void>) => {
      await fn("test-token");
    },
    auth: { accessToken: "x" },
  }),
}));

vi.mock("@/lib/agent-api/client", () => ({
  listFavoriteFolders: vi.fn().mockResolvedValue({ items: [{ id: "f1", name: "默认", sort_order: 0, created_at: "", updated_at: "" }] }),
  listUserFavorites: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 }),
  formatAgentApiErrorForUser: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("artifacts flow", () => {
  it("renders an explicit empty state when search has no matches", async () => {
    render(<FavoritesWorkspace />);
    await screen.findByText("我的收藏夹");
    await waitFor(() => {
      expect(screen.queryByText("加载中…")).not.toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText("搜索收藏"), { target: { value: "不存在xyz" } });

    await waitFor(() => {
      expect(screen.getByText("暂无数据")).toBeInTheDocument();
    });
  });
});
