import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AliceHomePage } from "@/components/alice-home-page";

const replace = vi.fn();
const mockFetchHomePromptRecommendations = vi.hoisted(() => vi.fn());

vi.mock("@/components/agent-workspace", () => ({
  AgentWorkspace: () => <div>agent workspace</div>,
}));

vi.mock("@/components/ui/flickering-grid", () => ({
  FlickeringGrid: () => <div data-testid="flickering-grid" />,
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
}));

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
    mockFetchHomePromptRecommendations.mockResolvedValue([
      {
        id: "web-card",
        title: "站外评论洞察",
        description: "通过网页检索汇总站外评论。",
        prompt: "@实时与全网检索 搜索 Anker 评论",
        meta: "",
        capability_ids: ["web-search"],
        replay_run_id: null,
        replay_share_id: null,
        sort_order: 1,
      },
      {
        id: "keepa-card",
        title: "Keepa 价格历史",
        description: "查看价格历史。",
        prompt: "@Keepa-亚马逊价格历史 查询价格变化",
        meta: "",
        capability_ids: ["keepa-price-history"],
        replay_run_id: null,
        replay_share_id: null,
        sort_order: 2,
      },
    ]);
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

    const keepaCategory = screen.getByRole("button", { name: /^Keepa$/ });
    fireEvent.click(keepaCategory);
    expect(keepaCategory).toHaveClass("text-[#111111]");

    fireEvent.click(await screen.findByLabelText("使用示例任务 Keepa 价格历史"));

    expect(keepaCategory).toHaveClass("text-[#111111]");
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
});
