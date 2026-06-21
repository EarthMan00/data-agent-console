import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FavoritesWorkspace } from "@/components/favorites-workspace";

const apiMocks = vi.hoisted(() => ({
  getUserFavorite: vi.fn(),
  listFavoriteFolders: vi.fn(),
  listUserFavorites: vi.fn(),
}));

vi.mock("@/components/alice-shell", () => ({
  AliceShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/platform-agent-provider", () => ({
  useOptionalPlatformAgent: () => ({
    withFreshToken: async (fn: (token: string) => Promise<void>) => {
      await fn("test-token");
    },
    auth: { accessToken: "x" },
  }),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverAnchor: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/lib/agent-api/client", () => ({
  getUserFavorite: apiMocks.getUserFavorite,
  listFavoriteFolders: apiMocks.listFavoriteFolders,
  listUserFavorites: apiMocks.listUserFavorites,
  formatAgentApiErrorForUser: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("artifacts flow", () => {
  beforeEach(() => {
    apiMocks.listFavoriteFolders.mockResolvedValue({
      items: [{ id: "f1", name: "默认", sort_order: 0, created_at: "", updated_at: "" }],
    });
    apiMocks.listUserFavorites.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 });
    apiMocks.getUserFavorite.mockReset();
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

  it("shows a report summary instead of html source in favorite cards", async () => {
    apiMocks.listUserFavorites.mockResolvedValue({
      items: [
        {
          id: "favorite-report-1",
          folder_id: "f1",
          title: "收藏 · 数据报告",
          created_at: "2026-06-18T02:48:58Z",
          updated_at: "2026-06-18T02:48:58Z",
          source_task_id: null,
          result_kind: "html",
          card_preview: '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><style>body { font-family: Arial; }</style>',
        },
      ],
      total: 1,
      page: 1,
      page_size: 50,
    });
    apiMocks.getUserFavorite.mockResolvedValue({
      id: "favorite-report-1",
      folder_id: "f1",
      title: "收藏 · 数据报告",
      stored_file_path: null,
      source_task_id: null,
      created_at: "2026-06-18T02:48:58Z",
      updated_at: "2026-06-18T02:48:58Z",
      snapshot: {
        version: 2,
        sheets: [
          {
            id: "report",
            label: "数据报告",
            primary_kind: "html",
            primary_text:
              '<!DOCTYPE html><html><head><style>body { color: #000; }</style></head><body><h1>历史销量分析报告</h1><p>核心发现：销量波动剧烈，近期销量低迷。</p></body></html>',
          },
        ],
      },
    });

    render(<FavoritesWorkspace />);

    const summary = await screen.findByText(/历史销量分析报告/);
    expect(summary).toHaveClass("line-clamp-4");
    expect(summary).toHaveTextContent("核心发现");
    expect(summary).not.toHaveTextContent("DOCTYPE");
    expect(summary).not.toHaveTextContent("font-family");
  });
});
