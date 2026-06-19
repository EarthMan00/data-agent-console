import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserFavoriteListItemDto } from "@/lib/agent-api/types";

const apiMocks = vi.hoisted(() => ({
  createFavoriteFolder: vi.fn(),
  deleteFavoriteFolder: vi.fn(),
  deleteUserFavorite: vi.fn(),
  downloadAuthorizedFile: vi.fn(),
  listFavoriteFolders: vi.fn(),
  listUserFavorites: vi.fn(),
  moveUserFavorite: vi.fn(),
  patchUserFavoriteTitle: vi.fn(),
}));

const navigationMocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/components/alice-shell", () => ({
  AliceShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode; asChild?: boolean }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div role="menu">{children}</div>,
  DropdownMenuGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    disabled,
    onSelect,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onSelect?: (event: { preventDefault: () => void }) => void;
  }) => (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => onSelect?.({ preventDefault: vi.fn() })}
    >
      {children}
    </button>
  ),
}));

vi.mock("@/components/platform-agent-provider", () => ({
  useOptionalPlatformAgent: () => ({
    withFreshToken: async <T,>(fn: (token: string) => Promise<T>) => {
      return fn("test-token");
    },
    auth: { accessToken: "x" },
  }),
}));

vi.mock("@/lib/agent-api/client", () => ({
  ...apiMocks,
  formatAgentApiErrorForUser: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigationMocks,
  useSearchParams: () => new URLSearchParams(),
}));

import { FavoritesWorkspace } from "@/components/favorites-workspace";

describe("artifacts flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.listFavoriteFolders.mockResolvedValue({
      items: [{ id: "f1", name: "默认", sort_order: 0, created_at: "", updated_at: "" }],
    });
    apiMocks.listUserFavorites.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 });
  });

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

  it("keeps the unfavorite confirmation open and deletes only after confirmation", async () => {
    const user = userEvent.setup();
    const favorite: UserFavoriteListItemDto = {
      id: "fav-1",
      folder_id: "f1",
      title: "2222",
      created_at: "2026-06-03T00:44:59Z",
      updated_at: "2026-06-03T00:44:59Z",
      source_task_id: "task-1",
      result_kind: "json",
      card_preview: "关键词,mentions,search_volume",
    };
    let favorites = [favorite];
    apiMocks.listUserFavorites.mockImplementation(async () => ({
      items: favorites,
      total: favorites.length,
      page: 1,
      page_size: 50,
    }));
    apiMocks.deleteUserFavorite.mockImplementation(async () => {
      favorites = [];
    });

    render(<FavoritesWorkspace />);
    await screen.findByText("2222");

    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.click(await screen.findByRole("menuitem", { name: "取消收藏" }));

    expect(apiMocks.deleteUserFavorite).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "取消收藏确认" })).toBeInTheDocument();
    expect(screen.getByText("确定取消收藏该报告吗？")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "确认取消收藏" }));

    await waitFor(() => {
      expect(apiMocks.deleteUserFavorite).toHaveBeenCalledWith("test-token", "fav-1");
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "取消收藏确认" })).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.queryByText("2222")).not.toBeInTheDocument();
    });
  });
});
