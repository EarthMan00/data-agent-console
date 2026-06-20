import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AliceHomePage } from "@/components/alice-home-page";

const replace = vi.fn();
const mockFetchHomePromptRecommendations = vi.hoisted(() => vi.fn());
const mockFetchPublicPromptCategories = vi.hoisted(() => vi.fn());

vi.mock("@/components/agent-workspace", () => ({
  AgentWorkspace: () => <div>agent workspace</div>,
}));

vi.mock("@/components/ui/flickering-grid", () => ({
  FlickeringGrid: () => <div data-testid="flickering-grid" />,
}));

vi.mock("@/components/alice-shell", () => ({
  AliceShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useAliceShellState: () => ({
    refreshHistoryNow: vi.fn(),
    setActiveSessionTitle: vi.fn(),
    upsertOptimisticHistorySession: vi.fn(),
  }),
}));

vi.mock("@/components/platform-agent-provider", () => ({
  useOptionalPlatformAgent: () => ({
    auth: null,
    authHydrated: true,
    authValidated: true,
    platformSessionId: null,
    openLogin: vi.fn(),
    closeLogin: vi.fn(),
    loginWithPassword: vi.fn(),
    logout: vi.fn(),
    beginNewHomeTaskSession: vi.fn(),
    ensurePlatformSession: vi.fn(),
    setActivePlatformSession: vi.fn(),
    clearActivePlatformSession: vi.fn(),
    withFreshToken: vi.fn(),
  }),
}));

vi.mock("@/lib/agent-api/home-prompts", () => ({
  fetchHomePromptRecommendations: mockFetchHomePromptRecommendations,
  fetchPublicPromptCategories: mockFetchPublicPromptCategories,
}));

vi.mock("@/lib/use-data-source-menu", async () => {
  const menu = await import("../fixtures/mock-data-source-menu");
  return {
    useDataSourceMenu: () => ({
      groups: menu.mockDataSourceGroups,
      items: menu.mockDataSourceItems,
      loading: false,
      error: null,
      ensureMenuLoaded: async () => {},
      refreshMenu: async () => menu.mockDataSourceGroups,
      loadCategoryTools: async () => {},
    }),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace,
    push: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("home flow", () => {
  beforeEach(() => {
    replace.mockClear();
    const webCard = {
      id: "web-card",
      title: "站外评论洞察",
      description: "通过网页检索汇总站外评论。",
      prompt: "@实时与全网检索 搜索 Anker 评论",
      meta: "",
      capability_ids: ["站外实时信息检索"],
      replay_run_id: null,
      replay_share_id: null,
      sort_order: 1,
    };
    const keepaCard = {
      id: "keepa-card",
      title: "Keepa 价格历史",
      description: "查看价格历史。",
      prompt: "@Keepa-亚马逊价格历史 查询价格变化",
      meta: "",
      capability_ids: ["Keepa-亚马逊-商品搜索", "Keepa-亚马逊价格历史"],
      replay_run_id: null,
      replay_share_id: null,
      sort_order: 2,
    };
    const excelCard = {
      id: "excel-card",
      title: "处理Excel新增列",
      description: "批量读取 Excel 表格中图片列的商品视觉信息。",
      prompt: "请批量读取 Excel 中图片列的视觉信息，提取主体、场景、材质、颜色和关键卖点。",
      meta: "@智能Excel处理",
      capability_ids: ["scenarios", "web-search"],
      replay_run_id: null,
      replay_share_id: null,
      sort_order: 3,
    };
    const jimuCard = {
      id: "jimu-card",
      title: "细分市场机会分析",
      description: "评估关键词细分市场的竞争格局。",
      prompt: "请分析目标关键词的细分市场竞争格局、品牌集中度和机会窗口。",
      meta: "@极目-亚马逊-关键词细分市场信息",
      capability_ids: ["jimu", "amazon"],
      replay_run_id: null,
      replay_share_id: null,
      sort_order: 4,
    };
    mockFetchPublicPromptCategories.mockResolvedValue([
      { id: "scenarios", name: "应用场景", sort_order: 0, is_active: true },
      { id: "web", name: "实时与全网检索", sort_order: 1, is_active: true },
      { id: "keepa", name: "Keepa", sort_order: 2, is_active: true },
    ]);
    mockFetchHomePromptRecommendations.mockImplementation((categoryId: string) => {
      if (categoryId === "web") return Promise.resolve([webCard]);
      if (categoryId === "keepa") return Promise.resolve([keepaCard]);
      return Promise.resolve([webCard, keepaCard, excelCard, jimuCard]);
    });
  });

  it("keeps prompt cards stable when selecting datasource tokens", async () => {
    render(<AliceHomePage />);

    await screen.findByLabelText("使用示例任务 站外评论洞察");
    const initialCount = screen.getAllByLabelText(/^使用示例任务 /).length;
    const editor = screen.getByTestId("task-composer-editor");
    await userEvent.click(editor);
    await userEvent.type(editor, "@");

    const mentionMenu = await screen.findByTestId("task-composer-mention-menu");
    const option = within(mentionMenu).getByRole("option", { name: /Keepa-亚马逊-商品搜索/ });
    fireEvent.pointerDown(option);

    await waitFor(() => {
      expect(screen.getByLabelText("移除数据源 Keepa-亚马逊-商品搜索")).toBeInTheDocument();
    });
    expect(screen.getAllByLabelText(/^使用示例任务 /)).toHaveLength(initialCount);
  });

  it("switches prompt cards when selecting a browse category", async () => {
    render(<AliceHomePage />);

    await screen.findByLabelText("使用示例任务 站外评论洞察");

    fireEvent.click(screen.getByRole("button", { name: /^Keepa$/ }));
    await waitFor(() => {
      expect(screen.getByLabelText("使用示例任务 Keepa 价格历史")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("使用示例任务 站外评论洞察")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /实时与全网检索/ }));
    await waitFor(() => {
      expect(screen.getByLabelText("使用示例任务 站外评论洞察")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("使用示例任务 Keepa 价格历史")).not.toBeInTheDocument();
  });

  it("keeps the selected category active after applying a visible prompt card", async () => {
    render(<AliceHomePage />);

    const keepaCategory = await screen.findByRole("button", { name: /^Keepa$/ });
    fireEvent.click(keepaCategory);
    expect(keepaCategory).toHaveClass("text-foreground");

    fireEvent.click(await screen.findByLabelText("使用示例任务 Keepa 价格历史"));

    expect(keepaCategory).toHaveClass("text-foreground");
    expect(screen.getByLabelText("移除数据源 Keepa-亚马逊价格历史")).toBeInTheDocument();
  });

  it("applies a sample task directly into the composer", async () => {
    render(<AliceHomePage />);

    fireEvent.click(await screen.findByLabelText("使用示例任务 站外评论洞察"));

    await waitFor(() => {
      expect(screen.getByText("搜索 Anker 评论")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("移除数据源 站外实时信息检索")).toBeInTheDocument();
  });

  it("uses meta mentions as datasource tokens when applying a prompt card", async () => {
    render(<AliceHomePage />);

    fireEvent.click(await screen.findByLabelText("使用示例任务 处理Excel新增列"));

    await waitFor(() => {
      expect(screen.getByText(/请批量读取 Excel 中图片列的视觉信息/)).toBeInTheDocument();
    });
    expect(screen.getByLabelText("移除数据源 智能Excel处理")).toBeInTheDocument();
  });

  it("recognizes Jimu keyword niche market meta mentions as datasource tokens", async () => {
    render(<AliceHomePage />);

    fireEvent.click(await screen.findByLabelText("使用示例任务 细分市场机会分析"));

    await waitFor(() => {
      expect(screen.getByText(/请分析目标关键词的细分市场竞争格局/)).toBeInTheDocument();
    });
    expect(screen.getByLabelText("移除数据源 极目-亚马逊-关键词细分市场信息")).toBeInTheDocument();
  });
});
